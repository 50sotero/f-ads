# F.ADS

Paste a link from X, TikTok, Instagram, Reddit, Facebook and other sites and download the video, with no countdowns or pop-ups. The page earns from up to 4 direct-sold sponsor cards shown under the downloader and in the footer.

## How it works

1. The page detects the site as soon as a link is pasted or typed (`src/lib/detect.ts`, sites listed in `src/config/platforms.json`). It also pulls the link out of shared text like "Look at this https://vm.tiktok.com/…" and adds a missing `https://`. Links from a known site start loading right away.
2. `api/info.py` (Vercel Python function) follows app share links (`fb.watch`, `pin.it`, Reddit `/s/` links…) to the real post, staying on the platform's own domains, then runs [yt-dlp](https://github.com/yt-dlp/yt-dlp) in metadata-only mode, picks the formats that are a single downloadable file, and returns each with a signed token that expires in 30 minutes.
3. `src/app/api/download/route.ts` (Next.js route) checks the token and streams the file from the source site's CDN to the browser as an attachment. Nothing is stored.

Every lookup and download is counted, and failures worth fixing (no video found, login walls, stream-only formats, share links that don't resolve, crashes, refused or broken downloads, timeouts and "Didn't work?" reports) are stored with the cleaned link, error, site, yt-dlp version and build. See **Failure log** below.

YouTube works differently: its file links only work from the server that looked them up, so `/api/download` sends YouTube tokens back to `api/info.py` (`GET /api/info?t=…`), which looks the video up again and streams the file in the same request. yt-dlp needs a JavaScript runtime for YouTube; `deno` comes from `requirements.txt` (or is fetched into `/tmp` if the bundle leaves it out). Only single-file formats are offered (360p plus audio); sharper qualities need ffmpeg merging. YouTube often blocks data-center servers ("Sign in to confirm you're not a bot"); those show up as `bot_check` in the failure log. To get past it, upload a throwaway Google account's cookies.txt under **YouTube sign-in** on `/admin`; it is kept in the failure store and YouTube lookups sign in with it. When YouTube invalidates it, failures show up as `cookies_expired` and a new export is needed.

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

## Failure log

- Storage: Upstash Redis over its REST API. In Vercel, open Storage, create an **Upstash for Redis** database (free plan), connect it to the project and redeploy. Without it, failures still go to the function logs.
- Review: set `ADMIN_TOKEN` in Vercel and open `/admin`. It shows lookups and downloads per site with failure rates, the top failure reasons, sites people asked for that we don't support, and the latest failures with their errors.
- Export: `GET /api/admin/failures?days=7` with `Authorization: Bearer $ADMIN_TOKEN` returns everything as JSON, ready to hand to Claude to fix.
- Retention: failure details 30 days (max 2,000 per day), counters 90 days. Links are stored without tracking parameters, and no IP addresses are kept.
- Code: `api/info.py` (lookups) and `src/lib/telemetry.ts` (downloads, browser reports, reading) share the same keys; `tests/fake_upstash.py` stands in for Upstash in tests.

## Editing content

- Brand, contact email, price and traffic numbers: `src/config/site.ts`
- Sponsors: `src/config/sponsors.ts` (logos go in `public/sponsors/`)
- Supported sites, their domains and sample links: `src/config/platforms.json`. `npm test` checks every sample is detected on the page and readable by yt-dlp. Brand icons come from Simple Icons (CC0) in `src/components/brandIcons.ts`.
