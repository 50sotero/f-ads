import type { NextRequest } from "next/server";
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
    return errorPage("This download link has expired. Go back and paste the video link again.", 410);
  }
  if (!isPublicHttpUrl(payload.u)) return errorPage("Invalid download link.", 400);

  let upstream: Response;
  try {
    upstream = await fetch(payload.u, {
      headers: payload.h,
      redirect: "follow",
      signal: request.signal,
    });
  } catch {
    return errorPage("The video site did not respond. Please try again.", 502);
  }
  if (!upstream.ok || !upstream.body) {
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
  return new Response(upstream.body, { status: 200, headers });
}
