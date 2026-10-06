import assert from "node:assert/strict";
import { test } from "node:test";
import { CANNON_Y, cannonBarrelOffsets, newGame, step } from "../src/game/engine.ts";

const assaultLevel = (overrides = {}) => ({
  name: "direct motion test",
  par: 20,
  bases: [{ x: 125, y: 300, hp: 99999, every: 9999, group: 0 }],
  gates: [
    { x: 180, y: 510, w: 170, kind: "x", n: 2 },
    { x: 180, y: 467, w: 170, kind: "x", n: 3 },
    { x: 180, y: 424, w: 170, kind: "x", n: 4 },
  ],
  assault: { horde: 0, reserve: 0, speed: 16, theme: "fork" },
  ...overrides,
});

test("red forward spacing uses the enemy travel direction", () => {
  const game = newGame(assaultLevel({
    bases: [{ x: 180, y: 1000, hp: 99999, every: 9999, group: 0 }],
    gates: [],
    assault: { horde: 0, reserve: 0, speed: 18, theme: "fork" },
  }));
  game.firing = false;
  const leader = { x: 180, y: 458, vx: 0, hp: 1, r: 4.2, big: false, used: 0, dead: false, lane: 0 };
  const follower = { x: 180, y: 450, vx: 0, hp: 1, r: 4.2, big: false, used: 0, dead: false, lane: 0 };
  game.red.push(leader, follower);

  step(game, 1 / 60);

  assert.ok(leader.y - follower.y >= 8, "red follower overtook the forward runner");
});

test("cannon barrel offsets are centered and match every assault volley", () => {
  assert.deepEqual(cannonBarrelOffsets(1), [0]);
  assert.deepEqual(cannonBarrelOffsets(5), [-24, 0, 24, -12, 12]);

  const game = newGame(assaultLevel());
  game.assault.tier = 5;
  game.cannonX = game.targetX = 180;
  game.firing = true;
  step(game, 1 / 60);
  assert.equal(game.blue.length, 5);
  const offsets = cannonBarrelOffsets(game.assault.tier);
  for (const [index, unit] of game.blue.entries()) {
    assert.ok(Math.abs(unit.x - (game.cannonX + offsets[index])) <= 0.4, `shot ${index} left the visible barrel`);
    assert.ok(unit.y < CANNON_Y);
  }
});

test("changing the target after launch does not redirect an in-flight runner", () => {
  const game = newGame(assaultLevel());
  game.cannonX = game.targetX = 180;
  game.firing = true;
  step(game, 1 / 60);
  game.firing = false;
  const runner = game.blue[0];
  const launchX = runner.x;

  game.targetX = 55;
  for (let frame = 0; frame < 30; frame++) step(game, 1 / 60);

  assert.equal(runner.x, launchX);
  assert.equal(game.cannonX, 55);
});

test("boss attraction starts only after the final gate line", () => {
  const game = newGame(assaultLevel());
  game.targetX = 55;
  const runner = { x: 220, y: 430, vx: 0, hp: 1, r: 4.2, big: false, used: 0, dead: false, lane: 0 };
  game.blue.push(runner);
  step(game, 1 / 60);
  assert.equal(runner.x, 220, "runner bent before the final gate");

  runner.y = 330;
  step(game, 1 / 60);
  assert.ok(runner.x < 220, "runner did not enter the short boss approach");
});

test("the broad assault boss catches runners at the corridor edge", () => {
  const game = newGame(assaultLevel({
    bases: [{ x: 180, y: 300, hp: 9999, every: 9999, group: 0 }],
    gates: [],
  }));
  game.firing = false;
  const edgeRunner = { x: 245, y: 330, vx: 0, hp: 1, r: 4.2, big: false, used: 0, dead: false };
  game.blue.push(edgeRunner);
  step(game, 1 / 60);

  assert.equal(edgeRunner.dead, true, "runner walked through the edge of the living boss");
  assert.equal(game.bases[0].hp, 9998);
});

