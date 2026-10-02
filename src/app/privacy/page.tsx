import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage";
import { site } from "@/config/site";

export const metadata: Metadata = { title: `Privacy – ${site.name}` };

export default function Privacy() {
  return (
    <LegalPage title="Privacy">
      <p>We collect as little as possible.</p>
      <h2>Links you paste</h2>
      <p>
        The link is sent to our server so we can find the video. It is not saved to a database or tied to you. Our
        hosting provider may keep short-lived request logs (such as IP address and time) for security and abuse
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
