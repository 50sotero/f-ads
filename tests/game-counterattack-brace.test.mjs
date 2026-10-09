import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CHARGE_MAX,
  MAX_UNITS,
  championShieldAim,
  counterattackWaveRole,
  isShieldCleanup,
  launchChampion,
  newGame,
  shieldBracePressure,
  step,
} from "../src/game/engine.ts";

const makeLevel = ({ practice = false, horde = 0, waves = 1 } = {}) => ({
  name: "guard brace",
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
    slamEvery: 8,
    counterattack: { waves, runners: 2, guards: 3, brutes: 0, interval: 2, flankEvery: 2 },
  },
});

function setupCounterattack(options = {}) {
  const g = newGame(makeLevel(options), 31);
  g.assault.encounter = options.encounter ?? 1;
  g.assault.phase = "counterattack";
  g.assault.wave = 0;
  g.assault.waves = options.waves ?? 1;
  g.assault.waveTimer = 0;
  g.assault.waveSpawned = 0;
  g.red = [];
  g.blue = [];
  g.firing = false;
  return g;
}

function cleanupGame({ practice = false, waves = 1 } = {}) {
  const g = setupCounterattack({ practice, waves });
  g.assault.wave = g.assault.waves;
  g.assault.waveTimer = 999;
  const guard = { x: 180, y: 400, vx: 0, hp: 2, r: 5.2, big: false, used: 0, dead: false, kind: "guard", braced: true };
  g.red = [guard];
  return { g, guard };
}

function contactGuard(g, guard, count = 1, dt = 1 / 60) {
  g.blue = Array.from({ length: count }, () => ({
    x: guard.x,
    y: guard.y,
    vx: 0,
    hp: 1,
    r: 4.2,
    big: false,
    used: 0,
    dead: false,
  }));
  step(g, dt);
}

test("late multi-wave roles brace only centered shield waves", () => {
  const late = setupCounterattack();
  assert.equal(counterattackWaveRole(late, 0), "mixed", "a one-wave custom fixture keeps its mixed role");
  step(late, 1 / 60);
  assert.equal(late.red.filter((unit) => unit.braced).length, 1);
  assert.equal(late.red.filter((unit) => unit.braced)[0].kind, "guard");

  const everyWave = setupCounterattack({ waves: 2 });
  assert.equal(counterattackWaveRole(everyWave, 0), "flank");
  assert.equal(counterattackWaveRole(everyWave, 1), "shield");
  step(everyWave, 1 / 60);
  assert.equal(everyWave.red.filter((unit) => unit.braced).length, 0, "flanks do not brace a guard");
  everyWave.assault.wave = 1;
  everyWave.assault.waveSpawned = 0;
  everyWave.assault.waveTimer = 0;
  step(everyWave, 1 / 60);
  assert.equal(everyWave.red.filter((unit) => unit.braced).length, 1, "the centered shield wave gets one brace");

  const early = setupCounterattack({ encounter: 0 });
  assert.equal(counterattackWaveRole(early, 0), "mixed");
  step(early, 1 / 60);
  assert.equal(early.red.filter((unit) => unit.braced).length, 0);

  const practice = setupCounterattack({ practice: true });
  assert.equal(counterattackWaveRole(practice, 0), "mixed");
  step(practice, 1 / 60);
  assert.ok(practice.red.length > 0);
  assert.equal(practice.red.filter((unit) => unit.braced).length, 0);

  const legacy = newGame(makeLevel({ horde: 2, waves: 0 }), 31);
  assert.ok(legacy.red.every((unit) => unit.braced === undefined));
});

test("late role compositions preserve each scaled wave total and authored zero roles", () => {
  const g = setupCounterattack({ waves: 2 });
  step(g, 1 / 60);
  const first = g.red.slice();
  assert.equal(first.length, 5);
  assert.equal(first.filter((unit) => unit.kind === "runner").length, 4);
  assert.equal(first.filter((unit) => unit.kind === "guard").length, 1);
  assert.equal(first.filter((unit) => unit.kind === "brute").length, 0);

  g.assault.wave = 1;
  g.assault.waveSpawned = 0;
  g.assault.waveTimer = 0;
  step(g, 1 / 60);
  const second = g.red.slice(first.length);
  assert.equal(second.length, 5, "the shield transfer keeps the scaled total intact");
  assert.equal(second.filter((unit) => unit.kind === "runner").length, 0);
  assert.equal(second.filter((unit) => unit.kind === "guard").length, 5);
  assert.equal(second.filter((unit) => unit.kind === "brute").length, 0);
  assert.equal(second.filter((unit) => unit.braced).length, 1);

  const noGuards = setupCounterattack({ waves: 2 });
  noGuards.level.assault.counterattack.guards = 0;
  noGuards.level.assault.counterattack.runners = 3;
  assert.equal(counterattackWaveRole(noGuards, 1), "mixed", "a centered wave without guards keeps the mixed telegraph");
  step(noGuards, 1 / 60);
  noGuards.assault.wave = 1;
  noGuards.assault.waveSpawned = 0;
  noGuards.assault.waveTimer = 0;
  step(noGuards, 1 / 60);
  assert.ok(noGuards.red.every((unit) => unit.kind !== "guard"), "shield waves do not invent guards");
});

