// Run with: node --test tests/*.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { activeSponsors } from "../src/config/sponsors.ts";

test("a sponsor slot ends at the end of its date, or at its exact time when it has one", () => {
  const list = [
    { name: "day", tagline: "", href: "https://a.example", until: "2026-10-02" },
    { name: "hour", tagline: "", href: "https://b.example", until: "2026-10-02T18:00-03:00" },
    { name: "open", tagline: "", href: "https://c.example" },
  ];
  const shown = (iso) => activeSponsors(new Date(iso), list).map((s) => s.name);
  assert.deepEqual(shown("2026-10-02T20:59:00Z"), ["day", "hour", "open"]);
  assert.deepEqual(shown("2026-10-02T21:01:00Z"), ["day", "open"]);
  assert.deepEqual(shown("2026-10-03T00:00:01Z"), ["open"]);
});
