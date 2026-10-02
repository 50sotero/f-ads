// Pure helpers for reading a pasted link. No imports, so the tests in
// tests/detect.test.mjs can run them with plain Node.

export type Platform = {
  id: string;
  name: string;
  hosts: string[];
  status: "supported" | "soon";
  featured?: boolean;
  samples: string[];
};

const URL_IN_TEXT = /https?:\/\/[^\s<>"'`]+/i;
const BARE_DOMAIN = /^(?:[a-z0-9-]+\.)+[a-z]{2,}(?:[/?#]|$)/i;

/**
 * Turns whatever was pasted into a clean link, or null if there isn't one.
 * Apps often share text like "Watch this! https://vm.tiktok.com/ZM123/", and
 * people sometimes drop the https://.
 */
export function normalizeUrl(input: string): string | null {
  const text = input.trim();
  if (!text) return null;

  let candidate = text.match(URL_IN_TEXT)?.[0] ?? text.split(/\s+/).find((word) => BARE_DOMAIN.test(word));
  if (!candidate) return null;

  // Sentence punctuation that got copied along with the link.
  candidate = candidate.replace(/[.,;:!?)\]}]+$/, "");
  if (!/^https?:\/\//i.test(candidate)) candidate = `https://${candidate}`;

  try {
    const url = new URL(candidate);
    if (!url.hostname.includes(".")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function hostMatches(hostname: string, domain: string): boolean {
  const host = hostname.toLowerCase();
  return host === domain || host.endsWith(`.${domain}`);
}

export function detectPlatform(url: string | null, platforms: Platform[]): Platform | null {
  if (!url) return null;
  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    return null;
  }
  return platforms.find((p) => p.hosts.some((domain) => hostMatches(hostname, domain))) ?? null;
}
