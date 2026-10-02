// Edit this file to change the brand, contact and the "Advertise here" numbers.
export const site = {
  name: "F.ADS",
  tagline: "Download videos from X, TikTok, Instagram and more. No waiting, no pop-ups.",
  url: "https://f-ads.vercel.app",
  // Sponsor inquiries, copyright notices and privacy questions go here.
  contactEmail: "victorvcdb@gmail.com",
  advertise: {
    // Leave a number as null to hide it until there is real traffic data.
    monthlyVisitors: null as number | null,
    monthlyDownloads: null as number | null,
    pricePerHourUsd: 1,
    pricePerDayUsd: 20,
    // Wide screens fill each side column with up to 4 cards (as many as the window
    // height allows); smaller screens show every paid card under the downloader.
    totalSlots: 8,
  },
};
