import assert from "node:assert/strict";
import { test } from "node:test";
import { newGame, step, surgeActive, trapActive } from "../src/game/engine.ts";

const emptyBase = { x: 180, y: 100, hp: 1000, every: 1000, group: 0, delay: 1000 };

test("pulsed traps have stable positive-modulo boundaries", () => {
  const trap = { x: 180, y: 300, w: 80, kind: "trap", pulse: { period: 4, active: 1, phase: 0 } };
  const plainTrap = { x: 180, y: 300, w: 80, kind: "trap" };
  const multiplier = { x: 180, y: 300, w: 80, kind: "x", n: 2 };

  assert.equal(trapActive(multiplier, 0), false);
  assert.equal(trapActive(plainTrap, -100), true);
  assert.equal(trapActive(trap, 0), true);
  assert.equal(trapActive(trap, 0.999), true);
  assert.equal(trapActive(trap, 1), false);
  assert.equal(trapActive(trap, 3.999), false);
  assert.equal(trapActive(trap, 4), true);
  assert.equal(trapActive(trap, -4), true);
});

test("inactive traps let runners through; active traps kill runners and spare champions", () => {
  const safeLevel = {
    name: "safe pulse",
    par: 1,
    bases: [emptyBase],
    gates: [{ x: 180, y: 568, w: 120, kind: "trap", pulse: { period: 2, active: 0.5, phase: 1 } }],
  };
  const safe = newGame(safeLevel);
  safe.blue.push({ x: 180, y: 574, vx: 0, hp: 1, r: 4.2, big: false, used: 0, dead: false });
  step(safe, 0.1); // g.t = 0.1, inside the trap's off window.
  assert.equal(safe.blue.length, 1);
  assert.equal(safe.blue[0].dead, false);

  const activeLevel = {
    name: "active pulse",
    par: 1,
    bases: [emptyBase],
    gates: [{ x: 180, y: 568, w: 120, kind: "trap", pulse: { period: 2, active: 1, phase: 0 } }],
  };
  const active = newGame(activeLevel);
  active.blue.push({ x: 180, y: 574, vx: 0, hp: 14, r: 11, big: true, used: 0, dead: false });
  active.blue.push({ x: 180, y: 574, vx: 0, hp: 1, r: 4.2, big: false, used: 0, dead: false });
  step(active, 0.1);
  assert.equal(active.blue.length, 1);
  assert.equal(active.blue[0].dead, false);
  assert.equal(active.blue[0].big, true);
});

test("surges have clear start/end boundaries and only accelerate regular waves", () => {
  const level = { name: "surge", par: 1, bases: [{ ...emptyBase, bruteEvery: 20 }], surge: { every: 5, duration: 2, strength: 1, delay: 3 } };
  assert.equal(surgeActive(level, 2.999), false);
  assert.equal(surgeActive(level, 3), true);
  assert.equal(surgeActive(level, 4.999), true);
  assert.equal(surgeActive(level, 5), false);
  assert.equal(surgeActive(level, 7.999), false);
  assert.equal(surgeActive(level, 8), true);

  const regular = newGame(level);
  regular.bases[0].timer = 10;
  step(regular, 0.2);

  const surged = newGame(level);
  surged.t = 2.9;
  surged.bases[0].timer = 10;
  step(surged, 0.2);

  assert.equal(regular.bases[0].timer, 9.8);
  assert.equal(surged.bases[0].timer, 9.6);
  assert.ok(Number.isFinite(surged.bases[0].bruteTimer));
  assert.equal(surged.bases[0].bruteTimer, regular.bases[0].bruteTimer);
});
