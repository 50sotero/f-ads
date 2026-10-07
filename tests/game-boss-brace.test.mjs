import assert from "node:assert/strict";
import { test } from "node:test";
import {
  bossBrace,
  bossBraceChampionIncoming,
  bossBreakthrough,
  championBossAim,
  launchChampion,
  newGame,
  step,
} from "../src/game/engine.ts";

const FRAME = 1 / 60;

const makeLevel = (options = {}) => {
  const practice = options.practice ?? false;
  const horde = options.horde ?? 24;
  const slamEvery = Object.hasOwn(options, "slamEvery") ? options.slamEvery : 9;
  const baseX = options.baseX ?? 180;
  const counterattack = options.counterattack;
  const walls = options.walls ?? [];
  return {
    name: "boss brace fixture",
    par: 30,
    bases: [{ x: baseX, y: 300, hp: 100, every: 9999, group: 0 }],
    gates: [{ x: baseX, y: 0, w: 1, kind: "x", n: 2 }],
    walls,
    assault: {
      horde,
      reserve: 0,
      speed: 16,
      theme: "fork",
      practice,
      slamEvery,
      ...(counterattack ? { counterattack } : {}),
    },
  };
};

const makeUnit = ({ x = 180, y = 331, big = false } = {}) => ({
  x,
  y,
  vx: 0,
  hp: big ? 14 : 1,
  r: big ? 11 : 4.2,
  big,
  used: 0,
  dead: false,
});

const prepare = (options = {}) => {
  const horde = options.horde ?? 24;
  const game = newGame(makeLevel(options));
  game.firing = false;
  game.red = [];
  game.assault.horde = horde;
  game.assault.reserve = 0;
  game.bases[0].hp = 75;
  return game;
};

const armBrace = (options = {}) => {
  const game = prepare(options);
  game.blue.push(makeUnit({ x: game.bases[0].x }));
  step(game, FRAME);
  assert.equal(bossBrace(game)?.phase, "winding");
  game.assault.weaponTarget = null;
  game.assault.cannonTarget = null;
  game.assault.weaponTargetsEnabled = false;
  return game;
};

const advanceUntil = (game, predicate, maxFrames = 360) => {
  for (let frame = 0; frame < maxFrames; frame++) {
    if (predicate()) return frame;
    step(game, FRAME);
  }
  return maxFrames;
};

test("brace permits ordinary damage but limits one contact batch and only triggers once", () => {
  const game = prepare();
  game.blue.push(...Array.from({ length: 8 }, () => makeUnit()));

  step(game, FRAME);

  assert.deepEqual(bossBrace(game), { phase: "winding", progress: 0, seconds: 4.75 });
  assert.equal(game.bases[0].hp, 71, "ordinary contacts still damaged the giant");
  assert.equal(game.stats.baseHits, 4, "the winding batch capped ordinary contacts at four");
  assert.equal(game.blue.length, 4, "remaining runners were left alive for the warning window");

  game.blue = [];
  advanceUntil(game, () => bossBrace(game)?.phase === "impact");
  advanceUntil(game, () => bossBrace(game) === null);
  const hpBeforeSecondContact = game.bases[0].hp;
  game.blue.push(makeUnit());
  step(game, FRAME);
  assert.equal(bossBrace(game), null, "the completed encounter brace did not re-arm");
  assert.equal(game.bases[0].hp, hpBeforeSecondContact - 1, "normal contact resumed after the one-shot brace");
});

test("brace arms before a twelve-contact batch can carry the giant below 75%", () => {
  const game = prepare();
  game.bases[0].hp = 80;
  game.blue.push(...Array.from({ length: 12 }, () => makeUnit()));

  step(game, FRAME);

  assert.equal(bossBrace(game)?.phase, "winding");
  assert.equal(game.bases[0].hp, 76, "the predicted lethal batch was limited to four contacts");
  assert.equal(game.blue.length, 8);
});

test("a champion contact interrupts the winding brace and restores normal contact damage", () => {
  const game = prepare();
  game.blue.push(makeUnit({ big: true }), ...Array.from({ length: 4 }, () => makeUnit()));

  step(game, FRAME);

  assert.equal(game.blue.length, 0, "the champion and the ordinary contacts were consumed normally");
  assert.equal(game.bases[0].hp, 50, "the champion dealt its normal damage and ordinary contacts continued");
  assert.deepEqual(bossBrace(game), { phase: "staggered", progress: 0, seconds: 0.6 });
  step(game, 0.3);
  assert.equal(bossBrace(game)?.phase, "staggered");
  step(game, 0.31);
  assert.equal(bossBrace(game), null, "the brief stagger cleaned up");
});

