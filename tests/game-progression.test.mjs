import assert from "node:assert/strict";
import { test } from "node:test";
import {
  UPGRADE_DEFS,
  buyUpgrade,
  completeRoute,
  emptyCampaignSave,
  normalizeCampaignSave,
  startingLoadout,
} from "../src/game/progression.ts";

test("legacy saves migrate stars to credits exactly once", () => {
  const legacy = { stars: [3, 1, 0], muted: true, tutorialDone: true };
  const migrated = normalizeCampaignSave(legacy);
  assert.deepEqual(migrated.stars, [3, 1, 0]);
  assert.equal(migrated.credits, (150 + 3 * 40) + (150 + 40));
  assert.equal(normalizeCampaignSave(migrated).credits, migrated.credits);
  assert.deepEqual(migrated.upgrades, { crew: 0, weapon: 0, champion: 0 });
  assert.equal(migrated.bestTimes.length, 0);
});

test("a first clear pays the clear bonus and only newly earned stars", () => {
  const first = completeRoute(emptyCampaignSave(), 2, 2, 41.25);
  assert.equal(first.earned, 150 + 2 * 40);
  assert.equal(first.bestStars, 2);
  assert.equal(first.bestTime, 41.25);
  assert.equal(first.save.stars[2], 2);

  const improved = completeRoute(first.save, 2, 3, 39.5);
  assert.equal(improved.earned, 40);
  assert.equal(improved.bestStars, 3);
  assert.equal(improved.bestTime, 39.5);
  assert.equal(improved.save.credits, first.save.credits + 40);
});

test("replaying a cleared route pays the repeat reward without downgrading stars or time", () => {
  const cleared = completeRoute(emptyCampaignSave(), 0, 3, 31).save;
  const replay = completeRoute(cleared, 0, 2, 38);
  assert.equal(replay.earned, 35);
  assert.equal(replay.bestStars, 3);
  assert.equal(replay.bestTime, 31);
  assert.equal(replay.save.stars[0], 3);
  assert.equal(replay.save.bestTimes[0], 31);
});

test("losses do not pay, overwrite stars, or create a best time", () => {
  const saved = completeRoute(emptyCampaignSave(), 0, 0, 55);
  assert.equal(saved.earned, 0);
  assert.equal(saved.save.credits, 0);
  assert.equal(saved.save.stars.length, 0);
  assert.equal(saved.save.bestTimes.length, 0);
});

test("upgrade purchases deduct the exact next cost and do not mutate the input", () => {
  const costs = UPGRADE_DEFS.find((definition) => definition.id === "champion").costs;
  const save = { ...emptyCampaignSave(), credits: costs[0] + costs[1] };
  const first = buyUpgrade(save, "champion");
  assert.notEqual(first, save);
  assert.equal(first.credits, costs[1]);
  assert.equal(first.upgrades.champion, 1);
  assert.equal(save.credits, costs[0] + costs[1]);
  assert.equal(save.upgrades.champion, 0);

  const second = buyUpgrade(first, "champion");
  assert.equal(second.credits, 0);
  assert.equal(second.upgrades.champion, 2);
  assert.equal(buyUpgrade(second, "champion"), second, "max rank should not spend credits");
  assert.equal(buyUpgrade(second, "weapon"), second, "unaffordable purchase should preserve identity");
  assert.equal(buyUpgrade(second, "unknown"), second, "unknown upgrade should preserve identity");
});

test("starting loadout maps persistent ranks to real run values", () => {
  const save = {
    ...emptyCampaignSave(),
    upgrades: { crew: 2, weapon: 2, champion: 3 },
  };
  assert.deepEqual(startingLoadout(save), { tier: 3, weaponLevel: 3, charge: 30 });
});

test("malformed storage is bounded and never throws", () => {
  const malformed = normalizeCampaignSave({
    stars: [99, -3, "3", Number.NaN, Number.POSITIVE_INFINITY, ...Array(30).fill(3)],
    muted: "yes",
    tutorialDone: 1,
    credits: Number.POSITIVE_INFINITY,
    bestTimes: [Number.NaN, -4, 12_000, 22.5],
    upgrades: { crew: 99, weapon: -2, champion: "max" },
  });
  assert.deepEqual(malformed.stars.slice(0, 5), [3, 0, 0, 0, 0]);
  assert.equal(malformed.stars.length, 12);
  assert.equal(malformed.muted, false);
  assert.equal(malformed.tutorialDone, false);
  assert.equal(malformed.credits, 0);
  assert.deepEqual(malformed.bestTimes.slice(0, 4), [0, 0, 3600, 22.5]);
  assert.deepEqual(malformed.upgrades, { crew: 2, weapon: 0, champion: 0 });
  assert.doesNotThrow(() => startingLoadout(malformed));
  assert.equal(completeRoute(malformed, -10, 3, 10).save, malformed);
});
