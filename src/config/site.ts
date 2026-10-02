// Edit this file to change the brand, contact and the "Advertise here" numbers.
export const site = {
  name: "F.ADS",
  tagline: "Download videos from X, TikTok, Instagram and more. No waiting, no pop-ups.",
  url: "https://f-ads.vercel.app",
  // TODO: replace with the real sponsorship inbox before launch.
  contactEmail: "sponsors@example.com",
  advertise: {
    // Leave a number as null to hide it until there is real traffic data.
    monthlyVisitors: null as number | null,
    monthlyDownloads: null as number | null,
    pricePerMonthUsd: 500,
    totalSlots: 4,
  },
  supportedSites: ["X / Twitter", "TikTok", "Instagram", "Reddit", "Facebook", "Vimeo", "Twitch clips"],
  comingSoon: ["YouTube"],
};
