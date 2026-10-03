import { after, type NextRequest } from "next/server";
import { recordEvent } from "@/lib/telemetry";
import { verifyToken } from "@/lib/token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Long videos can take a while to stream through.
export const maxDuration = 300;

const PASSTHROUGH = ["content-type", "content-length", "last-modified", "etag"];

function isPublicHttpUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return false;
  const host = url.hostname;
  // The URL comes from our own signed token, so this is only a backstop.
  return !(
    host === "localhost" ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    /^\d+\.\d+\.\d+\.\d+$/.test(host) ||
    host.includes(":")
  );
}

function contentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

function errorPage(message: string, status: number) {
  return new Response(message, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("t") ?? "";
  const payload = verifyToken(token);
  if (!payload) {
    // Also covers tampered tokens; both are counted, neither is a broken download.
    after(() => recordEvent({ stage: "download", code: "expired" }));
    return errorPage("This download link has expired. Go back and paste the video link again.", 410);
  }
  if (payload.r) {
    // YouTube file links only work from the server that looked them up, so
    // api/info.py looks the video up again and streams it in one request.
    return new Response(null, {
      status: 307,
      headers: { location: `/api/info?t=${encodeURIComponent(token)}`, "cache-control": "no-store" },
    });
  }
  const log = (code: string, detail?: string) =>
    after(() =>
      recordEvent({ stage: "download", code, platform: payload.p, url: payload.s, host: cdnHost(payload.u), detail }),
    );
  if (!isPublicHttpUrl(payload.u)) {
    log("bad_url");
    return errorPage("Invalid download link.", 400);
  }

  let upstream: Response;
  try {
    upstream = await fetch(payload.u, {
      headers: payload.h,
      redirect: "follow",
      signal: request.signal,
    });
  } catch (err) {
    if (!request.signal.aborted) log("fetch_failed", String(err));
    return errorPage("The video site did not respond. Please try again.", 502);
  }
  if (!upstream.ok || !upstream.body) {
    log("upstream_error", `HTTP ${upstream.status} from ${cdnHost(upstream.url || payload.u)}`);
    return errorPage("The video site refused the download. Please paste the link again.", 502);
  }

  const headers = new Headers({
    "content-disposition": contentDisposition(payload.f || "video.mp4"),
    "cache-control": "no-store",
  });
  // fetch() decompresses gzip bodies, which makes the upstream length wrong.
  const encoded = upstream.headers.has("content-encoding");
  for (const name of PASSTHROUGH) {
    if (encoded && name === "content-length") continue;
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }

  // Count bytes on the way through so a download that dies halfway is logged
  // too, not only the ones that fail to start.
  let sent = 0;
  const counter = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      sent += chunk.byteLength;
      controller.enqueue(chunk);
    },
  });
  const finished = upstream.body.pipeTo(counter.writable).then(
    () => recordEvent({ stage: "download", code: "ok", platform: payload.p }),
    (err) => {
      // The user cancelling the download is not a failure.
      if (request.signal.aborted) return;
      return recordEvent({
        stage: "download",
        code: "stream_failed",
        platform: payload.p,
        url: payload.s,
        host: cdnHost(payload.u),
        detail: `stopped after ${sent} bytes: ${String(err)}`,
      });
    },
  );
  after(() => finished);
  return new Response(counter.readable, { status: 200, headers });
}

function cdnHost(raw: string): string | null {
  try {
    return new URL(raw).hostname;
  } catch {
    return null;
  }
}
