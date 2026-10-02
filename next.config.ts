import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // On Vercel, api/info.py is its own Python function. Locally it runs via
  // `npm run dev:api` (scripts/dev_api.py), so point the route there.
  async rewrites() {
    if (process.env.NODE_ENV !== "development") return [];
    return [{ source: "/api/info", destination: "http://127.0.0.1:8000/api/info" }];
  },
};

export default nextConfig;
