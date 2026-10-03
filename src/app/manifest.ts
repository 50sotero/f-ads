import type { MetadataRoute } from "next";
import { site } from "@/config/site";
import { siteDescription } from "@/lib/seo";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${site.name} video downloader`,
    short_name: site.name,
    description: siteDescription,
    start_url: "/",
    display: "standalone",
    background_color: "#fdf6e9",
    theme_color: "#e2531f",
    categories: ["utilities", "entertainment"],
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
