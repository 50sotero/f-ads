import { createHmac, timingSafeEqual } from "node:crypto";

// Mirrors sign_token() in api/info.py.
export type DownloadToken = {
  u: string; // media URL on the source site's CDN
  h: Record<string, string>; // headers the CDN expects
  f: string; // filename for the user
  e: number; // expiry, unix seconds
  p?: string; // platform id, for the failure log
  s?: string | null; // the post's link (cleaned), for the failure log
};

function secret(): string {
  const value = process.env.DOWNLOAD_SIGNING_SECRET;
  if (value) return value;
  if (process.env.NODE_ENV === "development") return "dev-secret-change-me";
  throw new Error("DOWNLOAD_SIGNING_SECRET is not set");
}

export function verifyToken(token: string): DownloadToken | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;

  const expected = createHmac("sha256", secret()).update(body).digest();
  const given = Buffer.from(sig, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (typeof payload?.u !== "string" || typeof payload?.e !== "number") return null;
    if (payload.e < Date.now() / 1000) return null;
    return payload as DownloadToken;
  } catch {
    return null;
  }
}
