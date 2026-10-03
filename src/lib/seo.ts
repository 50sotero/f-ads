import type { Metadata } from "next";
import { landings, type Landing } from "@/config/landing";
import { site } from "@/config/site";
import { platforms, supportedPlatforms, type Platform } from "./platforms";

/** Shown in search results and link previews; stays under about 160 characters. */
export const siteDescription = `Free online video downloader for TikTok, X (Twitter), Instagram, Facebook, Reddit and ${
  supportedPlatforms.length - 5
} more sites. Paste a link and save the MP4. No countdowns or pop-ups.`;

export type LandingPage = Landing & { platform: Platform };

/** Landing pages for the sites that work today, in platforms.json order. */
export const landingPages: LandingPage[] = landings.flatMap((l) => {
  const platform = platforms.find((p) => p.id === l.id);
  return platform?.status === "supported" ? [{ ...l, platform }] : [];
});

export function landingBySlug(slug: string) {
  return landingPages.find((l) => l.slug === slug);
}

export function landingTitle(l: Landing) {
  return `${l.keyword} ${l.thing === "clip" ? "Clip" : "Video"} Downloader`;
}

/**
 * Title, description, canonical link and share-card text for one page. Child
 * metadata replaces the layout's openGraph object instead of merging into it,
 * so every page passes the full set.
 */
export function pageMetadata(opts: { title: string; description: string; path: string; absoluteTitle?: boolean }): Metadata {
  const shareTitle = opts.absoluteTitle ? opts.title : `${opts.title} | ${site.name}`;
  return {
    title: opts.absoluteTitle ? { absolute: opts.title } : opts.title,
    description: opts.description,
    alternates: { canonical: opts.path },
    openGraph: {
      type: "website",
      siteName: site.name,
      locale: "en_US",
      url: opts.path,
      title: shareTitle,
      description: opts.description,
    },
    twitter: { card: "summary_large_image", title: shareTitle, description: opts.description },
  };
}

export function absoluteUrl(path = "/") {
  return new URL(path, site.url).toString();
}

const orgId = absoluteUrl("/#organization");
const siteId = absoluteUrl("/#website");
const appId = absoluteUrl("/#app");

/** Who runs the site and what the site is; every page's graph links to these. */
export function baseGraph() {
  return [
    {
      "@type": "Organization",
      "@id": orgId,
      name: site.name,
      url: absoluteUrl("/"),
      logo: absoluteUrl("/icon-512.png"),
      email: site.contactEmail,
    },
    {
      "@type": "WebSite",
      "@id": siteId,
      name: site.name,
      url: absoluteUrl("/"),
      description: siteDescription,
      inLanguage: "en",
      publisher: { "@id": orgId },
    },
  ];
}

export function webApp(opts: { id?: string; name: string; url: string; description: string; sites: string[] }) {
  return {
    "@type": "WebApplication",
    "@id": opts.id ?? appId,
    name: opts.name,
    url: opts.url,
    description: opts.description,
    applicationCategory: "MultimediaApplication",
    operatingSystem: "Any",
    browserRequirements: "Requires a modern web browser",
    isAccessibleForFree: true,
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    featureList: [
      "No countdowns, pop-ups or redirects",
      "Detects the site from the pasted link",
      "Choose the video quality",
      "No sign-up and nothing to install",
      ...opts.sites.map((s) => `Download ${s} videos`),
    ],
    provider: { "@id": orgId },
  };
}

export function faqPage(url: string, faq: { q: string; a: string }[]) {
  return {
    "@type": "FAQPage",
    "@id": `${url}#faq`,
    mainEntity: faq.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
}

export function howTo(url: string, name: string, steps: { title: string; body: string }[]) {
  return {
    "@type": "HowTo",
    "@id": `${url}#howto`,
    name,
    totalTime: "PT1M",
    tool: { "@type": "HowToTool", name: "A web browser" },
    step: steps.map((s, i) => ({
      "@type": "HowToStep",
      position: i + 1,
      name: s.title,
      text: s.body,
      url: `${url}#step-${i + 1}`,
    })),
  };
}

export function breadcrumbs(items: { name: string; url: string }[]) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({ "@type": "ListItem", position: i + 1, name: item.name, item: item.url })),
  };
}

/** Serializes a JSON-LD graph for a <script> tag, escaping "<" so text can't close the tag. */
export function jsonLd(graph: object[]) {
  return JSON.stringify({ "@context": "https://schema.org", "@graph": graph }).replace(/</g, "\\u003c");
}
