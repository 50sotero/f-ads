import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/LegalPage";
import { site } from "@/config/site";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Terms of use",
  description: `The rules for using ${site.name}: download only videos you own or may use, how the service works, and how to send a copyright complaint.`,
  path: "/terms",
});

export default function Terms() {
  return (
    <LegalPage title="Terms of use">
      <p>
        {site.name} is a tool that helps you save a copy of publicly available videos for personal use. By using it you
        agree to these terms.
      </p>
      <h2>Your responsibility</h2>
      <p>
        Only download content you own, content in the public domain, or content you have permission from the rights
        holder to download. You are responsible for following copyright law and the terms of the site the video comes
        from.
      </p>
      <h2>What we do</h2>
      <p>
        We do not host, store or cache videos. When you download, the file is streamed from the original site to your
        device. We do not keep a list of what you download.
      </p>
      <h2>No warranty</h2>
      <p>
        The service is provided as is, without any warranty. Sites change often, so a link that works today may stop
        working.
      </p>
      <h2>Copyright complaints</h2>
      <p>
        See our <Link href="/dmca">copyright page</Link>.
      </p>
    </LegalPage>
  );
}
