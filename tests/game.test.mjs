// Run with: node --test tests/*.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { newGame, step, CANNON_Y } from "../src/game/engine.ts";
import { levels } from "../src/game/levels.ts";
import { play } from "./gameBot.mjs";

test("there are at least 10 levels, each with a base and a target time", () => {
  assert.ok(levels.length >= 10);
  for (const l of levels) {
    assert.ok(l.bases.length > 0, l.name);
    assert.ok(l.par > 0, l.name);
    assert.ok((l.gates ?? []).length <= 31, `${l.name}: gates are tracked in a 31-bit mask`);
  }
});

test("a sharp player beats every level", () => {
  for (const [i, l] of levels.entries()) {
    for (const seed of [1, 2]) {
      const r = play(l, { seed });
      assert.equal(r.status, "won", `level ${i + 1} ${l.name} (seed ${seed}): ${JSON.stringify(r)}`);
    }
  }
});

test("doing nothing loses every level", () => {
  for (const l of levels) {
    const g = newGame(l);
    while (g.status === "playing" && g.t < 120) step(g, 1 / 60);
    assert.equal(g.status, "lost", l.name);
  }
});

test("a gate multiplies each runner once", () => {
  const g = newGame({ name: "t", par: 1, bases: [{ x: 180, y: 100, hp: 1e6, every: 1e6, group: 0 }], gates: [{ x: 180, y: 400, w: 200, kind: "x", n: 3 }] });
  g.blue.push({ x: 180, y: CANNON_Y - 22, vx: 0, hp: 1, r: 4.2, big: false, used: 0, dead: false });
  for (let i = 0; i < 120; i++) step(g, 1 / 60);
  assert.equal(g.stats.multiplied, 2);
  assert.equal(g.blue.length, 3);
});