test("custom zero-role waves keep mixed telegraphs and exact brute-only totals", () => {
  const runnerlessFlank = setupCounterattack({ waves: 2 });
  Object.assign(runnerlessFlank.level.assault.counterattack, { runners: 0, guards: 3, brutes: 0 });
  assert.equal(counterattackWaveRole(runnerlessFlank, 0), "mixed", "a runnerless flank cannot announce a runner rush");
  assert.equal(counterattackWaveRole(runnerlessFlank, 1), "shield", "a centered wave may still brace its authored guards");
  step(runnerlessFlank, 1 / 60);
  assert.equal(runnerlessFlank.red.length, 3);
  assert.ok(runnerlessFlank.red.every((unit) => unit.kind === "guard"));
  assert.ok(runnerlessFlank.red.every((unit) => !unit.braced), "a mixed fallback does not brace a multi-wave flank");
  assert.equal(runnerlessFlank.assault.remaining, 6, "the mixed fallback preserves both scaled wave totals");

  const bruteOnly = setupCounterattack({ waves: 2 });
  Object.assign(bruteOnly.level.assault.counterattack, { runners: 0, guards: 0, brutes: 2 });
  assert.equal(counterattackWaveRole(bruteOnly, 0), "mixed", "a brute-only flank stays mixed");
  assert.equal(counterattackWaveRole(bruteOnly, 1), "mixed", "a brute-only center has no shield role");
  step(bruteOnly, 1 / 60);
  assert.equal(bruteOnly.red.length, 2);
  assert.ok(bruteOnly.red.every((unit) => unit.kind === "brute"));
  assert.equal(bruteOnly.assault.remaining, 4, "brute-only waves keep their scaled count without inventing runners or guards");
});

test("partial counterattack capacity deploys every role wave and keeps remaining exact", () => {
  const g = setupCounterattack({ waves: 2 });
  Object.assign(g.level.assault.counterattack, { runners: 30, guards: 8, brutes: 4 });
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
  g.assault.wave = 0;
  g.assault.waveSpawned = 0;
  g.assault.waveTimer = 0;

  // Wave 0 is a flank: 30 + 6 runners, 2 guards, 4 brutes = 42.
  // Wave 1 is centered: 32 - 6 runners, 9 + 6 guards, 4 brutes = 45.
  step(g, 1 / 60);
  assert.equal(g.assault.wave, 0);
  assert.equal(g.assault.waveSpawned, 0);
  assert.equal(g.assault.remaining, 737);

  g.red.slice(0, 10).forEach((unit) => { unit.dead = true; });
  g.assault.waveTimer = 0;
  step(g, 1 / 60);
  g.assault.waveTimer = 0;
  step(g, 1 / 60);
  assert.equal(g.assault.waveSpawned, 10);
  assert.equal(g.assault.remaining, 727);

  g.red.slice(0, 32).forEach((unit) => { unit.dead = true; });
  g.assault.waveTimer = 0;
  step(g, 1 / 60);
  g.assault.waveTimer = 0;
  step(g, 1 / 60);
  assert.equal(g.assault.wave, 1);
  assert.equal(g.red.length, 650);
  assert.equal(g.red.filter((unit) => unit.kind === "runner").length, 36);
  assert.equal(g.red.filter((unit) => unit.kind === "guard").length, 2);
  assert.equal(g.red.filter((unit) => unit.kind === "brute").length, 4);
  assert.equal(g.assault.remaining, 695);

  g.red.forEach((unit) => { unit.dead = true; });
  g.assault.waveTimer = 0;
  step(g, 1 / 60);
  g.assault.waveTimer = 0;
  step(g, 1 / 60);
  assert.equal(g.assault.wave, 2);
  assert.equal(g.red.length, 45);
  assert.equal(g.red.filter((unit) => unit.kind === "runner").length, 26);
  assert.equal(g.red.filter((unit) => unit.kind === "guard").length, 15);
  assert.equal(g.red.filter((unit) => unit.kind === "brute").length, 4);
  assert.equal(g.red.filter((unit) => unit.braced).length, 1);
  assert.equal(g.assault.remaining, 45);
});

