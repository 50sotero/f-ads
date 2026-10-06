import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Downloader } from "@/components/Downloader";
import { Faq, SiteLinks, Steps } from "@/components/Guide";
import { JsonLd } from "@/components/JsonLd";
import { PlatformIcon } from "@/components/PlatformIcon";
import { SponsorBar, SponsorGrid, SponsorRails } from "@/components/Sponsors";
import { site } from "@/config/site";
import {
  absoluteUrl,
  baseGraph,
  breadcrumbs,
  faqPage,
  howTo,
  landingBySlug,
  landingPages,
  landingTitle,
  pageMetadata,
  webApp,
  type LandingPage,
} from "@/lib/seo";

// One page per supported site (see src/config/landing.ts); any other path is a 404.
export const dynamicParams = false;

export function generateStaticParams() {
  return landingPages.map((l) => ({ slug: l.slug }));
}

function description(l: LandingPage) {
  if (l.description) return l.description;
  return `Download ${l.keyword} ${l.thing}s for free as MP4. Paste the link, pick a quality and save it. No countdowns, pop-ups or sign-up.`;
}

function steps(l: LandingPage) {
  return [
    { title: "Copy the link", body: l.copyStep },
    { title: "Paste it here", body: `Paste the link in the box above. We fetch the ${l.thing} right away.` },
    { title: "Pick a quality", body: "Choose the size you want and the file saves to your device." },
  ];
}

function questions(l: LandingPage) {
  return [
    ...l.faq,
    {
      q: `Is the ${landingTitle(l)} free?`,
      a: `Yes. There is no sign-up, no limit and no countdown. ${site.name} is paid for by small sponsor cards on the page that never block the download.`,
    },
    {
      q: "Does it work on phones?",
      a: "Yes. It runs in any browser on iPhone, Android, Windows, Mac and Linux, with nothing to install.",
    },
    {
      q: `Do you keep the ${l.keyword} videos I download?`,
      a: "No. Files stream from the original site to your device. We don't store videos or keep a history of what you download.",
    },
  ];
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const l = landingBySlug((await params).slug);
  if (!l) return {};
  return pageMetadata({
    title: l.title ?? `${landingTitle(l)}: Free, No Waiting`,
    description: description(l),
    path: `/${l.slug}`,
  });
}

export default async function LandingRoute({ params }: Props) {
  const l = landingBySlug((await params).slug);
  if (!l) notFound();

  const url = absoluteUrl(`/${l.slug}`);
  const title = landingTitle(l);
  const howSteps = steps(l);
  const faq = questions(l);

  return (
    <div className="mx-auto max-w-5xl px-4">
      <JsonLd
        graph={[
          ...baseGraph(),
          webApp({ id: `${url}#app`, name: `${site.name} ${title}`, url, description: description(l), sites: [l.platform.name] }),
          howTo(url, `How to download ${l.keyword} ${l.thing}s`, howSteps),
          faqPage(url, faq),
          breadcrumbs([
            { name: site.name, url: absoluteUrl("/") },
            { name: title, url },
          ]),
        ]}
      />
      <nav aria-label="Breadcrumb" className="pt-6 text-sm text-muted">
        <ol className="flex gap-2">
          <li>
            <Link href="/" className="hover:text-ink">{site.name}</Link>
          </li>
          <li aria-hidden="true">/</li>
          <li aria-current="page" className="text-ink">{title}</li>
        </ol>
      </nav>

      <section className="mx-auto max-w-3xl pt-8 pb-10 text-center sm:pt-12">
        <p className="inline-flex items-center gap-2 text-sm font-semibold tracking-wide text-accent uppercase">
          <PlatformIcon id={l.id} className="h-4 w-4" />
          Free {l.keyword} downloader
        </p>
        <h1 className="mt-3 text-4xl font-extrabold tracking-tight sm:text-5xl">{title}</h1>
        <p className="mt-4 text-lg text-muted">{l.intro}</p>
        <div className="mt-8 text-left">
          <Downloader placeholder={`Paste a link from ${l.keyword}…`} />
        </div>
      </section>

      <div className="mx-auto max-w-3xl">
        <SponsorBar />
      </div>
      <SponsorGrid />
      <SponsorRails />

      <Steps heading={`How to download ${l.keyword} ${l.thing}s`} steps={howSteps} />
      {l.guide && (
        <section className="mt-16 max-w-3xl">
          {l.guide.map((g) => (
            <div key={g.heading} className="mt-8 first:mt-0">
              <h2 className="text-xl font-bold">{g.heading}</h2>
              {g.paragraphs.map((text) => (
                <p key={text} className="mt-2 leading-relaxed text-muted">{text}</p>
              ))}
            </div>
          ))}
        </section>
      )}
      <Faq heading={`${title} questions`} faq={faq} />
      <SiteLinks heading="More video downloaders" exclude={l.slug} />
    </div>
  );
}