test("the capped winding batch does not take an extra ordinary contact after twelve champions", () => {
  const game = prepare();
  const champions = Array.from({ length: 12 }, () => {
    const champion = makeUnit({ big: true });
    champion.hp = 1;
    return champion;
  });
  game.blue.push(...champions, makeUnit());

  step(game, FRAME);

  assert.equal(game.bases[0].hp, 15, "the batch stopped at twelve contacts");
  assert.equal(game.blue.length, 1, "the ordinary contact remained for the next batch");
  assert.equal(bossBrace(game)?.phase, "staggered");
});

test("a remote champion cannot interrupt the brace", () => {
  const game = prepare();
  const champion = makeUnit({ y: 200, big: true });
  game.blue.push(champion);

  step(game, FRAME);

  assert.equal(champion.dead, false);
  assert.equal(game.bases[0].hp, 75);
  assert.equal(bossBrace(game)?.phase, "winding");
});

test("a champion launched during winding keeps its forward floor through allied crowd", () => {
  const game = prepare();
  step(game, FRAME);
  assert.equal(bossBrace(game)?.phase, "winding");
  game.charge = 30;
  assert.equal(launchChampion(game), true);
  const champion = game.blue.at(-1);
  for (let index = 0; index < 40; index++) {
    game.blue.push({
      x: 180 + (index % 5 - 2) * 2,
      y: 560 - Math.floor(index / 5) * 4,
      vx: 0,
      hp: 1,
      r: 4.2,
      big: false,
      used: 0,
      dead: false,
    });
  }
  const before = champion.y;
  step(game, FRAME);
  assert.ok(before - champion.y >= 0.98, `champion advanced only ${before - champion.y}px through the crowd`);
});

test("unopposed expiry produces a nonlethal impact cue", () => {
  const game = prepare();
  step(game, FRAME);
  assert.equal(bossBrace(game)?.phase, "winding");

  const elapsedFrames = advanceUntil(game, () => bossBrace(game)?.phase === "impact");

  assert.ok(elapsedFrames >= 280 && elapsedFrames <= 295, `brace warning lasted ${elapsedFrames} frames`);
  assert.equal(game.bases[0].hp, 75, "impact did not change boss hp");
  assert.equal(game.status, "playing");
  assert.equal(game.assault.bossPulse, 1);
  assert.equal(bossBrace(game)?.phase, "impact");
});

test("an ignored brace starts a bounded physical breakthrough that pushes the blue front", () => {
  const game = armBrace();
  const runner = {
    x: 180,
    y: 320,
    vx: 0,
    hp: 1,
    r: 4.2,
    big: false,
    used: 0,
    dead: false,
    pace: 0,
  };
  // Hold ordinary contact resolution so this runner remains available to be
  // moved by the actual advancing boss body during the probe.
  game.assault.bossTimer = Infinity;
  game.blue.push(runner);
  advanceUntil(game, () => bossBrace(game)?.phase === "impact");

  const impactBaseY = game.bases[0].y;
  const impactRunnerY = runner.y;
  assert.deepEqual(bossBreakthrough(game), {
    phase: "breaking",
    progress: 0,
    seconds: 2.25,
    advance: 0,
  });

  for (let frame = 0; frame < 120; frame++) step(game, FRAME);
  const active = bossBreakthrough(game);
  assert.ok(active);
  assert.ok(active.advance >= 60 && active.advance <= 80, `boss advanced ${active.advance}px in the equal-clock window`);
  assert.ok(game.bases[0].y - impactBaseY >= 60, "the live giant moved through the held front");
  assert.ok(runner.y - impactRunnerY >= 55, "the blue front was physically displaced with the giant");
  assert.equal(runner.dead, false);

  advanceUntil(game, () => bossBreakthrough(game) === null, 60);
  assert.equal(bossBreakthrough(game), null, "the breakthrough did not leave a stale phase");
});

