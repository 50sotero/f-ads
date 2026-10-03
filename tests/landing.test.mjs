// Run with: node --test tests/*.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { landings } from "../src/config/landing.ts";

const platforms = JSON.parse(readFileSync(new URL("../src/config/platforms.json", import.meta.url), "utf8"));

test("every supported site has exactly one landing page with a unique slug", () => {
  const supported = platforms.filter((p) => p.status === "supported").map((p) => p.id);
  const ids = landings.map((l) => l.id);
  assert.deepEqual([...ids].sort(), [...supported].sort());
  assert.equal(new Set(landings.map((l) => l.slug)).size, landings.length);
});

test("slugs are lowercase words that don't clash with other pages", () => {
  const taken = ["admin", "api", "terms", "privacy", "dmca", "llms.txt", "sitemap.xml", "robots.txt"];
  for (const l of landings) {
    assert.match(l.slug, /^[a-z0-9]+(-[a-z0-9]+)*$/);
    assert.ok(!taken.includes(l.slug), l.slug);
  }
});
