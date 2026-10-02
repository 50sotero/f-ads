// Run with: node --test tests/*.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { detectPlatform, normalizeUrl } from "../src/lib/detect.ts";

const platforms = JSON.parse(readFileSync(new URL("../src/config/platforms.json", import.meta.url), "utf8"));
const detect = (text) => detectPlatform(normalizeUrl(text), platforms)?.id ?? null;

test("every sample link is detected as its own platform", () => {
  for (const p of platforms) {
    for (const sample of p.samples) assert.equal(detect(sample), p.id, sample);
  }
});

test("pulls the link out of shared text", () => {
  assert.equal(
    normalizeUrl("Olha esse vídeo! https://vm.tiktok.com/ZMabc123/ kkkk"),
    "https://vm.tiktok.com/ZMabc123/",
  );
  assert.equal(normalizeUrl("see (https://x.com/a/status/1)."), "https://x.com/a/status/1");
});

test("adds https:// when it is missing", () => {
  assert.equal(normalizeUrl("x.com/a/status/1"), "https://x.com/a/status/1");
  assert.equal(detect("www.instagram.com/reel/abc/"), "instagram");
});

test("ignores text without a link", () => {
  for (const text of ["", "   ", "hello world", "tiktok", "localhost:3000/x"]) {
    assert.equal(normalizeUrl(text), null, text);
  }
});

test("does not match look-alike domains", () => {
  assert.equal(detect("https://notx.com/a/status/1"), null);
  assert.equal(detect("https://tiktok.com.evil.example/v/1"), null);
  assert.equal(detect("https://example.com/?u=https://x.com/a"), null);
});

test("unknown sites are valid links with no platform", () => {
  assert.equal(normalizeUrl("https://example.com/video"), "https://example.com/video");
  assert.equal(detect("https://example.com/video"), null);
});
