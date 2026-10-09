import assert from "node:assert/strict";
import { test } from "node:test";
import { bossBrace, bossBreakthrough, bossDefenseDeadline, CANNON_Y, DEFENSE_Y, newGame, step } from "../src/game/engine.ts";

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

const frontAt = (game, index = 0) => game.bases[index].y + game.bases[index].h / 2;
const front = (game) => frontAt(game);

test("late giants hold 12px/s to row 447, then ramp smoothly to 36px/s", () => {
  const game = prepare();
  game.bases[0].y = 447 - game.bases[0].h / 2 - 6;

  step(game, 0.5);
  assert.ok(Math.abs(front(game) - 447) <= EPSILON, `normal pressure stopped at ${front(game)}px`);

  step(game, 0.5);
  assert.ok(Math.abs(front(game) - 459) <= EPSILON, `ramp covered ${front(game) - 447}px instead of 12px`);
  const deadline = bossDefenseDeadline(game);
  assert.equal(deadline?.moving, true);
  assert.equal(deadline?.phase, "rushing");
  assert.ok(Math.abs(deadline.remaining - (DEFENSE_Y - front(game))) <= EPSILON);

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
  assert.equal(game.assault.integrity, 0);
  assert.equal(game.assault.breaches, 1);
  assert.equal(game.status, "lost");
  assert.ok(game.pops.some((pop) => pop.text === "GIANT BREACH"));
});

test("a blocked wall step does not bank deadline ramp time", () => {
  const game = prepare();
  const active = game.bases[0];
  active.y = 447 - active.h / 2;
  const wall = { x: 100, y: 445, w: 160, h: 12 };
  const contact = unit({ y: wall.y - 4.2 });
  game.walls.push(wall);
  game.blue.push(contact);

  step(game, 0.5);
  assert.ok(Math.abs(front(game) - 447) <= EPSILON, "the blocked giant moved through the wall");
  const blocked = bossDefenseDeadline(game);
  assert.equal(blocked?.moving, false);
  assert.equal(blocked?.phase, "blocked");
  game.walls = [];
  step(game, 0.5);
  assert.ok(Math.abs(front(game) - 459) <= EPSILON, "the wall banked acceleration into the next step");
});

test("champion stagger pauses deadline ramp time", () => {
  const game = prepare();
  const active = game.bases[0];
  active.hp = 75;
  active.y = 447 - active.h / 2;
  game.blue.push(unit({ y: active.y, big: true }));
  game.assault.bossTimer = 0;

  step(game, FRAME);
  assert.equal(bossBrace(game)?.phase, "staggered");
  assert.equal(bossDefenseDeadline(game), null, "the brace should own the objective while the giant is staggered");
  const heldFront = front(game);
  game.assault.bossTimer = Infinity;
  step(game, 0.5);
  assert.equal(front(game), heldFront, "the giant moved during champion stagger");
  step(game, 0.2);
  assert.equal(bossBrace(game), null);
  const resumedFront = front(game);
  step(game, 0.5);
  assert.ok(front(game) - resumedFront < 13.5, "stagger time was banked as fast pressure");
});

test("deadline ramp state stays isolated across games and encounters", () => {
  const first = prepare();
  const second = prepare();
  first.bases[0].y = second.bases[0].y = 447 - first.bases[0].h / 2;
  step(first, 0.5);
  step(second, 0.5);
  assert.ok(Math.abs(front(first) - 459) <= EPSILON);
  assert.ok(Math.abs(front(second) - 459) <= EPSILON);

  const resetLevel = deadlineLevel();
  resetLevel.bases.push({ x: 180, y: 300, hp: 100, every: 9999, group: 0 });
  const reset = newGame(resetLevel, 9);
  reset.red = [];
  reset.blue = [];
  reset.firing = false;
  reset.assault.bossTime = 3.1;
  reset.assault.bossTimer = Infinity;
  reset.assault.slamTimer = Infinity;
  reset.bases[0].y = 447 - reset.bases[0].h / 2;
  step(reset, 0.5);
  reset.assault.encounter = 1;
  reset.assault.bossOriginY = 300;
  reset.bases[1].y = 447 - reset.bases[1].h / 2;
  reset.assault.bossTime = 3.1;
  step(reset, 0.5);
  assert.ok(Math.abs(frontAt(reset, 1) - 459) <= EPSILON, "the prior encounter banked ramp time into the next giant");
});

test("a breakthrough crossing row 447 keeps its 36px/s pressure afterward", () => {
  const game = prepare();
  const active = game.bases[0];
  active.hp = 75;
  active.y = 447 - active.h / 2;
  game.blue.push(unit({ y: active.y }));
  game.assault.bossTimer = 0;
  step(game, FRAME);
  game.assault.bossTime = -10;
  game.assault.bossTimer = Infinity;

  let frames = 0;
  while (bossBrace(game)?.phase !== "impact" && frames++ < 400) step(game, FRAME);
  assert.equal(bossBrace(game)?.phase, "impact");
  game.assault.bossTime = 3.1;
  while (bossBreakthrough(game) && frames++ < 600) step(game, FRAME);
  assert.equal(bossBreakthrough(game), null);
  const before = front(game);
  step(game, FRAME);
  assert.ok(front(game) - before >= 0.55, "breakthrough pressure fell back to the 12px/s ramp");
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
  assert.equal(game.assault.integrity, 3);
  assert.equal(game.assault.breaches, 0);
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
    assert.equal(bossDefenseDeadline(game), null, "legacy or practice pressure exposed a late-giant deadline");
  }
});
