import assert from "node:assert/strict";
import { test } from "node:test";
import { bossBrace, launchChampion, newGame, step } from "../src/game/engine.ts";

const FRAME = 1 / 60;

const makeLevel = (options = {}) => {
  const practice = options.practice ?? false;
  const horde = options.horde ?? 24;
  const slamEvery = Object.hasOwn(options, "slamEvery") ? options.slamEvery : 9;
  return {
    name: "boss brace fixture",
    par: 30,
    bases: [{ x: 180, y: 300, hp: 100, every: 9999, group: 0 }],
    gates: [{ x: 180, y: 0, w: 1, kind: "x", n: 2 }],
    assault: { horde, reserve: 0, speed: 16, theme: "fork", practice, slamEvery },
  };
};

const makeUnit = ({ x = 180, y = 331, big = false } = {}) => ({
  x,
  y,
  vx: 0,
  hp: big ? 14 : 1,
  r: big ? 11 : 4.2,
  big,
  used: 0,
  dead: false,
});

const prepare = (options = {}) => {
  const practice = options.practice ?? false;
  const horde = options.horde ?? 24;
  const game = newGame(makeLevel(options));
  game.firing = false;
  game.red = [];
  game.assault.horde = horde;
  game.assault.reserve = 0;
  game.bases[0].hp = 75;
  return game;
};

const advanceUntil = (game, predicate, maxFrames = 360) => {
  for (let frame = 0; frame < maxFrames; frame++) {
    if (predicate()) return frame;
    step(game, FRAME);
  }
  return maxFrames;
};

test("brace permits ordinary damage but limits one contact batch and only triggers once", () => {
  const game = prepare();
  game.blue.push(...Array.from({ length: 8 }, () => makeUnit()));

  step(game, FRAME);

  assert.deepEqual(bossBrace(game), { phase: "winding", progress: 0, seconds: 4 });
  assert.equal(game.bases[0].hp, 71, "ordinary contacts still damaged the giant");
  assert.equal(game.stats.baseHits, 4, "the winding batch capped ordinary contacts at four");
  assert.equal(game.blue.length, 4, "remaining runners were left alive for the warning window");

  game.blue = [];
  advanceUntil(game, () => bossBrace(game)?.phase === "impact");
  advanceUntil(game, () => bossBrace(game) === null);
  const hpBeforeSecondContact = game.bases[0].hp;
  game.blue.push(makeUnit());
  step(game, FRAME);
  assert.equal(bossBrace(game), null, "the completed encounter brace did not re-arm");
  assert.equal(game.bases[0].hp, hpBeforeSecondContact - 1, "normal contact resumed after the one-shot brace");
});

test("brace arms before a twelve-contact batch can carry the giant below 75%", () => {
  const game = prepare();
  game.bases[0].hp = 80;
  game.blue.push(...Array.from({ length: 12 }, () => makeUnit()));

  step(game, FRAME);

  assert.equal(bossBrace(game)?.phase, "winding");
  assert.equal(game.bases[0].hp, 76, "the predicted lethal batch was limited to four contacts");
  assert.equal(game.blue.length, 8);
});

test("a champion contact interrupts the winding brace and restores normal contact damage", () => {
  const game = prepare();
  game.blue.push(makeUnit({ big: true }), ...Array.from({ length: 4 }, () => makeUnit()));

  step(game, FRAME);

  assert.equal(game.blue.length, 0, "the champion and the ordinary contacts were consumed normally");
  assert.equal(game.bases[0].hp, 50, "the champion dealt its normal damage and ordinary contacts continued");
  assert.deepEqual(bossBrace(game), { phase: "staggered", progress: 0, seconds: 0.6 });
  step(game, 0.3);
  assert.equal(bossBrace(game)?.phase, "staggered");
  step(game, 0.31);
  assert.equal(bossBrace(game), null, "the brief stagger cleaned up");
});

test("a remote champion cannot interrupt the brace", () => {
  const game = prepare();
  const champion = makeUnit({ y: 200, big: true });
  game.blue.push(champion);

  step(game, FRAME);

  assert.equal(champion.dead, false);
  assert.equal(game.bases[0].hp, 75);
  assert.equal(bossBrace(game)?.phase, "winding");
});

test("a champion launched during winding keeps its forward floor through allied crowd", () => {
  const game = prepare();
  step(game, FRAME);
  assert.equal(bossBrace(game)?.phase, "winding");
  game.charge = 30;
  assert.equal(launchChampion(game), true);
  const champion = game.blue.at(-1);
  for (let index = 0; index < 40; index++) {
    game.blue.push({
      x: 180 + (index % 5 - 2) * 2,
      y: 560 - Math.floor(index / 5) * 4,
      vx: 0,
      hp: 1,
      r: 4.2,
      big: false,
      used: 0,
      dead: false,
    });
  }
  const before = champion.y;
  step(game, FRAME);
  assert.ok(before - champion.y >= 0.98, `champion advanced only ${before - champion.y}px through the crowd`);
});

test("unopposed expiry produces a nonlethal impact cue", () => {
  const game = prepare();
  step(game, FRAME);
  assert.equal(bossBrace(game)?.phase, "winding");

  const elapsedFrames = advanceUntil(game, () => bossBrace(game)?.phase === "impact");

  assert.ok(elapsedFrames >= 230 && elapsedFrames <= 250, `brace warning lasted ${elapsedFrames} frames`);
  assert.equal(game.bases[0].hp, 75, "impact did not change boss hp");
  assert.equal(game.status, "playing");
  assert.equal(game.assault.bossPulse, 1);
  assert.equal(bossBrace(game)?.phase, "impact");
});

test("practice and horde-free early assaults do not arm a boss brace", () => {
  const practice = prepare({ practice: true });
  step(practice, FRAME);
  assert.equal(bossBrace(practice), null);
  assert.equal(practice.bases[0].hp, 75);

  const early = prepare({ horde: 24, slamEvery: undefined });
  step(early, FRAME);
  assert.equal(bossBrace(early), null);
  assert.equal(early.bases[0].hp, 75);
});

test("pause and phase changes invalidate the active cue without leaving a stale brace", () => {
  const paused = prepare();
  step(paused, FRAME);
  assert.equal(bossBrace(paused)?.phase, "winding");
  paused.status = "lost";
  step(paused, FRAME);
  assert.equal(bossBrace(paused), null);
  paused.status = "playing";
  step(paused, FRAME);
  assert.equal(bossBrace(paused), null);

  const phased = prepare();
  step(phased, FRAME);
  phased.assault.phase = "counterattack";
  assert.equal(bossBrace(phased), null);
  step(phased, FRAME);
  phased.assault.phase = "battle";
  step(phased, FRAME);
  assert.equal(bossBrace(phased), null, "returning to the old phase did not resurrect the cue");
});
