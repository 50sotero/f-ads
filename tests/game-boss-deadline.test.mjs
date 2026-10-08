import assert from "node:assert/strict";
import { test } from "node:test";
import { CANNON_Y, DEFENSE_Y, newGame, step } from "../src/game/engine.ts";

const FRAME = 1 / 60;
const EPSILON = 1e-6;

const deadlineLevel = ({ horde = 1, slamEvery = 8, practice = false, hp = 100 } = {}) => {
  const assault = {
    horde,
    reserve: 0,
    speed: 16,
    theme: "fork",
    practice,
  };
  if (slamEvery !== undefined && slamEvery !== null) assault.slamEvery = slamEvery;
  return {
    name: "boss deadline fixture",
    par: 30,
    bases: [{ x: 180, y: 300, hp, every: 9999, group: 0 }],
    gates: [
      { x: 180, y: 510, w: 170, kind: "x", n: 2 },
      { x: 180, y: 467, w: 170, kind: "x", n: 3 },
      { x: 180, y: 424, w: 170, kind: "x", n: 4 },
    ],
    assault,
  };
};

const unit = ({ x = 180, y = 300, big = false, pace = 0 } = {}) => ({
  x,
  y,
  vx: 0,
  hp: big ? 14 : 1,
  r: big ? 11 : 4.2,
  big,
  used: 0,
  dead: false,
  pace,
});

const prepare = (options = {}) => {
  const game = newGame(deadlineLevel(options), 9);
  game.red = [];
  game.blue = [];
  game.firing = false;
  game.assault.bossTime = 3.1;
  game.assault.bossTimer = Infinity;
  game.assault.slamTimer = Infinity;
  return game;
};

const front = (game) => game.bases[0].y + game.bases[0].h / 2;

test("late giants hold 12px/s to row 447, then ramp smoothly to 36px/s", () => {
  const game = prepare();
  game.bases[0].y = 447 - game.bases[0].h / 2 - 6;

  step(game, 0.5);
  assert.ok(Math.abs(front(game) - 447) <= EPSILON, `normal pressure stopped at ${front(game)}px`);

  step(game, 0.5);
  assert.ok(Math.abs(front(game) - 459) <= EPSILON, `ramp covered ${front(game) - 447}px instead of 12px`);

  step(game, 0.5);
  assert.ok(Math.abs(front(game) - 477) <= EPSILON, `fast pressure covered ${front(game) - 459}px instead of 18px`);
  assert.equal(game.status, "playing");
});

test("a late giant stops at the defense line and loses after same-frame contacts", () => {
  const game = prepare();
  game.bases[0].y = DEFENSE_Y - game.bases[0].h / 2 - 6;

  step(game, 0.5);

  assert.ok(Math.abs(front(game) - DEFENSE_Y) <= EPSILON, `giant front crossed ${front(game)}px`);
  assert.equal(game.bases[0].hp, 100);
  assert.equal(game.status, "lost");
  assert.ok(game.pops.some((pop) => pop.text === "GIANT BREACH"));
});

test("a killing boss contact on the defense frame saves the line", () => {
  const game = prepare({ hp: 1 });
  const active = game.bases[0];
  active.y = DEFENSE_Y - active.h / 2 - 6;
  const contact = unit({ y: active.y });
  game.blue.push(contact);
  game.assault.bossTimer = 0;

  step(game, 1);

  assert.equal(active.hp, 0);
  assert.equal(contact.dead, true);
  assert.equal(game.status, "won", "the defense loss ran before the same-frame killing contact");
});

test("the carry floor constrains a circle at CANNON_Y minus radius and padding", () => {
  const game = prepare();
  const active = game.bases[0];
  active.y = DEFENSE_Y - active.h / 2 - 0.01;
  const floor = CANNON_Y - 11 - 2;
  const champion = unit({ y: floor, big: true, pace: 0 });
  game.blue.push(champion);

  step(game, FRAME);

  assert.ok(Math.abs(front(game) - (DEFENSE_Y - 0.01)) <= EPSILON, "the giant crossed a carried circle's floor");
  assert.equal(champion.y, floor, "the carried circle crossed its cannon-line floor");
  assert.equal(game.status, "playing");
});

test("early, practice, and horde-free giants retain the existing pressure cap", () => {
  const fixtures = [
    prepare({ slamEvery: null }),
    prepare({ horde: 0, slamEvery: 8 }),
    prepare({ practice: true, slamEvery: 8 }),
  ];
  for (const game of fixtures) {
    game.bases[0].y = 447 - game.bases[0].h / 2 - 6;
    const initialFront = front(game);
    step(game, 1);
    if (game.level.assault.practice) {
      assert.equal(front(game), initialFront, "practice pressure moved the giant");
    } else {
      assert.ok(Math.abs(front(game) - 447) <= EPSILON, "legacy pressure crossed its 447px cap");
    }
    assert.equal(game.status, "playing");
  }
});
