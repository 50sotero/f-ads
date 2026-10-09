import assert from "node:assert/strict";
import { test } from "node:test";
import { newGame, step } from "../src/game/engine.ts";

function contactFixture({ guardX = 143, blueX = 168.5, offsetY = 0, braced = true, champion = false } = {}) {
  const game = newGame({
    name: "visible shield contact", par: 30,
    bases: [{ x: 180, y: 300, hp: 100, every: 9999, group: 0 }],
    gates: [],
    assault: { horde: 0, reserve: 0, speed: 0, theme: "fork" },
  }, 19);
  const guard = { x: guardX, y: 400, vx: 0, hp: 2, r: 5.2, big: false, used: 0, dead: false, kind: "guard", braced };
  const blue = { x: blueX, y: 400 + offsetY, vx: 0, hp: champion ? 14 : 1, r: champion ? 11 : 4.2, big: champion, used: 0, dead: false };
  game.red = [guard];
  game.blue = [blue];
  game.firing = false;
  // No travel: this isolates contact at the observed shield's broad face.
  step(game, 0);
  return { game, guard, blue };
}

test("both raised shield edges contact across a two-column grid boundary", () => {
  for (const [guardX, blueX] of [[143, 168.5], [168.5, 143]]) {
    assert.equal(Math.abs(Math.floor(guardX / 24) - Math.floor(blueX / 24)), 2);
    const { game, guard, blue } = contactFixture({ guardX, blueX });
    assert.equal(blue.dead, true, "a runner overlapping the visible shield wing must contact");
    assert.equal(game.blue.length, 0);
    assert.equal(guard.hp, 2, "ordinary wing contact cannot damage the brace");
    assert.equal(guard.braced, true);
    assert.equal(guard.r, 5.2, "the wider shield must not enlarge ordinary movement spacing");
  }
});

test("the raised shield remains shallow and rounded instead of becoming a wide contact box", () => {
  for (const [offsetX, offsetY] of [[26.4, 0], [0, 9.6], [24, 8], [24, -8]]) {
    const { guard, blue } = contactFixture({ blueX: 143 + offsetX, offsetY });
    assert.equal(blue.dead, false, `contact occurred outside the face at ${offsetX}, ${offsetY}`);
    assert.equal(guard.braced, true);
  }
  const nearFront = contactFixture({ blueX: 151, offsetY: 8 });
  assert.equal(nearFront.blue.dead, true, "contact on the broad front must still resolve");
});

test("a champion physically touching the shield wing breaks it with the existing damage cost", () => {
  const { game, guard, blue } = contactFixture({ blueX: 175, champion: true });
  assert.equal(guard.braced, false);
  assert.equal(guard.dead, true);
  assert.equal(blue.hp, 12);
  assert.equal(game.stats.kills, 1);
  assert.equal(game.pops.filter(pop => pop.text === "SHIELD BREAK").length, 1);
  const miss = contactFixture({ blueX: 176.2, champion: true });
  assert.equal(miss.guard.braced, true, "a nearby champion cannot break the shield without contact");
  assert.equal(miss.blue.hp, 14);
});

test("lowered guards retain their original circular contact after the shield footprint correction", () => {
  const outside = contactFixture({ blueX: 163, braced: false });
  assert.equal(outside.blue.dead, false);
  assert.equal(outside.guard.hp, 2);
  const inside = contactFixture({ blueX: 150, braced: false });
  assert.equal(inside.blue.dead, true);
  assert.equal(inside.guard.hp, 1);
});
