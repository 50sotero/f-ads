import assert from "node:assert/strict";
import { test } from "node:test";
import { launchChampion, newGame, step } from "../src/game/engine.ts";
import { levels } from "../src/game/levels.ts";
import {
  advanceTutorial,
  newTutorialProgress,
  TUTORIAL_SHIELD_GUARD_X,
  TUTORIAL_SHIELD_GUARD_Y,
  tutorialLessons,
  tutorialLevel,
} from "../src/game/tutorial.ts";

function reachShieldLesson() {
  const progress = newTutorialProgress();
  const game = newGame(tutorialLevel);

  game.stats.fired = 8;
  game.cannonX = 260;
  assert.equal(advanceTutorial(progress, game), true);
  game.stats.multiplied = 8;
  game.cannonX = game.gates[0].cx;
  assert.equal(advanceTutorial(progress, game), true);
  game.assault.pickupsCollected = 1;
  assert.equal(advanceTutorial(progress, game), true);
  game.assault.weaponLevel = 2;
  assert.equal(advanceTutorial(progress, game), true);
  assert.equal(progress.step, 4);
  assert.ok(progress.shieldTarget);
  return { progress, game, target: progress.shieldTarget };
}

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
  Object.assign(game.stats, { fired: 8, multiplied: 20 });
  game.cannonX = 260;
  advanceTutorial(progress, game);
  assert.equal(advanceTutorial(progress, game), false, "old multiplications must not skip the lesson");
  game.stats.multiplied = 28;
  assert.equal(advanceTutorial(progress, game), true);
  assert.equal(progress.step, 2);
  assert.equal(progress.pickupsAtStart, 0);
  assert.equal(advanceTutorial(progress, game), false, "a multiplier must not finish the pickup lesson");
  game.assault.tier = 2;
  game.assault.pickupsCollected++;
  game.t = 12;
  assert.equal(advanceTutorial(progress, game), true);
  assert.equal(progress.step, 3);
  assert.equal(game.assault.weaponTargetsEnabled, true);
  assert.equal(progress.completedAt, Infinity, "collecting a cannon must not finish weapon training");
  assert.equal(advanceTutorial(progress, game), false);
  game.assault.weaponLevel = 2;
  game.t = 15;
  assert.equal(advanceTutorial(progress, game), true);
  assert.equal(progress.step, 4);
  assert.equal(progress.championsAtStart, 0);
  assert.equal(game.charge, 30, "weapon training should prime the practice champion");
  assert.equal(game.red.length, 1, "the final lesson should stage a real shield guard");
  assert.equal(game.red[0].braced, true);
  assert.equal(progress.completedAt, Infinity);
  assert.equal(advanceTutorial(progress, game), false, "a full charge must not launch the champion automatically");
  game.stats.champions++;
  game.t = 16;
  assert.equal(advanceTutorial(progress, game), false, "launch stats alone must not complete the shield lesson");
  assert.equal(progress.step, 4);
  assert.equal(progress.completedAt, Infinity);
  assert.equal(advanceTutorial(progress, game), false);
});

test("multipliers cannot finish the lesson while the cannon is aimed outside the live first panel", () => {
  const progress = newTutorialProgress();
  const game = newGame(tutorialLevel);
  progress.step = 1;
  progress.multipliedAtStart = 0;
  game.stats.multiplied = 8;
  game.cannonX = 285;

  assert.equal(advanceTutorial(progress, game), false, "early center runners must not finish while aiming right");
  assert.equal(progress.step, 1);

  game.cannonX = game.gates[0].cx;
  assert.equal(advanceTutorial(progress, game), true, "the existing multiplier progress should count after aligning");
  assert.equal(progress.step, 2);
});

test("a champion launched before the final lesson does not auto-complete it", () => {
  const progress = newTutorialProgress();
  const game = newGame(tutorialLevel);
  game.stats.champions = 1;
  progress.step = 3;
  game.assault.weaponLevel = 2;
  game.t = 11;

  assert.equal(advanceTutorial(progress, game), true);
  assert.equal(progress.step, 4);
  assert.equal(progress.championsAtStart, 1);
  assert.equal(game.charge, 30);
  assert.equal(advanceTutorial(progress, game), false);
  game.stats.champions = 2;
  assert.equal(advanceTutorial(progress, game), false);
  assert.equal(progress.step, 4);
});

