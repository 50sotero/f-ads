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
    <div className="mx-auto w-full max-w-6xl px-3 sm:px-6">
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
      <section className="relative -mx-3 min-h-[100dvh] pt-0 pb-0 sm:mx-0 sm:min-h-0 sm:pt-5 sm:pb-9">
        <h1 className="sr-only">Crowd Cannon, a free game from {site.name}</h1>
        <CrowdCannon />
      </section>

      <div className="mx-auto max-w-3xl">
        <SponsorBar />
      </div>
      <SponsorRails />

      <section className="mx-auto mt-7 max-w-3xl rounded-3xl border border-line bg-surface/85 p-5 text-muted shadow-sm sm:mt-10 sm:p-7">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold tracking-[0.16em] text-accent uppercase">Crowd Cannon field guide</p>
            <h2 className="mt-1 text-2xl font-bold text-ink">How to play</h2>
          </div>
          <span className="hidden rounded-full bg-[#e5f8f7] px-3 py-1 text-xs font-bold text-[#217c8e] sm:inline">12 stages</span>
        </div>
        <ul className="mt-5 grid gap-3 text-sm leading-6 sm:grid-cols-2 sm:gap-x-8">
          <li><strong className="text-ink">Steer and fire.</strong> Hold anywhere on the arena and drag left or right. Your cannon keeps firing while you hold.</li>
          <li><strong className="text-ink">Pick your gate.</strong> Purple gates multiply every runner who crosses them. Each gate works once per person, so line up two in a row.</li>
          <li><strong className="text-ink">Read the hazards.</strong> Red trap gates and spinning bars wipe out your crew. Walls make runners walk around.</li>
          <li><strong className="text-ink">Save your champion.</strong> Shooting fills the star. Tap it (or press Space) to send a champion that ignores traps and absorbs heavy hits.</li>
          <li><strong className="text-ink">Hold the line.</strong> If an enemy reaches your defense line, the level is lost. Take down every base to win.</li>
          <li><strong className="text-ink">Chase stars.</strong> Beat the target time shown by the level to earn 3 stars. Arrow keys or A/D aim on desktop; Up/W fires in place.</li>
        </ul>
        <p className="mt-6 text-sm">
          Came for a video? <Link href="/" className="font-semibold text-accent hover:underline">Download it here</Link>, with no waiting.
        </p>
      </section>
    </div>
  );
}
