// Edit this file to change the brand, contact and the "Advertise here" numbers.
export const site = {
  name: "F.ADS",
  tagline: "Download videos from X, TikTok, Instagram and more. No waiting, no pop-ups.",
  // Main address. Older addresses in `oldHosts` forward here (see next.config.ts).
  url: "https://getfads.vercel.app",
  oldHosts: ["f-ads.vercel.app"],
  // Sponsor inquiries, copyright notices and privacy questions go here.
  contactEmail: "victorvcdbswe@gmail.com",
  // Ownership tokens from Google Search Console / Bing Webmaster Tools (the content
  // of their HTML meta tag). They are public, so they live here; an env var of the
  // same purpose (GOOGLE_SITE_VERIFICATION, BING_SITE_VERIFICATION) overrides them.
  verification: { google: "oQVVqAAE9b8CHXj-lwoYT3xZvNnyv1v-w3-2oi_Y5vQ", bing: "" },
  advertise: {
    // Leave a number as null to hide it until there is real traffic data.
    monthlyVisitors: null as number | null,
    monthlyDownloads: null as number | null,
    pricePerHourUsd: 1,
    pricePerDayUsd: 20,
    // Wide screens stack up to 4 cards per side, from the bottom of the window up (as
    // many as its height allows); smaller screens show them under the downloader.
    // Open slots appear as a single faded "Your brand here" card per column.
    totalSlots: 8,
  },
};
