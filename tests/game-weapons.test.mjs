import assert from "node:assert/strict";
import { test } from "node:test";
import { newGame, step, MAX_UNITS } from "../src/game/engine.ts";

const level = {
  name: "weapon training", par: 30,
  bases: [{ x: 180, y: 300, hp: 99999, every: 9999, group: 0 }],
  gates: [{ x: 30, y: 480, w: 12, kind: "x", n: 2 }],
  assault: { horde: 0, reserve: 0, speed: 0, theme: "fork" },
};
const tick = (game, seconds) => { for (let i = 0; i < Math.round(seconds * 60); i++) step(game, 1 / 60); };

test("blue pickups add cannons without upgrading the weapon", () => {
  const game = newGame(level);
  game.cannonX = game.targetX = 55;
  game.assault.pickups = [{ id: 99, x: 55, y: 561, w: 70, value: 1 }];
  step(game, 1 / 60);
  assert.equal(game.assault.tier, 2);
  assert.equal(game.assault.weaponLevel, 1);
  assert.equal(game.assault.weaponTarget.hp, 14);
});

test("the gold target needs hits, upgrades every barrel, and has a finite final evolution", () => {
  const game = newGame(level);
  game.assault.pickups = [];
  game.assault.pickupTimer = 999;
  game.cannonX = game.targetX = 307;
  tick(game, 2);
  assert.equal(game.assault.weaponTarget.hp, 14, "moving under the crate should not collect it");
  game.firing = true;
  while (game.assault.weaponLevel < 2 && game.t < 10) step(game, 1 / 60);
  assert.equal(game.assault.weaponLevel, 2);
  assert.equal(game.assault.tier, 1, "weapon evolution should not add a cannon");
  assert.equal(game.assault.weaponTarget, null);
  assert.ok(game.assault.weaponFlash > 0);
  while (game.assault.weaponLevel < 3 && game.t < 20) step(game, 1 / 60);
  assert.equal(game.assault.weaponLevel, 3);
  tick(game, 4);
  assert.equal(game.assault.weaponTarget, null, "max weapon spawned another target");
  assert.equal(game.assault.weaponLevel, 3);
});

test("the weapon lock sits below the first multiplier row but remains directly aimable", () => {
  const placementLevel = {
    ...level,
    gates: [{ x: 240, y: 510, w: 78, kind: "x", n: 4 }],
  };
  const makeUnit = (y) => ({ x: 307, y, vx: 0, hp: 1, r: 4.2, big: false, used: 0, dead: false });

  const passingRow = newGame(placementLevel, 5);
  passingRow.gates = [];
  passingRow.assault.weaponTargetsEnabled = false;
  passingRow.assault.weaponTarget.hp = 1;
  passingRow.blue = [makeUnit(510)];
  step(passingRow, 1 / 60);
  assert.ok(passingRow.assault.weaponTarget.y - passingRow.assault.weaponTarget.h / 2 > placementLevel.gates[0].y);
  assert.equal(passingRow.assault.weaponLevel, 1, "a first-row runner should not buy the weapon incidentally");
  assert.equal(passingRow.blue.length, 1);

  const deliberate = newGame(placementLevel, 5);
  deliberate.gates = [];
  deliberate.assault.weaponTargetsEnabled = false;
  deliberate.assault.weaponTarget.hp = 1;
  deliberate.blue = [makeUnit(550)];
  step(deliberate, 1 / 60);
  assert.equal(deliberate.assault.weaponLevel, 2, "a runner deliberately aimed at the lock should still buy it");
  assert.equal(deliberate.blue.length, 0);
});

test("weapon levels change real shot cadence and releasing fire cancels a burst", () => {
  const counts = [], gaps = [];
  for (const weaponLevel of [1, 2, 3]) {
    const game = newGame(level);
    game.assault.weaponLevel = weaponLevel;
    game.assault.weaponTarget = null;
    game.assault.weaponTargetsEnabled = false;
    game.assault.pickups = [];
    game.assault.pickupTimer = 999;
    game.firing = true;
    const times = [];
    for (let frame = 0; frame < 120; frame++) {
      const before = game.stats.fired;
      step(game, 1 / 60);
      if (game.stats.fired > before) times.push(game.t);
    }
    counts.push(game.stats.fired);
    if (weaponLevel === 2) gaps.push(...times.slice(1).map((t, i) => t - times[i]));
    game.firing = false;
    const stopped = game.stats.fired;
    tick(game, 0.5);
    assert.equal(game.stats.fired, stopped);
    assert.equal(game.assault.burstRemaining, 0);
  }
  assert.ok(counts[1] > counts[0] && counts[2] > counts[1], `shot counts did not increase: ${counts}`);
  assert.ok(Math.max(...gaps) > Math.min(...gaps) * 1.6, "Repeater does not have a burst/pause rhythm");
});

test("rapid fire stays inside the unit cap and a new run starts with Scout", () => {
  const game = newGame(level);
  game.assault.weaponLevel = 3;
  game.assault.tier = 5;
  game.firing = true;
  for (let i = 0; i < MAX_UNITS - 2; i++) game.blue.push({ x: 180, y: 350, vx: 0, hp: 1, r: 4.2, big: false, used: 7, dead: false });
  step(game, 1 / 60);
  assert.ok(game.blue.length <= MAX_UNITS);
  assert.equal(game.stats.fired, 2);
  assert.equal(newGame(level).assault.weaponLevel, 1);
});

test("the left pickup lane stays locked until its cannon target breaks", () => {
  const game = newGame(level);
  assert.deepEqual(game.assault.pickups.map((pickup) => pickup.y), [485, 450, 415, 380]);
  game.assault.weaponLevel = 3;
  game.assault.weaponTarget = null;
  game.assault.pickupTimer = 999;
  game.assault.pickups = [
    { id: 1, x: 55, y: 500, w: 70, value: 1 },
    { id: 2, x: 55, y: 465, w: 70, value: 1 },
  ];
  game.cannonX = game.targetX = 55;
  tick(game, 0.5);
  assert.deepEqual(game.assault.pickups.map((pickup) => pickup.y), [500, 465]);
  game.firing = true;
  tick(game, 2);

  assert.equal(game.assault.cannonTarget, null);
  assert.ok(game.pops.some((p) => p.text === "BREAK!"));
  assert.ok(game.assault.pickups.length >= 2);
  assert.ok(game.assault.pickups.every((pickup, index) => pickup.y > [500, 465][index]));
});
