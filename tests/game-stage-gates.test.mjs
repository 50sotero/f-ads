import assert from "node:assert/strict";
import { test } from "node:test";
import { newGame, step } from "../src/game/engine.ts";

const branchLevel = (horde = 18) => ({
  name: "stage gate remix",
  par: 30,
  bases: [
    { x: 180, y: 300, hp: 1, every: 9999, group: 0 },
    { x: 180, y: 300, hp: 99999, every: 9999, group: 0 },
  ],
  gates: [
    { x: 120, y: 510, w: 74, kind: "x", n: 2 },
    { x: 240, y: 510, w: 66, kind: "x", n: 4 },
    { x: 132, y: 467, w: 82, kind: "x", n: 3, move: { range: 16, speed: 0.8, phase: 0.25 } },
    { x: 228, y: 467, w: 58, kind: "x", n: 2 },
  ],
  assault: { horde, reserve: 0, speed: 0, theme: "fork" },
});

function advanceToNextEncounter(game) {
  game.bases[0].hp = 0;
  step(game, 1 / 60);
  assert.equal(game.assault.encounter, 1);
  assert.equal(game.assault.phase, "advance");
  while (game.assault.phase === "advance") step(game, 1 / 60);
}

test("campaign branch panels mirror on the next encounter and preserve authored dimensions", () => {
  const game = newGame(branchLevel(), 17);
  const before = game.gates.map((gate) => ({
    x: gate.x,
    y: gate.y,
    w: gate.w,
    n: gate.n,
    range: gate.move?.range,
  }));

  advanceToNextEncounter(game);

  assert.deepEqual(game.gates.map((gate) => gate.x), before.map((gate) => 360 - gate.x));
  assert.deepEqual(game.gates.map((gate) => gate.y), before.map((gate) => gate.y));
  assert.deepEqual(game.gates.map((gate) => gate.w), before.map((gate) => gate.w));
  assert.deepEqual(game.gates.map((gate) => gate.n), before.map((gate) => gate.n + 1));
  assert.deepEqual(game.gates.map((gate) => gate.move?.range), before.map((gate) => gate.range));
  assert.equal(game.gates[2].cx, 360 - (before[2].x + Math.sin(game.t * 0.8 + 0.25) * 16));

  game.bases[1].hp = 1;
  game.bases[0].hp = 0;
  for (const unit of game.red) unit.dead = true;
  game.red = [];
  game.assault.horde = 0;
  game.assault.reserve = 0;
  game.assault.pickups = [];
  game.assault.weaponTarget = null;
  game.assault.cannonTarget = null;
  game.cannonX = game.targetX = game.gates[0].cx;
  game.firing = true;
  let shot;
  for (let frame = 0; frame < 30 && !shot; frame++) {
    step(game, 1 / 60);
    shot = game.blue.at(-1);
  }
  game.firing = false;
  assert.ok(shot, "the remixed lane did not launch a runner");
  for (let frame = 0; frame < 100 && !(shot.used & 1); frame++) step(game, 1 / 60);
  assert.ok(shot.used & 1, "the new shot did not select the remixed first panel");
});

test("center layouts stay centered and horde-free fixtures keep their authored lanes", () => {
  const center = newGame({
    ...branchLevel(),
    gates: branchLevel().gates.map((gate) => ({ ...gate, x: 180 })),
  }, 3);
  advanceToNextEncounter(center);
  assert.deepEqual(center.gates.map((gate) => gate.x), [180, 180, 180, 180]);

  const hordeFree = newGame(branchLevel(0), 5);
  const authored = hordeFree.gates.map((gate) => gate.x);
  advanceToNextEncounter(hordeFree);
  assert.deepEqual(hordeFree.gates.map((gate) => gate.x), authored);
});
