import type { Game, Unit } from "./engine";

/** Champions leave the middle of the battery, even with several cannons. */
export function championShieldAim(game: Game): { target: Unit; direction: "left" | "right" | "aligned" } | null {
  let target: Unit | null = null;
  for (const unit of game.red) {
    if (!unit.dead && unit.braced && (!target || unit.y > target.y)) target = unit;
  }
  if (!target) return null;
  const offset = target.x - game.cannonX;
  // Leave some margin inside the combined champion/guard contact radii.
  const direction = Math.abs(offset) <= 14 ? "aligned" : offset < 0 ? "left" : "right";
  return { target, direction };
}
