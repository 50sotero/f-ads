// Failure log, Node half. api/info.py writes lookup outcomes with the same keys
// and record shape; this file records download/browser failures and reads
// everything back for /admin. Keep the two in sync.
//
// Storage is Upstash Redis over its REST API:
//   fads:stats:<day>     hash  "<stage>:<platform>:<code>" -> count   (90 days)
//   fads:failures:<day>  list  JSON FailureEvent, newest first        (30 days, 2000/day)
//   fads:demand:<month>  zset  unsupported host -> times asked        (~13 months)
//   fads:youtube:cookies        cookies.txt uploaded in /admin; api/info.py signs in to YouTube with it
//   fads:youtube:cookies:saved  when it was uploaded (ISO time)
//
// No imports on purpose, so tests/telemetry.test.mjs can run it with plain Node.

const KEY_PREFIX = "fads";
const STATS_RETENTION_DAYS = 90;
const FAILURE_RETENTION_DAYS = 30;
const MAX_FAILURES_PER_DAY = 2000;
const STORE_TIMEOUT_MS = 2000;
const DAY_MS = 86_400_000;

export type Stage = "info" | "download" | "client" | "report";

export type FailureEvent = {
  t: string;
  stage: Stage;
  code: string;
  platform: string;
  url: string | null;
  host: string | null;
  extractor: string | null;
  detail: string | null;
  version: string | null;
  build: string;
  region: string | null;
};

// Failures we keep in full; every other outcome is only counted. api/info.py
// has its own list for lookup failures.
const STORED_CODES = new Set([
  "fetch_failed",
  "upstream_error",
  "stream_failed",
  "timeout",
  "network",
  "bad_response",
  "user_report",
]);
// Outcomes that are not a broken download: bad input, unsupported or not-yet
// supported sites, expired links. They are shown, but kept out of failure rates.
const NOT_A_FAILURE = new Set([
  "ok",
  "empty",
  "too_long",
  "invalid_url",
  "bad_request",
  "coming_soon",
  "unsupported_site",
  "expired",
  "bad_url",
]);
const KEPT_QUERY_PARAMS = new Set(["v", "id", "story_fbid", "fbid"]);

type Command = (string | number)[];

function storeConfig() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  return url && token ? { url: url.replace(/\/+$/, ""), token } : null;
}

export function storeConfigured(): boolean {
  return storeConfig() !== null;
}

async function pipeline(commands: Command[]): Promise<unknown[] | null> {
  const config = storeConfig();
  if (!config) return null;
  const res = await fetch(`${config.url}/pipeline`, {
    method: "POST",
    headers: { authorization: `Bearer ${config.token}`, "content-type": "application/json" },
    body: JSON.stringify(commands.map((cmd) => cmd.map(String))),
    signal: AbortSignal.timeout(STORE_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`failure store answered ${res.status}`);
  const results = (await res.json()) as { result?: unknown; error?: string }[];
  return results.map((r) => {
    if (r.error) throw new Error(r.error);
    return r.result;
  });
}

const YOUTUBE_COOKIES_KEY = `${KEY_PREFIX}:youtube:cookies`;

/** Saves the cookies.txt that api/info.py signs in to YouTube with. */
export async function saveYoutubeCookies(text: string): Promise<void> {
  await pipeline([
    ["SET", YOUTUBE_COOKIES_KEY, text],
    ["SET", `${YOUTUBE_COOKIES_KEY}:saved`, new Date().toISOString()],
  ]);
}

export async function removeYoutubeCookies(): Promise<void> {
  await pipeline([["DEL", YOUTUBE_COOKIES_KEY, `${YOUTUBE_COOKIES_KEY}:saved`]]);
}

/** When the YouTube cookies were uploaded, or null if there are none. */
export async function youtubeCookiesSavedAt(): Promise<string | null> {
  const [saved] = (await pipeline([["GET", `${YOUTUBE_COOKIES_KEY}:saved`]])) ?? [];
  return typeof saved === "string" ? saved : null;
}

/** The link without tracking parameters or fragment, short enough to store. */
export function redactUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    for (const key of [...url.searchParams.keys()]) {
      if (!KEPT_QUERY_PARAMS.has(key)) url.searchParams.delete(key);
    }
    url.hash = "";
    return url.toString().slice(0, 300);
  } catch {
    return null;
  }
}

export function cleanPlatform(value: unknown): string {
  return typeof value === "string" && /^[a-z0-9]{1,20}$/.test(value) ? value : "unknown";
}

function hostOf(url: string | null): string | null {
  try {
    return url ? new URL(url).hostname : null;
  } catch {
    return null;
  }
}

/** Counts an outcome and, for failures worth fixing, stores the details. Never throws. */
export async function recordEvent(event: {
  stage: Stage;
  code: string;
  platform?: string | null;
  url?: string | null;
  host?: string | null;
  detail?: string | null;
}): Promise<void> {
  try {
    const day = new Date().toISOString().slice(0, 10);
    const platform = cleanPlatform(event.platform);
    const statsKey = `${KEY_PREFIX}:stats:${day}`;
    const commands: Command[] = [
      ["HINCRBY", statsKey, `${event.stage}:${platform}:${event.code}`, 1],
      ["EXPIRE", statsKey, STATS_RETENTION_DAYS * 86400],
    ];
    if (STORED_CODES.has(event.code)) {
      const url = redactUrl(event.url);
      const failure: FailureEvent = {
        t: new Date().toISOString().replace(/\.\d+Z$/, "Z"),
        stage: event.stage,
        code: event.code,
        platform,
        url,
        host: event.host ?? hostOf(url),
        extractor: null,
        detail: event.detail?.slice(0, 600) || null,
        version: null,
        build: (process.env.VERCEL_GIT_COMMIT_SHA || "local").slice(0, 7),
        region: process.env.VERCEL_REGION || null,
      };
      console.log(JSON.stringify({ failure }));
      const failuresKey = `${KEY_PREFIX}:failures:${day}`;
      commands.push(
        ["LPUSH", failuresKey, JSON.stringify(failure)],
        ["LTRIM", failuresKey, 0, MAX_FAILURES_PER_DAY - 1],
        ["EXPIRE", failuresKey, FAILURE_RETENTION_DAYS * 86400],
      );
    }
    await pipeline(commands);
  } catch (err) {
    console.error("failure log write failed", err);
  }
}

