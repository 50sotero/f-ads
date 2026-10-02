import Link from "next/link";
import { site } from "@/config/site";
import { activeSponsors } from "@/config/sponsors";

export function SponsorGrid({ compact = false }: { compact?: boolean }) {
  const sponsors = activeSponsors().slice(0, site.advertise.totalSlots);
  const open = site.advertise.totalSlots - sponsors.length;

  return (
    <section aria-label="Sponsors">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">Sponsors</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {sponsors.map((s) => (
          <a
            key={s.name}
            href={s.href}
            target="_blank"
            rel="sponsored noopener"
            className="flex items-center gap-3 rounded-xl border border-line bg-surface p-4 transition hover:border-muted"
          >
            {s.logo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={s.logo} alt="" width={36} height={36} className="h-9 w-9 shrink-0 rounded-lg object-contain" />
            )}
            <span className="min-w-0">
              <span className="block truncate font-semibold">{s.name}</span>
              {!compact && <span className="block text-sm text-muted">{s.tagline}</span>}
            </span>
          </a>
        ))}
        {Array.from({ length: open }, (_, i) => (
          <Link
            key={`open-${i}`}
            href="/#advertise"
            className="flex items-center justify-center rounded-xl border border-dashed border-line p-4 text-sm text-muted transition hover:border-muted hover:text-ink"
          >
            Your brand here
          </Link>
        ))}
      </div>
    </section>
  );
}
