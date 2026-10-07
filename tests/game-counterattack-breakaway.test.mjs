import assert from "node:assert/strict";
import { test } from "node:test";
import { counterattackWaveRole, newGame, step, W } from "../src/game/engine.ts";

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
  g.assault.encounter = options.encounter ?? 1;
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
  assert.equal(counterattackWaveRole(g, 0), "flank");
  assert.equal(counterattackWaveRole(g, 1), "mixed", "a centered runner-only wave has no shield role");
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

  const mirrored = setupCounterattack({ encounter: 2 });
  assert.equal(counterattackWaveRole(mirrored, 0), "flank", "mirroring changes side, not the wave role");
  assert.equal(counterattackWaveRole(mirrored, 1), "mixed");
  step(mirrored, 1 / 60);
  const mirroredRunners = mirrored.red.filter((unit) => unit.kind === "runner");
  assert.ok(mirroredRunners.every((unit) => (unit.breakawayTargetX ?? 180) < unit.x), "the mirrored first wave uses the left flank");
});

test("only an authored flank rush ramps its road speed after the sidestep", () => {
  const flank = setupCounterattack();
  step(flank, 1 / 60);
  const runner = flank.red
    .filter((unit) => unit.kind === "runner")
    .sort((a, b) => Math.abs((b.breakawayTargetX ?? b.x) - b.x) - Math.abs((a.breakawayTargetX ?? a.x) - a.x))[0];
  const early = [];
  const late = [];
  let reachedFlank = false;
  for (let frame = 0; frame < 240 && !runner.dead; frame++) {
    const beforeY = runner.y;
    step(flank, 1 / 60);
    if (!reachedFlank && Math.abs((runner.breakawayTargetX ?? runner.x) - runner.x) <= 12) reachedFlank = true;
    (reachedFlank ? late : early).push(runner.y - beforeY);
  }
  assert.ok(reachedFlank, "the runner never reached its committed outward flank");
  assert.ok(early.length >= 20 && late.length >= 20, "the fixture did not expose both speed phases");
  const earlyAverage = early.reduce((sum, value) => sum + value, 0) / early.length;
  const lateAverage = late.slice(0, 20).reduce((sum, value) => sum + value, 0) / 20;
  assert.ok(lateAverage > earlyAverage * 1.15, `flank road speed did not ramp: ${earlyAverage} -> ${lateAverage}`);
  assert.ok(lateAverage < earlyAverage * 1.65, `flank road speed ramp was unbounded: ${earlyAverage} -> ${lateAverage}`);

  const centered = setupCounterattack();
  step(centered, 1 / 60);
  centered.red = [];
  centered.assault.wave = 1;
  centered.assault.waveSpawned = 0;
  centered.assault.waveTimer = 0;
  step(centered, 1 / 60);
  const centerRunner = centered.red.find((unit) => unit.kind === "runner");
  const centerEarly = [];
  const centerLate = [];
  let centerReached = false;
  for (let frame = 0; frame < 240 && !centerRunner.dead; frame++) {
    const beforeY = centerRunner.y;
    step(centered, 1 / 60);
    if (!centerReached && Math.abs((centerRunner.breakawayTargetX ?? centerRunner.x) - centerRunner.x) <= 12) centerReached = true;
    (centerReached ? centerLate : centerEarly).push(centerRunner.y - beforeY);
  }
  assert.ok(centerReached, "the centered fixture never reached its spacing target");
  const centerEarlyAverage = centerEarly.reduce((sum, value) => sum + value, 0) / centerEarly.length;
  const centerLateAverage = centerLate.slice(0, 20).reduce((sum, value) => sum + value, 0) / 20;
  assert.ok(centerLateAverage <= centerEarlyAverage * 1.1, `mixed center wave inherited flank speed: ${centerEarlyAverage} -> ${centerLateAverage}`);
});

test("flank road speed still uses the normal wall collision path", () => {
  const g = setupCounterattack();
  g.walls = [{ x: 300, y: 215, w: 35, h: 100 }];
  step(g, 1 / 60);
  const runner = g.red
    .filter((unit) => unit.kind === "runner")
    .sort((a, b) => Math.abs((b.breakawayTargetX ?? b.x) - b.x) - Math.abs((a.breakawayTargetX ?? a.x) - a.x))[0];
  const wall = g.walls[0];
  for (let frame = 0; frame < 240 && !runner.dead; frame++) {
    step(g, 1 / 60);
    const overlapsWall = runner.x > wall.x - runner.r
      && runner.x < wall.x + wall.w + runner.r
      && runner.y > wall.y - runner.r
      && runner.y < wall.y + wall.h + runner.r;
    assert.equal(overlapsWall, false, `runner crossed the wall at x=${runner.x}, y=${runner.y}`);
  }
});