// --- Reading it back ---------------------------------------------------------

export type PlatformSummary = {
  platform: string;
  lookups: number;
  lookupFailures: number;
  downloads: number;
  downloadFailures: number;
  browserFailures: number;
  userReports: number;
  /** Not-our-fault outcomes such as "coming soon" or unsupported sites. */
  other: number;
};

export type Report = {
  configured: boolean;
  days: string[];
  platforms: PlatformSummary[];
  /** "<stage>:<code>" -> count over the period, failures first. */
  reasons: { stage: string; code: string; count: number; failure: boolean }[];
  demand: { host: string; count: number }[];
  failures: FailureEvent[];
};

export function lastDays(count: number, now = new Date()): string[] {
  return Array.from({ length: count }, (_, i) => new Date(now.getTime() - i * DAY_MS).toISOString().slice(0, 10));
}

function pairs(flat: unknown): [string, number][] {
  const list = Array.isArray(flat) ? flat : [];
  const out: [string, number][] = [];
  for (let i = 0; i + 1 < list.length; i += 2) out.push([String(list[i]), Number(list[i + 1]) || 0]);
  return out;
}

/** Turns per-day stats hashes into per-platform rows and failure reasons. */
export function summarize(statsByDay: [string, number][][]) {
  const rows = new Map<string, PlatformSummary>();
  const reasons = new Map<string, number>();
  for (const day of statsByDay) {
    for (const [field, count] of day) {
      const [stage, platform, code] = field.split(":");
      if (!stage || !platform || !code) continue;
      const row = rows.get(platform) ?? {
        platform,
        lookups: 0,
        lookupFailures: 0,
        downloads: 0,
        downloadFailures: 0,
        browserFailures: 0,
        userReports: 0,
        other: 0,
      };
      const failure = !NOT_A_FAILURE.has(code);
      if (stage === "info" && (code === "ok" || failure)) {
        row.lookups += count;
        if (failure) row.lookupFailures += count;
      } else if (stage === "download" && (code === "ok" || failure)) {
        row.downloads += count;
        if (failure) row.downloadFailures += count;
      } else if (stage === "client") {
        row.browserFailures += count;
      } else if (stage === "report") {
        row.userReports += count;
      } else {
        row.other += count;
      }
      rows.set(platform, row);
      if (code !== "ok") reasons.set(`${stage}:${code}`, (reasons.get(`${stage}:${code}`) ?? 0) + count);
    }
  }
  const failuresOf = (r: PlatformSummary) => r.lookupFailures + r.downloadFailures + r.browserFailures + r.userReports;
  return {
    platforms: [...rows.values()].sort((a, b) => failuresOf(b) - failuresOf(a) || b.lookups - a.lookups),
    reasons: [...reasons.entries()]
      .map(([key, count]) => {
        const [stage, code] = key.split(":");
        return { stage, code, count, failure: !NOT_A_FAILURE.has(code) };
      })
      .sort((a, b) => Number(b.failure) - Number(a.failure) || b.count - a.count),
  };
}

export async function readReport(dayCount = 7, failureLimit = 200): Promise<Report> {
  const days = lastDays(dayCount);
  const empty: Report = { configured: storeConfigured(), days, platforms: [], reasons: [], demand: [], failures: [] };
  if (!empty.configured) return empty;

  const months = [...new Set(days.map((d) => d.slice(0, 7)))];
  const results = await pipeline([
    ...days.map((d) => ["HGETALL", `${KEY_PREFIX}:stats:${d}`]),
    ...days.map((d) => ["LRANGE", `${KEY_PREFIX}:failures:${d}`, 0, failureLimit - 1]),
    ...months.map((m) => ["ZREVRANGE", `${KEY_PREFIX}:demand:${m}`, 0, 49, "WITHSCORES"]),
  ]);
  if (!results) return empty;

  const stats = results.slice(0, days.length).map(pairs);
  const failures = results
    .slice(days.length, days.length * 2)
    .flatMap((list) => (Array.isArray(list) ? list : []))
    .flatMap((raw) => {
      try {
        return [JSON.parse(String(raw)) as FailureEvent];
      } catch {
        return [];
      }
    })
    .sort((a, b) => b.t.localeCompare(a.t))
    .slice(0, failureLimit);
  const demand = new Map<string, number>();
  for (const zset of results.slice(days.length * 2)) {
    for (const [host, count] of pairs(zset)) demand.set(host, (demand.get(host) ?? 0) + count);
  }

  return {
    ...empty,
    ...summarize(stats),
    demand: [...demand.entries()].map(([host, count]) => ({ host, count })).sort((a, b) => b.count - a.count),
    failures,
  };
}
