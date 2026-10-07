import type { Metadata } from "next";
import { CrowdCannon } from "@/components/CrowdCannon";
import { JsonLd } from "@/components/JsonLd";
import { site } from "@/config/site";
import { levels } from "@/game/levels";
import { absoluteUrl, baseGraph, pageMetadata } from "@/lib/seo";

const description = `Crowd Cannon is a free 3D crowd shooter: multiply your army, upgrade your cannons, defeat giants, and survive their counterattacks. ${levels.length} routes, permanent upgrades, no download or sign-up.`;

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

    </div>
  );
}
