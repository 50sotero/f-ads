import assert from "node:assert/strict";
import { test } from "node:test";
import { MAX_UNITS, counterattackSideEntry, counterattackWaveRole, newGame, step, W } from "../src/game/engine.ts";

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

test("the authored flank opens one deterministic roadside entry for two runner slots", () => {
  const g = setupCounterattack({ waves: 2, runners: 4 });
  assert.deepEqual(counterattackSideEntry(g), { x: 306, y: 470, count: 2, lane: 1 });

  step(g, 1 / 60);
  const runners = g.red.filter((unit) => unit.kind === "runner");
  const roadside = runners.filter((unit) => unit.sideEntry === 1);
  assert.equal(roadside.length, 2);
  assert.ok(roadside.every((unit) => Math.abs(unit.y - 470) < 1), "roadside slots drifted before their first simulation frame");
  assert.ok(Math.abs(roadside[0].x - roadside[1].x) >= 8.8, "roadside slots overlap at creation");
  assert.ok(runners.slice(2).every((unit) => unit.y < 260), "far runner slots were moved to the roadside");
  assert.equal(counterattackSideEntry(g), null, "the next wave owns the next warning after deployment");

  const early = setupCounterattack({ encounter: 0, waves: 2, runners: 4 });
  const practice = setupCounterattack({ practice: true, waves: 2, runners: 4 });
  const centered = setupCounterattack({ waves: 2, runners: 4 });
  centered.assault.wave = 1;
  centered.assault.waveTimer = 0;
  assert.equal(counterattackSideEntry(early), null);
  assert.equal(counterattackSideEntry(practice), null);
  assert.equal(counterattackSideEntry(centered), null, "centered waves do not advertise a roadside entry");

  const runnerless = setupCounterattack({ waves: 2, runners: 0 });
  assert.equal(counterattackSideEntry(runnerless), null, "runnerless waves do not advertise an empty entry");

  const blockedEntry = setupCounterattack({ encounter: 2, waves: 2, runners: 4 });
  blockedEntry.walls = [{ x: 25, y: 450, w: 70, h: 45 }];
  assert.equal(counterattackSideEntry(blockedEntry), null, "a wall-covered hatch falls back to the ordinary formation");
  step(blockedEntry, 1 / 60);
  assert.equal(blockedEntry.red.filter((unit) => unit.sideEntry !== undefined).length, 0);
});

test("partial red capacity deploys roadside slots once and then keeps the pending warning quiet", () => {
  const g = setupCounterattack({ waves: 2, runners: 4 });
  g.red = Array.from({ length: 650 }, (_, index) => ({
    x: 20 + (index % 20) * 15,
    y: 250 - Math.floor(index / 20) * 2,
    vx: 0,
    hp: 1,
    r: 4.4,
    big: false,
    used: 0,
    dead: false,
  }));
  assert.equal(counterattackSideEntry(g)?.count, 2);

  step(g, 1 / 60);
  assert.equal(g.assault.waveSpawned, 0);
  assert.equal(g.assault.waveWarning, 1);
  assert.equal(counterattackSideEntry(g)?.count, 2);

  // Make room for exactly one slot, then repeat the same cap retry. The
  // first slot remains live, so the second retry must start at slot index one.
  g.red.splice(0, 1);
  g.assault.waveTimer = 0;
  step(g, 1 / 60);
  assert.equal(g.assault.waveSpawned, 1);
  assert.equal(counterattackSideEntry(g)?.count, 1);

  g.red.splice(0, 1);
  g.assault.waveTimer = 0;
  step(g, 1 / 60);
  assert.equal(g.assault.waveSpawned, 2);
  assert.equal(g.assault.wave, 0, "the remaining far slots must keep this wave pending");
  assert.equal(g.assault.waveWarning, 1);
  assert.equal(counterattackSideEntry(g), null, "the hatch is not re-announced after both slots deploy");
  assert.equal(g.red.filter((unit) => unit.sideEntry === 1).length, 2);
});

test("a saturated blue front can intercept the roadside entry and resume fresh shots", () => {
  const g = setupCounterattack({ waves: 2, runners: 4 });
  g.blue = Array.from({ length: MAX_UNITS }, (_, index) => ({
    // Keep the staged crowd outside the right hatch lane. Counterattack
    // guidance and later fresh shots must still reach the marked runners.
    x: 120 + (index % 15) * 8,
    y: 540 - Math.floor(index / 15) * 0.3,
    vx: 0,
    hp: 1,
    r: 4.2,
    big: false,
    used: 0,
    dead: false,
    pace: 1,
  }));
  g.targetX = 306;
  g.firing = true;
  const roadside = [];
  let maxBlue = g.blue.length;
  for (let frame = 0; frame < 300 && g.status === "playing"; frame++) {
    step(g, 1 / 60);
    maxBlue = Math.max(maxBlue, g.blue.length);
    for (const unit of g.red) {
      if (unit.sideEntry !== undefined && !roadside.includes(unit)) roadside.push(unit);
    }
  }
  assert.equal(g.status, "won");
  assert.equal(roadside.length, 2);
  assert.ok(roadside.every((unit) => unit.dead), "the saturated front never intercepted both marked runners");
  assert.ok(g.stats.fired > 0, "the cannon never resumed fresh shots after the cap opened");
  assert.ok(g.stats.kills >= roadside.length);
  assert.ok(maxBlue <= MAX_UNITS, "the blue crowd exceeded its authored cap");
  assert.equal(g.assault.breaches, 0);
  assert.equal(g.assault.integrity, 3);
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

test("only an authored flank rush gains road speed as it moves outward", () => {
  const flank = setupCounterattack({ runners: 1 });
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
  assert.ok(lateAverage < earlyAverage * 1.65, `flank displacement exceeded the fixture envelope: ${earlyAverage} -> ${lateAverage}`);

  const centered = setupCounterattack({ runners: 1 });
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
