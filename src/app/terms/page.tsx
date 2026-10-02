import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage";
import { site } from "@/config/site";

export const metadata: Metadata = { title: `Terms of use – ${site.name}` };

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
        See our <a href="/dmca">copyright page</a>.
      </p>
    </LegalPage>
  );
}
