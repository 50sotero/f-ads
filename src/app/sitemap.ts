import type { MetadataRoute } from "next";
import { absoluteUrl, landingPages } from "@/lib/seo";

// Bump when a page's text changes, so search engines know to re-read it.
const contentUpdated = new Date("2026-10-05");
const legalUpdated = new Date("2026-10-02");

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: absoluteUrl("/"), lastModified: contentUpdated, changeFrequency: "weekly", priority: 1 },
    ...landingPages.map((l) => ({
      url: absoluteUrl(`/${l.slug}`),
      lastModified: contentUpdated,
      changeFrequency: "weekly" as const,
      priority: l.platform.featured ? 0.9 : 0.7,
    })),
    ...["/terms", "/privacy", "/dmca"].map((path) => ({
      url: absoluteUrl(path),
      lastModified: legalUpdated,
      changeFrequency: "yearly" as const,
      priority: 0.2,
    })),
  ];
}
