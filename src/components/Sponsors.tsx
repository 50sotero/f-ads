import Link from "next/link";
import { site } from "@/config/site";
import { activeSponsors, type Sponsor } from "@/config/sponsors";

// Sponsor cards in the style of codex-resets.com: a small "Sponsor" label, the
// logo, the name and a one-line pitch. Wide screens get them in the side
// gutters (SponsorRails); narrower screens get a grid under the downloader.

const cardFrame =
  "rounded-xl border-2 border-ink/80 bg-surface shadow-[3px_3px_0_0_rgb(0_0_0/0.25)] transition hover:-translate-y-0.5 hover:rotate-0";

function slots(): (Sponsor | null)[] {
  const shown = activeSponsors().slice(0, site.advertise.totalSlots);
  return [...shown, ...Array<null>(site.advertise.totalSlots - shown.length).fill(null)];
}

function priceLine() {
  const { pricePerHourUsd, pricePerDayUsd } = site.advertise;
  return `$${pricePerHourUsd}/hour · $${pricePerDayUsd}/day`;
}

function Label() {
  return <span className="font-mono text-[10px] font-semibold tracking-[0.2em] text-muted uppercase">Sponsor</span>;
}

function Logo({ sponsor, className }: { sponsor: Sponsor; className: string }) {
  if (sponsor.logo) {
    // Sponsor logos are local files or other sites' images; a plain img keeps them simple.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={sponsor.logo} alt="" className={`${className} rounded-lg object-contain`} />;
  }
  return (
    <span className={`${className} flex items-center justify-center rounded-lg bg-line text-lg font-bold`}>
      {sponsor.name.charAt(0)}
    </span>
  );
}

export function SponsorCard({ sponsor, className = "" }: { sponsor: Sponsor | null; className?: string }) {
  const inner = "mt-3 flex flex-1 flex-col items-center justify-center text-center";
  if (!sponsor) {
    return (
      <Link href="/#advertise" className={`${cardFrame} flex flex-col border-dashed p-4 ${className}`}>
        <Label />
        <span className={inner}>
          <span className="flex h-11 w-11 items-center justify-center rounded-lg border-2 border-dashed border-muted/60 text-xl text-muted">
            +
          </span>
          <span className="mt-3 font-bold">Your brand here</span>
          <span className="mt-1 font-mono text-xs text-muted">{priceLine()}</span>
        </span>
      </Link>
    );
  }
  return (
    <a
      href={sponsor.href}
      target="_blank"
      rel="sponsored noopener"
      className={`${cardFrame} flex flex-col p-4 ${className}`}
    >
      <Label />
      <span className={inner}>
        <Logo sponsor={sponsor} className="h-11 w-11" />
        <span className="mt-3 font-bold">{sponsor.name}</span>
        <span className="mt-1 line-clamp-3 font-mono text-xs leading-relaxed text-muted">{sponsor.tagline}</span>
      </span>
    </a>
  );
}

/** Under the downloader, below the width where the side rails fit. */
export function SponsorGrid() {
  return (
    <section aria-label="Sponsors" className="grid grid-cols-2 gap-3 lg:grid-cols-4 2xl:hidden">
      {slots().map((s, i) => (
        <SponsorCard key={s?.name ?? `open-${i}`} sponsor={s} />
      ))}
    </section>
  );
}

/**
 * Two cards in each side gutter, pinned to the bottom of the window. Only on
 * screens wide enough that they sit beside the 1024px content column.
 */
export function SponsorRails() {
  const all = slots();
  const half = Math.ceil(all.length / 2);
  const rail = (side: "left" | "right", items: (Sponsor | null)[]) => (
    <aside
      aria-label="Sponsors"
      className={`fixed bottom-4 z-10 hidden w-[220px] flex-col gap-4 2xl:flex ${side === "left" ? "left-4" : "right-4"}`}
    >
      {items.map((s, i) => (
        <SponsorCard
          key={s?.name ?? `open-${side}-${i}`}
          sponsor={s}
          className={`h-52 ${(i % 2 === 0) === (side === "left") ? "rotate-[-0.6deg]" : "rotate-[0.6deg]"}`}
        />
      ))}
    </aside>
  );
  return (
    <>
      {rail("left", all.slice(0, half))}
      {rail("right", all.slice(half))}
    </>
  );
}

/** A slim bar for the first sponsor inside the content column, next to the rails. */
export function SponsorBar() {
  const [first] = activeSponsors();
  if (!first) return null;
  return (
    <a
      href={first.href}
      target="_blank"
      rel="sponsored noopener"
      className={`${cardFrame} group hidden items-center gap-4 px-4 py-3 2xl:flex`}
    >
      <Logo sponsor={first} className="h-9 w-9 shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="font-bold">{first.name}</span>
          <span className="rounded border border-line px-1.5 py-0.5 font-mono text-[10px] tracking-widest text-muted uppercase">
            Sponsor
          </span>
        </span>
        <span className="block truncate font-mono text-xs text-muted">{first.tagline}</span>
      </span>
      <span aria-hidden="true" className="text-xl text-muted transition group-hover:translate-x-1">
        →
      </span>
    </a>
  );
}

/** Compact list in the footer, for pages and screens without the rails. */
export function FooterSponsors() {
  return (
    <section aria-label="Sponsors" className="2xl:hidden">
      <p className="mb-3 font-mono text-xs font-semibold tracking-wider text-muted uppercase">Sponsors</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {slots().map((s, i) =>
          s ? (
            <a
              key={s.name}
              href={s.href}
              target="_blank"
              rel="sponsored noopener"
              className="flex items-center gap-3 rounded-xl border border-line bg-surface p-3 transition hover:border-muted"
            >
              <Logo sponsor={s} className="h-8 w-8 shrink-0" />
              <span className="min-w-0 truncate font-semibold">{s.name}</span>
            </a>
          ) : (
            <Link
              key={`open-${i}`}
              href="/#advertise"
              className="flex items-center justify-center rounded-xl border border-dashed border-line p-3 text-sm text-muted transition hover:border-muted hover:text-ink"
            >
              Your brand here
            </Link>
          ),
        )}
      </div>
    </section>
  );
}
