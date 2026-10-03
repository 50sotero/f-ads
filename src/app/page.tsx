import type { Metadata } from "next";
import { AdvertiseBox } from "@/components/AdvertiseBox";
import { Downloader } from "@/components/Downloader";
import { Faq, SiteLinks, Steps } from "@/components/Guide";
import { JsonLd } from "@/components/JsonLd";
import { SponsorBar, SponsorGrid, SponsorRails } from "@/components/Sponsors";
import { site } from "@/config/site";
import { comingSoonNote, supportedPlatforms } from "@/lib/platforms";
import { absoluteUrl, baseGraph, faqPage, howTo, pageMetadata, siteDescription, webApp } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: `${site.name}: Free Video Downloader for TikTok, X, Instagram & More`,
  absoluteTitle: true,
  description: siteDescription,
  path: "/",
});

const steps = [
  { title: "Copy the link", body: "Tap Share on the post and copy its link." },
  { title: "Paste it here", body: "Drop it in the box above. We spot the site and fetch the video right away." },
  { title: "Pick a quality", body: "Choose the size you want. The file saves straight away." },
];

const faq = [
  {
    q: "Do I have to watch ads or wait?",
    a: "No. There are no countdowns, pop-ups or redirects. Sponsors appear as simple cards on the page and never block the download.",
  },
  {
    q: "Which sites work?",
    a: `${supportedPlatforms.map((p) => p.name).join(", ")}. Just paste the link and we detect the site for you.${comingSoonNote}`,
  },
  {
    q: "Do you keep the videos?",
    a: "No. Files stream from the original site to your device. We do not store videos or keep a history of what you download.",
  },
  {
    q: "Why didn't my link work?",
    a: "Private posts, posts that need a login, and some live streams can't be downloaded. Make sure the post is public and try again.",
  },
];

export default function Home() {
  return (
    <div className="mx-auto max-w-5xl px-4">
      <JsonLd
        graph={[
          ...baseGraph(),
          webApp({
            name: `${site.name} video downloader`,
            url: absoluteUrl("/"),
            description: siteDescription,
            sites: supportedPlatforms.map((p) => p.name),
          }),
          howTo(absoluteUrl("/"), "How to download a video from a link", steps),
          faqPage(absoluteUrl("/"), faq),
        ]}
      />
      <section className="mx-auto max-w-3xl pt-14 pb-10 text-center sm:pt-20">
        <p className="text-sm font-semibold tracking-wide text-accent uppercase">Free online video downloader</p>
        <h1 className="mt-3 text-4xl font-extrabold tracking-tight sm:text-5xl">
          Download any video. <span className="text-accent">No waiting.</span>
        </h1>
        <p className="mt-4 text-lg text-muted">{site.tagline}</p>
        <div className="mt-8 text-left">
          <Downloader />
        </div>
      </section>

      <div className="mx-auto max-w-3xl">
        <SponsorBar />
      </div>
      <SponsorGrid />
      <SponsorRails />

      <Steps heading="How to download a video" steps={steps} />
      <SiteLinks heading="Downloaders for every site" />
      <Faq faq={faq} />

      <div className="mt-16">
        <AdvertiseBox />
      </div>
    </div>
  );
}
