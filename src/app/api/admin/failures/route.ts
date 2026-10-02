import type { NextRequest } from "next/server";
import { ADMIN_COOKIE, bearerIsValid, cookieIsValid } from "@/lib/adminAuth";
import { readReport } from "@/lib/telemetry";

export const dynamic = "force-dynamic";

// JSON export of the failure log, for scripts or for handing to Claude to fix.
// GET /api/admin/failures?days=7 with the admin cookie or a Bearer ADMIN_TOKEN.
export async function GET(request: NextRequest) {
  const authorized =
    bearerIsValid(request.headers.get("authorization")) || cookieIsValid(request.cookies.get(ADMIN_COOKIE)?.value);
  if (!authorized) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const days = Math.min(30, Math.max(1, Number(request.nextUrl.searchParams.get("days")) || 7));
  const report = await readReport(days, 2000);
  return Response.json(
    { generatedAt: new Date().toISOString(), ...report },
    { headers: { "cache-control": "no-store" } },
  );
}
