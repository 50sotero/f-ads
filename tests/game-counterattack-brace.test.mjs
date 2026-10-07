import assert from "node:assert/strict";
import { test } from "node:test";
import { CHARGE_MAX, MAX_UNITS, championShieldAim, launchChampion, newGame, step } from "../src/game/engine.ts";

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

test("eligible late counterattack waves mark exactly one guard as braced", () => {
  const late = setupCounterattack();
  step(late, 1 / 60);
  assert.equal(late.red.filter((unit) => unit.braced).length, 1);
  assert.equal(late.red.filter((unit) => unit.braced)[0].kind, "guard");

  const everyWave = setupCounterattack({ waves: 2 });
  step(everyWave, 1 / 60);
  everyWave.assault.wave = 1;
  everyWave.assault.waveSpawned = 0;
  everyWave.assault.waveTimer = 0;
  step(everyWave, 1 / 60);
  assert.equal(everyWave.red.filter((unit) => unit.braced).length, 2, "each eligible wave gets one brace");

  const early = setupCounterattack({ encounter: 0 });
  step(early, 1 / 60);
  assert.equal(early.red.filter((unit) => unit.braced).length, 0);

  const practice = setupCounterattack({ practice: true });
  step(practice, 1 / 60);
  assert.ok(practice.red.length > 0);
  assert.equal(practice.red.filter((unit) => unit.braced).length, 0);

  const legacy = newGame(makeLevel({ horde: 2, waves: 0 }), 31);
  assert.ok(legacy.red.every((unit) => unit.braced === undefined));
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
