import type { Metadata } from "next";
import Link from "next/link";
import { CrowdCannon } from "@/components/CrowdCannon";
import { JsonLd } from "@/components/JsonLd";
import { SponsorBar, SponsorRails } from "@/components/Sponsors";
import { site } from "@/config/site";
import { levels } from "@/game/levels";
import { absoluteUrl, baseGraph, pageMetadata } from "@/lib/seo";

const description = `Horde Assault is a free browser game: steer a growing cannon through purple multiplier chains and blue +1 pickups, then defeat every boss on the road. ${levels.length} routes, no download, no sign-up.`;

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
            name: "Horde Assault",
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
            <p className="text-xs font-bold tracking-[0.16em] text-accent uppercase">Horde Assault field guide</p>
            <h2 className="mt-1 text-2xl font-bold text-ink">How to play</h2>
          </div>
          <span className="hidden rounded-full bg-[#e5f8f7] px-3 py-1 text-xs font-bold text-[#217c8e] sm:inline">12 routes</span>
        </div>
        <ul className="mt-5 grid gap-3 text-sm leading-6 sm:grid-cols-2 sm:gap-x-8">
          <li><strong className="text-ink">Fire and steer.</strong> Hold anywhere on the arena and drag left or right. Your cannon keeps firing while you hold.</li>
          <li><strong className="text-ink">Chain purple gates.</strong> Guide the horde through ×2, ×3, and ×4 gates to multiply your crowd before the next boss.</li>
          <li><strong className="text-ink">Collect blue +1s.</strong> Aim through a blue +1 lane to add a cannon and raise your tier. More cannons mean a stronger frontline.</li>
          <li><strong className="text-ink">Read the road.</strong> Forks, bridges, and bends change the safest line. Keep moving while the red horde closes in.</li>
          <li><strong className="text-ink">Break every boss.</strong> Each route has a sequence of bosses. Defeat the current boss to advance up the road and meet the next.</li>
          <li><strong className="text-ink">Use your champion.</strong> Shooting fills the star. Tap it (or press Space) to launch a champion that can absorb heavy hits.</li>
        </ul>
        <p className="mt-6 text-sm">
          Came for a video? <Link href="/" className="font-semibold text-accent hover:underline">Download it here</Link>, with no waiting.
        </p>
      </section>
    </div>
  );
}
