import assert from "node:assert/strict";
import { test } from "node:test";
import { bossBrace, newGame, step } from "../src/game/engine.ts";

const FRAME = 1 / 60;

const pressureLevel = ({ horde = 1, slamEvery = 8, practice = false, walls = [] } = {}) => ({
  name: "boss pressure fixture",
  par: 30,
  bases: [{ x: 180, y: 300, hp: 100, every: 9999, group: 0 }],
  gates: [{ x: 180, y: 510, w: 170, kind: "x", n: 2 }],
  walls,
  assault: { horde, reserve: 0, speed: 16, theme: "fork", practice, slamEvery },
});

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

const prepare = (level = pressureLevel()) => {
  const game = newGame(level, 9);
  game.red = [];
  game.blue = [];
  game.firing = false;
  game.assault.bossTime = 3.1;
  game.assault.bossTimer = Infinity;
  game.assault.slamTimer = Infinity;
  return game;
};

test("a late brace-eligible giant carries only its overlapping contact cohort", () => {
  const game = prepare();
  const near = unit({ y: 300 });
  const side = unit({ x: 220, y: 300 });
  const distant = unit({ y: 120 });
  game.blue.push(near, side, distant);
  const initialBossY = game.bases[0].y;
  const initialNearY = near.y;
  const initialSideY = side.y;
  const initialDistantY = distant.y;

  for (let second = 0; second < 4; second++) step(game, 1);

  assert.equal(game.bases[0].y - initialBossY, 48, "ordinary pressure did not keep its 12px/s advance");
  assert.equal(near.y - initialNearY, 48, "the front runner was left behind");
  assert.equal(side.y - initialSideY, 48, "the edge runner was left behind");
  assert.equal(distant.y, initialDistantY, "a distant runner was snapped with the contact cohort");
  assert.equal(game.bases[0].hp, 100, "carrying the contact cohort changed boss health");
  assert.equal(near.dead, false);
  assert.equal(side.dead, false);
});

test("ordinary contact still damages the giant after a carried pressure step", () => {
  const game = prepare();
  const contact = unit();
  game.blue.push(contact);
  game.assault.bossTimer = 0;

  step(game, FRAME);

  assert.equal(game.bases[0].hp, 99, "contact damage was bypassed by the pressure carry");
  assert.equal(game.stats.baseHits, 1);
  assert.equal(contact.dead, true);
});

test("a champion stagger pauses ordinary pressure before it resumes", () => {
  const game = prepare();
  game.bases[0].hp = 75;
  const champion = unit({ big: true });
  const ordinary = unit({ x: 160 });
  game.blue.push(champion, ordinary);
  game.assault.bossTimer = 0;

  step(game, FRAME);

  assert.equal(bossBrace(game)?.phase, "staggered", "the champion did not interrupt the brace");
  const heldBossY = game.bases[0].y;
  const heldRunnerY = ordinary.y;
  game.assault.bossTimer = Infinity;
  step(game, 0.5);
  assert.equal(game.bases[0].y, heldBossY, "the giant advanced during champion stagger");
  assert.equal(ordinary.y, heldRunnerY, "the contact cohort moved during champion stagger");
  assert.equal(bossBrace(game)?.phase, "staggered");

  step(game, 0.2);
  assert.equal(game.bases[0].y, heldBossY, "the giant advanced before stagger cleanup");
  assert.equal(bossBrace(game), null);
  step(game, 1);
  assert.equal(game.bases[0].y - heldBossY, 12, "ordinary pressure did not resume after stagger");
});

test("a wall constrains both the giant and an overlapping runner", () => {
  const game = prepare(pressureLevel({ walls: [{ x: 100, y: 330, w: 160, h: 12 }] }));
  const contact = unit({ y: 325 });
  game.blue.push(contact);
  const initialBossY = game.bases[0].y;
  const initialRunnerY = contact.y;

  step(game, 1);

  const bossDelta = game.bases[0].y - initialBossY;
  const runnerDelta = contact.y - initialRunnerY;
  assert.ok(bossDelta >= 0 && bossDelta < 2, `wall did not constrain the giant: ${bossDelta}`);
  assert.ok(Math.abs(runnerDelta - bossDelta) < 1e-6, "the runner was stranded while the giant moved");
  assert.ok(contact.y + contact.r <= 330 + 1e-6, "the carried runner crossed the authored wall");
});

test("a runner tangent to a wall constrains the giant before entering it", () => {
  const wallTop = 330;
  const radius = 4.2;
  const game = prepare(pressureLevel({ walls: [{ x: 100, y: wallTop, w: 160, h: 12 }] }));
  const contact = unit({ y: wallTop - radius });
  game.blue.push(contact);
  const initialBossY = game.bases[0].y;
  const initialRunnerY = contact.y;

  step(game, 1);

  assert.equal(game.bases[0].y, initialBossY, "the giant crossed a tangent wall boundary");
  assert.equal(contact.y, initialRunnerY, "the tangent runner was stranded behind the giant");
});

test("a runner inside the rear contact tolerance is carried before contact resolves", () => {
  const game = prepare();
  const active = game.bases[0];
  const previousRear = active.y - active.h / 2;
  const contact = unit({ y: previousRear - 4.2 - 0.4, pace: 0 });
  game.blue.push(contact);
  game.assault.bossTimer = 0;
  const initialBossY = active.y;
  const initialRunnerY = contact.y;

  step(game, FRAME);

  assert.equal(game.stats.baseHits, 1, "rear-tolerance contact did not damage the giant");
  assert.equal(active.hp, 99);
  assert.equal(contact.dead, true, "rear-tolerance contact was not consumed");
  assert.ok(active.y > initialBossY, "the pressure step did not advance");
  assert.ok(contact.y > initialRunnerY, "the contact runner was left behind the advancing giant");
});

test("early, practice, and horde-free assaults retain their contact hold", () => {
  const early = pressureLevel();
  delete early.assault.slamEvery;
  const fixtures = [
    early,
    pressureLevel({ horde: 0, slamEvery: 8 }),
    pressureLevel({ horde: 1, slamEvery: 8, practice: true }),
  ];
  for (const [index, level] of fixtures.entries()) {
    const game = prepare(level);
    game.blue.push(unit());
    const initialBossY = game.bases[0].y;
    for (let second = 0; second < 4; second++) step(game, 1);
    assert.equal(game.bases[0].y, initialBossY, `fixture ${index} changed its contact hold`);
  }
});
