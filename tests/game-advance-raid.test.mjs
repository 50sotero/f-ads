import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assaultEarlyRaid,
  bossBrace,
  newGame,
  step,
} from "../src/game/engine.ts";

const FRAME = 1 / 60;

const defaultCounterattack = {
  waves: 2,
  runners: 4,
  guards: 0,
  brutes: 0,
  interval: 0.65,
  flankEvery: 2,
};

const makeLevel = (options = {}) => {
  const bases = options.bases ?? [
    { x: 180, y: 300, hp: 100, every: 9999, group: 0 },
    { x: 180, y: 300, hp: 100, every: 9999, group: 0 },
  ];
  const counterattack = Object.hasOwn(options, "counterattack")
    ? options.counterattack
    : defaultCounterattack;
  return {
    name: "early roadside raid",
    par: 30,
    bases,
    gates: [],
    walls: options.walls ?? [],
    assault: {
      horde: options.horde ?? 24,
      reserve: 0,
      speed: 16,
      theme: "fork",
      practice: options.practice ?? false,
      slamEvery: options.slamEvery ?? 9,
      ...(counterattack ? { counterattack } : {}),
    },
  };
};

const makeBlue = (x = 180, y = 331.2, big = false) => ({
  x,
  y,
  vx: 0,
  hp: big ? 14 : 1,
  r: big ? 11 : 4.2,
  big,
  used: 0,
  dead: false,
});

const setup = (options = {}) => {
  const game = newGame(makeLevel(options), 17);
  const encounter = options.encounter ?? 1;
  game.assault.encounter = encounter;
  game.assault.phase = "battle";
  game.assault.horde = options.horde ?? 24;
  game.assault.reserve = 0;
  game.red = [];
  game.blue = [makeBlue(game.bases[encounter].x)];
  game.bases[encounter].hp = options.hp ?? 75;
  game.firing = false;
  return game;
};

const trigger = (game) => {
  step(game, FRAME);
  assert.equal(bossBrace(game)?.phase, "winding");
  return assaultEarlyRaid(game);
};

const advanceUntilWave = (game, wave) => {
  for (let frame = 0; frame < 180 && game.assault.wave < wave; frame++) step(game, FRAME);
  assert.equal(game.assault.wave, wave);
};

test("the roadside raid requires a late authored flank and a clear hatch", () => {
  const practice = setup({ practice: true });
  step(practice, FRAME);
  assert.equal(assaultEarlyRaid(practice), null);

  const firstEncounter = setup({ encounter: 0 });
  step(firstEncounter, FRAME);
  assert.equal(assaultEarlyRaid(firstEncounter), null);

  const noSlam = setup({ slamEvery: 0 });
  step(noSlam, FRAME);
  assert.equal(assaultEarlyRaid(noSlam), null);

  const noCounterattack = setup({ counterattack: null });
  step(noCounterattack, FRAME);
  assert.equal(assaultEarlyRaid(noCounterattack), null);

  const runnerless = setup({ counterattack: { ...defaultCounterattack, runners: 0 } });
  step(runnerless, FRAME);
  assert.equal(assaultEarlyRaid(runnerless), null);

  const centered = setup({ counterattack: { ...defaultCounterattack, flankEvery: 1 } });
  step(centered, FRAME);
  assert.equal(assaultEarlyRaid(centered), null);

  const blocked = setup({ walls: [{ x: 285, y: 450, w: 45, h: 45 }] });
  step(blocked, FRAME);
  assert.equal(assaultEarlyRaid(blocked), null, "a wall-covered hatch falls back to the ordinary wave");
  assert.equal(blocked.red.length, 0);
});

