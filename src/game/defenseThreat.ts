// The repository's Node regression runner loads TypeScript directly. Next's
// bundler resolves this concrete source extension, while the expectation keeps
// the existing no-emit TypeScript configuration strict.
// @ts-expect-error Node strip-types tests require the concrete TypeScript path.
import { CANNON_BARREL_SPACING, DEFENSE_Y, cannonBarrelPositions, type Game } from "./engine.ts";

/** Maximum distance from the defense line at which a real red threat is shown. */
export const DEFENSE_THREAT_DISTANCE = 130;

export type DefenseThreatLane = -1 | 0 | 1;
export type DefenseThreatDirection = "left" | "right" | "aligned";

/** Read-only UI data for the closest ordinary red unit near the defense line. */
export type DefenseThreatSnapshot = Readonly<{
  x: number;
  y: number;
  lane: DefenseThreatLane;
  nearLineCount: number;
  direction: DefenseThreatDirection;
}>;

type BarrelAlignment = {
  lane: DefenseThreatLane;
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
      continue;
    }
    if (Math.abs(distance - nearestDistance) <= 1e-9) {
      // A center barrel wins an exact tie. For an even battery, the midpoint
      // between equally distant left and right barrels is the stable center.
      const currentOffset = barrels[nearestIndex].x;
      const nextOffset = barrels[i].x;
      if (Math.abs(nextOffset) < Math.abs(currentOffset) - 1e-9
        || (Math.abs(nextOffset - currentOffset) <= 1e-9 && nextOffset < currentOffset)) {
        nearestIndex = i;
      }
    }
  }

  const nearestOffset = barrels[nearestIndex].x;
  const nearestX = centerX + nearestOffset;
  const gap = x - nearestX;
  // Keep the read model on the same ten-pixel alignment contract used by the
  // existing assault HUD while still deriving each target barrel from the
  // actual tier layout.
  const alignmentTolerance = Math.min(10, CANNON_BARREL_SPACING * 0.5);
  const symmetricMidpoint = barrels.some((barrel) => (
    barrel.x < 0
    && barrels.some((other) => Math.abs(other.x + barrel.x) <= 1e-9)
  ));
  const atEvenBatteryMidpoint = symmetricMidpoint
    && Math.abs(x - centerX) <= 1e-9
    && Math.abs(nearestOffset) > 1e-9;
  const direction: DefenseThreatDirection = Math.abs(gap) <= alignmentTolerance || atEvenBatteryMidpoint
    ? "aligned"
    : gap < 0 ? "left" : "right";
  const lane = atEvenBatteryMidpoint
    ? 0
    : Math.max(-1, Math.min(1, Math.sign(nearestOffset))) as DefenseThreatLane;
  return { lane, direction, gap };
}

function tieBreak(game: Game, candidate: { x: number; y: number }, selected: { x: number; y: number }) {
  if (candidate.y > selected.y + 1e-9) return true;
  if (candidate.y < selected.y - 1e-9) return false;
  const candidateAlignment = barrelAlignment(game, candidate.x);
  const selectedAlignment = barrelAlignment(game, selected.x);
  const candidateGap = Math.abs(candidateAlignment.gap);
  const selectedGap = Math.abs(selectedAlignment.gap);
  if (candidateGap < selectedGap - 1e-9) return true;
  if (candidateGap > selectedGap + 1e-9) return false;
  if (candidateAlignment.lane !== selectedAlignment.lane) {
    // Center is the stable winner when two equally near units occupy a lane
    // boundary; otherwise prefer left before right without array-order state.
    const candidateRank = candidateAlignment.lane === 0 ? 0 : candidateAlignment.lane < 0 ? 1 : 2;
    const selectedRank = selectedAlignment.lane === 0 ? 0 : selectedAlignment.lane < 0 ? 1 : 2;
    return candidateRank < selectedRank;
  }
  return candidate.x < selected.x - 1e-9;
}

/**
 * Selects the closest real ordinary red unit that can physically reach the
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

  let nearest: { x: number; y: number } | null = null;
  let nearLineCount = 0;
  for (const unit of game.red) {
    if (unit.dead || unit.big || unit.sideEntry) continue;
    const distance = DEFENSE_Y - unit.y;
    if (distance > DEFENSE_THREAT_DISTANCE) continue;
    nearLineCount++;
    if (!nearest || tieBreak(game, unit, nearest)) nearest = unit;
  }
  if (!nearest) return null;
  const alignment = barrelAlignment(game, nearest.x);
  return {
    x: nearest.x,
    y: nearest.y,
    lane: alignment.lane,
    nearLineCount,
    direction: alignment.direction,
  };
}