test("breakthrough shoves only the swept body cohort by the giant's small step", () => {
  const game = armBrace({ walls: [{ x: 230, y: 300, w: 20, h: 50 }] });
  game.assault.bossTimer = Infinity;
  advanceUntil(game, () => bossBrace(game)?.phase === "impact");

  const active = game.bases[0];
  const front = active.y + active.h / 2;
  const rear = active.y - active.h / 2;
  const makeProbe = (x, y) => ({
    x,
    y,
    vx: 0,
    hp: 1,
    r: 4.2,
    big: false,
    used: 0,
    dead: false,
    pace: 0,
  });
  const frontUnit = makeProbe(active.x, front - 2);
  const insideUnit = makeProbe(active.x, active.y);
  const behindUnit = makeProbe(active.x, rear - 8);
  const aheadUnit = makeProbe(active.x, front + 8);
  const wallUnit = makeProbe(240, front - 2);
  game.blue = [frontUnit, insideUnit, behindUnit, aheadUnit, wallUnit];
  const before = game.blue.map((unit) => unit.y);
  const beforeBaseY = active.y;

  const dt = 1 / 120;
  step(game, dt);
  const giantStep = game.bases[0].y - beforeBaseY;
  assert.ok(giantStep > 0 && giantStep <= 36 * dt + 1e-9, `giant step was ${giantStep}px`);
  assert.ok(frontUnit.y - before[0] > 0, "front overlap was not displaced");
  assert.ok(insideUnit.y - before[1] > 0, "body overlap was not displaced");
  assert.ok(frontUnit.y - before[0] <= giantStep + 1e-9);
  assert.ok(insideUnit.y - before[1] <= giantStep + 1e-9);
  assert.equal(behindUnit.y, before[2], "blue behind the old rear edge was moved");
  assert.equal(aheadUnit.y, before[3], "blue ahead of the new front was moved");
  assert.equal(wallUnit.y, before[4], "the shove crossed an authored wall");
});

test("breakthrough momentum carries marked nearby reds into the same encounter counterattack", () => {
  const game = armBrace({ counterattack: { waves: 1, runners: 0, guards: 0, brutes: 0, interval: 1.4 } });
  const red = {
    x: 180,
    y: 350,
    vx: 0,
    hp: 1,
    r: 4.2,
    big: false,
    used: 0,
    dead: false,
    kind: "runner",
  };
  game.red.push(red);
  game.assault.bossTimer = Infinity;
  advanceUntil(game, () => bossBrace(game)?.phase === "impact");
  game.bases[0].hp = 0;
  step(game, FRAME);

  assert.equal(game.assault.phase, "counterattack");
  assert.ok(game.red.includes(red), "the same red survived the boss transition");
  const before = red.y;
  step(game, 0.5);
  assert.ok(red.y - before > 9, `surviving red momentum was only ${red.y - before}px`);
});

test("practice and horde-free early assaults do not arm a boss brace", () => {
  const practice = prepare({ practice: true });
  step(practice, FRAME);
  assert.equal(bossBrace(practice), null);
  assert.equal(practice.bases[0].hp, 75);

  const early = prepare({ horde: 24, slamEvery: undefined });
  step(early, FRAME);
  assert.equal(bossBrace(early), null);
  assert.equal(early.bases[0].hp, 75);
});

test("pause and phase changes invalidate the active cue without leaving a stale brace", () => {
  const paused = prepare();
  step(paused, FRAME);
  assert.equal(bossBrace(paused)?.phase, "winding");
  paused.status = "lost";
  step(paused, FRAME);
  assert.equal(bossBrace(paused), null);
  paused.status = "playing";
  step(paused, FRAME);
  assert.equal(bossBrace(paused), null);

  const phased = prepare();
  step(phased, FRAME);
  phased.assault.phase = "counterattack";
  assert.equal(bossBrace(phased), null);
  step(phased, FRAME);
  phased.assault.phase = "battle";
  step(phased, FRAME);
  assert.equal(bossBrace(phased), null, "returning to the old phase did not resurrect the cue");
});

test("boss aim reports the readable lane and closes the interruption window near expiry", () => {
  const game = armBrace({ baseX: 272 });
  game.cannonX = 272;
  game.targetX = 272;

  const aligned = championBossAim(game);
  assert.equal(aligned?.target, game.bases[0]);
  assert.equal(aligned?.direction, "aligned");
  assert.equal(aligned?.canInterrupt, true);

  game.cannonX = 180;
  game.targetX = 180;
  assert.equal(championBossAim(game)?.direction, "right");

  for (let frame = 0; frame < 250; frame++) step(game, FRAME);
  const late = championBossAim(game);
  assert.equal(late?.direction, "right", "the aim lane follows the cannon's current position");
  assert.equal(late?.canInterrupt, false, "a late launch no longer promises an interruption");
});

