import assert from "node:assert/strict";
import { test } from "node:test";
import { CANNON_Y, newGame, step } from "../src/game/engine.ts";

const assaultLevel = (overrides = {}) => ({
  name: "assault test",
  par: 20,
  bases: [{ x: 125, y: 300, hp: 24, every: 9999, group: 0 }],
  gates: [
    { x: 180, y: 510, w: 170, kind: "x", n: 2 },
    { x: 180, y: 467, w: 170, kind: "x", n: 3 },
    { x: 180, y: 424, w: 170, kind: "x", n: 4 },
  ],
  assault: { horde: 320, reserve: 900, speed: 16, theme: "fork" },
  ...overrides,
});

test("assault starts with a compact horde and explicit reserve state", () => {
  const g = newGame(assaultLevel(), 7);
  assert.ok(g.assault);
  assert.equal(g.assault.encounter, 0);
  assert.equal(g.assault.encounters, 1);
  assert.equal(g.assault.reserve, 900);
  assert.equal(g.red.length, 320);
  assert.equal(g.assault.frontline, 372);
  assert.ok(Math.min(...g.red.map((u) => u.x)) >= 35);
  assert.ok(Math.max(...g.red.map((u) => u.x)) <= 215);
  assert.ok(Math.max(...g.red.map((u) => u.y)) >= 370);
});

test("practice assault pickups raise the cannon tier and emit upgrade feedback", () => {
  const g = newGame(assaultLevel({
    bases: [{ x: 125, y: 300, hp: 999, every: 9999, group: 0 }],
    assault: { horde: 0, reserve: 0, speed: 16, theme: "fork", practice: true, pickupEvery: 20 },
  }));
  g.cannonX = 55;
  g.targetX = 55;
  for (let i = 0; i < 110; i++) step(g, 1 / 60);
  assert.ok(g.assault);
  assert.ok(g.assault.tier > g.assault.startingTier);
  assert.ok(g.assault.pickupsCollected > 0);
  assert.ok(g.pops.some((p) => p.text === "UPGRADE"));
  assert.equal(g.status, "playing");
  assert.equal(g.red.length, 0);
  assert.equal(CANNON_Y, 596);
});

test("assault bosses advance sequentially and preserve future boss health", () => {
  const g = newGame(assaultLevel({
    bases: [
      { x: 125, y: 300, hp: 1, every: 9999, group: 0 },
      { x: 125, y: 300, hp: 5, every: 9999, group: 0 },
    ],
    assault: { horde: 0, reserve: 0, speed: 16, theme: "bend" },
  }));
  g.blue.push({ x: 125, y: 331.2, vx: 0, hp: 1, r: 4.2, big: false, used: 0, dead: false });
  step(g, 1 / 60);
  assert.ok(g.assault);
  assert.equal(g.assault.encounter, 1);
  assert.ok(g.assault.advance > 0);
  assert.equal(g.bases[0].hp, 0);
  assert.equal(g.bases[1].hp, 5);
  assert.equal(g.status, "playing");
});
