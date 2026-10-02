// Paid sponsor slots. Up to `site.advertise.totalSlots` are shown; while spots are
// left, each column adds one faded "Your brand here" card that links to the
// advertise section.
//
// Example:
// {
//   name: "Acme VPN",
//   tagline: "Private browsing in one tap.",
//   href: "https://acme.example?ref=fads",
//   logo: "/sponsors/acme.png", // put the file in public/sponsors/
//   until: "2026-12-31",        // hidden after the end of this day (UTC)
//   // or, for a slot sold by the hour, the exact end time:
//   // until: "2026-10-02T18:00-03:00",
// },
export type Sponsor = {
  name: string;
  tagline: string;
  href: string;
  logo?: string;
  until?: string;
};

export const sponsors: Sponsor[] = [];

// A bare date runs to the end of that day (UTC); a date with a time ends at that moment.
function endsAt(until: string): Date {
  return new Date(/^\d{4}-\d{2}-\d{2}$/.test(until) ? `${until}T23:59:59Z` : until);
}

export function activeSponsors(now = new Date(), list: Sponsor[] = sponsors): Sponsor[] {
  return list.filter((s) => !s.until || endsAt(s.until) >= now);
}
