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

const counterattackUnit = (x, y, overrides = {}) => ({
  x,
  y,
  vx: 0,
  hp: 1,
  r: 4.2,
  big: false,
  used: 7,
  dead: false,
  ...overrides,
});

const counterattackGame = ({ blue = [], red = [] } = {}) => {
  const game = newGame(assaultLevel({
    bases: [{ x: 180, y: 300, hp: 99999, every: 9999, group: 0 }],
    assault: {
      horde: 0,
      reserve: 0,
      speed: 16,
      theme: "fork",
      counterattack: { waves: 1, runners: 0, guards: 0, brutes: 0, interval: 999 },
    },
  }));
  game.firing = false;
  game.assault.phase = "counterattack";
  game.assault.wave = 0;
  game.assault.waves = 1;
  game.assault.waveTimer = 999;
  game.assault.waveSpawned = 0;
  game.assault.horde = 0;
  game.assault.reserve = 0;
  game.assault.weaponTarget = null;
  game.assault.cannonTarget = null;
  game.assault.weaponTargetsEnabled = false;
  game.bases[0].hp = 0;
  game.blue.push(...blue);
  game.red.push(...red);
  return game;
};

test("crowd movement stays deterministic when another game runs between frames", () => {
  const level = assaultLevel({ assault: { horde: 160, reserve: 60, speed: 16, theme: "fork" } });
  const reference = newGame(level, 5), interleaved = newGame(level, 5);
  const unrelated = newGame(level, 37);
  const advance = (game, frame) => {
    game.firing = true;
    game.targetX = frame < 70 ? 110 : 245;
    step(game, 1 / 60);
  };
  for (let frame = 0; frame < 180; frame++) advance(reference, frame);
  for (let frame = 0; frame < 180; frame++) {
    for (let extra = 0; extra <= frame % 3; extra++) advance(unrelated, frame);
    advance(interleaved, frame);
  }
  assert.ok(reference.blue.length > 10 && reference.red.length > 10);
  assert.deepEqual(interleaved.blue, reference.blue);
  assert.deepEqual(interleaved.red, reference.red);
  assert.deepEqual(interleaved.bases, reference.bases);
  assert.deepEqual(interleaved.stats, reference.stats);
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

test("red rear pressure widens behind the active boss", () => {
  const game = newGame(assaultLevel({
    bases: [{ x: 180, y: 300, hp: 99999, every: 9999, group: 0 }],
    gates: [],
  }));
  game.firing = false;
  const near = { x: 280, y: 340, vx: 0, hp: 1, r: 4.2, big: false, used: 0, dead: false };
  const rear = { x: 280, y: 100, vx: 0, hp: 1, r: 4.2, big: false, used: 0, dead: false };
  game.red.push(near, rear);

  step(game, 1 / 60);

  assert.ok(near.x < 280, "the front red unit stopped receiving boss corridor pressure");
  assert.equal(rear.x, 280, "the rear red unit was pulled into the narrow boss corridor");
});

test("assault horde spacing is deterministic but staggered", () => {
  const level = assaultLevel({
    bases: [{ x: 180, y: 300, hp: 99999, every: 9999, group: 0 }],
    assault: { horde: 320, reserve: 0, speed: 16, theme: "fork" },
  });
  const first = newGame(level, 7);
  const second = newGame(level, 7);
  assert.deepEqual(first.red, second.red, "the formed horde changed for the same seed");

  const firstRow = first.red.slice(0, 17);
  const secondRow = first.red.slice(17, 35);
  assert.ok(Math.abs(firstRow[0].x - secondRow[0].x) > 1, "adjacent rows shared one rigid left edge");
  assert.ok(Math.abs(firstRow.at(-1).x - secondRow.at(-1).x) > 1, "adjacent rows shared one rigid right edge");
  assert.ok(new Set(first.red.map((unit) => unit.pace)).size > 8, "formed runners did not get stable pace variation");
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

test("counterattack survivors react locally to both flanks with bounded motion", () => {
  for (const [targetX, direction] of [[95, -1], [265, 1]]) {
    const survivor = counterattackUnit(180, 280);
    const target = counterattackUnit(targetX, 280, { used: 0 });
    const game = counterattackGame({ blue: [survivor], red: [target] });
    const firstX = survivor.x;
    const firstY = survivor.y;
    step(game, 1 / 60);

    assert.ok(Math.abs(survivor.x - firstX) <= 0.11, "counterattack steering exceeded its per-frame bound");
    assert.ok(survivor.y <= firstY, "counterattack steering moved a survivor backward");
    for (let frame = 0; frame < 30; frame++) step(game, 1 / 60);
    assert.ok(direction < 0 ? survivor.x < firstX - 10 : survivor.x > firstX + 10, `survivor did not react toward the ${direction < 0 ? "left" : "right"} flank`);
  }
});

test("counterattack ignores an enemy outside the local lateral window", () => {
  const survivor = counterattackUnit(180, 450);
  const target = counterattackUnit(55, 400, { used: 0 });
  const game = counterattackGame({ blue: [survivor], red: [target] });
  for (let frame = 0; frame < 30; frame++) step(game, 1 / 60);

  assert.equal(survivor.x, 180, "a distant flank unit steered a counterattack survivor");
  assert.ok(survivor.y < 450, "the survivor did not retain its forward travel");
});

test("counterattack guidance brakes an existing sideways velocity continuously", () => {
  const survivor = counterattackUnit(180, 280, { vx: 420 });
  const game = counterattackGame({ blue: [survivor], red: [counterattackUnit(100, 280)] });
  step(game, 1 / 60);
  const dampedVelocity = 420 * Math.exp(-3 / 60);
  assert.ok(Math.abs(survivor.vx - dampedVelocity) <= 4.001, `guidance snapped velocity to ${survivor.vx}`);
});

test("counterattack survivors physically turn back to an adjacent attacker", () => {
  const survivor = counterattackUnit(180, 300);
  const game = counterattackGame({ blue: [survivor], red: [counterattackUnit(180, 325)] });
  step(game, 1 / 60);
  assert.ok(survivor.y > 300 && survivor.y <= 300.701, `reverse movement jumped to y=${survivor.y}`);
  for (let i = 0; i < 90; i++) step(game, 1 / 60);
  assert.ok(survivor.dead || game.red.length === 0, "the nearby attacker was never engaged");
});

test("a survivor keeps engaging when it turns back across the final approach", () => {
  // A branched route does not set every gate bit. Before the latch, a turn
  // across y=408 repeatedly switched this survivor back to forward travel.
  const survivor = counterattackUnit(180, 407, { used: 1 });
  const guard = counterattackUnit(180, 441, { used: 0, kind: "guard", braced: true, hp: 2 });
  const game = counterattackGame({ blue: [survivor], red: [guard] });
  let previousY = survivor.y;
  for (let frame = 0; frame < 60 && !survivor.dead; frame++) {
    step(game, 1 / 60);
    assert.ok(survivor.y >= previousY, "crossing the approach line reversed the survivor away from its target");
    assert.ok(survivor.y - previousY <= 0.701, "engagement exceeded the bounded turn-back speed");
    previousY = survivor.y;
  }
  assert.ok(survivor.dead || survivor.y > 430, `survivor remained pinned to the approach at ${survivor.y}`);
});

test("staged survivors can reach a visible attacker behind the old short reverse window", () => {
  const survivor = counterattackUnit(180, 365);
  const guard = counterattackUnit(180, 442, { used: 0, kind: "guard", braced: true, hp: 2 });
  const game = counterattackGame({ blue: [survivor], red: [guard] });
  for (let frame = 0; frame < 120 && !survivor.dead; frame++) step(game, 1 / 60);
  assert.ok(survivor.dead || survivor.y > 430, `the nearby visible guard left the survivor parked at ${survivor.y}`);
});

test("an advanced defeated boss stages incoming troops after its gates are overrun", () => {
  const survivor = counterattackUnit(180, 550, { used: 0 });
  const game = counterattackGame({ blue: [survivor] });
  game.bases[0].y = 419;
  for (const gate of game.gates) gate.overrun = true;
  for (let i = 0; i < 180; i++) step(game, 1 / 60);
  assert.ok(survivor.y >= 467 && survivor.y <= 472, `survivor passed through the advanced staging area to ${survivor.y}`);
});

test("fresh counterattack shots keep their committed launch lane before the final gate", () => {
  const survivor = counterattackUnit(180, 555, { used: 0 });
  const target = counterattackUnit(100, 555, { used: 0 });
  const game = counterattackGame({ blue: [survivor], red: [target] });
  for (let frame = 0; frame < 20; frame++) step(game, 1 / 60);

  assert.equal(survivor.x, 180, "a fresh shot was steered before reaching the final gate");
  assert.ok(survivor.y > 510, "fixture runner crossed the first gate during the launch-lane check");
});

test("engagement does not leak into another encounter or game", () => {
  for (const scope of ["encounter", "game"]) {
    const survivor = counterattackUnit(180, 407, { used: 0 });
    let game = counterattackGame({ blue: [survivor], red: [counterattackUnit(180, 441, { used: 0 })] });
    step(game, 1 / 60);
    assert.ok(survivor.y > 407, "fixture did not commit to the counterattack");
    survivor.y = 555;
    const target = counterattackUnit(100, 555, { used: 0 });
    if (scope === "game") game = counterattackGame({ blue: [survivor], red: [target] });
    else {
      game.bases.push({ ...game.bases[0] });
      game.assault.encounter = 1;
      game.red = [target];
    }
    for (let frame = 0; frame < 20; frame++) step(game, 1 / 60);
    assert.equal(survivor.x, 180, `engagement leaked across ${scope} before the new approach`);
    assert.ok(survivor.y > 510);
  }
});

test("counterattack survivors stage near the defeated boss when the road is empty", () => {
  const survivor = counterattackUnit(180, 450);
  const irrelevant = counterattackUnit(55, 40, { used: 0 });
  const game = counterattackGame({ blue: [survivor], red: [irrelevant] });
  let previousY = survivor.y;
  for (let frame = 0; frame < 240; frame++) {
    step(game, 1 / 60);
    assert.ok(survivor.y <= previousY + 0.0001, "staging moved a survivor backward");
    previousY = survivor.y;
  }

  assert.ok(survivor.y >= 350, `survivor ran above the staging line to y=${survivor.y}`);
  assert.ok(survivor.y < 360, `survivor never reached the staging line, y=${survivor.y}`);
  assert.ok(game.status === "playing", "an empty counterattack road ended before its pending phase");
});

test("an aligned counterattack target ahead releases the staging cap", () => {
  const survivor = counterattackUnit(180, 365);
  const target = counterattackUnit(180, 300, { used: 0 });
  const game = counterattackGame({ blue: [survivor], red: [target] });
  for (let frame = 0; frame < 30; frame++) step(game, 1 / 60);

  assert.ok(survivor.dead || survivor.y < 350, `aligned target left the survivor at the staging line y=${survivor.y}`);
  assert.ok(survivor.y <= 450, "closing toward an aligned target moved the survivor backward");
});

test("final cleanup pursues a selected ordinary enemy without waiting for it to cross the staging gap", () => {
  const survivor = counterattackUnit(180, 350);
  const target = counterattackUnit(180, 240, { used: 0 });
  const game = counterattackGame({ blue: [survivor], red: [target] });
  game.assault.wave = game.assault.waves;

  step(game, 1 / 60);
  assert.ok(survivor.y < 349, "the selected enemy left its aligned pursuer parked");
  assert.equal(target.hp, 1, "pursuit must not damage an enemy remotely");
  assert.equal(target.dead, false);

  for (let frame = 0; frame < 120 && !target.dead; frame++) step(game, 1 / 60);
  assert.equal(target.dead, true, "the pursuer did not reach physical contact");
  assert.equal(game.stats.kills, 1);
  assert.equal(game.status, "won");
});

test("counterattack approach releases aligned actual enemies while waves remain", () => {
  for (const depth of [110, 150, 180]) {
    const survivor = counterattackUnit(180, 350);
    const target = counterattackUnit(180, 350 - depth, { used: 0 });
    const game = counterattackGame({ blue: [survivor], red: [target] });
    step(game, 1 / 60);
    assert.ok(survivor.y < 349, `enemy ${depth}px ahead left the survivor parked`);
    assert.equal(survivor.x, 180, "forward approach changed the chosen lane");
    assert.equal(target.hp, 1, "approach damaged a distant target");
    assert.equal(target.dead, false);
    for (let frame = 0; frame < 240 && !target.dead; frame++) step(game, 1 / 60);
    assert.equal(target.dead, true, "approach never reached physical contact");
    assert.equal(game.stats.kills, 1);
  }
});

test("counterattack approach retains staging outside its forward lane and in practice", () => {
  for (const scenario of [
    { name: "target outside approach", depth: 181 },
    { name: "target outside alignment", offset: 37 },
    { name: "distant sideways target", offset: 37, depth: 150 },
    { name: "practice", practice: true },
    { name: "champion retains close engagement", big: true, pending: true },
  ]) {
    const survivor = counterattackUnit(180, 350, { big: scenario.big ?? false });
    const target = counterattackUnit(180 + (scenario.offset ?? 0), 350 - (scenario.depth ?? 110), { used: 0 });
    const extras = Array.from({ length: (scenario.count ?? 1) - 1 }, (_, index) => counterattackUnit(20, 20 + index * 12, { used: 0 }));
    const game = counterattackGame({ blue: [survivor], red: [target, ...extras] });
    game.assault.wave = scenario.pending ? 0 : game.assault.waves;
    game.level.assault.practice = scenario.practice ?? false;
    step(game, 1 / 60);
    assert.equal(survivor.y, 350, `${scenario.name} released the staging line`);
    assert.equal(target.hp, 1, `${scenario.name} damaged an enemy remotely`);
  }
});

test("forward approach does not steer sideways before close engagement", () => {
  const survivor = counterattackUnit(180, 350);
  const target = counterattackUnit(215, 185, { used: 0 });
  const game = counterattackGame({ blue: [survivor], red: [target] });
  for (let frame = 0; frame < 12; frame++) step(game, 1 / 60);
  assert.ok(survivor.y < 335, "the aligned incoming enemy did not release forward travel");
  assert.equal(survivor.x, 180, "a distant enemy pulled the survivor sideways");
  assert.equal(survivor.vx, 0);
  target.dead = true;
  const stoppedAt = survivor.y;
  for (let frame = 0; frame < 30; frame++) step(game, 1 / 60);
  assert.equal(survivor.y, stoppedAt, "survivor kept pursuing after the real enemy disappeared");
});

test("approach-only rows cannot consume champion or practice close-target samples", () => {
  for (const practice of [false, true]) {
    const survivor = counterattackUnit(180, 350, { big: !practice });
    // These near cells have always spent samples on just-outside-depth reds.
    // The newly indexed farther row must not spend the remaining budget and
    // hide the valid close target at the far corner of the original window.
    const decoys = [-1, 0, 1].flatMap(column => Array.from({ length: 8 },
      () => counterattackUnit(180 + column * 24, 220, { used: 0 })));
    const farther = Array.from({ length: 8 }, () => counterattackUnit(180, 200, { used: 0 }));
    const target = counterattackUnit(264, 460, { used: 0 });
    const game = counterattackGame({ blue: [survivor], red: [...decoys, ...farther, target] });
    game.level.assault.practice = practice;
    step(game, 1 / 60);
    assert.ok(survivor.x > 180, `${practice ? "practice" : "champion"} lost its close target to approach-only samples`);
    assert.equal(survivor.y, 350, "the unaligned target released forward travel");
    assert.equal(target.hp, 1, "target was damaged without physical contact");
  }
});

test("a full survivor cap still clears a counterattack while firing", () => {
  const blue = [];
  for (let index = 0; index < 900; index++) {
    const row = Math.floor(index / 30);
    const column = index % 30;
    blue.push(counterattackUnit(12 + column * 11.5, 250 + row * 1.2));
  }
  const game = counterattackGame({ blue });
  game.level.assault.counterattack = { waves: 1, runners: 12, guards: 0, brutes: 0, interval: 0.65 };
  game.firing = true;
  game.targetX = 55;
  game.assault.waveTimer = 0;
  for (let frame = 0; frame < 360 && game.status === "playing"; frame++) step(game, 1 / 60);

  assert.equal(game.status, "won", "the counterattack stalled with a full survivor cap");
  assert.ok(game.stats.kills >= 1, "the full survivor cap never engaged the incoming wave");
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

test("late side-lane shots still reach a boss that has advanced below the gates", () => {
  for (const launchX of [55, 307]) {
    const game = newGame(assaultLevel({
      bases: [{ x: 180, y: 300, hp: 99999, every: 9999, group: 0 }],
    }));
    game.firing = false;
    game.assault.weaponTarget = null;
    game.assault.cannonTarget = null;
    game.assault.weaponTargetsEnabled = false;
    for (let frame = 0; frame < 780; frame++) step(game, 1 / 60);
    assert.ok(game.bases[0].y >= 419 && game.bases[0].y <= 420, "boss did not reach its pressure cap");

    const runner = { x: launchX, y: 574, vx: 0, hp: 1, r: 4.2, big: false, used: 0, dead: false };
    game.blue.push(runner);
    for (let frame = 0; frame < 240 && !runner.dead; frame++) step(game, 1 / 60);

    assert.equal(runner.dead, true, `late side shot at x=${launchX} leaked above the boss`);
    assert.ok(runner.y > 400, `late side shot at x=${launchX} passed behind the boss to y=${runner.y}`);
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

test("sustained fire keeps a deep central queue that advances and replenishes boss contact", () => {
  const game = newGame(assaultLevel({
    bases: [{ x: 180, y: 300, hp: 99999, every: 9999, group: 0 }],
  }));
  game.firing = true;
  const diameter = 8.4;
  let initialCohort;
  let initialHits = 0;
  let oldContacts = 0;
  let newContacts = 0;
  for (let frame = 0; frame < 720; frame++) {
    if (frame === 600) {
      initialCohort = new Map(game.blue.map((unit) => [unit, { startY: unit.y, travel: 0 }]));
      initialHits = game.stats.baseHits;
    }
    const before = frame >= 600 ? game.blue.map((unit) => [unit, unit.y]) : [];
    step(game, 1 / 60);
    for (const [unit, previousY] of before) {
      const travel = previousY - unit.y;
      assert.ok(travel >= -1e-9, "queue repacked an existing runner backward");
      assert.ok(travel <= 98 * 1.1 / 60 + 1e-9, "queue teleported a runner forward");
      const original = initialCohort.get(unit);
      if (original) original.travel = original.startY - unit.y;
      if (unit.dead) {
        if (original) oldContacts++;
        else newContacts++;
      }
    }
    if (![480, 600, 720].includes(frame + 1)) continue;
    const boss = game.bases[0];
    const postChain = game.blue.filter((unit) => (unit.used & 1) !== 0);
    const central = postChain.filter((unit) => Math.abs(unit.x - boss.x) <= 96);
    const front = boss.y + boss.h / 2;
    const touching = game.blue.filter((unit) => unit.y >= front && unit.y <= front + 8);
    const depths = game.blue.map((unit) => unit.y).sort((a, b) => a - b);
    let bandStart = 0;
    let peakBand = 0;
    for (let end = 0; end < depths.length; end++) {
      while (depths[end] - depths[bandStart] > diameter) bandStart++;
      peakBand = Math.max(peakBand, end - bandStart + 1);
    }
    assert.ok(game.blue.length > 100, "fixture did not build sustained crowd pressure");
    assert.ok(postChain.length > 100, "fixture did not cross the first gate");
    assert.ok(central.length / postChain.length > 0.9, "post-gate crowd spilled across the full road");
    assert.ok(touching.length < 50, `${touching.length} runners overlapped at the boss edge`);
    // Preserve the original twenty eight-unit rows' physical extent without
    // requiring every world-aligned bin to contain a runner. Bulk distribution
    // rules out a thin shelf with a handful of distant outliers.
    assert.ok(depths.at(-1) - depths[0] >= 20 * 8, "queue lost its sustained depth");
    assert.ok(depths[Math.floor(depths.length * 0.75)] - depths[Math.floor(depths.length * 0.25)] >= 2 * diameter,
      "the middle half of the crowd collapsed into fewer than two body depths");
    assert.ok(peakBand <= depths.length / 4, "one body-deep shelf held over a quarter of the crowd");
    assert.ok(boss.y > 300 && boss.y <= 420, `boss pressure moved to an invalid y=${boss.y}`);
  }
  assert.ok([...initialCohort.values()].filter(({ travel }) => travel >= diameter).length > initialCohort.size / 2,
    "most waiting runners failed to advance by a body diameter");
  assert.ok(oldContacts > initialCohort.size / 2, "the waiting queue failed to reach boss contact");
  assert.ok(newContacts > 0, "new arrivals did not replenish boss contact");
  assert.equal(oldContacts + newContacts, game.stats.baseHits - initialHits,
    "tracked runners disappeared without causing boss contact");
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

test("surviving runners keep their lane and move smoothly with road travel", () => {
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
  const preservedX = survivor.x;
  assert.ok(preservedY < CANNON_Y - 100, `survivor was reset near the cannon at y=${preservedY}`);
  for (let frame = 0; frame < 60 && game.assault.phase === "advance"; frame++) {
    const beforeY = survivor.y;
    step(game, 1 / 60);
    assert.ok(survivor.y - beforeY <= 6.4, "camera advance teleported the survivor");
  }
  assert.equal(survivor.x, preservedX, "camera travel rewrote the survivor's lane");
  assert.equal(survivor.used, 7, "camera travel allowed a gate to multiply twice");
  assert.ok(survivor.y > game.bases[1].y + game.bases[1].h / 2, "survivor arrived beyond the next boss");
  assert.ok(survivor.y <= CANNON_Y - 24, "survivor was left behind the cannon");
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
