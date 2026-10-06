import type { Game, Level } from "./engine";

type AssaultPractice = {
  horde: number;
  reserve: number;
  speed: number;
  theme: "fork" | "bridge" | "bend";
  practice: true;
};

// Practice is separate from the twelve scored levels, so replaying a lesson
// never awards stars, unlocks a level, or changes a saved campaign result.
// The assertion keeps this branch compatible until the assault fields land in
// the shared Level type; the runtime shape is the contract used by the engine.
export const tutorialLevel = {
  name: "Training ground",
  par: 30,
  assault: { horde: 0, reserve: 0, speed: 0, theme: "fork", practice: true } satisfies AssaultPractice,
  bases: [{ x: 125, y: 300, hp: 99999, every: 9999, group: 0 }],
  gates: [
    { x: 180, y: 510, w: 170, kind: "x" as const, n: 2 },
    { x: 180, y: 467, w: 170, kind: "x" as const, n: 3 },
    { x: 180, y: 424, w: 170, kind: "x" as const, n: 4 },
  ],
} as unknown as Level & { assault: AssaultPractice };

export const tutorialLessons = [
  { title: "Fire + steer", text: "Hold the track to fire, then drag sideways to steer. On a keyboard, hold ← or →.", action: "Fire 8 runners and move across the lane", icon: "↔" },
  { title: "Chain purple multipliers", text: "Guide your crowd through the purple ×2, ×3, then ×4 gates. Each runner can use every gate once.", action: "Add 8 runners with the multiplier chain", icon: "×4" },
  { title: "Collect a blue +1", text: "Move into a blue +1 gate to add another cannon to your line. The left lane is ready when you are.", action: "Collect one blue +1 pickup", icon: "+1" },
] as const;

export type TutorialProgress = {
  step: number;
  minX: number;
  maxX: number;
  multipliedAtStart: number;
  tierAtStart: number;
  completedAt: number;
};

export function newTutorialProgress(): TutorialProgress {
  return { step: 0, minX: 180, maxX: 180, multipliedAtStart: 0, tierAtStart: 1, completedAt: Infinity };
}

function assaultTier(game: Game) {
  const assault = (game as Game & { assault?: { tier?: number } }).assault;
  return Math.max(1, assault?.tier ?? 1);
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
  if (progress.step === 1 && game.stats.multiplied - progress.multipliedAtStart >= 8) {
    progress.step = 2;
    progress.tierAtStart = assaultTier(game);
    return true;
  }
  if (progress.step === 2 && assaultTier(game) > progress.tierAtStart) {
    progress.step = 3;
    progress.completedAt = game.t;
    return true;
  }
  return false;
}
