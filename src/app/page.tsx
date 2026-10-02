import { AdvertiseBox } from "@/components/AdvertiseBox";
import { Downloader } from "@/components/Downloader";
import { SponsorGrid } from "@/components/SponsorGrid";
import { site } from "@/config/site";
import { comingSoonPlatforms, supportedPlatforms } from "@/lib/platforms";

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
    a: `${supportedPlatforms.map((p) => p.name).join(", ")}. Just paste the link and we detect the site for you. ${comingSoonPlatforms
      .map((p) => p.name)
      .join(", ")} support is coming soon.`,
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
      <section className="mx-auto max-w-3xl pt-14 pb-10 text-center sm:pt-20">
        <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">
          Download any video. <span className="text-accent">No waiting.</span>
        </h1>
        <p className="mt-4 text-lg text-muted">{site.tagline}</p>
        <div className="mt-8 text-left">
          <Downloader />
        </div>
      </section>

      <SponsorGrid />

      <section id="how" className="mt-16 scroll-mt-8">
        <h2 className="text-2xl font-bold">How it works</h2>
        <ol className="mt-6 grid gap-4 sm:grid-cols-3">
          {steps.map((s, i) => (
            <li key={s.title} className="rounded-2xl border border-line bg-surface p-5">
              <span className="text-sm font-semibold text-accent">Step {i + 1}</span>
              <p className="mt-1 font-semibold">{s.title}</p>
              <p className="mt-1 text-sm text-muted">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-16">
        <h2 className="text-2xl font-bold">Questions</h2>
        <div className="mt-6 divide-y divide-line rounded-2xl border border-line bg-surface">
          {faq.map((f) => (
            <details key={f.q} className="group p-5">
              <summary className="cursor-pointer list-none font-semibold">
                {f.q}
                <span className="float-right text-muted transition group-open:rotate-45">+</span>
              </summary>
              <p className="mt-2 text-muted">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      <div className="mt-16">
        <AdvertiseBox />
      </div>
    </div>
  );
}