function collisionGame() {
  const g = newGame(makeLevel({ waves: 0 }), 17);
  g.assault.phase = "battle";
  g.assault.encounter = 0;
  g.red = [{ x: 180, y: 400, vx: 0, hp: 2, r: 5.2, big: false, used: 0, dead: false, kind: "guard", braced: true }];
  g.blue = [{ x: 180, y: 400, vx: 0, hp: 1, r: 4.2, big: false, used: 0, dead: false }];
  g.firing = false;
  return g;
}

test("ordinary contact is consumed by the brace, while a champion breaks it through normal combat", () => {
  const blocked = collisionGame();
  step(blocked, 1 / 60);
  assert.equal(blocked.red.length, 1);
  assert.equal(blocked.red[0].hp, 2, "ordinary contact must not damage a braced guard");
  assert.equal(blocked.red[0].braced, true);
  assert.equal(blocked.blue.length, 0, "the blocked ordinary runner should be consumed");

  const broken = collisionGame();
  broken.blue[0].big = true;
  broken.blue[0].hp = 14;
  broken.blue[0].r = 11;
  step(broken, 1 / 60);
  assert.equal(broken.red.length, 0, "a champion should break and defeat the two-hit guard");
  assert.equal(broken.blue.length, 1);
  assert.equal(broken.blue[0].hp, 12, "champion keeps the existing two damage collision cost");
  assert.ok(broken.pops.some((pop) => pop.text === "SHIELD BREAK"));
});

test("a full crowd can still launch a charged champion for the brace", () => {
  const g = newGame(makeLevel({ waves: 0 }), 5);
  g.blue = Array.from({ length: MAX_UNITS }, (_, index) => ({
    x: 180 + (index % 5),
    y: 400,
    vx: 0,
    hp: 1,
    r: 4.2,
    big: false,
    used: 0,
    dead: false,
  }));
  g.charge = CHARGE_MAX;
  assert.equal(launchChampion(g), true);
  assert.equal(g.charge, 0);
  assert.equal(g.blue.length, MAX_UNITS + 1, "champion launch must remain available at the crowd cap");
});

test("a dense contact wave cannot erase shield-break feedback in the same step", () => {
  const g = collisionGame();
  g.red.push({ ...g.red[0], x: 260 });
  g.blue[0].big = true;
  g.blue[0].hp = 14;
  g.blue[0].r = 11;
  for (let i = 0; i < 300; i++) g.blue.push({ x: 260, y: 400, vx: 0, hp: 1, r: 4.2, big: false, used: 0, dead: false });
  step(g, 1 / 60);
  assert.equal(g.stats.kills, 1);
  assert.ok(g.pops.length <= 261);
  assert.equal(g.pops.filter((pop) => pop.text === "SHIELD BREAK").length, 1);
});

test("an aligned champion follows a drifting nearby shield through actual contact", () => {
  for (const vx of [80, 120, 180]) {
    const g = setupCounterattack();
    g.assault.waveTimer = 999;
    g.assault.weaponTarget = null;
    g.assault.cannonTarget = null;
    g.assault.weaponTargetsEnabled = false;
    g.bases[1].hp = 0;
    const guard = { x: 75, y: 520, vx, hp: 5, r: 6.2, big: false, used: 0, dead: false, kind: "guard", braced: true };
    g.red = [guard];
    g.cannonX = g.targetX = 75;
    g.charge = CHARGE_MAX;
    assert.equal(championShieldAim(g).direction, "aligned");
    launchChampion(g);
    const champion = g.blue[0];
    assert.equal(guard.braced, true, "launch damaged the shield remotely");
    let previousX = champion.x;
    for (let frame = 0; frame < 180 && guard.braced && !guard.dead; frame++) {
      step(g, 1 / 60);
      assert.ok(Math.abs(champion.x - previousX) <= 100 / 60 + 0.001, "champion correction teleported laterally");
      previousX = champion.x;
    }
    assert.equal(guard.braced, false, `aligned launch missed guard with lateral velocity ${vx}`);
    assert.equal(champion.hp, 9, "shield break skipped the physical combat cost");
  }
});

test("an unaligned champion does not acquire a shield or follow later cannon steering", () => {
  const g = setupCounterattack();
  g.assault.waveTimer = 999;
  const guard = { x: 75, y: 520, vx: 0, hp: 5, r: 6.2, big: false, used: 0, dead: false, kind: "guard", braced: true };
  g.red = [guard];
  g.cannonX = g.targetX = 240;
  g.charge = CHARGE_MAX;
  launchChampion(g);
  const champion = g.blue[0];
  g.targetX = 75;
  for (let frame = 0; frame < 20; frame++) step(g, 1 / 60);
  assert.equal(champion.x, 240);
  assert.equal(guard.braced, true);
});

