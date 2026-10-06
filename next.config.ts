import type { NextConfig } from "next";
import { site } from "./src/config/site";

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
  // On Vercel, api/info.py is its own Python function. Locally it runs via
  // `npm run dev:api` (scripts/dev_api.py), so point the route there.
  async rewrites() {
    if (process.env.NODE_ENV !== "development") return [];
    return [{ source: "/api/info", destination: "http://127.0.0.1:8000/api/info" }];
  },
};

export default nextConfig;
