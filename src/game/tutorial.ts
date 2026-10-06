import type { Game, Level } from "./engine";

// Practice is separate from the twelve scored levels, so replaying a lesson
// never awards stars, unlocks a level, or changes a saved campaign result.
export const tutorialLevel: Level = {
  name: "Training ground",
  par: 30,
  bases: [{ x: 180, y: 100, hp: 5000, every: 9999, group: 0, delay: 9999 }],
  gates: [
    { x: 260, y: 420, w: 130, kind: "x", n: 3 },
    { x: 75, y: 300, w: 110, kind: "trap" },
  ],
};

export const tutorialLessons = [
  { title: "Hold. Drag. Fire!", text: "Hold the track to fire, then drag sideways to steer. On a keyboard, hold ← or →.", action: "Fire 8 runners and move across the lane", icon: "↔" },
  { title: "Grow your crowd", text: "Aim through the purple ×3 gate on the right. Every runner becomes three!", action: "Add 8 runners with the gate", icon: "×3" },
  { title: "Send in the champion", text: "Your star is charged. Tap it or press Space to launch a giant that can survive red traps.", action: "Tap the glowing star", icon: "★" },
  { title: "Great shot!", text: "Your champion is on the move. You’re ready for the campaign.", action: "Training complete", icon: "✓" },
] as const;

export type TutorialProgress = {
  step: number;
  minX: number;
  maxX: number;
  multipliedAtStart: number;
  championsAtStart: number;
  completedAt: number;
};

export function newTutorialProgress(): TutorialProgress {
  return { step: 0, minX: 180, maxX: 180, multipliedAtStart: 0, championsAtStart: 0, completedAt: Infinity };
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
    progress.championsAtStart = game.stats.champions;
    return true;
  }
  if (progress.step === 2 && game.stats.champions > progress.championsAtStart) {
    progress.step = 3;
    progress.completedAt = game.t;
    return true;
  }
  return false;
}