test("only an aligned champion commits to the boss lane", () => {
  const game = armBrace({ baseX: 272 });
  game.cannonX = 180;
  game.targetX = 180;
  assert.equal(championBossAim(game)?.direction, "right");
  game.charge = 30;

  assert.equal(launchChampion(game), true);
  const champion = game.blue.at(-1);
  assert.ok(champion);
  assert.equal(bossBraceChampionIncoming(game), false, "a side launch keeps its ordinary gate guidance");
  step(game, 0.5);
  assert.equal(bossBraceChampionIncoming(game), false);
  assert.equal(champion.dead, false);
});

test("the committed charge is bounded and ordinary champions keep their base speed", () => {
  const committedGame = armBrace({ baseX: 272 });
  committedGame.cannonX = 272;
  committedGame.targetX = 272;
  committedGame.charge = 30;
  assert.equal(launchChampion(committedGame), true);
  const committed = committedGame.blue.at(-1);
  assert.ok(committed);
  const committedBefore = committed.y;
  step(committedGame, FRAME);
  const committedStep = committedBefore - committed.y;
  assert.ok(committedStep > 0);
  assert.ok(committedStep <= (66 * 1.35) / 60 + 1e-6, `committed step was ${committedStep}px`);

  const ordinaryGame = armBrace({ baseX: 272 });
  ordinaryGame.cannonX = 180;
  ordinaryGame.targetX = 180;
  ordinaryGame.charge = 30;
  assert.equal(launchChampion(ordinaryGame), true);
  const ordinary = ordinaryGame.blue.at(-1);
  assert.ok(ordinary);
  const ordinaryBefore = ordinary.y;
  step(ordinaryGame, FRAME);
  const ordinaryStep = ordinaryBefore - ordinary.y;
  assert.ok(ordinaryStep > 0);
  assert.ok(ordinaryStep <= 66 / 60 + 1e-6, `ordinary step was ${ordinaryStep}px`);
});

test("an aligned champion reaches the giant and keeps its commitment after another champion staggers it", () => {
  const game = armBrace({ baseX: 272 });
  game.cannonX = 272;
  game.targetX = 272;
  game.charge = 30;
  assert.equal(championBossAim(game)?.direction, "aligned");
  assert.equal(launchChampion(game), true);
  const committed = game.blue.at(-1);
  assert.ok(committed);
  const launchY = committed.y;
  assert.equal(bossBraceChampionIncoming(game), true);

  // This champion is already at the boss and breaks the brace before the
  // committed launch has crossed the road. The committed unit must retain
  // the boss lane through that stagger and the later phase cleanup.
  game.blue.push(makeUnit({ x: game.bases[0].x, big: true }));
  game.assault.bossTimer = 0;
  step(game, FRAME);
  assert.equal(bossBrace(game)?.phase, "staggered");
  assert.equal(bossBraceChampionIncoming(game), true);
  assert.equal(committed.dead, false);

  advanceUntil(game, () => bossBrace(game) === null, 90);
  assert.equal(bossBrace(game), null);
  assert.equal(bossBraceChampionIncoming(game), true);

  const hpBeforeCommittedContact = game.bases[0].hp;
  const frames = advanceUntil(game, () => committed.dead, 420);
  assert.ok(frames < 420, "the committed champion reached the giant instead of leaking past it");
  assert.ok(launchY - committed.y > 150, "the champion made a physical road advance");
  assert.ok(game.bases[0].hp < hpBeforeCommittedContact, "the committed champion made actual boss contact");
  assert.equal(bossBraceChampionIncoming(game), false, "the incoming cue clears when the champion dies");
});

test("boss champion commitment is invalidated by phase, pause, or encounter changes", () => {
  const game = armBrace({ baseX: 272 });
  game.cannonX = 272;
  game.targetX = 272;
  game.charge = 30;
  assert.equal(launchChampion(game), true);
  assert.equal(bossBraceChampionIncoming(game), true);

  game.assault.phase = "counterattack";
  assert.equal(bossBraceChampionIncoming(game), false);
  game.assault.phase = "battle";
  game.status = "lost";
  assert.equal(bossBraceChampionIncoming(game), false);
  game.status = "playing";
  game.assault.encounter = 1;
  assert.equal(bossBraceChampionIncoming(game), false);
});
