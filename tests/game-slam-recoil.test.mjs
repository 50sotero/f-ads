import assert from "node:assert/strict";
import { test } from "node:test";
import { bossSlamRecoil, newGame, step } from "../src/game/engine.ts";
import { levels } from "../src/game/levels.ts";

const FRAME = 1 / 60;

const makeLevel = ({ slamEvery = 1, practice = false, gateY = 0 } = {}) => ({
  name: "slam recoil fixture",
  par: 30,
  bases: [{ x: 180, y: 300, hp: 999999, every: 9999, group: 0 }],
  // A gate outside the active road keeps the assault fallback from creating
  // authored panels while still exercising the normal used-mask path.
  gates: [{ x: 180, y: gateY, w: 1, kind: "x", n: 2 }],
  assault: { horde: 0, reserve: 0, speed: 16, theme: "fork", practice, slamEvery },
});

const makeUnit = ({ x = 180, y = 430, big = false, used = 0 } = {}) => ({
  x,
  y,
  vx: 0,
  hp: big ? 14 : 1,
  r: big ? 11 : 4.2,
  big,
  used,
  dead: false,
});

const prepare = (levelOptions, unit) => {
  const game = newGame(makeLevel(levelOptions));
  game.firing = false;
  game.assault.slamTimer = 0;
  game.blue.push(unit);
  return game;
};

const prepareControl = (unit, levelOptions = {}) => {
  const game = newGame(makeLevel({ ...levelOptions, slamEvery: undefined }));
  game.firing = false;
  game.blue.push(unit);
  return game;
};

test("boss slam keeps its initial kick, adds a bounded smooth tail, and stays nonlethal", () => {
  const runner = makeUnit();
  const game = prepare({}, runner);
  const initialY = runner.y;

  step(game, FRAME);
  assert.equal(game.assault.bossPulse, 1);
  assert.ok(runner.y - initialY >= 8, `initial kick was only ${runner.y - initialY}px`);
  assert.equal(bossSlamRecoil(game, runner), 1);
  assert.equal(runner.dead, false);
  assert.equal(runner.hp, 1);

  const positions = [runner.y];
  for (let frame = 0; frame < 21; frame++) {
    step(game, FRAME);
    positions.push(runner.y);
  }

  assert.ok(positions.slice(1, 7).every((y, index) => y > positions[index]), "ordinary forward motion erased the recoil tail");
  assert.ok(positions.at(-1) - initialY <= 36.01, `recoil exceeded its 10+26px cap: ${positions.at(-1) - initialY}`);
  assert.ok(positions.at(-1) - initialY >= 35, `recoil tail ended at ${positions.at(-1) - initialY}px`);
  assert.equal(bossSlamRecoil(game, runner), 0);
  assert.equal(game.status, "playing");
  assert.equal(runner.dead, false);

  const endY = runner.y;
  step(game, FRAME);
  assert.ok(runner.y < endY, "forward travel stayed frozen after recoil ended");
});

test("champions receive the initial kick but resist the long recoil tail", () => {
  const champion = makeUnit({ big: true });
  const game = prepare({}, champion);
  const initialY = champion.y;

  step(game, FRAME);
  assert.ok(champion.y - initialY >= 8, "champions lost the initial slam kick");
  assert.equal(bossSlamRecoil(game, champion), 1);
  for (let frame = 0; frame < 21; frame++) {
    step(game, FRAME);
  }

  const displacement = champion.y - initialY;
  assert.ok(displacement >= 10 && displacement <= 13, `champion recoil was ${displacement}px instead of about 12px`);
  assert.equal(champion.dead, false);
  assert.equal(champion.hp, 14);
  assert.equal(bossSlamRecoil(game, champion), 0);
});

test("slam selects at most 120 nearest in-range units and leaves the rest untouched", () => {
  const near = Array.from({ length: 120 }, () => makeUnit());
  const outsideX = makeUnit({ x: 290 });
  const outsideY = makeUnit({ y: 450 });
  const game = prepare({}, near[0]);
  game.blue.push(...near.slice(1), outsideX, outsideY);
  step(game, FRAME);

  const impacted = [...near, outsideX, outsideY].filter((unit) => bossSlamRecoil(game, unit) > 0);
  assert.equal(impacted.length, 120);
  assert.equal(bossSlamRecoil(game, outsideX), 0);
  assert.equal(bossSlamRecoil(game, outsideY), 0);
  assert.equal(outsideX.dead, false);
  assert.equal(outsideY.dead, false);
  assert.equal(game.stats.multiplied, 0);
});

test("recoil respects used gates, game ownership, paused time, and phase boundaries", () => {
  const runner = makeUnit({ used: 1 });
  const game = prepare({ gateY: 424 }, runner);
  step(game, FRAME);
  assert.equal(runner.used, 1);
  assert.equal(game.stats.multiplied, 0);
  assert.equal(bossSlamRecoil(game, runner), 1);

  const otherGame = newGame(makeLevel());
  otherGame.blue.push(runner);
  assert.equal(bossSlamRecoil(otherGame, runner), 0);

  game.status = "lost";
  step(game, 0.5);
  game.status = "playing";
  assert.equal(bossSlamRecoil(game, runner), 1, "paused simulation time decayed recoil state");

  game.assault.phase = "counterattack";
  step(game, FRAME);
  assert.equal(bossSlamRecoil(game, runner), 0);
  game.assault.phase = "advance";
  assert.equal(bossSlamRecoil(game, runner), 0);
});

test("early authored routes and practice/tutorial assaults do not opt into slam recoil", () => {
  assert.ok(levels.slice(0, 6).every((level) => level.assault?.slamEvery === undefined));

  const runner = makeUnit();
  const controlRunner = makeUnit();
  const game = prepare({ practice: true }, runner);
  const control = prepareControl(controlRunner, { practice: true });
  step(game, FRAME);
  step(control, FRAME);

  assert.equal(game.assault.bossPulse, 0);
  assert.equal(bossSlamRecoil(game, runner), 0);
  assert.equal(runner.y, controlRunner.y);
});
