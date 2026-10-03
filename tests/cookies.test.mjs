// Run with: node --test tests/*.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { parseCookiesTxt } from "../src/lib/cookiesTxt.ts";

const line = (domain, name, value) => [domain, "TRUE", "/", "TRUE", "1830000000", name, value].join("\t");

test("keeps only youtube.com cookies and adds the Netscape header", () => {
  const raw = [
    "# Netscape HTTP Cookie File",
    "# This is a generated file!",
    line(".youtube.com", "SAPISID", "abc/def"),
    line(".google.com", "SID", "drop-me"),
    `#HttpOnly_${line(".youtube.com", "LOGIN_INFO", "xyz")}`,
    "",
  ].join("\r\n");
  const result = parseCookiesTxt(raw);
  assert.equal(result.ok, true);
  assert.equal(result.count, 2);
  assert.equal(
    result.text,
    `# Netscape HTTP Cookie File\n${line(".youtube.com", "SAPISID", "abc/def")}\n#HttpOnly_${line(".youtube.com", "LOGIN_INFO", "xyz")}\n`,
  );
});

test("accepts lines whose tabs were turned into spaces", () => {
  const result = parseCookiesTxt(line(".youtube.com", "SAPISID", "a b").replaceAll("\t", "  "));
  assert.equal(result.ok, true);
  assert.equal(result.text.split("\n")[1], line(".youtube.com", "SAPISID", "a b"));
});

test("explains what is wrong with a bad file", () => {
  assert.deepEqual(parseCookiesTxt("  \n"), { ok: false, error: "empty" });
  assert.deepEqual(parseCookiesTxt('[{"domain": ".youtube.com"}]'), { ok: false, error: "json" });
  assert.deepEqual(parseCookiesTxt(line(".google.com", "SAPISID", "x")), { ok: false, error: "not_netscape" });
  assert.deepEqual(parseCookiesTxt(line(".youtube.com", "VISITOR_INFO1_LIVE", "x")), {
    ok: false,
    error: "not_signed_in",
  });
  assert.deepEqual(parseCookiesTxt(line(".notyoutube.com", "SAPISID", "x")), { ok: false, error: "not_netscape" });
  assert.deepEqual(parseCookiesTxt("x".repeat(100_001)), { ok: false, error: "too_large" });
});
