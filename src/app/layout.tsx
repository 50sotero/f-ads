import type { Metadata, Viewport } from "next";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { site } from "@/config/site";
import { siteDescription } from "@/lib/seo";
import "./globals.css";

// Search Console and Bing Webmaster Tools check these meta tags to prove the site is ours.
const google = process.env.GOOGLE_SITE_VERIFICATION || site.verification.google;
const bing = process.env.BING_SITE_VERIFICATION || site.verification.bing;
const verification: Metadata["verification"] = {
  google: google || undefined,
  other: bing ? { "msvalidate.01": bing } : undefined,
};

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: { default: `${site.name}: Free Video Downloader, No Waiting`, template: `%s | ${site.name}` },
  description: siteDescription,
  applicationName: site.name,
  category: "multimedia",
  creator: site.name,
  publisher: site.name,
  formatDetection: { telephone: false, email: false, address: false },
  openGraph: {
    type: "website",
    siteName: site.name,
    locale: "en_US",
    title: `${site.name}: Free Video Downloader, No Waiting`,
    description: siteDescription,
  },
  twitter: { card: "summary_large_image" },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 },
  },
  verification,
  appleWebApp: { title: site.name, capable: true, statusBarStyle: "default" },
};

// Sponsor slots are sold by the hour and the footer shows them on every page, so
// re-render pages every 5 minutes to drop expired slots without a redeploy.
export const revalidate = 300;

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fdf6e9" },
    { media: "(prefers-color-scheme: dark)", color: "#15120e" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
