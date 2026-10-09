import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CAMPAIGN_CHARGE_RATE,
  CHARGE_MAX,
  launchChampion,
  MAX_UNITS,
  newGame,
  step,
} from "../src/game/engine.ts";

const assaultLevel = {
  name: "champion timing",
  par: 20,
  bases: [{ x: 180, y: 300, hp: 999999, every: 9999, group: 0 }],
  gates: [],
  assault: { horde: 0, reserve: 0, speed: 0, theme: "fork" },
};

function firingGame(tier, weaponLevel) {
  const game = newGame(assaultLevel);
  game.assault.tier = tier;
  game.assault.weaponLevel = weaponLevel;
  game.assault.weaponTarget = null;
  game.assault.weaponTargetsEnabled = false;
  game.assault.pickups = [];
  game.assault.pickupTimer = 999;
  game.firing = true;
  return game;
}

function championsIn(seconds, tier, weaponLevel) {
  const game = firingGame(tier, weaponLevel);
  for (let frame = 0; frame < Math.round(seconds * 60); frame++) {
    if (game.charge >= CHARGE_MAX) launchChampion(game);
    step(game, 1 / 60);
  }
  return game.stats.champions;
}

test("campaign champion charge keeps a predictable held-fire cadence", () => {
  assert.equal(CAMPAIGN_CHARGE_RATE, 7);

  const starter = championsIn(24, 1, 1);
  const maxed = championsIn(24, 5, 3);
  assert.equal(starter, maxed, `upgrades changed the held-fire refill cadence: ${starter} vs ${maxed}`);
  assert.ok(maxed >= 4, `campaign charge became too slow at ${maxed} champions`);
  assert.ok(maxed <= 5, `campaign charge still allows a champion loop: ${maxed}`);
});

test("campaign charge continues while the crowd is at the unit cap", () => {
  const game = firingGame(5, 3);
  game.blue = Array.from({ length: MAX_UNITS }, () => ({
    x: 180,
    y: 500,
    vx: 0,
    hp: 1,
    r: 4.2,
    big: false,
    used: 0,
    dead: false,
  }));

  step(game, 1 / 60);
  assert.ok(game.charge > 0, "the champion meter froze at MAX_UNITS");
});

test("campaign pickups refill five charge, while practice stays generous", () => {
  const game = firingGame(5, 3);
  game.cannonX = game.targetX = 55;
  game.assault.pickups = [{ id: 1, x: 55, y: 561, w: 70, value: 1 }];
  game.firing = false;
  step(game, 1 / 60);
  assert.equal(game.charge, 5);

  const practice = newGame({ ...assaultLevel, assault: { ...assaultLevel.assault, practice: true } });
  practice.assault.tier = 5;
  practice.cannonX = practice.targetX = 55;
  practice.assault.pickups = [{ id: 2, x: 55, y: 561, w: 70, value: 1 }];
  step(practice, 1 / 60);
  assert.equal(practice.charge, 10);
});
