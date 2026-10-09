// The repository's Node regression runner loads TypeScript directly. Next's
// bundler resolves this concrete source extension, while the expectation keeps
// the existing no-emit TypeScript configuration strict.
// @ts-expect-error Node strip-types tests require the concrete TypeScript path.
import { DEFENSE_Y, W, cannonBarrelPositions, type Game } from "./engine.ts";

/** Maximum distance from the defense line at which a real red threat is shown. */
export const DEFENSE_THREAT_DISTANCE = 130;

export type DefenseThreatLane = -1 | 0 | 1;
export type DefenseThreatDirection = "left" | "right" | "aligned";

/** Read-only UI data for the closest nonboss red unit near the defense line. */
export type DefenseThreatSnapshot = Readonly<{
  x: number;
  y: number;
  lane: DefenseThreatLane;
  nearLineCount: number;
  shielded: boolean;
  direction: DefenseThreatDirection;
}>;

type BarrelAlignment = {
  direction: DefenseThreatDirection;
  gap: number;
};

function barrelAlignment(game: Game, x: number): BarrelAlignment {
  const centerX = game.cannonX;
  const barrels = cannonBarrelPositions(game.assault?.tier ?? 1);
  let nearestIndex = 0;
  let nearestDistance = Infinity;
  for (let i = 0; i < barrels.length; i++) {
    const distance = Math.abs(x - (centerX + barrels[i].x));
    if (distance < nearestDistance - 1e-9) {
      nearestIndex = i;
      nearestDistance = distance;
    }
  }

  const nearestOffset = barrels[nearestIndex].x;
  const nearestX = centerX + nearestOffset;
  const gap = x - nearestX;
  // Keep the read model on the same ten-pixel alignment contract used by the
  // existing assault HUD while still deriving each target barrel from the
  // actual tier layout. Exact equal-distance ties retain authored barrel
  // order, so an even battery never invents a center barrel.
  const direction: DefenseThreatDirection = Math.abs(gap) <= 10
    ? "aligned"
    : gap < 0 ? "left" : "right";
  return { direction, gap };
}

function roadLane(x: number): DefenseThreatLane {
  if (x < W / 3) return -1;
  if (x > W * 2 / 3) return 1;
  return 0;
}

/**
 * Selects the closest real nonboss red unit that can physically reach the
 * defense line soon. The selector has no timers or memory: callers can read
 * it every render frame without affecting simulation state.
 *
 * Side-entry raiders are intentionally excluded because their hatch warning
 * already has its own UI. A nominal velocity is not used; congestion makes
 * a countdown misleading, so proximity is measured from the actual center.
 */
export function selectDefenseThreat(game: Game): DefenseThreatSnapshot | null {
  const assault = game.assault;
  if (
    game.status !== "playing"
    || !assault
    || (assault.phase !== "battle" && assault.phase !== "counterattack")
    || game.level.assault?.practice
  ) return null;

  let nearest: Game["red"][number] | null = null;
  let nearLineCount = 0;
  for (const unit of game.red) {
    if (unit.dead || unit.sideEntry || !Number.isFinite(unit.x) || !Number.isFinite(unit.y)) continue;
    const distance = DEFENSE_Y - unit.y;
    if (distance > DEFENSE_THREAT_DISTANCE) continue;
    nearLineCount++;
    if (!nearest
      || unit.y > nearest.y + 1e-9
      || (Math.abs(unit.y - nearest.y) <= 1e-9 && unit.x < nearest.x - 1e-9)) nearest = unit;
  }
  if (!nearest) return null;
  const alignment = barrelAlignment(game, nearest.x);
  return {
    x: nearest.x,
    y: nearest.y,
    lane: roadLane(nearest.x),
    nearLineCount,
    shielded: !!nearest.braced,
    direction: alignment.direction,
  };
}
