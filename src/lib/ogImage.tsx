import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { brandIcons } from "@/components/brandIcons";
import { site } from "@/config/site";

export const ogSize = { width: 1200, height: 630 };

const logo = `data:image/svg+xml;base64,${readFileSync(join(process.cwd(), "src/app/icon.svg")).toString("base64")}`;
// Instrument Sans (SIL Open Font License, see src/assets/fonts).
const fonts = [
  { name: "Instrument Sans", data: readFileSync(join(process.cwd(), "src/assets/fonts/InstrumentSans-Regular.ttf")), weight: 400 as const },
  { name: "Instrument Sans", data: readFileSync(join(process.cwd(), "src/assets/fonts/InstrumentSans-Bold.ttf")), weight: 700 as const },
];

/** The 1200×630 card shown when a page is shared on X, WhatsApp, Facebook, Slack… */
export function ogImage({ title, subtitle, platform }: { title: string; subtitle: string; platform?: string }) {
  const icon = platform ? brandIcons[platform] : undefined;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background: "#fdf6e9",
          color: "#1f1a14",
          fontFamily: "Instrument Sans",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
          <img src={logo} width={72} height={72} />
          <span style={{ fontSize: 44, fontWeight: 700 }}>{site.name}</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
            {icon && (
              <svg width="96" height="96" viewBox="0 0 24 24" fill={icon.ink ? "#1f1a14" : icon.color}>
                <path d={icon.path} />
              </svg>
            )}
            <span style={{ fontSize: 76, fontWeight: 700, letterSpacing: -2, lineHeight: 1.05 }}>{title}</span>
          </div>
          <span style={{ fontSize: 36, color: "#6b5f50" }}>{subtitle}</span>
        </div>
        <div style={{ display: "flex", gap: 16 }}>
          {["No countdowns", "No pop-ups", "Free"].map((tag) => (
            <span
              key={tag}
              style={{ fontSize: 28, fontWeight: 700, padding: "10px 22px", borderRadius: 999, background: "#e2531f", color: "#fff" }}
            >
              {tag}
            </span>
          ))}
        </div>
      </div>
    ),
    { ...ogSize, fonts },
  );
}
