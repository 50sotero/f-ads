import assert from "node:assert/strict";
import { test } from "node:test";
import { newGame, step } from "../src/game/engine.ts";

const FRAME = 1 / 60;
const gate = (x, y, n = 2) => ({ x, y, w: 78, kind: "x", n });
const runner = (overrides = {}) => ({
  x: 180, y: 501.6, vx: 0, hp: 1, r: 4.2, big: false,
  used: 0, dead: false, pace: 1, ...overrides,
});
const prepared = (gates, unit, bossY = 1000) => {
  const game = newGame({
    name: "gate guidance regression", par: 20,
    bases: [{ x: 180, y: bossY, hp: 999999, every: 9999, group: 0 }],
    gates, assault: { horde: 0, reserve: 0, speed: 0, theme: "fork" },
  }, 7);
  game.firing = false;
  game.assault.pickups = [];
  game.assault.pickupTimer = 999;
  game.assault.weaponTarget = null;
  game.assault.cannonTarget = null;
  game.assault.weaponTargetsEnabled = false;
  game.assault.bossTimer = Infinity;
  game.blue.push(unit);
  return game;
};

test("a completed branch row cannot attract trailing children to its unchosen sibling", () => {
  for (const selectedX of [120, 240]) {
    const siblingX = selectedX === 120 ? 240 : 120;
    const make = (siblingKind) => prepared([
      { ...gate(siblingX, 500, 3), kind: siblingKind },
      gate(selectedX, 500, 8), gate(selectedX, 457, 2),
    ], runner({ x: selectedX }));
    const visibleSibling = make("x");
    const noSiblingGuidance = make("trap");
    for (let frame = 0; frame < 150; frame++) {
      step(visibleSibling, FRAME);
      step(noSiblingGuidance, FRAME);
      assert.deepEqual(visibleSibling.blue, noSiblingGuidance.blue,
        `unchosen panel changed the selected ${selectedX} stream on frame ${frame}`);
    }
    assert.equal(visibleSibling.blue.length, 16);
    assert.equal(visibleSibling.stats.multiplied, 15);
    assert.ok(visibleSibling.blue.every(unit => unit.used === 6), "a child crossed the unchosen branch");
  }
});

test("completing one panel in each fork row restores the same boss approach as a single route", () => {
  for (const x of [100, 260]) for (const big of [false, true]) {
    const selectedX = x < 180 ? 120 : 240;
    const siblingX = x < 180 ? 240 : 120;
    const selected = [gate(selectedX, 510), gate(selectedX, 467), gate(180, 424)];
    const branched = prepared([
      gate(siblingX, 510), selected[0], gate(siblingX, 467), selected[1], selected[2],
    ], runner({ x, y: 390, big, used: 26 }), 300);
    const singleRoute = prepared(selected, runner({ x, y: 390, big, used: 7 }), 300);
    for (let frame = 0; frame < 20; frame++) {
      step(branched, FRAME);
      step(singleRoute, FRAME);
      assert.equal(branched.blue.length, 1);
      assert.equal(singleRoute.blue.length, 1);
      const { used: branchMask, ...branchUnit } = branched.blue[0];
      const { used: singleMask, ...singleUnit } = singleRoute.blue[0];
      assert.deepEqual(branchUnit, singleUnit, `fork changed ${big ? "champion" : "runner"} approach on frame ${frame}`);
      assert.equal(branchMask, 26, "guidance marked an unchosen panel as crossed");
      assert.equal(singleMask, 7);
    }
    assert.ok(Math.abs(branched.blue[0].x - 180) < Math.abs(x - 180));
    assert.equal(branched.stats.multiplied, 0);
    assert.equal(branched.stats.baseHits, 0);
  }
});

test("an unfinished downstream row still prevents the completed-route pull", () => {
  for (const x of [100, 260]) {
    const game = prepared([
      gate(120, 510), gate(240, 510), gate(120, 467), gate(240, 467), gate(180, 424),
    ], runner({ x, y: 430, used: x < 180 ? 5 : 10, pace: 0 }), 300);
    step(game, FRAME);
    assert.equal(game.blue[0].x, x, "boss pulled a runner that has not completed the final row");
    assert.equal(game.blue[0].vx, 0);
    assert.equal(game.stats.multiplied, 0);
  }
});
