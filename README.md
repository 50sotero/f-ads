# F.ADS

Paste a link from X, TikTok, Instagram, Reddit, Facebook and other sites and download the video, with no countdowns or pop-ups. The page earns from up to 4 direct-sold sponsor cards shown under the downloader and in the footer.

## How it works

1. `api/info.py` (Vercel Python function) runs [yt-dlp](https://github.com/yt-dlp/yt-dlp) in metadata-only mode, picks the formats that are a single downloadable file, and returns each with a signed token that expires in 30 minutes.
2. `src/app/api/download/route.ts` (Next.js route) checks the token and streams the file from the source site's CDN to the browser as an attachment. Nothing is stored.

YouTube is turned off for now (`BLOCKED_HOSTS` in `api/info.py`); it needs rotating proxies and ffmpeg merging, planned for phase 2.

## Run locally

```bash
npm install
pip install -r requirements.txt
npm run dev:api   # Python function on :8000
npm run dev       # site on :3000, /api/info is proxied to :8000
npm test          # Python tests
```

## Deploy on Vercel

1. Import the repo in Vercel (framework: Next.js). Vercel picks up `api/info.py` and `requirements.txt` automatically.
2. Add the environment variable `DOWNLOAD_SIGNING_SECRET` (generate with `openssl rand -hex 32`).
3. Deploy.

## Editing content

- Brand, contact email, price and traffic numbers: `src/config/site.ts`
- Sponsors: `src/config/sponsors.ts` (logos go in `public/sponsors/`)
