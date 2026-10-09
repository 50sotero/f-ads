import assert from "node:assert/strict";
import { test } from "node:test";
import { applyStartingLoadout, newGame, step } from "../src/game/engine.ts";
import { levels } from "../src/game/levels.ts";

const assaultLevel = (overrides = {}) => ({
  name: "polish test",
  par: 20,
  bases: [{ x: 180, y: 300, hp: 99999, every: 9999, group: 0 }],
  gates: [],
  assault: { horde: 0, reserve: 0, speed: 16, theme: "fork" },
  ...overrides,
});

const defenderAtLine = (big = false) => ({
  x: 180,
  y: 572,
  vx: 0,
  hp: big ? 4 : 1,
  r: big ? 8.5 : 4.4,
  big,
  used: 0,
  dead: false,
});

test("assault breaches consume one defender and spend one integrity pip", () => {
  const game = newGame(assaultLevel());
  game.red.push(defenderAtLine(), defenderAtLine());

  step(game, 1 / 60);

  assert.equal(game.status, "playing");
  assert.equal(game.red.length, 0, "breached defenders should be consumed");
  assert.equal(game.assault.integrity, 1);
  assert.equal(game.assault.maxIntegrity, 3);
  assert.equal(game.assault.breaches, 2);
  assert.equal(game.assault.breachFlash, 1);
});

test("a brute breach spends two pips and only the final pip loses", () => {
  const game = newGame(assaultLevel());
  game.red.push(defenderAtLine(true));

  step(game, 1 / 60);

  assert.equal(game.status, "playing");
  assert.equal(game.assault.integrity, 1);
  assert.equal(game.assault.breaches, 1);
  assert.equal(game.red.length, 0);

  game.red.push(defenderAtLine());
  step(game, 1 / 60);
  assert.equal(game.status, "lost");
  assert.equal(game.assault.integrity, 0);
  assert.ok(game.pops.some((pop) => pop.text === "LINE DOWN"));
});

test("starting loadouts clamp to campaign-safe values and create the next weapon lock", () => {
  const game = newGame(assaultLevel());
  applyStartingLoadout(game, { tier: 9, weaponLevel: 2, charge: 99 });

  assert.equal(game.assault.tier, 3);
  assert.equal(game.assault.startingTier, 3);
  assert.equal(game.assault.weaponLevel, 2);
  assert.equal(game.assault.weaponTarget.hp, 24);
  assert.equal(game.assault.weaponTargetsEnabled, true);
  assert.equal(game.charge, 30);
  assert.deepEqual(game.assault.barrelShots, [0, 0, 0, 0, 0]);

  applyStartingLoadout(game, { tier: 0, weaponLevel: 99, charge: -4 });
  assert.equal(game.assault.tier, 1);
  assert.equal(game.assault.weaponLevel, 3);
  assert.equal(game.assault.weaponTarget, null);
  assert.equal(game.assault.weaponTargetsEnabled, false);
  assert.equal(game.charge, 0);
});

test("campaign routes contain authored branches and lane changes", () => {
  const splitRoutes = levels.filter((level) => {
    const gates = level.gates ?? [];
    return gates.some((gate, index) => gates.some((other, otherIndex) => otherIndex > index && other.y === gate.y && other.x !== gate.x));
  });
  const laneChangeRoutes = levels.filter((level) => new Set((level.gates ?? []).map((gate) => gate.x)).size > 1);
  const routeShapes = new Set(levels.map((level) => (level.gates ?? []).map((gate) => `${gate.x}:${gate.y}:${gate.w}:${gate.n}`).join("|")));

  assert.ok(splitRoutes.length >= 4, `expected visible branch routes, got ${splitRoutes.length}`);
  assert.ok(laneChangeRoutes.length >= 8, `expected varied lane routes, got ${laneChangeRoutes.length}`);
  assert.ok(routeShapes.size >= 6, `expected six authored route shapes, got ${routeShapes.size}`);
  assert.ok((levels[0].gates ?? []).every((gate) => gate.x === 180), "the opening route should remain approachable");
});

test("right split runners keep the nearest right panel before the boss approach", () => {
  const game = newGame(levels[1], 17);
  game.firing = false;
  game.red = [];
  game.assault.reserve = 0;
  game.assault.horde = 0;
  game.assault.pickups = [];
  game.assault.weaponTarget = null;
  game.assault.cannonTarget = null;
  game.assault.weaponTargetsEnabled = false;
  const runner = { x: 240, y: 520, vx: 0, hp: 1, r: 4.2, big: false, used: 0, dead: false };
  game.blue.push(runner);

  for (let frame = 0; frame < 120 && (runner.used & (1 << 3)) === 0; frame++) step(game, 1 / 60);

  assert.equal(runner.used & (1 << 1), 1 << 1, "the launch crossed the right first branch");
  assert.equal(runner.used & (1 << 3), 1 << 3, "the runner reached the right second branch");
  assert.ok(runner.x > 200, `right branch guidance bent toward the left panel at x=${runner.x}`);
});

test("an engaged crowd holds the boss while a full contact row attacks", () => {
  const game = newGame(assaultLevel());
  const boss = game.bases[0];
  game.assault.bossTime = 3.1;
  for (let i = 0; i < 24; i++) game.blue.push({
    x: 135 + (i % 12) * 8, y: boss.y + boss.h / 2 + 4.2,
    vx: 0, hp: 1, r: 4.2, big: false, used: 0, dead: false,
  });
  step(game, 1 / 60);
  assert.equal(boss.y, 300, "giant walked through the dense fighting front");
  assert.equal(game.stats.baseHits, 12, "the broad contact row did not attack together");
  assert.equal(game.blue.length, 12, "contact discarded non-attacking survivors");
  assert.ok(game.blue.every((u) => u.y >= boss.y + boss.h / 2), "engaged runners escaped behind the boss");
  game.blue = [];
  step(game, 1 / 60);
  assert.ok(boss.y > 300, "giant did not resume pressure after its path cleared");
});

test("advanced survivors arrive ahead of the next boss without a teleport", () => {
  const game = newGame(assaultLevel({ bases: [
    { x: 180, y: 300, hp: 1, every: 9999, group: 0 },
    { x: 180, y: 300, hp: 9999, every: 9999, group: 0 },
  ] }));
  const leader = { x: 35, y: 20, vx: 0, hp: 1, r: 4.2, big: false, used: 7, dead: false };
  game.blue.push(leader, { ...leader, x: 180, y: 330, used: 0 });
  step(game, 1 / 60);
  assert.equal(game.assault.phase, "advance");
  const lane = leader.x;
  while (game.assault.phase === "advance") {
    const previousY = leader.y;
    step(game, 1 / 60);
    assert.ok(leader.y - previousY <= 6.4, "road transition teleported the forward crowd");
  }
  assert.ok(game.blue.includes(leader), "road transition discarded a survivor");
  assert.equal(leader.x, lane);
  assert.equal(leader.used, 7);
  assert.ok(leader.y > game.bases[1].y + game.bases[1].h / 2 + leader.r, "survivor bypassed the new giant");
});
