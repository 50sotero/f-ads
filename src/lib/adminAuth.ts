import { createHmac, timingSafeEqual } from "node:crypto";

// /admin is for the site owner only. Set ADMIN_TOKEN in Vercel; the login form
// trades it for a cookie, and scripts can send it as "Authorization: Bearer …".

export const ADMIN_COOKIE = "fads_admin";

function adminToken(): string | null {
  return process.env.ADMIN_TOKEN || null;
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function adminConfigured(): boolean {
  return adminToken() !== null;
}

export function tokenMatches(input: string): boolean {
  const token = adminToken();
  return token !== null && safeEqual(input, token);
}

/** What the cookie holds: derived from the token, so the token itself never sits in the browser. */
export function adminCookieValue(): string | null {
  const token = adminToken();
  return token ? createHmac("sha256", token).update("fads-admin-v1").digest("hex") : null;
}

export function cookieIsValid(value: string | undefined): boolean {
  const expected = adminCookieValue();
  return expected !== null && value !== undefined && safeEqual(value, expected);
}

export function bearerIsValid(header: string | null): boolean {
  const match = header?.match(/^Bearer (.+)$/);
  return match !== null && match !== undefined && tokenMatches(match[1]);
}
