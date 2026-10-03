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
      <h2>Cookies and ads</h2>
      <p>
        We do not use advertising cookies or tracking scripts. Sponsor cards are plain links. If you click one, the
        sponsor&apos;s site has its own privacy policy.
      </p>
      <h2>Contact</h2>
      <p>
        Questions: <a href={`mailto:${site.contactEmail}`}>{site.contactEmail}</a>
      </p>
    </LegalPage>
  );
}
