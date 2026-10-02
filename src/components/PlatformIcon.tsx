import { brandIcons } from "./brandIcons";

type Props = {
  /** Platform id, or null when the link isn't from a known platform. */
  id: string | null;
  className?: string;
  /** Draw in the current text color instead of the brand color. */
  mono?: boolean;
};

export function PlatformIcon({ id, className, mono = false }: Props) {
  const icon = id ? brandIcons[id] : undefined;

  if (!icon) {
    // A known platform without a brand mark gets a play button; no platform gets a link.
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="none" stroke="currentColor"
        strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        {id ? (
          <>
            <circle cx="12" cy="12" r="9" />
            <path d="m10 8.5 5 3.5-5 3.5z" fill="currentColor" />
          </>
        ) : (
          <>
            <path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1" />
            <path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1" />
          </>
        )}
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor"
      style={mono || icon.ink ? undefined : { color: icon.color }}>
      <path d={icon.path} />
    </svg>
  );
}

/** Fill and text colors for a highlighted platform chip. */
export function brandChipStyle(id: string): React.CSSProperties {
  const icon = brandIcons[id];
  return icon ? { background: icon.color, color: icon.onBrand } : { background: "var(--ink)", color: "var(--bg)" };
}
