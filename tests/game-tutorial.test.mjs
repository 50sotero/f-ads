import assert from "node:assert/strict";
import { test } from "node:test";
import { newGame, step } from "../src/game/engine.ts";
import { levels } from "../src/game/levels.ts";
import { advanceTutorial, newTutorialProgress, tutorialLevel } from "../src/game/tutorial.ts";

test("tutorial requires firing AND steering before teaching multipliers", () => {
  const progress = newTutorialProgress();
  const game = newGame(tutorialLevel);
  game.stats.fired = 8;
  assert.equal(advanceTutorial(progress, game), false);
  game.cannonX = 260;
  assert.equal(advanceTutorial(progress, game), true);
  assert.equal(progress.step, 1);

  const movedOnly = newTutorialProgress();
  game.stats.fired = 0;
  assert.equal(advanceTutorial(movedOnly, game), false);
});

test("tutorial checks new actions for each lesson and completes once", () => {
  const progress = newTutorialProgress();
  const game = newGame(tutorialLevel);
  Object.assign(game.stats, { fired: 8, multiplied: 20, champions: 1 });
  game.cannonX = 260;
  advanceTutorial(progress, game);
  assert.equal(advanceTutorial(progress, game), false, "old multiplications must not skip the lesson");
  game.stats.multiplied = 28;
  assert.equal(advanceTutorial(progress, game), true);
  assert.equal(progress.step, 2);
  assert.equal(advanceTutorial(progress, game), false, "an earlier champion must not finish training");
  game.stats.champions = 2;
  game.t = 12;
  assert.equal(advanceTutorial(progress, game), true);
  assert.equal(progress.step, 3);
  assert.equal(progress.completedAt, 12);
  assert.equal(advanceTutorial(progress, game), false);
});

test("practice gives players time to learn without changing the campaign", () => {
  const game = newGame(tutorialLevel);
  for (let i = 0; i < 60 * 30; i++) step(game, 1 / 60);
  assert.equal(game.status, "playing");
  assert.equal(game.red.length, 0);
  assert.equal(levels.length, 12);
  assert.ok(!levels.includes(tutorialLevel));
});
