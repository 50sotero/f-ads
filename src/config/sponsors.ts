// Paid sponsor slots. Up to `site.advertise.totalSlots` are shown; empty slots
// render as "Your brand here" cards that link to the advertise section.
//
// Example:
// {
//   name: "Acme VPN",
//   tagline: "Private browsing in one tap.",
//   href: "https://acme.example?ref=fads",
//   logo: "/sponsors/acme.png", // put the file in public/sponsors/
//   until: "2026-12-31",        // hidden automatically after this date
// },
export type Sponsor = {
  name: string;
  tagline: string;
  href: string;
  logo?: string;
  until?: string;
};

export const sponsors: Sponsor[] = [];

export function activeSponsors(now = new Date()): Sponsor[] {
  return sponsors.filter((s) => !s.until || new Date(`${s.until}T23:59:59Z`) >= now);
}
