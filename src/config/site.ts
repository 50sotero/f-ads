// Edit this file to change the brand, contact and the "Advertise here" numbers.
export const site = {
  name: "F.ADS",
  tagline: "Download videos from X, TikTok, Instagram and more. No waiting, no pop-ups.",
  url: "https://f-ads.vercel.app",
  // Sponsor inquiries, copyright notices and privacy questions go here.
  contactEmail: "victorvcdbswe@gmail.com",
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