test("shield cleanup activates only after the final wave has deployed and six reds remain", () => {
  const final = cleanupGame();
  assert.equal(isShieldCleanup(final.g), true);

  const pending = setupCounterattack();
  pending.red = [final.guard];
  pending.assault.wave = pending.assault.waves - 1;
  pending.assault.waveTimer = 999;
  assert.equal(isShieldCleanup(pending), false, "pending waves keep the brace strict");

  const busy = cleanupGame();
  for (let i = 1; i < 7; i++) {
    busy.g.red.push({ x: 30 + i * 32, y: 420, vx: 0, hp: 1, r: 4.4, big: false, used: 0, dead: false });
  }
  assert.equal(busy.g.red.filter((unit) => !unit.dead).length, 7);
  assert.equal(isShieldCleanup(busy.g), false, "seven living reds are still a busy fight");
});

test("ordinary contact fatigues one final-wave guard for 1.25 seconds and leaves health intact", () => {
  const { g, guard } = cleanupGame();
  for (let frame = 0; frame < 74; frame++) {
    contactGuard(g, guard);
    assert.equal(guard.braced, true);
  }
  assert.ok(Math.abs(shieldBracePressure(g, guard) - 74 / 75) < 0.0001);
  contactGuard(g, guard);
  assert.equal(guard.braced, false);
  assert.equal(guard.hp, 2, "fatigue breaks the brace before normal combat damage");
  assert.equal(shieldBracePressure(g, guard), 0);
  assert.equal(g.pops.filter((pop) => pop.text === "SHIELD BREAK").length, 1);
});

test("ordinary contact cannot fatigue a busy brace, and champions still break cleanup braces immediately", () => {
  for (const pendingWave of [true, false]) {
    const { g, guard } = cleanupGame();
    if (pendingWave) g.assault.wave = g.assault.waves - 1;
    else for (let i = 0; i < 6; i++) g.red.push({ x: 25 + i * 55, y: 250, vx: 0, hp: 10, r: 4.4, big: false, used: 0, dead: false });
    for (let frame = 0; frame < 100; frame++) contactGuard(g, guard);
    assert.equal(guard.braced, true);
    assert.equal(guard.hp, 2);
    assert.equal(shieldBracePressure(g, guard), 0);
  }
  const { g, guard } = cleanupGame();
  g.blue = [{ x: guard.x, y: guard.y, vx: 0, hp: 14, r: 11, big: true, used: 0, dead: false }];
  step(g, 1 / 60);
  assert.equal(guard.braced, false);
  assert.equal(guard.dead, true);
  assert.equal(g.blue[0].hp, 12);
});

test("shield fatigue pauses without contact and a dense frame counts once", () => {
  const { g, guard } = cleanupGame();
  for (let frame = 0; frame < 20; frame++) contactGuard(g, guard);
  const beforePause = shieldBracePressure(g, guard);
  g.blue = [];
  for (let frame = 0; frame < 60; frame++) step(g, 1 / 60);
  assert.equal(shieldBracePressure(g, guard), beforePause, "no-contact frames do not advance fatigue");
  assert.equal(guard.braced, true);

  contactGuard(g, guard, 24);
  assert.equal(guard.braced, true, "a same-frame pileup cannot spend 24 frames of fatigue");
  assert.ok(Math.abs(shieldBracePressure(g, guard) - (21 / 75)) < 0.0001);
});

test("practice braces stay strict and fatigue metadata does not cross game owners", () => {
  const practice = cleanupGame({ practice: true });
  for (let frame = 0; frame < 100; frame++) contactGuard(practice.g, practice.guard);
  assert.equal(isShieldCleanup(practice.g), false);
  assert.equal(practice.guard.braced, true);
  assert.equal(practice.guard.hp, 2);
  assert.equal(shieldBracePressure(practice.g, practice.guard), 0);

  const first = cleanupGame();
  for (let frame = 0; frame < 20; frame++) contactGuard(first.g, first.guard);
  assert.ok(shieldBracePressure(first.g, first.guard) > 0);

  const second = cleanupGame();
  second.g.red = [first.guard];
  assert.equal(shieldBracePressure(second.g, first.guard), 0, "a new game starts with a fresh owner");
  contactGuard(second.g, first.guard);
  assert.ok(Math.abs(shieldBracePressure(second.g, first.guard) - 1 / 75) < 0.0001);
});
