import type { Metadata } from "next";
import Link from "next/link";
import { CrowdCannon } from "@/components/CrowdCannon";
import { JsonLd } from "@/components/JsonLd";
import { SponsorBar, SponsorRails } from "@/components/Sponsors";
import { site } from "@/config/site";
import { levels } from "@/game/levels";
import { absoluteUrl, baseGraph, pageMetadata } from "@/lib/seo";

const description = `Crowd Cannon is a free browser game: fire a crowd through multiplier gates and knock down the enemy base. ${levels.length} levels, no download, no sign-up.`;

export const metadata: Metadata = pageMetadata({
  title: "Crowd Cannon: Free Crowd Shooter Game",
  description,
  path: "/play",
});

export default function PlayPage() {
  return (
    <div className="mx-auto max-w-5xl px-4">
      <JsonLd
        graph={[
          ...baseGraph(),
          {
            "@type": "VideoGame",
            name: "Crowd Cannon",
            url: absoluteUrl("/play"),
            description,
            genre: ["Arcade", "Casual"],
            gamePlatform: "Web browser",
            playMode: "SinglePlayer",
            numberOfPlayers: 1,
            isAccessibleForFree: true,
            offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
            publisher: { "@id": absoluteUrl("/#organization") },
          },
        ]}
      />
      <section className="pt-4 pb-6">
        <h1 className="sr-only">Crowd Cannon, a free game from {site.name}</h1>
        <CrowdCannon />
      </section>

      <div className="mx-auto max-w-3xl">
        <SponsorBar />
      </div>
      <SponsorRails />

      <section className="mx-auto mt-6 max-w-2xl text-muted">
        <h2 className="text-xl font-bold text-ink">How to play</h2>
        <ul className="mt-3 list-disc space-y-1.5 pl-5">
          <li>Hold anywhere on the field and drag left or right to aim. Your cannon fires while you hold.</li>
          <li>Green gates multiply everyone who runs through them. Each gate works once per person, so line up two in a row.</li>
          <li>Red gates and spinning bars wipe out your crowd. Walls make it walk around.</li>
          <li>Shooting fills the star. Tap it (or press Space) to send a champion that takes 14 hits and ignores traps.</li>
          <li>If an enemy crosses the dashed line, the level is lost. Take down every base to win; beat the target time for 3 stars.</li>
          <li>On a keyboard: arrow keys or A and D to aim and fire, Up or W to fire in place.</li>
        </ul>
        <p className="mt-6 text-sm">
          Came for a video? <Link href="/" className="font-semibold text-accent hover:underline">Download it here</Link>, with no waiting.
        </p>
      </section>
    </div>
  );
}
