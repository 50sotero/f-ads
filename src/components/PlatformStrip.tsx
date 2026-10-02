import { featuredPlatforms, supportedPlatforms, type Platform } from "@/lib/platforms";
import { brandChipStyle, PlatformIcon } from "./PlatformIcon";

/** The row of supported sites under the link box; the detected one lights up. */
export function PlatformStrip({ active }: { active: Platform | null }) {
  const shown = active && !active.featured ? [active, ...featuredPlatforms] : featuredPlatforms;
  const more = supportedPlatforms.filter((p) => !shown.includes(p)).length;

  return (
    <ul aria-label="Supported sites" className="flex flex-wrap items-center justify-center gap-2">
      {shown.map((p) => {
        const isActive = p.id === active?.id;
        return (
          <li key={p.id} title={p.status === "soon" ? `${p.name} (coming soon)` : p.name}>
            <span
              style={isActive ? brandChipStyle(p.id) : undefined}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-all duration-200 ${
                isActive
                  ? "scale-105 border-transparent shadow-sm ring-1 ring-inset ring-white/15"
                  : `border-line text-muted ${active ? "opacity-40" : ""}`
              }`}
            >
              <PlatformIcon id={p.id} mono={isActive} className="h-3.5 w-3.5" />
              <span className={isActive ? "" : "sr-only sm:not-sr-only"}>{p.name}</span>
              {p.status === "soon" && <span className="opacity-70">· soon</span>}
            </span>
          </li>
        );
      })}
      {more > 0 && <li className="text-xs text-muted">+{more} more</li>}
    </ul>
  );
}
