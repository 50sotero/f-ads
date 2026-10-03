import { ogImage, ogSize } from "@/lib/ogImage";
import { landingBySlug, landingPages, landingTitle } from "@/lib/seo";

export const alt = "Free video downloader with no waiting";
export const size = ogSize;
export const contentType = "image/png";

export function generateStaticParams() {
  return landingPages.map((l) => ({ slug: l.slug }));
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const l = landingBySlug((await params).slug)!;
  return ogImage({
    title: landingTitle(l),
    subtitle: `Paste the link and save the ${l.thing}.`,
    platform: l.id,
  });
}
