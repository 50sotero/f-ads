import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFENSE_Y, newGame } from "../src/game/engine.ts";
import { DEFENSE_THREAT_DISTANCE, selectDefenseThreat } from "../src/game/defenseThreat.ts";

function makeLevel({ practice = false, tier = 5 } = {}) {
  return {
    name: "defense threat fixture",
    par: 30,
    bases: [{ x: 180, y: 300, hp: 100, every: 9999, group: 0 }],
    gates: [],
    assault: {
      horde: 0,
      reserve: 0,
      speed: 16,
      theme: "fork",
      practice,
    },
    tier,
  };
}

function makeGame(options = {}) {
  const game = newGame(makeLevel(options), 1);
  game.firing = false;
  game.red = [];
  game.assault.tier = options.tier ?? 5;
  return game;
}

function red(x, y, overrides = {}) {
  return {
    x,
    y,
    vx: 0,
    hp: 1,
    r: 4.4,
    big: false,
    used: 0,
    dead: false,
    ...overrides,
  };
}

test("selects the closest nonboss red and counts only actual eligible threats", () => {
  const game = makeGame();
  const closest = red(180, DEFENSE_Y - 40);
  const other = red(156, DEFENSE_Y - 90);
  game.red = [
    other,
    closest,
    red(204, DEFENSE_Y - DEFENSE_THREAT_DISTANCE - 0.01),
    red(180, DEFENSE_Y - 20, { dead: true }),
    red(180, DEFENSE_Y - DEFENSE_THREAT_DISTANCE - 0.02, { big: true, kind: "brute" }),
    red(Number.NaN, DEFENSE_Y - 20),
    red(180, Number.POSITIVE_INFINITY),
  ];

  assert.deepEqual(selectDefenseThreat(game), {
    x: closest.x,
    y: closest.y,
    lane: 0,
    nearLineCount: 2,
    direction: "aligned",
  });
});

test("does not report threats after reset, outside battle phases, or in practice", () => {
  const game = makeGame();
  game.red = [red(180, DEFENSE_Y - 20)];

  assert.ok(selectDefenseThreat(game));
  game.status = "won";
  assert.equal(selectDefenseThreat(game), null);
  game.status = "lost";
  assert.equal(selectDefenseThreat(game), null);
  game.status = "playing";
  game.assault.phase = "advance";
  assert.equal(selectDefenseThreat(game), null);
  game.assault.phase = "battle";
  game.level.assault.practice = true;
  assert.equal(selectDefenseThreat(game), null);
  game.level.assault.practice = false;
  game.assault = null;
  assert.equal(selectDefenseThreat(game), null);
});

test("includes the exact 130-pixel boundary and excludes the next pixel", () => {
  const game = makeGame();
  game.red = [
    red(180, DEFENSE_Y - DEFENSE_THREAT_DISTANCE),
    red(180, DEFENSE_Y - DEFENSE_THREAT_DISTANCE - 0.01),
  ];

  const threat = selectDefenseThreat(game);
  assert.equal(threat?.y, DEFENSE_Y - DEFENSE_THREAT_DISTANCE);
  assert.equal(threat?.nearLineCount, 1);
});

test("keeps side-entry raiders out of the ordinary defense threat", () => {
  const game = makeGame();
  game.red = [
    red(156, DEFENSE_Y - 20, { sideEntry: -1 }),
    red(204, DEFENSE_Y - 70),
    red(180, DEFENSE_Y - 10, { sideEntry: 1 }),
  ];

  assert.deepEqual(selectDefenseThreat(game), {
    x: 204,
    y: DEFENSE_Y - 70,
    lane: 0,
    nearLineCount: 1,
    direction: "aligned",
  });
});

test("includes living large red guards and brutes in the warning", () => {
  const game = makeGame();
  game.red = [
    red(156, DEFENSE_Y - 90, { big: true, kind: "brute", hp: 14 }),
    red(204, DEFENSE_Y - 40, { big: true, kind: "guard", hp: 4 }),
  ];

  assert.deepEqual(selectDefenseThreat(game), {
    x: 204,
    y: DEFENSE_Y - 40,
    lane: 0,
    nearLineCount: 2,
    direction: "aligned",
  });
});

test("uses world road thirds for lane even when the cannon is offset", () => {
  const cases = [
    { cannonX: 300, x: 50, lane: -1, direction: "left" },
    { cannonX: 60, x: 180, lane: 0, direction: "right" },
    { cannonX: 60, x: 300, lane: 1, direction: "right" },
  ];

  for (const expected of cases) {
    const game = makeGame({ tier: 1 });
    game.cannonX = expected.cannonX;
    game.red = [red(expected.x, DEFENSE_Y - 40)];
    assert.deepEqual(selectDefenseThreat(game), {
      x: expected.x,
      y: DEFENSE_Y - 40,
      lane: expected.lane,
      nearLineCount: 1,
      direction: expected.direction,
    });
  }
});

test("uses actual tier-five barrel positions for left, center, right, and offset direction", () => {
  const cases = [
    { x: 156, lane: 0, direction: "aligned" },
    { x: 180, lane: 0, direction: "aligned" },
    { x: 204, lane: 0, direction: "aligned" },
    { x: 130, lane: 0, direction: "left" },
    { x: 230, lane: 0, direction: "right" },
  ];

  for (const expected of cases) {
    const game = makeGame({ tier: 5 });
    game.red = [red(expected.x, DEFENSE_Y - 40)];
    assert.deepEqual(selectDefenseThreat(game), {
      x: expected.x,
      y: DEFENSE_Y - 40,
      lane: expected.lane,
      nearLineCount: 1,
      direction: expected.direction,
    });
  }
});

test("resolves equal-distance barrel and threat ties deterministically", () => {
  const game = makeGame({ tier: 2 });
  game.red = [red(180, DEFENSE_Y - 40)];
  assert.deepEqual(selectDefenseThreat(game), {
    x: 180,
    y: DEFENSE_Y - 40,
    lane: 0,
    nearLineCount: 1,
    direction: "right",
  });

  const tied = makeGame({ tier: 5 });
  tied.red = [red(204, DEFENSE_Y - 40), red(156, DEFENSE_Y - 40)];
  const first = selectDefenseThreat(tied);
  tied.red.reverse();
  assert.deepEqual(selectDefenseThreat(tied), first);
  assert.equal(first?.x, 156, "the lower world x wins an equal-depth tie");
});

test("counterattack remains eligible while advance remains hidden", () => {
  const game = makeGame();
  game.assault.phase = "counterattack";
  game.red = [red(180, DEFENSE_Y - 50)];
  assert.ok(selectDefenseThreat(game));
  game.assault.phase = "advance";
  assert.equal(selectDefenseThreat(game), null);
});
