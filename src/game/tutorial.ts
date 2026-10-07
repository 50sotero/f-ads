import type { Game, Level, Unit } from "./engine";

// Keep the practice charge aligned with engine.CHARGE_MAX without adding a
// runtime engine import; the tutorial is also loaded directly by Node tests.
const TUTORIAL_CHARGE_MAX = 30;
const MULTIPLIER_AIM_PADDING = 12;
const TUTORIAL_SHIELD_RETRY_DELAY = 1.25;

/**
 * The final drill uses a right-side lane far enough from the central gate
 * chain that the player must deliberately aim before launching the champion.
 * Keep these coordinates shared with the renderer/HUD marker work.
 */
export const TUTORIAL_SHIELD_GUARD_X = 270;
export const TUTORIAL_SHIELD_GUARD_Y = 360;

// Practice is separate from the twelve scored levels, so replaying a lesson
// never awards stars, unlocks a level, or changes a saved campaign result.
export const tutorialLevel: Level = {
  name: "Training ground",
  par: 30,
  assault: { horde: 0, reserve: 0, speed: 0, theme: "fork", practice: true },
  bases: [{ x: 180, y: 300, hp: 99999, every: 9999, group: 0 }],
  gates: [
    { x: 180, y: 510, w: 170, kind: "x", n: 2 },
    { x: 180, y: 467, w: 170, kind: "x", n: 3 },
    { x: 180, y: 424, w: 170, kind: "x", n: 4 },
  ],
};

export const tutorialLessons = [
  { title: "Fire + steer", text: "Hold to fire and drag to move your cannon. Runners launch straight ahead. On a keyboard, hold ← or →.", action: "Fire 8 runners and move across the lane", icon: "↔" },
  { title: "Chain purple multipliers", text: "Line up your cannon with the purple ×2, ×3, then ×4 gates. Each runner can use every gate once.", action: "Add 8 runners with the multiplier chain", icon: "×4" },
  { title: "Collect a blue +1", text: "Move into a blue +1 gate to add another cannon to your squad. The left lane is ready when you are.", action: "Collect one blue +1 pickup", icon: "+1" },
  { title: "Upgrade your weapon", text: "Aim at the weapon lock on the right and keep firing. Break it to turn every cannon into a three-shot Repeater.", action: "Shoot the lock until its counter reaches zero", icon: "↑" },
  { title: "Break a shield guard", text: "Fill the star, aim at the right-lane shield guard, then press Space or tap it. Champions break shields only on contact; protect the cyan defense line.", action: "Aim at the shield guard, then tap the champion button or press Space", icon: "★" },
] as const;

export type TutorialProgress = {
  step: number;
  minX: number;
  maxX: number;
  multipliedAtStart: number;
  pickupsAtStart: number;
  weaponAtStart: number;
  championsAtStart: number;
  /** The stationary guard introduced by the final drill. */
  shieldTarget?: Unit;
  /** Number of champions observed since the guard was introduced. */
  shieldChampionsObserved: number;
  /** Earliest time to offer a bounded charge refill after a missed champion. */
  shieldRetryAt: number;
  completedAt: number;
};

export function newTutorialProgress(): TutorialProgress {
  return {
    step: 0,
    minX: 180,
    maxX: 180,
    multipliedAtStart: 0,
    pickupsAtStart: 0,
    weaponAtStart: 1,
    championsAtStart: 0,
    shieldChampionsObserved: 0,
    shieldRetryAt: Infinity,
    completedAt: Infinity,
  };
}

function makeTutorialShieldGuard(): Unit {
  return {
    x: TUTORIAL_SHIELD_GUARD_X,
    y: TUTORIAL_SHIELD_GUARD_Y,
    vx: 0,
    hp: 2,
    r: 5.2,
    big: false,
    used: 0,
    dead: false,
    lane: 2,
    pace: 1,
    kind: "guard",
    braced: true,
  };
}

function spawnTutorialShieldGuard(game: Game, progress: TutorialProgress) {
  const target = makeTutorialShieldGuard();
  game.red.push(target);
  progress.shieldTarget = target;
  progress.shieldChampionsObserved = game.stats.champions;
  progress.shieldRetryAt = Infinity;
}

function updateShieldRetry(progress: TutorialProgress, game: Game) {
  const target = progress.shieldTarget;
  if (!target || target.dead || target.braced !== true) return;

  if (game.stats.champions > progress.shieldChampionsObserved) {
    progress.shieldChampionsObserved = game.stats.champions;
    progress.shieldRetryAt = game.t + TUTORIAL_SHIELD_RETRY_DELAY;
  }

  // Practice mode intentionally has no campaign charge clock. Once a missed
  // champion has left the board, give the player one bounded refill so a bad
  // first aim teaches retrying instead of forcing a tutorial restart.
  if (game.t < progress.shieldRetryAt || game.blue.some((unit) => unit.big && !unit.dead)) return;
  game.charge = TUTORIAL_CHARGE_MAX;
  progress.shieldRetryAt = Infinity;
}

/** Lessons advance only after the player performs the action, never on a timer. */
export function advanceTutorial(progress: TutorialProgress, game: Game): boolean {
  progress.minX = Math.min(progress.minX, game.cannonX);
  progress.maxX = Math.max(progress.maxX, game.cannonX);
  if (progress.step === 0 && game.stats.fired >= 8 && progress.maxX - progress.minX >= 70) {
    progress.step = 1;
    progress.multipliedAtStart = game.stats.multiplied;
    return true;
  }
  const firstMultiplier = game.gates.find((gate) => gate.kind === "x");
  const cannonAlignedWithMultiplier = firstMultiplier
    ? Math.abs(game.cannonX - firstMultiplier.cx) <= firstMultiplier.w / 2 + MULTIPLIER_AIM_PADDING
    : false;
  if (progress.step === 1 && cannonAlignedWithMultiplier && game.stats.multiplied - progress.multipliedAtStart >= 8) {
    progress.step = 2;
    progress.pickupsAtStart = game.assault?.pickupsCollected ?? 0;
    return true;
  }
  if (progress.step === 2 && (game.assault?.pickupsCollected ?? 0) > progress.pickupsAtStart) {
    progress.step = 3;
    progress.weaponAtStart = game.assault?.weaponLevel ?? 1;
    if (game.assault) game.assault.weaponTargetsEnabled = true;
    return true;
  }
  if (progress.step === 3 && (game.assault?.weaponLevel ?? 1) > progress.weaponAtStart) {
    progress.step = 4;
    progress.championsAtStart = game.stats.champions;
    // The weapon drill is complete. Leave its lock disabled so a correctly
    // aimed champion reaches the shield guard instead of being consumed by a
    // second lock that the practice route never asks the player to shoot.
    if (game.assault) {
      game.assault.weaponTargetsEnabled = false;
      game.assault.weaponTarget = null;
      game.assault.weaponTargetTimer = 0;
    }
    spawnTutorialShieldGuard(game, progress);
    game.charge = TUTORIAL_CHARGE_MAX;
    return true;
  }
  if (progress.step === 4) {
    updateShieldRetry(progress, game);
    const target = progress.shieldTarget;
    if (target?.dead && target.braced === false) {
      progress.step = 5;
      progress.completedAt = game.t;
      return true;
    }
  }
  return false;
}
