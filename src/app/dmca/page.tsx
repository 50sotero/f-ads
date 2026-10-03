import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage";
import { site } from "@/config/site";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Copyright / DMCA",
  description: `How to send a copyright or DMCA notice to ${site.name}, and how we handle it.`,
  path: "/dmca",
});

export default function Dmca() {
  return (
    <LegalPage title="Copyright / DMCA">
      <p>
        {site.name} does not host any videos. Every file is fetched from the original site at the moment a user asks for
        it, and nothing is stored on our servers. To remove content, the most effective step is to ask the site where it
        is published to take it down.
      </p>
      <p>
        If you believe {site.name} is being used to infringe your copyright, email{" "}
        <a href={`mailto:${site.contactEmail}`}>{site.contactEmail}</a> with:
      </p>
      <ul className="list-disc pl-6">
        <li>your name and contact details,</li>
        <li>the work you own and the links involved,</li>
        <li>a statement that you have a good-faith belief the use is not authorized,</li>
        <li>a statement, under penalty of perjury, that the information is accurate and you are the owner or authorized to act for them,</li>
        <li>your physical or electronic signature.</li>
      </ul>
      <p>We review every notice and can block specific links from being processed.</p>
    </LegalPage>
  );
}