test("ordinary runners are consumed by the staged brace and cannot complete the final lesson", () => {
  const { progress, game, target } = reachShieldLesson();
  game.blue.push({ x: target.x, y: target.y, vx: 0, hp: 1, r: 4.2, big: false, used: 0, dead: false });

  step(game, 1 / 60);

  assert.equal(target.braced, true, "ordinary contact must leave the shield raised");
  assert.equal(target.dead, false);
  assert.equal(progress.step, 4);
  assert.equal(advanceTutorial(progress, game), false);
  assert.equal(progress.step, 4);
});

test("a missed champion leaves the guard intact and earns one bounded retry refill", () => {
  const { progress, game, target } = reachShieldLesson();
  game.cannonX = 80;
  game.targetX = 80;
  assert.equal(launchChampion(game), true);
  assert.equal(advanceTutorial(progress, game), false);
  for (let frame = 0; frame < 600 && progress.step === 4; frame++) {
    step(game, 1 / 60);
    advanceTutorial(progress, game);
  }

  assert.equal(target.braced, true, "a champion launched in the opposite lane must miss the guard");
  assert.equal(target.dead, false);
  assert.equal(game.charge, 30, "a missed champion should get a bounded retry charge");
  assert.equal(progress.step, 4);
});

test("only champion contact breaks and completes the staged shield lesson", () => {
  const { progress, game, target } = reachShieldLesson();
  assert.equal(target.x, TUTORIAL_SHIELD_GUARD_X);
  assert.equal(target.y, TUTORIAL_SHIELD_GUARD_Y);
  game.cannonX = TUTORIAL_SHIELD_GUARD_X;
  game.targetX = TUTORIAL_SHIELD_GUARD_X;
  assert.equal(launchChampion(game), true);

  for (let frame = 0; frame < 600 && progress.step === 4; frame++) {
    step(game, 1 / 60);
    advanceTutorial(progress, game);
  }

  assert.equal(target.braced, false, "the champion must make contact with the shield");
  assert.equal(target.dead, true, "the champion must defeat the guard after breaking its brace");
  assert.equal(progress.step, 5);
  assert.ok(Number.isFinite(progress.completedAt));
});

test("a fully upgraded battery can still complete the pickup lesson", () => {
  const progress = newTutorialProgress();
  const game = newGame(tutorialLevel);
  progress.step = 1;
  game.assault.tier = 5;
  game.assault.pickupsCollected = 4;
  game.stats.multiplied = 10;
  advanceTutorial(progress, game);
  assert.equal(progress.step, 2);
  assert.equal(advanceTutorial(progress, game), false);
  game.cannonX = game.targetX = 55;
  game.assault.pickups = [{ id: 99, x: 55, y: 561, w: 70, value: 1 }];
  step(game, 1 / 60);
  assert.equal(game.assault.tier, 5);
  assert.equal(advanceTutorial(progress, game), true);
  assert.equal(progress.step, 3);
});

test("tutorial is a three gate assault practice route", () => {
  assert.equal(tutorialLessons.length, 5);
  assert.match(tutorialLessons[4].text, /fill.*star.*aim.*shield guard.*press Space.*champions.*shields.*defense line/i);
  assert.deepEqual(tutorialLevel.assault, { horde: 0, reserve: 0, speed: 0, theme: "fork", practice: true });
  assert.deepEqual(
    tutorialLevel.gates.map(({ x, y, w, n }) => ({ x, y, w, n })),
    [
      { x: 180, y: 510, w: 170, n: 2 },
      { x: 180, y: 467, w: 170, n: 3 },
      { x: 180, y: 424, w: 170, n: 4 },
    ],
  );
  assert.deepEqual(tutorialLevel.bases, [{ x: 180, y: 300, hp: 99999, every: 9999, group: 0 }]);
});

test("practice gives players time to learn without changing the campaign", () => {
  const game = newGame(tutorialLevel);
  for (let i = 0; i < 60 * 30; i++) step(game, 1 / 60);
  assert.equal(game.status, "playing");
  assert.equal(game.red.length, 0);
  assert.equal(levels.length, 12);
  assert.ok(!levels.includes(tutorialLevel));
});
