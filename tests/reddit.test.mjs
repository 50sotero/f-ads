// Run with: node --test tests/*.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { isRedditPost, readPost } from "../src/lib/reddit.ts";

const wrap = (post) => [{ data: { children: [{ data: post } ] } }, {}];

test("finds the v.redd.it id, title and preview of a video post", () => {
  const out = readPost(
    wrap({
      title: "Do not walk on the belts",
      author: "someone",
      secure_media: { reddit_video: { fallback_url: "https://v.redd.it/ba9rghafmmth1/CMAF_1080.mp4?source=fallback", duration: 12 } },
      preview: { images: [{ source: { url: "https://preview.redd.it/a.jpg?s=1" } }] },
    }),
  );
  assert.deepEqual(out, {
    video: { id: "ba9rghafmmth1", title: "Do not walk on the belts", thumbnail: "https://preview.redd.it/a.jpg?s=1", duration: 12, uploader: "someone" },
  });
});

test("uses the original post of a crosspost", () => {
  const out = readPost(
    wrap({ title: "x", crosspost_parent_list: [{ media: { reddit_video: { fallback_url: "https://v.redd.it/abcdef1/DASH_720.mp4" } } }] }),
  );
  assert.equal(out.video.id, "abcdef1");
});

test("hands back an outside link, and nothing for a text post", () => {
  assert.deepEqual(readPost(wrap({ url: "https://streamable.com/abc" })), { link: "https://streamable.com/abc" });
  assert.equal(readPost(wrap({ url: "https://www.reddit.com/r/a/comments/b/c/" })), null);
  assert.equal(readPost({}), null);
});

test("only post links are read in the browser", () => {
  assert.ok(isRedditPost("https://www.reddit.com/r/factorio/comments/1wy57fg/do_not_walk_on_the_belts/"));
  assert.ok(isRedditPost("https://old.reddit.com/r/a/comments/abc/"));
  assert.ok(!isRedditPost("https://www.reddit.com/r/videos/s/AbC"));
  assert.ok(!isRedditPost("https://evilreddit.com/r/a/comments/abc/"));
});