test("side-lane shots turn at the last channel and reach the boss flank", () => {
  for (const launchX of [55, 307]) {
    const game = newGame(assaultLevel({
      bases: [{ x: 180, y: 300, hp: 99999, every: 9999, group: 0 }],
    }));
    game.firing = false;
    game.assault.weaponTarget = null;
    game.assault.cannonTarget = null;
    game.assault.weaponTargetsEnabled = false;
    const runner = { x: launchX, y: 574, vx: 0, hp: 1, r: 4.2, big: false, used: 0, dead: false };
    game.blue.push(runner);
    for (let frame = 0; frame < 240 && !runner.dead; frame++) step(game, 1 / 60);

    assert.equal(runner.dead, true, `side shot at x=${launchX} leaked beyond the boss`);
    assert.equal(game.blue.length, 0);
    assert.equal(game.bases[0].hp, 99998);
  }
});

test("boss contact is forward-only and does not repack surviving runners backward", () => {
  const game = newGame(assaultLevel());
  game.firing = false;
  const first = { x: 125, y: 330, vx: 0, hp: 1, r: 4.2, big: false, used: 7, dead: false, lane: 0 };
  const second = { x: 125, y: 340, vx: 0, hp: 1, r: 4.2, big: false, used: 7, dead: false, lane: 0 };
  game.blue.push(first, second);
  step(game, 1 / 60);

  assert.equal(game.blue.length, 1);
  assert.ok(second.y <= 340, `queue moved surviving runner backward to y=${second.y}`);
  assert.ok(340 - second.y <= 98 / 60 + 0.001, `queue moved surviving runner too far in one frame to y=${second.y}`);
});

test("far-side shots keep moving after they miss the boss lane", () => {
  for (const launchX of [30, 330]) {
    const game = newGame(assaultLevel());
    game.cannonX = game.targetX = launchX;
    game.firing = true;
    step(game, 1 / 60);
    game.firing = false;
    for (let frame = 0; frame < 420; frame++) step(game, 1 / 60);
    assert.equal(game.blue.length, 0, `a shot launched at x=${launchX} became stuck after missing the boss`);
    assert.equal(game.status, "playing");
  }
});

test("sustained fire stays in a central multi-row corridor while the boss advances", () => {
  const game = newGame(assaultLevel({
    bases: [{ x: 180, y: 300, hp: 99999, every: 9999, group: 0 }],
  }));
  game.firing = true;
  for (let frame = 0; frame < 720; frame++) step(game, 1 / 60);
  const boss = game.bases[0];
  const postChain = game.blue.filter((unit) => (unit.used & 1) !== 0);
  const central = postChain.filter((unit) => Math.abs(unit.x - boss.x) <= 96);
  const front = boss.y + boss.h / 2;
  const touching = game.blue.filter((unit) => unit.y >= front && unit.y <= front + 8);
  const occupiedRows = new Set(game.blue.map((unit) => Math.floor(unit.y / 8)));
  assert.ok(game.blue.length > 100, "fixture did not build sustained crowd pressure");
  assert.ok(postChain.length > 100, "fixture did not cross the first gate");
  assert.ok(central.length / postChain.length > 0.9, "post-gate crowd spilled across the full road");
  assert.ok(touching.length < 50, `${touching.length} runners overlapped at the boss edge`);
  assert.ok(occupiedRows.size > 20, "crowd did not form a multi-row queue");
  assert.ok(boss.y > 300 && boss.y <= 420, `boss pressure moved to an invalid y=${boss.y}`);
});

test("boss pressure waits for the opening, then reaches the choke on reference timing", () => {
  const game = newGame(assaultLevel({
    bases: [{ x: 180, y: 300, hp: 99999, every: 9999, group: 0 }],
    gates: [],
  }));
  game.firing = false;
  for (let frame = 0; frame < 174; frame++) step(game, 1 / 60);
  assert.ok(Math.abs(game.bases[0].y - 300) < 0.001);
  for (let frame = 0; frame < 366; frame++) step(game, 1 / 60);
  assert.ok(game.bases[0].y >= 371 && game.bases[0].y <= 373, `boss y at 9s=${game.bases[0].y}`);
  for (let frame = 0; frame < 180; frame++) step(game, 1 / 60);
  assert.ok(game.bases[0].y >= 407 && game.bases[0].y <= 409, `boss y at 12s=${game.bases[0].y}`);
});

