import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage";
import { site } from "@/config/site";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Privacy",
  description: `What ${site.name} stores and what it doesn't: no videos and no download history. Failed-link reports expire after 30 days.`,
  path: "/privacy",
});

export default function Privacy() {
  return (
    <LegalPage title="Privacy">
      <p>We collect as little as possible.</p>
      <h2>Links you paste</h2>
      <p>
        The link is sent to our server so we can find the video. When everything works, we only add one to a count
        of downloads per site; the link itself is not kept.
      </p>
      <h2>When something goes wrong</h2>
      <p>
        If a download fails, or you press &ldquo;Didn&apos;t work?&rdquo;, we keep the link (with tracking
        parameters removed), the error and the time for up to 30 days so we can fix the problem. If you paste a link
        from a site we don&apos;t support, we only note the site&apos;s name. None of this includes your IP address or
        anything else that identifies you.
      </p>
      <p>
        Our hosting provider may keep short-lived request logs (such as IP address and time) for security and abuse
        prevention.
      </p>
      <h2>Visitor statistics</h2>
      <p>
        We use Vercel Web Analytics to count page views. It records which page was viewed, the referring site, your
        approximate location (country, region and city), and your browser, operating system and device type. It uses
        no cookies, and visitors are counted with a hash that is discarded after 24 hours, so it can&apos;t follow you
        across days or other sites. The links you paste are not part of it. See{" "}
        <a href="https://vercel.com/docs/analytics/privacy-policy">Vercel&apos;s analytics privacy policy</a>.
      </p>
      <h2>Cookies and ads</h2>
      <p>
        Visitors get no cookies: no analytics or advertising cookies, and no cross-site tracking scripts. The only
        cookie on the site is a sign-in cookie for the owner&apos;s admin page. Sponsor cards are plain links. If you
        click one, the sponsor&apos;s site has its own privacy policy.
      </p>
      <h2>Contact</h2>
      <p>
        Questions: <a href={`mailto:${site.contactEmail}`}>{site.contactEmail}</a>
      </p>
    </LegalPage>
  );
}
