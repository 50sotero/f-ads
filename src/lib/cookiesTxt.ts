// Checks a cookies.txt export before /admin saves it for api/info.py, which signs
// in to YouTube with it. Only youtube.com cookies are kept.
//
// No imports on purpose, so tests/cookies.test.mjs can run it with plain Node.

export const MAX_COOKIES_BYTES = 100_000;

export type CookiesError = "empty" | "too_large" | "json" | "not_netscape" | "not_signed_in";

export type CookiesResult = { ok: true; text: string; count: number } | { ok: false; error: CookiesError };

// Cookies YouTube only sets for a signed-in account.
const SIGNED_IN = new Set(["SAPISID", "__Secure-1PAPISID", "__Secure-3PAPISID", "LOGIN_INFO"]);

export function parseCookiesTxt(raw: string): CookiesResult {
  const input = raw.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  if (!input.trim()) return { ok: false, error: "empty" };
  if (input.length > MAX_COOKIES_BYTES) return { ok: false, error: "too_large" };
  if (/^\s*[[{]/.test(input)) return { ok: false, error: "json" };

  const kept: string[] = [];
  let signedIn = false;
  for (const line of input.split("\n")) {
    if (!line.trim() || (line.startsWith("#") && !line.startsWith("#HttpOnly_"))) continue;
    let fields = line.split("\t");
    if (fields.length !== 7) {
      // Copying from some editors turns the tabs into spaces. The value comes
      // last and is the only field that may contain spaces.
      const parts = line.trim().split(/\s+/);
      fields = parts.length >= 7 ? [...parts.slice(0, 6), parts.slice(6).join(" ")] : [];
    }
    if (fields.length !== 7 || !/(^|\.)youtube\.com$/.test(fields[0].replace(/^#HttpOnly_/, ""))) continue;
    kept.push(fields.join("\t"));
    if (SIGNED_IN.has(fields[5])) signedIn = true;
  }
  if (!kept.length) return { ok: false, error: "not_netscape" };
  if (!signedIn) return { ok: false, error: "not_signed_in" };
  return { ok: true, text: `# Netscape HTTP Cookie File\n${kept.join("\n")}\n`, count: kept.length };
}
