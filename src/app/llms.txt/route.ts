import { site } from "@/config/site";
import { comingSoonPlatforms } from "@/lib/platforms";
import { absoluteUrl, landingPages, landingTitle, siteDescription } from "@/lib/seo";

// A plain-text summary for AI assistants and answer engines (llmstxt.org).
export const dynamic = "force-static";

export function GET() {
  const body = `# ${site.name}

> ${siteDescription}

${site.name} is a free web tool: paste a link to a public video post and download the video file. There are no countdowns, pop-ups, redirects or sign-up. Videos stream from the original site to the user's device and are not stored. ${comingSoonPlatforms.map((p) => p.name).join(", ")} support is coming soon.

## Downloaders

- [${site.name} video downloader](${absoluteUrl("/")}): works with every supported site; the site is detected from the link.
${landingPages.map((l) => `- [${landingTitle(l)}](${absoluteUrl(`/${l.slug}`)}): ${l.intro}`).join("\n")}

## About

- [Terms of use](${absoluteUrl("/terms")})
- [Privacy](${absoluteUrl("/privacy")})
- [Copyright / DMCA](${absoluteUrl("/dmca")})
- Contact: ${site.contactEmail}
`;
  return new Response(body, { headers: { "content-type": "text/plain; charset=utf-8" } });
}
