import assert from "node:assert/strict";
import { test } from "node:test";
import { newGame, step, W } from "../src/game/engine.ts";

const makeLevel = ({ practice = false, horde = 0, slamEvery = 8, waves = 2, runners = 4 } = {}) => ({
  name: "runner breakaway",
  par: 30,
  bases: [
    { x: 180, y: 300, hp: 50, every: 9999, group: 0 },
    { x: 180, y: 300, hp: 50, every: 9999, group: 0 },
  ],
  gates: [],
  assault: {
    horde,
    reserve: 0,
    speed: 16,
    theme: "fork",
    practice,
    slamEvery,
    counterattack: { waves, runners, guards: 0, brutes: 0, interval: 2, flankEvery: 2 },
  },
});

function setupCounterattack(options = {}) {
  const g = newGame(makeLevel(options), 23);
  g.assault.encounter = 1;
  g.assault.phase = "counterattack";
  g.assault.wave = 0;
  g.assault.waves = options.waves ?? 2;
  g.assault.waveTimer = 0;
  g.assault.waveSpawned = 0;
  g.red = [];
  g.blue = [];
  g.firing = false;
  return g;
}

test("late counterattack runners commit to a bounded flank target", () => {
  const first = setupCounterattack({ waves: 1 });
  const second = setupCounterattack({ waves: 1 });
  step(first, 1 / 60);
  step(second, 1 / 60);

  const runners = first.red.filter((unit) => unit.kind === "runner");
  const matching = second.red.filter((unit) => unit.kind === "runner");
  assert.equal(runners.length, 4);
  assert.deepEqual(
    runners.map((unit) => unit.breakawayTargetX),
    matching.map((unit) => unit.breakawayTargetX),
    "the spawn target must be deterministic for a given seed",
  );
  assert.ok(runners.every((unit) => Number.isFinite(unit.breakawayTargetX)));
  assert.ok(runners.every((unit) => unit.breakawayTargetX > unit.x), "encounter two's first wave should use the right flank");

  const starts = runners.map((unit) => unit.x);
  first.assault.waveLane = -1;
  for (let frame = 0; frame < 30; frame++) step(first, 1 / 60);
  assert.ok(runners.some((unit, index) => unit.x > starts[index] + 4), "a runner never left its original rail");
  assert.ok(runners.every((unit) => unit.x <= (unit.breakawayTargetX ?? W) + 1));
  assert.ok(runners.every((unit) => unit.x >= 18 && unit.x <= W - 18));
  assert.deepEqual(
    runners.map((unit) => unit.breakawayTargetX),
    matching.map((unit) => unit.breakawayTargetX),
    "changing the public wave lane must not retarget already spawned runners",
  );
});

test("a centered follow-up wave fans both ways while legacy and practice units stay untouched", () => {
  const g = setupCounterattack();
  step(g, 1 / 60);
  const firstWaveCount = g.red.length;
  g.assault.wave = 1;
  g.assault.waveSpawned = 0;
  g.assault.waveTimer = 0;
  step(g, 1 / 60);
  const centeredWave = g.red.slice(firstWaveCount).filter((unit) => unit.kind === "runner");
  assert.equal(centeredWave.length, 4);
  assert.ok(centeredWave.some((unit) => (unit.breakawayTargetX ?? 180) < 180));
  assert.ok(centeredWave.some((unit) => (unit.breakawayTargetX ?? 180) > 180));

  const legacy = newGame(makeLevel({ horde: 2, waves: 0 }), 23);
  assert.ok(legacy.red.every((unit) => unit.kind === undefined && unit.breakawayTargetX === undefined));
  const practice = setupCounterattack({ practice: true, waves: 1 });
  step(practice, 1 / 60);
  assert.ok(practice.red.length > 0);
  assert.ok(practice.red.every((unit) => unit.breakawayTargetX === undefined));
  const practiceX = practice.red.map((unit) => unit.x);
  for (let frame = 0; frame < 30; frame++) step(practice, 1 / 60);
  assert.deepEqual(practice.red.map((unit) => unit.x), practiceX, "practice assault must not sidestep or advance red units");
});
