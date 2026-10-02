# F.ADS

Paste a link from X, TikTok, Instagram, Reddit, Facebook and other sites and download the video, with no countdowns or pop-ups. The page earns from up to 4 direct-sold sponsor cards shown under the downloader and in the footer.

## How it works

1. The page detects the site as soon as a link is pasted or typed (`src/lib/detect.ts`, sites listed in `src/config/platforms.json`). It also pulls the link out of shared text like "Look at this https://vm.tiktok.com/…" and adds a missing `https://`. Links from a known site start loading right away.
2. `api/info.py` (Vercel Python function) follows app share links (`fb.watch`, `pin.it`, Reddit `/s/` links…) to the real post, staying on the platform's own domains, then runs [yt-dlp](https://github.com/yt-dlp/yt-dlp) in metadata-only mode, picks the formats that are a single downloadable file, and returns each with a signed token that expires in 30 minutes.
3. `src/app/api/download/route.ts` (Next.js route) checks the token and streams the file from the source site's CDN to the browser as an attachment. Nothing is stored.

YouTube is turned off for now (`BLOCKED_HOSTS` in `api/info.py`); it needs rotating proxies and ffmpeg merging, planned for phase 2.

## Run locally

```bash
npm install
pip install -r requirements.txt
npm run dev:api   # Python function on :8000
npm run dev       # site on :3000, /api/info is proxied to :8000
npm test          # Python + Node tests
```

## Deploy on Vercel

1. Import the repo in Vercel (framework: Next.js). Vercel picks up `api/info.py` and `requirements.txt` automatically.
2. Add the environment variable `DOWNLOAD_SIGNING_SECRET` (generate with `openssl rand -hex 32`).
3. Deploy.

## Editing content

- Brand, contact email, price and traffic numbers: `src/config/site.ts`
- Sponsors: `src/config/sponsors.ts` (logos go in `public/sponsors/`)
- Supported sites, their domains and sample links: `src/config/platforms.json`. `npm test` checks every sample is detected on the page and readable by yt-dlp. Brand icons come from Simple Icons (CC0) in `src/components/brandIcons.ts`.
