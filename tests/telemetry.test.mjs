// Run with: node --test tests/*.test.mjs
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { cleanPlatform, readReport, recordEvent, redactUrl, summarize } from "../src/lib/telemetry.ts";

const root = fileURLToPath(new URL("..", import.meta.url));
let server;

before(async () => {
  server = spawn("python3", ["tests/fake_upstash.py"], { cwd: root });
  const [line] = await once(server.stdout, "data");
  const port = String(line).match(/PORT (\d+)/)[1];
  process.env.UPSTASH_REDIS_REST_URL = `http://127.0.0.1:${port}`;
  process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
});

after(() => server.kill());

test("redactUrl drops tracking parameters and fragments", () => {
  assert.equal(redactUrl("https://www.instagram.com/reel/abc/?igsh=xyz&utm_source=ig#c"), "https://www.instagram.com/reel/abc/");
  assert.equal(redactUrl("https://www.facebook.com/watch/?v=1&ref=sharing"), "https://www.facebook.com/watch/?v=1");
  assert.equal(redactUrl("javascript:alert(1)"), null);
  assert.equal(redactUrl(undefined), null);
});

test("cleanPlatform only accepts plain ids", () => {
  assert.equal(cleanPlatform("tiktok"), "tiktok");
  assert.equal(cleanPlatform("x:ok"), "unknown");
  assert.equal(cleanPlatform(null), "unknown");
});

test("summarize keeps bad input and unsupported sites out of failure rates", () => {
  const { platforms, reasons } = summarize([
    [
      ["info:x:ok", 8],
      ["info:x:not_found", 2],
      ["download:x:ok", 7],
      ["download:x:upstream_error", 1],
      ["report:x:user_report", 1],
      ["info:youtube:coming_soon", 5],
    ],
    [["info:x:ok", 2]],
  ]);
  const x = platforms.find((p) => p.platform === "x");
  assert.deepEqual(
    [x.lookups, x.lookupFailures, x.downloads, x.downloadFailures, x.userReports],
    [12, 2, 8, 1, 1],
  );
  assert.equal(platforms.find((p) => p.platform === "youtube").other, 5);
  assert.deepEqual(reasons[0], { stage: "info", code: "not_found", count: 2, failure: true });
  assert.equal(reasons.at(-1).failure, false);
});

test("download failures and browser reports are stored and read back", async () => {
  await recordEvent({
    stage: "download",
    code: "upstream_error",
    platform: "tiktok",
    url: "https://www.tiktok.com/@a/video/1?_r=1",
    host: "v16.tiktokcdn.com",
    detail: "HTTP 403 from v16.tiktokcdn.com",
  });
  await recordEvent({ stage: "download", code: "ok", platform: "tiktok" });
  await recordEvent({ stage: "download", code: "expired" });

  const report = await readReport(1);
  assert.equal(report.configured, true);
  const tiktok = report.platforms.find((p) => p.platform === "tiktok");
  assert.deepEqual([tiktok.downloads, tiktok.downloadFailures], [2, 1]);
  const stored = report.failures.find((f) => f.code === "upstream_error");
  assert.equal(stored.url, "https://www.tiktok.com/@a/video/1");
  assert.equal(stored.host, "v16.tiktokcdn.com");
  assert.equal(report.failures.filter((f) => f.code === "expired").length, 0);
});

test("reads what the Python lookup function writes", async () => {
  execFileSync(
    "python3",
    [
      "-c",
      "import sys; sys.path.insert(0, 'api'); import info; " +
        "info.record('info', 'not_found', 'x', url='https://x.com/a/status/1?s=20', detail='No video found'); " +
        "info.record('info', 'unsupported_site', 'unknown', host='kwai.com')",
    ],
    { cwd: root, env: process.env, stdio: "ignore" },
  );
  const report = await readReport(1);
  const fromPython = report.failures.find((f) => f.stage === "info");
  assert.equal(fromPython.url, "https://x.com/a/status/1");
  assert.equal(fromPython.detail, "No video found");
  assert.match(fromPython.version, /^\d{4}\.\d+\.\d+/);
  assert.equal(report.platforms.find((p) => p.platform === "x").lookupFailures, 1);
  assert.deepEqual(report.demand, [{ host: "kwai.com", count: 1 }]);
});

test("a store outage never breaks the caller", async () => {
  const saved = process.env.UPSTASH_REDIS_REST_URL;
  process.env.UPSTASH_REDIS_REST_URL = "http://127.0.0.1:9";
  const quiet = console.error;
  console.error = () => {};
  try {
    await recordEvent({ stage: "client", code: "timeout", platform: "x", url: "https://x.com/a/status/1" });
  } finally {
    console.error = quiet;
    process.env.UPSTASH_REDIS_REST_URL = saved;
  }
});

test("without a store, reading says so instead of failing", async () => {
  const saved = process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_URL;
  try {
    const report = await readReport(7);
    assert.equal(report.configured, false);
    assert.deepEqual(report.failures, []);
  } finally {
    process.env.UPSTASH_REDIS_REST_URL = saved;
  }
});
