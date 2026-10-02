import Link from "next/link";
import { site } from "@/config/site";
import { activeSponsors, type Sponsor } from "@/config/sponsors";

// Sponsor cards in the style of codex-resets.com: a small "Sponsor" label, the
// logo, the name and a one-line pitch. Wide screens get them in the side
// columns (SponsorRails); narrower screens get a grid under the downloader.

const cardFrame =
  "rounded-xl border-2 border-ink/80 bg-surface shadow-[3px_3px_0_0_rgb(0_0_0/0.25)] transition hover:-translate-y-0.5 hover:rotate-0";

// Every slot, paid or open, for the side columns.
function slots(): (Sponsor | null)[] {
  const shown = activeSponsors().slice(0, site.advertise.totalSlots);
  return [...shown, ...Array<null>(site.advertise.totalSlots - shown.length).fill(null)];
}

// Every paid slot, topped up with open ones to fill a row of four, so small
// screens don't get a wall of "Your brand here" cards.
function inlineSlots(): (Sponsor | null)[] {
  const shown = activeSponsors().slice(0, site.advertise.totalSlots);
  return [...shown, ...Array<null>(Math.max(0, 4 - shown.length)).fill(null)];
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

type CardProps = {
  sponsor: Sponsor | null;
  /** Display and sizing classes; the card is a flex column, so pass "flex" or a variant of it. */
  className?: string;
  /** Smaller logo and a two-line pitch, for the side columns. */
  compact?: boolean;
};

export function SponsorCard({ sponsor, className = "flex", compact = false }: CardProps) {
  const inner = `${compact ? "mt-2" : "mt-3"} flex flex-1 flex-col items-center justify-center text-center`;
  const logo = compact ? "h-10 w-10" : "h-11 w-11";
  if (!sponsor) {
    return (
      <Link href="/#advertise" className={`${cardFrame} flex-col border-dashed p-4 ${className}`}>
        <Label />
        <span className={inner}>
          <span
            className={`${logo} flex items-center justify-center rounded-lg border-2 border-dashed border-muted/60 text-xl text-muted`}
          >
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
      className={`${cardFrame} flex-col p-4 ${className}`}
    >
      <Label />
      <span className={inner}>
        <Logo sponsor={sponsor} className={logo} />
        <span className={`${compact ? "mt-2" : "mt-3"} font-bold`}>{sponsor.name}</span>
        <span
          className={`mt-1 font-mono text-xs leading-relaxed text-muted ${compact ? "line-clamp-2" : "line-clamp-3"}`}
        >
          {sponsor.tagline}
        </span>
      </span>
    </a>
  );
}

/** Under the downloader, below the width where the side rails fit. */
export function SponsorGrid() {
  return (
    <section aria-label="Sponsors" className="grid grid-cols-2 gap-3 lg:grid-cols-4 2xl:hidden">
      {inlineSlots().map((s, i) => (
        <SponsorCard key={s?.name ?? `open-${i}`} sponsor={s} />
      ))}
    </section>
  );
}

// The n-th card in a side column shows once the window is tall enough for it
// at its smallest (180px, 16px gaps, starting 77px down, below the header), so
// short windows drop the lowest cards instead of squeezing them.
const SHOW_AT_HEIGHT = [
  "flex",
  "hidden [@media(min-height:469px)]:flex",
  "hidden [@media(min-height:665px)]:flex",
  "hidden [@media(min-height:861px)]:flex",
];

/**
 * Side columns of cards from just below the header to the bottom of the window,
 * only on screens wide enough that they sit beside the 1024px content column.
 * Slots alternate sides, so slots 1 and 2 are at the top; the cards stretch to
 * share the height.
 */
export function SponsorRails() {
  const all = slots();
  const rail = (side: "left" | "right") => (
    <aside
      aria-label="Sponsors"
      className={`fixed top-[77px] bottom-4 z-10 hidden w-[220px] flex-col gap-4 2xl:flex ${side === "left" ? "left-4" : "right-4"}`}
    >
      {all
        .filter((_, i) => i % 2 === (side === "left" ? 0 : 1))
        .map((s, i) => (
          <SponsorCard
            key={s?.name ?? `open-${side}-${i}`}
            sponsor={s}
            compact
            className={`max-h-[300px] min-h-[180px] flex-1 ${SHOW_AT_HEIGHT[i] ?? "hidden"} ${
              (i % 2 === 0) === (side === "left") ? "rotate-[-0.6deg]" : "rotate-[0.6deg]"
            }`}
          />
        ))}
    </aside>
  );
  return (
    <>
      {rail("left")}
      {rail("right")}
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
        {inlineSlots().map((s, i) =>
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
