import type { NextConfig } from "next";
import { site } from "./src/config/site";

// Panframe (video to recipe, github.com/50sotero/panframe) is its own Vercel project, served here at /recipe.
const panframe = (process.env.PANFRAME_URL || "https://panframe.vercel.app").replace(/\/$/, "");

const nextConfig: NextConfig = {
  // Landing pages that moved; permanent redirects keep their search ranking.
  async redirects() {
    return [
      { source: "/twitter-video-downloader", destination: "/x-video-downloader", permanent: true },
      // Old addresses forward every page to the same path on the main address.
      ...site.oldHosts.map((host) => ({
        source: "/:path*",
        has: [{ type: "host" as const, value: host }],
        destination: `${site.url}/:path*`,
        permanent: true,
      })),
    ];
  },
  async rewrites() {
    // Checked before this app's own pages, so the [slug] landing route can't claim /recipe.
    const beforeFiles = [
      { source: "/recipe", destination: `${panframe}/recipe` },
      { source: "/recipe/:path*", destination: `${panframe}/recipe/:path*` },
    ];
    // On Vercel, api/info.py is its own Python function. Locally it runs via
    // `npm run dev:api` (scripts/dev_api.py), so point the route there.
    const afterFiles =
      process.env.NODE_ENV === "development" ? [{ source: "/api/info", destination: "http://127.0.0.1:8000/api/info" }] : [];
    return { beforeFiles, afterFiles, fallback: [] };
  },
};

export default nextConfig;
