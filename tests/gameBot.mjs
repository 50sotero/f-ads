// A simple player for the Crowd Cannon balance tests: it aims through the best
// line of gates and swings over to block enemies that get close.
import { CANNON_Y, launchChampion, newGame, step, W } from "../src/game/engine.ts";

const BLUE_SPEED = 118;

export function bestLane(g, skill = 1) {
  let best = W / 2;
  let bestScore = -Infinity;
  for (let x = 20; x <= W - 20; x += 8) {
    let score = 1;
    for (const gt of g.gates) {
      const eta = (CANNON_Y - gt.y) / BLUE_SPEED;
      const cx = gt.move ? gt.x + Math.sin((g.t + eta * skill) * gt.move.speed + (gt.move.phase ?? 0)) * gt.move.range : gt.x;
      if (Math.abs(x - cx) < gt.w / 2 - 6) score = gt.kind === "trap" ? 0 : score * (gt.n ?? 2);
    }
    for (const w of g.walls) if (x > w.x - 6 && x < w.x + w.w + 6) score *= 0.7;
    for (const s of g.spinners) if (Math.abs(x - s.x) < s.r) score *= 0.75;
    score -= Math.abs(x - g.cannonX) * 0.002;
    if (score > bestScore) {
      bestScore = score;
      best = x;
    }
  }
  return best;
}

/**
 * Plays a level to the end. skill 1 = sharp aim and quick reactions, 0.5 = a casual
 * player (slow to react, sloppy aim), 0 = sits in the middle and holds fire.
 */
export function play(level, { skill = 1, seed = 1, limit = 240 } = {}) {
  const g = newGame(level, seed);
  const dt = 1 / 60;
  let frame = 0;
  while (g.status === "playing" && g.t < limit) {
    g.firing = true;
    if (skill > 0) {
      const casual = skill < 1;
      if (frame % (casual ? 24 : 6) === 0) {
        const threat = g.red.filter((r) => r.y > (casual ? 470 : 430)).sort((a, b) => b.y - a.y)[0];
        g.targetX = (threat ? threat.x : bestLane(g, skill)) + (casual ? (g.rand() - 0.5) * 36 : 0);
      }
      if (casual ? frame % 120 === 0 : g.red.some((r) => r.big) || g.charge >= 30) launchChampion(g);
    } else {
      g.targetX = W / 2;
    }
    step(g, dt);
    frame++;
  }
  return { status: g.status, time: Math.round(g.t * 10) / 10, hp: g.bases.map((b) => b.hp), maxUnits: g.blue.length };
}
