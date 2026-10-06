import type { NextRequest } from "next/server";
import { recordEvent } from "@/lib/telemetry";

export const dynamic = "force-dynamic";

// Failures only the browser sees: the lookup timing out, the network dropping,
// joining picture and sound failing, and people pressing "Didn't work?".
const CODES = new Set(["timeout", "network", "bad_response", "merge_failed", "user_report"]);

export async function POST(request: NextRequest) {
  const text = await request.text();
  if (text.length > 2048) return new Response(null, { status: 413 });

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(text);
  } catch {
    return new Response(null, { status: 400 });
  }
  const code = typeof body?.code === "string" ? body.code : "";
  if (!CODES.has(code)) return new Response(null, { status: 400 });

  const detail = [
    typeof body.status === "number" ? `HTTP ${body.status}` : null,
    typeof body.detail === "string" ? body.detail.slice(0, 200) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  await recordEvent({
    stage: code === "user_report" ? "report" : "client",
    code,
    platform: typeof body.platform === "string" ? body.platform : null,
    url: typeof body.url === "string" ? body.url : null,
    detail: detail || null,
  });
  return new Response(null, { status: 204 });
}
