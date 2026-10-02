import Link from "next/link";
import { site } from "@/config/site";
import { activeSponsors, type Sponsor } from "@/config/sponsors";

// Sponsor cards in the style of codex-resets.com: a small "Sponsor" label, the
// logo, the name and a one-line pitch. Wide screens get them in the side
// columns (SponsorRails); narrower screens get a grid under the downloader.

const cardFrame =
  "rounded-xl border-2 border-ink/80 bg-surface shadow-[3px_3px_0_0_rgb(0_0_0/0.25)] transition hover:-translate-y-0.5 hover:rotate-0";

function paidSlots(): Sponsor[] {
  return activeSponsors().slice(0, site.advertise.totalSlots);
}

// The paid cards plus one "Your brand here" card while spots are left, so open
// spots never fill the page with placeholders; only real sponsors add cards.
function withShowcase(paid: Sponsor[], spots: number): (Sponsor | null)[] {
  return paid.length < spots ? [...paid, null] : paid;
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
      <Link
        href="/#advertise"
        className={`${cardFrame} flex-col border-dashed p-4 opacity-50 hover:opacity-100 focus-visible:opacity-100 ${className}`}
      >
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
    <section aria-label="Sponsors" className="flex flex-wrap justify-center gap-3 2xl:hidden">
      {withShowcase(paidSlots(), site.advertise.totalSlots).map((s, i) => (
        <SponsorCard
          key={s?.name ?? `open-${i}`}
          sponsor={s}
          className="flex w-[calc(50%-0.375rem)] lg:w-[calc(25%-0.5625rem)]"
        />
      ))}
    </section>
  );
}

// A side column's n-th most important card shows once the window is tall enough
// for n cards at their smallest (180px, 16px gaps, starting 77px down, below the
// header), so short windows drop the "Your brand here" card first, then the last
// sponsors, instead of squeezing them.
const SHOW_AT_HEIGHT = [
  "flex",
  "hidden [@media(min-height:469px)]:flex",
  "hidden [@media(min-height:665px)]:flex",
  "hidden [@media(min-height:861px)]:flex",
];

/**
 * Side columns of cards, only on screens wide enough that they sit beside the
 * 1024px content column. Each column starts as one faded "Your brand here" card
 * at the bottom of the window; sponsors stack above it, growing toward the
 * header. Once a column is all sponsors, its cards stretch (up to 300px) so it
 * reaches the header on tall screens too. Slots alternate sides, so the first
 * two sponsors sit lowest.
 */
export function SponsorRails() {
  const paid = paidSlots();
  const perSide = Math.ceil(site.advertise.totalSlots / 2);
  const rail = (side: "left" | "right") => {
    const mine = paid.filter((_, i) => i % 2 === (side === "left" ? 0 : 1));
    const full = mine.length >= perSide;
    // Most important first, so the height rules drop the right cards...
    const cards = withShowcase(mine, perSide).map((sponsor, rank) => ({ sponsor, rank }));
    // ...then listed top to bottom: later sponsors above earlier ones, the showcase card last.
    const topToBottom = [...cards.filter((c) => c.sponsor).reverse(), ...cards.filter((c) => !c.sponsor)];
    const tilt = (fromBottom: number) =>
      (fromBottom % 2 === 0) === (side === "left") ? "rotate-[-0.6deg]" : "rotate-[0.6deg]";
    return (
      <aside
        aria-label="Sponsors"
        className={`fixed top-[77px] bottom-4 z-10 hidden w-[220px] flex-col justify-end gap-4 2xl:flex ${side === "left" ? "left-4" : "right-4"}`}
      >
        {topToBottom.map(({ sponsor, rank }, i) => (
          <SponsorCard
            key={sponsor?.name ?? `open-${side}`}
            sponsor={sponsor}
            compact
            className={`min-h-[180px] basis-[200px] ${full ? "max-h-[300px] grow" : ""} ${
              SHOW_AT_HEIGHT[rank] ?? "hidden"
            } ${tilt(topToBottom.length - 1 - i)}`}
          />
        ))}
      </aside>
    );
  };
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
        {withShowcase(paidSlots(), site.advertise.totalSlots).map((s, i) =>
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
