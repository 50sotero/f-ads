// One landing page per supported site, e.g. /tiktok-video-downloader. Each gets its
// own title, intro, "copy the link" step and questions, so search engines see a
// distinct page for every "<site> video downloader" search instead of one page.
// Sites with status "soon" in platforms.json get no page until they work.

export type Landing = {
  /** Platform id from platforms.json. */
  id: string;
  slug: string;
  /** What people call the site in searches, e.g. "Twitter" for X. */
  keyword: string;
  /** What a video is called there: "video", "reel", "clip"… */
  thing: string;
  intro: string;
  /** How to copy a post's link in that app. */
  copyStep: string;
  faq: { q: string; a: string }[];
  /** Search-result title, without the "| <site name>" suffix; defaults to "<H1>: Free, No Waiting". */
  title?: string;
  /** Page heading; defaults to "<keyword> Video Downloader". */
  h1?: string;
  /** Search-result description (about 150 characters); defaults to a generic one. */
  description?: string;
  /**
   * Longer how-to sections for the searches we most want to rank for. Each answers
   * something people actually ask, so the page is worth more than the tool alone.
   */
  guide?: { heading: string; paragraphs: string[] }[];
};

export const landings: Landing[] = [
  {
    id: "x",
    slug: "x-video-downloader",
    keyword: "X",
    thing: "video",
    title: "X Video Downloader: Download Twitter Videos Free",
    h1: "X (Twitter) Video Downloader",
    description:
      "Download X (Twitter) videos and GIFs free as MP4, in the best quality the post has. Paste the post link and save it. No countdowns, pop-ups or sign-up.",
    intro:
      "Save videos and GIFs from X (formerly Twitter) posts in the best quality the post offers. Paste the post link and the download starts with no countdown, no pop-ups and no sign-in.",
    copyStep: "On the post, tap the Share icon and choose Copy link. Links from x.com and twitter.com both work.",
    guide: [
      {
        heading: "How to download X videos on iPhone",
        paragraphs: [
          "Open the post in the X app, tap the Share icon and choose Copy link. Open this page in Safari, tap Paste and then Download. Safari asks where to save the file: pick Downloads, then open the Files app, tap the video and use Share → Save Video to put it in your Photos.",
        ],
      },
      {
        heading: "How to download X videos on Android",
        paragraphs: [
          "Copy the post link from the X app's Share menu, open this page in Chrome and paste it. The MP4 lands in your Downloads folder and shows up in Google Photos or your gallery app a moment later.",
        ],
      },
      {
        heading: "How to download X videos on a computer",
        paragraphs: [
          "On x.com, open the post and copy the address from the browser bar (or use Share → Copy link). Paste it here and pick a quality. The file saves like any other download on Windows, Mac or Linux.",
        ],
      },
      {
        heading: "Which quality should I pick?",
        paragraphs: [
          "X keeps several sizes of every video. The highest number (for example 1080p or 720p) is the sharpest and the biggest file; pick a lower one if you want to save data or share it in a chat app. The list only shows sizes X actually stores for that post.",
        ],
      },
      {
        heading: "Why won't an X video download?",
        paragraphs: [
          "The most common reasons are a protected account (only its followers can see the posts), a post that was deleted, or a post marked as sensitive that X only shows to signed-in users. Live broadcasts and Spaces can't be saved either. If the post is public and it still fails, try again in a minute: X sometimes refuses requests for a short while.",
        ],
      },
    ],
    faq: [
      {
        q: "Is this an X video downloader or a Twitter video downloader?",
        a: "Both. Twitter was renamed X, and links from x.com, twitter.com, mobile.twitter.com and t.co all work the same way.",
      },
      {
        q: "Can I download a video from an X post with several videos?",
        a: "Yes. Copy the link of the post, or the link that ends in /video/1, /video/2 and so on, to pick a specific one.",
      },
      {
        q: "Can I save GIFs from X?",
        a: "X stores GIFs as short videos, so they download as MP4 files you can play anywhere.",
      },
    ],
  },
  {
    id: "tiktok",
    slug: "tiktok-video-downloader",
    keyword: "TikTok",
    thing: "video",
    title: "TikTok Video Downloader: Download TikTok Videos Free",
    description:
      "Download TikTok videos free as MP4 on iPhone, Android or PC. Paste the TikTok link, pick a quality and save it. No app, no countdowns, no pop-ups.",
    guide: [
      {
        heading: "How to download TikTok videos on iPhone",
        paragraphs: [
          "In TikTok, tap Share on the video, then Copy link. Open this page in Safari, tap Paste and Download. Safari saves the MP4 to Files → Downloads; open it there and tap Share → Save Video to add it to Photos.",
        ],
      },
      {
        heading: "How to download TikTok videos on Android",
        paragraphs: [
          "Tap Share → Copy link in the TikTok app, open this page in Chrome and paste the link. The video saves to your Downloads folder and appears in your gallery.",
        ],
      },
      {
        heading: "How to download TikTok videos on PC or Mac",
        paragraphs: [
          "On tiktok.com, open the video and copy the address from the browser bar, or right-click the video and choose Copy link. Paste it here and the file downloads straight to your computer.",
        ],
      },
      {
        heading: "Why use a TikTok downloader instead of TikTok's own Save button?",
        paragraphs: [
          "TikTok's Save video option is turned off by many creators, and some videos can only be saved inside the app. Downloading the MP4 gives you a normal file you can keep offline, edit or move to another device. Only save videos you have permission to use, and credit the creator when you share them.",
        ],
      },
      {
        heading: "Why won't a TikTok video download?",
        paragraphs: [
          "Videos from private accounts, deleted videos and videos blocked in some countries can't be fetched. Photo slideshows have no video file to save. If a public video fails, wait a minute and try again: TikTok sometimes limits requests for a short while.",
        ],
      },
    ],
    intro:
      "Download TikTok videos to your phone or computer as MP4 files. Paste the link from the TikTok app or website and pick a quality. There is nothing to install and no waiting screen.",
    copyStep: "In TikTok, tap Share on the video and choose Copy link. Short vm.tiktok.com and vt.tiktok.com links work too.",
    faq: [
      {
        q: "Do short TikTok share links work?",
        a: "Yes. Links like vm.tiktok.com/… and vt.tiktok.com/… from the app's Share button are followed to the video automatically.",
      },
      {
        q: "Can I download TikTok videos on iPhone or Android?",
        a: "Yes. Open this page in your phone's browser, paste the link and tap Download. The file saves to your downloads, where you can move it to your gallery.",
      },
      {
        q: "Can I download private TikTok videos?",
        a: "No. Only public videos can be downloaded. Videos from private accounts need a login and are not available.",
      },
    ],
  },
  {
    id: "instagram",
    slug: "instagram-video-downloader",
    keyword: "Instagram",
    thing: "reel",
    intro:
      "Download Instagram Reels and videos from public posts as MP4 files. Paste the link of a reel or post and save it in seconds, with no login and no ads to sit through.",
    copyStep: "On the reel or post, tap the Share (paper plane) icon and choose Copy link.",
    faq: [
      {
        q: "Can I download Instagram Reels?",
        a: "Yes. Reel links (instagram.com/reel/…) and post links (instagram.com/p/…) both work for public accounts.",
      },
      {
        q: "Can I download Instagram Stories?",
        a: "Stories need a login to view, so they can't be downloaded here. Public reels and posts work.",
      },
      {
        q: "Will the person know I saved their reel?",
        a: "No. The download reads the public post like a browser does and does not notify anyone.",
      },
    ],
  },
  {
    id: "facebook",
    slug: "facebook-video-downloader",
    keyword: "Facebook",
    thing: "video",
    intro:
      "Download Facebook videos and Reels from public pages, profiles and groups. Paste a facebook.com or fb.watch link and pick a quality.",
    copyStep: "On the video, tap Share and choose Copy link. Watch, Reel, share and fb.watch links all work.",
    faq: [
      {
        q: "Can I download Facebook Reels?",
        a: "Yes. Paste the reel link (facebook.com/reel/…) or a share link (facebook.com/share/r/…).",
      },
      {
        q: "Can I download videos from private Facebook groups?",
        a: "No. Only videos anyone can watch without logging in can be downloaded.",
      },
      {
        q: "Can I choose HD quality?",
        a: "Yes. When Facebook offers an HD version, it shows up as a quality option next to SD.",
      },
    ],
  },
  {
    id: "reddit",
    slug: "reddit-video-downloader",
    keyword: "Reddit",
    thing: "video",
    title: "Reddit Video Downloader: Download Reddit Videos Free",
    description:
      "Download Reddit videos free as MP4. Paste the post link from the Reddit app or website, pick a quality and save it. No countdowns, pop-ups or sign-up.",
    guide: [
      {
        heading: "How to download Reddit videos on your phone",
        paragraphs: [
          "In the Reddit app, tap Share on the post and choose Copy link. Open this page in your browser, paste the link and tap Download. On iPhone the file goes to Files → Downloads, where Share → Save Video adds it to Photos; on Android it lands in Downloads and your gallery.",
        ],
      },
      {
        heading: "How to download Reddit videos on a computer",
        paragraphs: [
          "Open the post on reddit.com, copy the address from the browser bar and paste it here. Links to the post, to old.reddit.com and to v.redd.it all work.",
        ],
      },
      {
        heading: "Why are Reddit videos harder to save than others?",
        paragraphs: [
          "Reddit stores the picture and the sound of a video as separate files and streams them together in its player. That's why right-clicking a Reddit video or using a screen recorder often gives you a silent clip or a blurry copy. A downloader reads the post the way Reddit's player does and hands you a normal video file.",
        ],
      },
      {
        heading: "Why won't a Reddit video download?",
        paragraphs: [
          "Posts in private or quarantined communities, posts marked NSFW that need a login, deleted posts and videos still being processed by Reddit can't be fetched. If a post links to a video on another site, such as YouTube or Imgur, paste that link instead.",
        ],
      },
    ],
    intro:
      "Download videos from public Reddit posts. Paste the post link from the app or the website and pick a quality, with no countdown and no sign-up.",
    copyStep: "On the post, tap Share and choose Copy link. Links with /s/ from the Reddit app work too.",
    faq: [
      {
        q: "Do Reddit videos download with sound?",
        a: "Yes. Reddit keeps the picture and the sound in separate files, so we fetch both and your browser joins them into one MP4 before saving. It takes a few extra seconds on long videos.",
      },
      {
        q: "Do Reddit app share links work?",
        a: "Yes. Links like reddit.com/r/…/s/… from the app are followed to the post automatically.",
      },
      {
        q: "Can I download videos from private or quarantined subreddits?",
        a: "No. Only posts anyone can see without logging in can be downloaded.",
      },
    ],
  },
  {
    id: "pinterest",
    slug: "pinterest-video-downloader",
    keyword: "Pinterest",
    thing: "video",
    intro: "Download video Pins from Pinterest as MP4 files. Paste the Pin link, including pin.it short links, and save it.",
    copyStep: "On the Pin, tap Share and choose Copy link. Short pin.it links work too.",
    faq: [
      {
        q: "Do pin.it links work?",
        a: "Yes. Short pin.it links are followed to the Pin automatically.",
      },
      {
        q: "Can I download image Pins?",
        a: "This tool saves videos. Image-only Pins don't have a video to download.",
      },
    ],
  },
  {
    id: "vimeo",
    slug: "vimeo-video-downloader",
    keyword: "Vimeo",
    thing: "video",
    intro: "Download public Vimeo videos in the qualities the creator allows. Paste the vimeo.com link and pick a size.",
    copyStep: "Copy the video's address from your browser's address bar, or use Share and copy the link.",
    faq: [
      {
        q: "Can I download private or password-protected Vimeo videos?",
        a: "No. Only public videos can be downloaded.",
      },
    ],
  },
  {
    id: "twitch",
    slug: "twitch-clip-downloader",
    keyword: "Twitch",
    thing: "clip",
    intro: "Download Twitch clips as MP4 files. Paste the clip link and choose a quality.",
    copyStep: "On the clip, tap Share and choose Copy link. clips.twitch.tv links work too.",
    faq: [
      {
        q: "Can I download a live stream or a past broadcast?",
        a: "Not yet. Clips work today; full streams and past broadcasts are coming later.",
      },
    ],
  },
  {
    id: "bluesky",
    slug: "bluesky-video-downloader",
    keyword: "Bluesky",
    thing: "video",
    intro: "Download videos from Bluesky posts. Paste the bsky.app post link and save the video as a file.",
    copyStep: "On the post, tap the ⋯ menu or Share and choose Copy link to post.",
    faq: [],
  },
  {
    id: "linkedin",
    slug: "linkedin-video-downloader",
    keyword: "LinkedIn",
    thing: "video",
    intro: "Download videos from public LinkedIn posts. Paste the post link and pick a quality.",
    copyStep: "On the post, tap ⋯ or Share and choose Copy link to post.",
    faq: [
      {
        q: "Can I download LinkedIn Learning courses?",
        a: "No. Course videos need a login. Videos in public posts work.",
      },
    ],
  },
  {
    id: "snapchat",
    slug: "snapchat-video-downloader",
    keyword: "Snapchat",
    thing: "Spotlight video",
    intro: "Download public Snapchat Spotlight videos and public Stories shared on snapchat.com.",
    copyStep: "On the Spotlight video, tap Share and choose Copy link.",
    faq: [],
  },
  {
    id: "dailymotion",
    slug: "dailymotion-video-downloader",
    keyword: "Dailymotion",
    thing: "video",
    intro: "Download Dailymotion videos as MP4 files. Paste the video link, including dai.ly short links.",
    copyStep: "Copy the video's address, or tap Share and copy the dai.ly link.",
    faq: [],
  },
  {
    id: "tumblr",
    slug: "tumblr-video-downloader",
    keyword: "Tumblr",
    thing: "video",
    intro: "Download videos from Tumblr posts. Paste the post link and save the video.",
    copyStep: "On the post, tap Share and choose Copy link.",
    faq: [],
  },
  {
    id: "kick",
    slug: "kick-clip-downloader",
    keyword: "Kick",
    thing: "clip",
    intro: "Download Kick clips as MP4 files. Paste the clip link and pick a quality.",
    copyStep: "On the clip, tap Share and copy the link.",
    faq: [],
  },
  {
    id: "rumble",
    slug: "rumble-video-downloader",
    keyword: "Rumble",
    thing: "video",
    intro: "Download Rumble videos in the quality you want. Paste the rumble.com link.",
    copyStep: "Copy the video's address from your browser, or use Share and copy the link.",
    faq: [],
  },
  {
    id: "streamable",
    slug: "streamable-video-downloader",
    keyword: "Streamable",
    thing: "video",
    intro: "Download Streamable videos before they expire. Paste the streamable.com link and save the file.",
    copyStep: "Copy the streamable.com link of the video.",
    faq: [],
  },
  {
    id: "bilibili",
    slug: "bilibili-video-downloader",
    keyword: "Bilibili",
    thing: "video",
    intro: "Download public Bilibili videos. Paste the bilibili.com or b23.tv link and pick a quality.",
    copyStep: "Tap Share on the video and copy the link. Short b23.tv links work too.",
    faq: [],
  },
  {
    id: "9gag",
    slug: "9gag-video-downloader",
    keyword: "9GAG",
    thing: "video",
    intro: "Download 9GAG videos and GIF posts as MP4 files. Paste the post link and save it.",
    copyStep: "On the post, tap Share and choose Copy link.",
    faq: [],
  },
  {
    id: "imgur",
    slug: "imgur-video-downloader",
    keyword: "Imgur",
    thing: "video",
    intro: "Download Imgur videos and GIFs as MP4 files. Paste the imgur.com link and save it.",
    copyStep: "Copy the post's link from the address bar or the Share button.",
    faq: [],
  },
  {
    id: "likee",
    slug: "likee-video-downloader",
    keyword: "Likee",
    thing: "video",
    intro: "Download Likee videos to your phone or computer. Paste the video link and save it.",
    copyStep: "In Likee, tap Share on the video and choose Copy link.",
    faq: [],
  },
];