test("the brace commits an exact two-second warning and opens the actual roadside hatch", () => {
  const game = setup();
  const warning = trigger(game);
  assert.deepEqual(warning, {
    phase: "warning",
    seconds: 2,
    entry: { x: 306, y: 470, count: 2, lane: 1 },
    spawned: 0,
    reserved: 2,
    encounter: 1,
  });
  assert.equal(game.red.length, 0);
  assert.equal(game.assault.remaining, 2);

  for (let frame = 0; frame < 119; frame++) step(game, FRAME);
  assert.equal(game.red.length, 0, "the hatch opened before the warning elapsed");
  assert.equal(assaultEarlyRaid(game)?.phase, "warning");

  step(game, FRAME);
  assert.equal(assaultEarlyRaid(game), null, "the live warning cue closes once both reserved slots are visible");
  assert.equal(game.red.filter((unit) => unit.sideEntry === 1).length, 2);
  assert.ok(game.red.every((unit) => Number.isFinite(unit.breakawayTargetX)));
  assert.ok(game.red.every((unit) => Math.abs(unit.y - 470) < 1));
});

test("pulled slots debit the original wave and do not duplicate after the boss falls", () => {
  const game = setup();
  trigger(game);
  for (let frame = 0; frame < 120; frame++) step(game, FRAME);
  assert.equal(assaultEarlyRaid(game), null);

  game.bases[1].hp = 0;
  step(game, FRAME);
  assert.equal(game.assault.phase, "counterattack");
  assert.equal(game.assault.wave, 0);
  assert.equal(game.red.length, 2, "the already-spawned roadside pair stayed alive");
  assert.equal(assaultEarlyRaid(game), null, "battle-only raid state is hidden after the phase change");

  advanceUntilWave(game, 1);
  assert.equal(game.red.length, 4, "the original wave lost exactly the two pulled runner slots");
  assert.equal(game.red.filter((unit) => unit.kind === "runner").length, 4);
  assert.equal(game.red.filter((unit) => unit.sideEntry === 1).length, 2, "the ordinary wave did not create duplicate hatch slots");
  assert.equal(game.assault.remaining, 8, "living and future wave ledger stayed conserved");
});

test("a giant death during the warning restores unspawned slots to the ordinary wave", () => {
  const game = setup();
  trigger(game);
  game.bases[1].hp = 0;
  step(game, FRAME);
  assert.equal(game.assault.phase, "counterattack");
  assert.equal(game.red.length, 0);
  assert.equal(assaultEarlyRaid(game), null);

  advanceUntilWave(game, 1);
  assert.equal(game.red.length, 4);
  assert.equal(game.red.filter((unit) => unit.sideEntry === 1).length, 2);
});

test("a partially spawned raid cancels its pending slot on boss death and debits only what spawned", () => {
  const game = setup();
  trigger(game);
  game.red = Array.from({ length: 649 }, (_, index) => ({
    x: 20 + (index % 20) * 15,
    y: 100 - Math.floor(index / 20) * 0.2,
    vx: 0,
    hp: 1,
    r: 4.4,
    big: false,
    used: 0,
    dead: false,
  }));
  for (let frame = 0; frame < 120; frame++) step(game, FRAME);
  assert.deepEqual(assaultEarlyRaid(game), {
    phase: "active",
    seconds: 0,
    entry: { x: 306, y: 470, count: 1, lane: 1 },
    spawned: 1,
    reserved: 2,
    encounter: 1,
  });
  game.red = game.red.filter((unit) => unit.kind === "runner");
  assert.equal(game.red.length, 1);

  game.bases[1].hp = 0;
  step(game, FRAME);
  assert.equal(game.assault.phase, "counterattack");
  advanceUntilWave(game, 1);
  assert.equal(game.red.length, 4);
  assert.equal(game.red.filter((unit) => unit.sideEntry === 1).length, 2);
});

