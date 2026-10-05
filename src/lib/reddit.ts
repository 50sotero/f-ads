// Reddit refuses its post pages to most server IPs, but answers browsers. So for
// a Reddit post the browser reads the post's public JSON itself and sends only
// the video's id and title to /api/info, which fetches the video from v.redd.it.

export type RedditVideo = {
  id: string;
  title?: string;
  thumbnail?: string;
  duration?: number;
  uploader?: string;
};

export type RedditLookup = { video: RedditVideo } | { link: string } | null;

const VIDEO_ID = /^https:\/\/v\.redd\.it\/([A-Za-z0-9]{5,20})(?:[/?#]|$)/;

/** True for a reddit.com post link (not a share link or a subreddit). */
export function isRedditPost(url: string): boolean {
  try {
    const u = new URL(url);
    return /(^|\.)reddit\.com$/i.test(u.hostname) && /\/comments\/[A-Za-z0-9]+/.test(u.pathname);
  } catch {
    return false;
  }
}

type Post = {
  title?: string;
  author?: string;
  url?: string;
  thumbnail?: string;
  is_video?: boolean;
  secure_media?: { reddit_video?: { fallback_url?: string; duration?: number } } | null;
  media?: { reddit_video?: { fallback_url?: string; duration?: number } } | null;
  preview?: { images?: { source?: { url?: string } }[]; reddit_video_preview?: { fallback_url?: string } };
  crosspost_parent_list?: Post[];
};

/** Pulls the video (or the outside link a post shares) from Reddit's post JSON. */
export function readPost(json: unknown): RedditLookup {
  const listing = Array.isArray(json) ? json[0] : json;
  const post: Post | undefined = listing?.data?.children?.[0]?.data;
  if (!post) return null;
  const source = post.crosspost_parent_list?.[0] ?? post;
  const video = source.secure_media?.reddit_video ?? source.media?.reddit_video;
  const fallback = video?.fallback_url ?? source.preview?.reddit_video_preview?.fallback_url;
  const id = fallback?.match(VIDEO_ID)?.[1];
  if (id) {
    const thumb = source.preview?.images?.[0]?.source?.url ?? post.thumbnail;
    return {
      video: {
        id,
        title: post.title,
        thumbnail: thumb?.startsWith("https://") ? thumb : undefined,
        duration: video?.duration,
        uploader: post.author,
      },
    };
  }
  // A post that links to a video on another site (YouTube, Imgur, Streamable…).
  if (source.url && !/^https:\/\/(www\.|old\.)?reddit\.com\//.test(source.url)) return { link: source.url };
  return null;
}

/** Reads a Reddit post from the browser. Null when Reddit can't be reached or has no video. */
export async function lookupRedditPost(url: string): Promise<RedditLookup> {
  const u = new URL(url);
  u.hostname = "www.reddit.com";
  u.pathname = `${u.pathname.replace(/\/+$/, "")}.json`;
  u.search = "?raw_json=1";
  u.hash = "";
  try {
    const res = await fetch(u.toString(), { credentials: "omit" });
    if (!res.ok) return null;
    return readPost(await res.json());
  } catch {
    return null;
  }
}