test("a living assault boss overruns only the gate it has physically reached", () => {
  const game = newGame(assaultLevel({
    bases: [{ x: 180, y: 300, hp: 99999, every: 9999, group: 0 }],
    assault: { horde: 1, reserve: 0, speed: 0, theme: "fork" },
  }));
  game.firing = false;
  for (let frame = 0; frame < 720 && !game.gates[2].overrun; frame++) step(game, 1 / 60);

  assert.deepEqual(game.gates.map((gate) => gate.overrun), [false, false, true]);
  assert.equal(game.pops.filter((pop) => pop.text === "GATE DOWN").length, 1);

  const runner = { x: 260, y: 430, vx: 0, hp: 1, r: 4.2, big: false, used: 0b011, dead: false };
  game.blue.push(runner);
  for (let frame = 0; frame < 30; frame++) step(game, 1 / 60);
  assert.equal(runner.used & (1 << 2), 1 << 2, "overrun gate did not preserve its used bit");
  assert.equal(game.stats.multiplied, 0, "overrun gate multiplied a new runner");
});

test("surviving runners keep their positions during a boss transition", () => {
  const game = newGame(assaultLevel({
    bases: [
      { x: 125, y: 300, hp: 1, every: 9999, group: 0 },
      { x: 125, y: 300, hp: 5, every: 9999, group: 0 },
    ],
  }));
  game.gates[2].overrun = true;
  game.gates[2].flash = 0.75;
  const finisher = { x: 125, y: 330, vx: 0, hp: 1, r: 4.2, big: false, used: 7, dead: false };
  const survivor = { x: 125, y: 340, vx: 0, hp: 1, r: 4.2, big: false, used: 7, dead: false };
  game.blue.push(finisher, survivor);
  step(game, 1 / 60);

  assert.equal(game.assault.encounter, 1);
  assert.equal(game.assault.phase, "advance");
  assert.equal(game.blue.length, 1);
  assert.deepEqual(game.gates.map((gate) => gate.overrun), [false, false, false]);
  assert.ok(game.gates.every((gate) => gate.flash === 0), "next encounter retained a stale gate flash");
  assert.equal(survivor.used, 7, "transition rewrote the survivor's gate mask");
  const preservedY = survivor.y;
  assert.ok(preservedY < CANNON_Y - 100, `survivor was reset near the cannon at y=${preservedY}`);
  for (let frame = 0; frame < 50; frame++) step(game, 1 / 60);
  assert.equal(survivor.y, preservedY, "survivor moved during the camera transition");
});

test("neighbour flow stays continuous across a motion-cell boundary", () => {
  const game = newGame(assaultLevel({
    bases: [{ x: 180, y: 1000, hp: 99999, every: 9999, group: 0 }],
    gates: [],
  }));
  game.firing = false;
  const left = { x: 95.9, y: 450, vx: 0, hp: 1, r: 4.2, big: false, used: 0, dead: false };
  const right = { x: 96.1, y: 450, vx: 0, hp: 1, r: 4.2, big: false, used: 0, dead: false };
  game.blue.push(left, right);

  for (let frame = 0; frame < 12; frame++) step(game, 1 / 60);

  assert.ok(Math.abs(left.x - right.x) > 0.2, "neighbour flow did not open a cell-boundary gap");
  assert.ok(left.y <= 450 && right.y <= 450, "local flow moved a runner backward");
  assert.ok(left.x >= left.r && right.x >= right.r);
  assert.ok(left.x <= 360 - left.r && right.x <= 360 - right.r);
});