test("a live boss retries both roadside slots after red-cap space opens", () => {
  const game = setup();
  trigger(game);
  game.red = Array.from({ length: 650 }, (_, index) => ({
    x: 20 + (index % 20) * 15,
    y: 100 - Math.floor(index / 20) * 0.2,
    vx: 0,
    hp: 1,
    r: 4.4,
    big: false,
    used: 0,
    dead: false,
  }));
  for (let frame = 0; frame < 120; frame++) step(game, FRAME);
  assert.deepEqual(assaultEarlyRaid(game)?.entry, { x: 306, y: 470, count: 2, lane: 1 });
  assert.equal(game.red.length, 650, "a full red cap delayed the first roadside slot");

  game.red.splice(0, 1);
  step(game, FRAME);
  assert.equal(assaultEarlyRaid(game)?.spawned, 1);
  assert.equal(assaultEarlyRaid(game)?.entry.count, 1);
  assert.ok(game.bases[1].hp > 0, "the live giant remained actionable during the retry");

  game.red.splice(0, 1);
  step(game, FRAME);
  assert.equal(assaultEarlyRaid(game), null);
  assert.equal(game.assault.phase, "battle");
  assert.equal(game.red.filter((unit) => unit.sideEntry === 1).length, 2);
});

test("a wall inserted during the warning cancels the hatch and falls back to the ordinary wave", () => {
  const game = setup();
  trigger(game);
  game.walls.push({ x: 285, y: 450, w: 45, h: 45 });
  for (let frame = 0; frame < 120; frame++) step(game, FRAME);
  assert.equal(assaultEarlyRaid(game), null);
  assert.equal(game.red.length, 0, "the blocked hatch created no roadside unit");

  game.bases[1].hp = 0;
  step(game, FRAME);
  advanceUntilWave(game, 1);
  assert.equal(game.red.length, 4, "the blocked raid restored the original wave budget");
  assert.equal(game.red.filter((unit) => unit.sideEntry === 1).length, 0, "the wall kept the ordinary wave off the blocked hatch");
});

test("spawned roadside runners stay alive and keep moving when the boss dies", () => {
  const game = setup();
  trigger(game);
  for (let frame = 0; frame < 120; frame++) step(game, FRAME);
  const runner = game.red.find((unit) => unit.sideEntry === 1);
  assert.ok(runner);
  const beforeDeath = { x: runner.x, y: runner.y };

  game.bases[1].hp = 0;
  step(game, FRAME);
  assert.equal(game.assault.phase, "counterattack");
  assert.ok(game.red.includes(runner), "the spawned runner was discarded with the defeated boss");
  assert.equal(runner.dead, false);

  const afterDeath = { x: runner.x, y: runner.y };
  step(game, FRAME);
  assert.ok(runner.y > afterDeath.y, "the runner stopped moving at the phase boundary");
  assert.ok(Number.isFinite(runner.breakawayTargetX));
  assert.ok(afterDeath.y >= beforeDeath.y);
});

test("early runners use a real breakaway path and can be intercepted locally", () => {
  const game = setup();
  trigger(game);
  for (let frame = 0; frame < 120; frame++) step(game, FRAME);
  const runner = game.red.find((unit) => unit.sideEntry === 1);
  assert.ok(runner);
  const startX = runner.x;
  const startY = runner.y;
  for (let frame = 0; frame < 18; frame++) step(game, FRAME);
  assert.ok(runner.y > startY, "the roadside runner never entered the battle road");
  assert.ok(runner.x > startX, "the runner was pulled back into the giant corridor");
  assert.ok(runner.x <= runner.breakawayTargetX + 1);

  const interceptor = makeBlue(runner.x, runner.y, true);
  game.blue.push(interceptor);
  for (let frame = 0; frame < 8 && !runner.dead; frame++) step(game, FRAME);
  assert.equal(runner.dead, true, "the roadside threat did not use the normal local collision path");
});

test("loss and a new game clear the owned raid snapshot", () => {
  const game = setup();
  trigger(game);
  game.status = "lost";
  step(game, FRAME);
  assert.equal(assaultEarlyRaid(game), null);

  const fresh = newGame(makeLevel(), 17);
  assert.equal(assaultEarlyRaid(fresh), null);
});
