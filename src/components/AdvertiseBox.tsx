import { site } from "@/config/site";
import { activeSponsors } from "@/config/sponsors";

const fmt = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

export function AdvertiseBox() {
  const { monthlyVisitors, monthlyDownloads, pricePerHourUsd, pricePerDayUsd, totalSlots } = site.advertise;
  const left = Math.max(0, totalSlots - activeSponsors().length);
  const stats = [
    monthlyVisitors != null && { label: "Unique visitors · 30 days", value: `~${fmt.format(monthlyVisitors)}` },
    monthlyDownloads != null && { label: "Downloads · 30 days", value: `~${fmt.format(monthlyDownloads)}` },
    { label: "Price per hour", value: `$${pricePerHourUsd.toLocaleString("en-US")}` },
    { label: "Price per day", value: `$${pricePerDayUsd.toLocaleString("en-US")}` },
    { label: "Ad spots left", value: `${left} of ${totalSlots}` },
  ].filter(Boolean) as { label: string; value: string }[];

  return (
    <section id="advertise" className="scroll-mt-8 rounded-2xl border border-line bg-surface p-6 sm:p-8">
      <h2 className="text-2xl font-bold">Advertise here</h2>
      <p className="mt-2 max-w-2xl text-muted">
        One of {totalSlots} sponsor cards. On big screens it sits beside the downloader and stays in view on every
        page; on phones it shows right under the downloader. Book it by the hour or by the day. No pop-ups, no
        auto-play, no tracking scripts. Just your logo, a line of text and a link.
      </p>
      <dl className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label}>
            <dt className="text-xs text-muted">{s.label}</dt>
            <dd className="mt-1 text-lg font-semibold">{s.value}</dd>
          </div>
        ))}
      </dl>
      <a
        href={`mailto:${site.contactEmail}?subject=${encodeURIComponent(`Sponsor spot on ${site.name}`)}`}
        className="mt-6 inline-block rounded-lg bg-ink px-5 py-2.5 font-semibold text-bg transition hover:opacity-90"
      >
        Get in touch
      </a>
    </section>
  );
}
