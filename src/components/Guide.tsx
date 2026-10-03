import Link from "next/link";
import { landingPages, landingTitle } from "@/lib/seo";
import { PlatformIcon } from "./PlatformIcon";

export type Step = { title: string; body: string };
export type Question = { q: string; a: string };

export function Steps({ heading, steps }: { heading: string; steps: Step[] }) {
  return (
    <section id="how" className="mt-16 scroll-mt-8">
      <h2 className="text-2xl font-bold">{heading}</h2>
      <ol className="mt-6 grid gap-4 sm:grid-cols-3">
        {steps.map((s, i) => (
          <li key={s.title} id={`step-${i + 1}`} className="rounded-2xl border border-line bg-surface p-5">
            <span className="text-sm font-semibold text-accent">Step {i + 1}</span>
            <h3 className="mt-1 font-semibold">{s.title}</h3>
            <p className="mt-1 text-sm text-muted">{s.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function Faq({ heading = "Questions", faq }: { heading?: string; faq: Question[] }) {
  return (
    <section className="mt-16">
      <h2 className="text-2xl font-bold">{heading}</h2>
      <div className="mt-6 divide-y divide-line rounded-2xl border border-line bg-surface">
        {faq.map((f) => (
          <details key={f.q} className="group p-5">
            <summary className="flex cursor-pointer list-none items-start justify-between gap-4 font-semibold">
              <h3>{f.q}</h3>
              <span className="text-muted transition group-open:rotate-45">+</span>
            </summary>
            <p className="mt-2 text-muted">{f.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

/** Links to every site's own downloader page, so people and crawlers can reach them all. */
export function SiteLinks({ heading, exclude }: { heading: string; exclude?: string }) {
  return (
    <section className="mt-16">
      <h2 className="text-2xl font-bold">{heading}</h2>
      <ul className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {landingPages
          .filter((l) => l.slug !== exclude)
          .map((l) => (
            <li key={l.slug}>
              <Link
                href={`/${l.slug}`}
                className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2.5 text-sm font-medium transition hover:border-ink/40"
              >
                <PlatformIcon id={l.id} className="h-4 w-4 shrink-0" />
                {landingTitle(l)}
              </Link>
            </li>
          ))}
      </ul>
    </section>
  );
}
