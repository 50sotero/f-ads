import assert from "node:assert/strict";
import { newGame, step } from "../src/game/engine.ts";
import { test } from "node:test";

const level = {
  name: "compact contact test",
  par: 20,
  bases: [{ x: 180, y: 1000, hp: 999999, every: 9999, group: 0 }],
  gates: [],
  assault: { horde: 0, reserve: 0, speed: 16, theme: "fork" },
};

const unit = (x, y) => ({ x, y, vx: 0, hp: 1, r: 4.2, big: false, used: 0, dead: false });

test("side-by-side circles keep their forward speed", () => {
  const single = newGame(level, 1);
  const pair = newGame(level, 1);
  single.firing = pair.firing = false;
  single.blue.push(unit(180, 450));
  pair.blue.push(unit(140, 450), unit(156, 450));

  step(single, 1 / 60);
  step(pair, 1 / 60);

  assert.ok(Math.abs(pair.blue[0].y - single.blue[0].y) < 0.001);
  assert.ok(Math.abs(pair.blue[1].y - single.blue[0].y) < 0.001);
});

test("a same-lane leader applies forward braking", () => {
  const single = newGame(level, 1);
  const pair = newGame(level, 1);
  single.firing = pair.firing = false;
  single.blue.push(unit(180, 450));
  pair.blue.push(unit(180, 438), unit(180, 450));

  step(single, 1 / 60);
  step(pair, 1 / 60);

  assert.ok(pair.blue[1].y > single.blue[0].y + 0.01);
  assert.ok(pair.blue[1].y < 450);
});

test("overlapping circles open a lateral gap without moving backward", () => {
  const game = newGame(level, 1);
  game.firing = false;
  game.blue.push(unit(180, 450), unit(181, 450));
  const initialGap = Math.abs(game.blue[1].x - game.blue[0].x);
  const firstY = game.blue.map((runner) => runner.y);
  let previousY = firstY;

  for (let frame = 0; frame < 12; frame++) {
    step(game, 1 / 60);
    for (let index = 0; index < game.blue.length; index++) {
      assert.ok(game.blue[index].y <= previousY[index] + 1e-9);
    }
    previousY = game.blue.map((runner) => runner.y);
  }

  assert.ok(Math.abs(game.blue[0].x - game.blue[1].x) > initialGap + 0.2);
});
