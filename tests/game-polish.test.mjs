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
