import assert from "node:assert/strict";
import { test } from "node:test";
import { newGame, step, W } from "../src/game/engine.ts";

const denseLevel = {
  name: "flow test",
  par: 1,
  bases: [{ x: 180, y: 60, hp: 1e6, every: 1e6, group: 0 }],
  walls: [{ x: 150, y: 300, w: 60, h: 220 }],
};

function crowdGame() {
  const g = newGame(denseLevel);
  for (let i = 0; i < 60; i++) {
    g.blue.push({
      x: 180 + (i % 3 - 1) * 0.1,
      y: 570 - Math.floor(i / 10) * 2,
      vx: 0,
      hp: 1,
      r: 4.2,
      big: false,
      used: 0,
      dead: false,
    });
  }
  return g;
}

test("dense crowd flow separates through a wall without leaving the field", () => {
  const g = crowdGame();
  let widest = 0;
  for (let frame = 0; frame < 180; frame++) {
    step(g, 1 / 60);
    const xs = g.blue.map((u) => u.x);
    widest = Math.max(widest, Math.max(...xs) - Math.min(...xs));
    for (const u of g.blue) {
      assert.ok(u.x >= u.r && u.x <= W - u.r, `unit escaped at x=${u.x}`);
      const insideWall = u.x > 150 - u.r && u.x < 210 + u.r && u.y > 300 - u.r && u.y < 520 + u.r;
      assert.equal(insideWall, false, `unit crossed the wall at (${u.x}, ${u.y})`);
    }
  }
  assert.ok(widest > 70, `crowd did not separate laterally: ${widest}`);
});

test("crowd flow remains bounded at the unit cap", () => {
  const g = newGame({ ...denseLevel, walls: [] });
  for (let i = 0; i < 900; i++) {
    g.blue.push({ x: 180, y: 570 - (i % 30), vx: 0, hp: 1, r: 4.2, big: false, used: 0, dead: false });
  }
  for (let frame = 0; frame < 30; frame++) step(g, 1 / 60);
  assert.equal(g.blue.length, 900);
  assert.ok(g.blue.every((u) => u.x >= u.r && u.x <= W - u.r));
});

test("enemy waves arrive as staggered squads", () => {
  const g = newGame({
    name: "squad test",
    par: 1,
    bases: [{ x: 180, y: 60, hp: 1e6, every: 1000, group: 10, delay: 0 }],
  });
  step(g, 1 / 60);
  assert.equal(g.red.length, 10);
  const ys = g.red.map((u) => u.y);
  const xs = g.red.map((u) => u.x);
  assert.ok(Math.max(...ys) - Math.min(...ys) >= 15, "enemy squad should occupy multiple rows");
  assert.ok(Math.max(...xs) - Math.min(...xs) >= 20, "enemy squad should have lateral width");
});
