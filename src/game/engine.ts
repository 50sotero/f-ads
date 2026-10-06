// Crowd Cannon game rules. Pure logic with no DOM, so the browser draws it and the
// tests (tests/game.test.mjs) can play every level headless with a bot.

export const W = 360;
export const H = 640;
export const CANNON_Y = 596;
/** Enemies that reach this line break the cannon and the level is lost. */
export const DEFENSE_Y = 572;
export const GATE_H = 16;
export const MAX_UNITS = 900;
export const FIRE_RATE = 7;
export const CHARGE_MAX = 30;

export type GateDef = {
  x: number;
  y: number;
  w: number;
  /** "x": every crowd member that runs through becomes n of them. "trap": it dies. */
  kind: "x" | "trap";
  n?: number;
  /** Slides left and right around x by range px; speed in radians per second. */
  move?: { range: number; speed: number; phase?: number };
};
export type WallDef = { x: number; y: number; w: number; h: number };
export type SpinnerDef = { x: number; y: number; r: number; speed: number };
export type BaseDef = {
  x: number;
  y: number;
  hp: number;
  /** Seconds between enemy groups at full health; damaged bases send them faster. */
  every: number;
  group: number;
  /** Seconds between brutes (slow enemies that take many hits), 0 for none. */
  bruteEvery?: number;
  /** Hits a brute takes; default 10. */
  bruteHp?: number;
  delay?: number;
};
export type Level = {
  name: string;
  tip?: string;
  /** Seconds to beat for 3 stars. */
  par: number;
  bases: BaseDef[];
  gates?: GateDef[];
  walls?: WallDef[];
  spinners?: SpinnerDef[];
};

export type Unit = {
  x: number;
  y: number;
  vx: number;
  hp: number;
  r: number;
  big: boolean;
  /** Bit i set once the unit has used gate i, so a gate multiplies each unit once. */
  used: number;
  dead: boolean;
};
export type Base = BaseDef & { maxHp: number; timer: number; bruteTimer: number; hitFlash: number; w: number; h: number };
export type Gate = GateDef & { cx: number; flash: number };
export type Spinner = SpinnerDef & { angle: number };
export type Pop = { x: number; y: number; t: number; color: number; text?: string };

export type Status = "playing" | "won" | "lost";

export type Game = {
  level: Level;
  t: number;
  status: Status;
  cannonX: number;
  targetX: number;
  firing: boolean;
  cooldown: number;
  charge: number;
  blue: Unit[];
  red: Unit[];
  bases: Base[];
  gates: Gate[];
  walls: WallDef[];
  spinners: Spinner[];
  pops: Pop[];
  /** Above this line the crowd turns toward the nearest base; below it, it runs straight through the gates. */
  steerY: number;
  /** Running counts the page reads for sound and stats. */
  stats: { fired: number; multiplied: number; baseHits: number; kills: number; champions: number };
  rand: () => number;
};

const BASE_W = 92;
const BASE_H = 54;
const BLUE_SPEED = 118;
const CHAMP_SPEED = 72;
const RED_SPEED = 52;
const BRUTE_SPEED = 30;

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function newGame(level: Level, seed = 1): Game {
  return {
    level,
    t: 0,
    status: "playing",
    cannonX: W / 2,
    targetX: W / 2,
    firing: false,
    cooldown: 0,
    charge: 0,
    blue: [],
    red: [],
    bases: level.bases.map((b) => ({
      ...b,
      maxHp: b.hp,
      timer: b.delay ?? 1.5,
      bruteTimer: b.bruteEvery ? b.bruteEvery * 0.6 + (b.delay ?? 0) : Infinity,
      hitFlash: 0,
      w: BASE_W,
      h: BASE_H,
    })),
    gates: (level.gates ?? []).map((g) => ({ ...g, cx: g.x, flash: 0 })),
    walls: level.walls ?? [],
    spinners: (level.spinners ?? []).map((s) => ({ ...s, angle: 0 })),
    pops: [],
    steerY: Math.max(
      Math.min(...level.bases.map((b) => b.y)) + 110,
      Math.min(Math.max(...level.bases.map((b) => b.y)) + 300, ...(level.gates ?? []).map((gt) => gt.y - GATE_H)),
    ),
    stats: { fired: 0, multiplied: 0, baseHits: 0, kills: 0, champions: 0 },
    rand: mulberry32(seed),
  };
}

export function launchChampion(g: Game) {
  if (g.status !== "playing" || g.charge < CHARGE_MAX) return false;
  g.charge = 0;
  g.stats.champions++;
  g.blue.push({ x: g.cannonX, y: CANNON_Y - 26, vx: 0, hp: 14, r: 11, big: true, used: 0, dead: false });
  return true;
}

function pop(g: Game, x: number, y: number, color: number, text?: string) {
  if (g.pops.length > 260) g.pops.shift();
  g.pops.push({ x, y, t: 0, color, text });
}

function blocked(g: Game, x: number, y: number, r: number) {
  for (const w of g.walls) {
    if (x > w.x - r && x < w.x + w.w + r && y > w.y - r && y < w.y + w.h + r) return w;
  }
  return null;
}

function segDist2(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  const ex = ax + t * dx - px;
  const ey = ay + t * dy - py;
  return ex * ex + ey * ey;
}

function hitsSpinner(g: Game, u: Unit) {
  for (const s of g.spinners) {
    const dx = Math.cos(s.angle) * s.r;
    const dy = Math.sin(s.angle) * s.r;
    const reach = u.r + 4;
    if (segDist2(u.x, u.y, s.x - dx, s.y - dy, s.x + dx, s.y + dy) < reach * reach) return true;
  }
  return false;
}

/** Moves a unit vertically by dy, sliding it around any wall in the way. */
function move(g: Game, u: Unit, dy: number, dt: number) {
  const nx = Math.max(u.r, Math.min(W - u.r, u.x + u.vx * dt));
  const wall = blocked(g, nx, u.y + dy, u.r);
  if (!wall) {
    u.x = nx;
    u.y += dy;
    return;
  }
  // Slide toward the nearer end of the wall; at the field edge, go the other way.
  let dir = u.x < wall.x + wall.w / 2 ? -1 : 1;
  if ((dir < 0 && wall.x - u.r < u.r) || (dir > 0 && wall.x + wall.w + u.r > W - u.r)) dir = -dir;
  const sx = Math.max(u.r, Math.min(W - u.r, u.x + dir * 110 * dt));
  if (!blocked(g, sx, u.y, u.r)) u.x = sx;
  else u.x = Math.max(u.r, Math.min(W - u.r, u.x + dir * 110 * dt));
}

function nearestBase(g: Game, x: number, y: number) {
  let best: Base | null = null;
  let bestD = Infinity;
  for (const b of g.bases) {
    if (b.hp <= 0) continue;
    const d = Math.abs(b.x - x) + Math.abs(b.y - y) * 0.3;
    if (d < bestD) {
      bestD = d;
      best = b;
    }
  }
  return best;
}

const CELL = 24;
const COLS = Math.ceil(W / CELL);
const ROWS = Math.ceil(H / CELL) + 2;

export function step(g: Game, dt: number) {
  if (g.status !== "playing") {
    for (const p of g.pops) p.t += dt;
    g.pops = g.pops.filter((p) => p.t < 0.8);
    return;
  }
  g.t += dt;

  // Cannon
  const maxMove = 620 * dt;
  g.targetX = Math.max(22, Math.min(W - 22, g.targetX));
  g.cannonX += Math.max(-maxMove, Math.min(maxMove, g.targetX - g.cannonX));
  g.cooldown -= dt;
  if (g.firing && g.cooldown <= 0) {
    g.cooldown += 1 / FIRE_RATE;
    if (g.cooldown < 0) g.cooldown = 0;
    if (g.blue.length < MAX_UNITS) {
      g.blue.push({ x: g.cannonX + (g.rand() - 0.5) * 4, y: CANNON_Y - 22, vx: 0, hp: 1, r: 4.2, big: false, used: 0, dead: false });
      g.stats.fired++;
      g.charge = Math.min(CHARGE_MAX, g.charge + 1);
    }
  } else if (!g.firing) {
    g.cooldown = Math.max(g.cooldown, 0);
  }

  for (const gt of g.gates) {
    if (gt.move) gt.cx = gt.x + Math.sin(g.t * gt.move.speed + (gt.move.phase ?? 0)) * gt.move.range;
    gt.flash = Math.max(0, gt.flash - dt * 4);
  }
  for (const s of g.spinners) s.angle += s.speed * dt;

  // Crowd
  const spawned: Unit[] = [];
  for (const u of g.blue) {
    if (u.dead) continue;
    const target = nearestBase(g, u.x, u.y);
    if (target && u.y < g.steerY) {
      const pull = Math.min(1, (g.steerY - u.y) / 120);
      const want = Math.max(-90, Math.min(90, (target.x - u.x) * 2)) * pull;
      u.vx += (want - u.vx) * Math.min(1, dt * 4);
    } else {
      u.vx *= 1 - Math.min(1, dt * 3);
    }
    // Anyone who drifts past a base without hitting it walks sideways into it.
    let dy = -(u.big ? CHAMP_SPEED : BLUE_SPEED) * dt;
    if (target && u.y + dy < target.y) {
      dy = Math.min(0, target.y - u.y);
      u.vx = Math.sign(target.x - u.x) * (u.big ? CHAMP_SPEED : BLUE_SPEED);
    }
    const prevY = u.y;
    move(g, u, dy, dt);

    for (let i = 0; i < g.gates.length; i++) {
      const gt = g.gates[i];
      if (u.used & (1 << i)) continue;
      if (prevY < gt.y || u.y > gt.y || Math.abs(u.x - gt.cx) > gt.w / 2) continue;
      u.used |= 1 << i;
      gt.flash = 1;
      if (gt.kind === "trap") {
        if (!u.big) {
          u.dead = true;
          pop(g, u.x, u.y, 2);
        }
        continue;
      }
      const n = gt.n ?? 2;
      const copies = u.big ? (n - 1) * 3 : n - 1;
      for (let k = 0; k < copies; k++) {
        if (g.blue.length + spawned.length >= MAX_UNITS) break;
        const off = (k + 1) * 6 * (k % 2 === 0 ? 1 : -1) * (u.big ? 1.6 : 1);
        const x = Math.max(gt.cx - gt.w / 2 + 3, Math.min(gt.cx + gt.w / 2 - 3, u.x + off + (g.rand() - 0.5) * 3));
        spawned.push({ x, y: u.y - g.rand() * 6, vx: 0, hp: 1, r: 4.2, big: false, used: u.used, dead: false });
        g.stats.multiplied++;
      }
    }
    if (u.dead) continue;
    if (hitsSpinner(g, u) && !u.big) {
      u.dead = true;
      pop(g, u.x, u.y, 0);
      continue;
    }
    for (const b of g.bases) {
      if (b.hp <= 0) continue;
      if (Math.abs(u.x - b.x) < b.w / 2 && u.y < b.y + b.h / 2 && u.y > b.y - b.h / 2) {
        b.hp = Math.max(0, b.hp - u.hp);
        b.hitFlash = 1;
        g.stats.baseHits += u.hp;
        u.dead = true;
        if (u.big) pop(g, u.x, u.y, 0, "BOOM");
        if (b.hp === 0) {
          pop(g, b.x, b.y, 0, "DOWN!");
          for (let k = 0; k < 14; k++) pop(g, b.x + (g.rand() - 0.5) * 80, b.y + (g.rand() - 0.5) * 40, 1);
        }
        break;
      }
    }
    if (u.y < -10) u.dead = true;
  }
  for (const s of spawned) g.blue.push(s);

  // Enemy bases send waves; the more damaged, the faster.
  for (const b of g.bases) {
    b.hitFlash = Math.max(0, b.hitFlash - dt * 5);
    if (b.hp <= 0) continue;
    const rage = 0.55 + 0.45 * (b.hp / b.maxHp);
    b.timer -= dt;
    if (b.timer <= 0) {
      b.timer += b.every * rage;
      for (let k = 0; k < b.group; k++) {
        const x = b.x + (k - (b.group - 1) / 2) * 9 + (g.rand() - 0.5) * 4;
        g.red.push({ x, y: b.y + b.h / 2 + 6 + g.rand() * 8, vx: 0, hp: 1, r: 4.4, big: false, used: 0, dead: false });
      }
    }
    b.bruteTimer -= dt;
    if (b.bruteTimer <= 0 && b.bruteEvery) {
      b.bruteTimer += b.bruteEvery * rage;
      g.red.push({ x: b.x, y: b.y + b.h / 2 + 12, vx: 0, hp: b.bruteHp ?? 10, r: 11, big: true, used: 0, dead: false });
    }
  }

  for (const u of g.red) {
    if (u.dead) continue;
    if (u.y > 300) {
      const want = Math.max(-60, Math.min(60, (g.cannonX - u.x) * 1.2));
      u.vx += (want - u.vx) * Math.min(1, dt * 2);
    }
    move(g, u, (u.big ? BRUTE_SPEED : RED_SPEED) * dt, dt);
    if (!u.big && hitsSpinner(g, u)) {
      u.dead = true;
      pop(g, u.x, u.y, 1);
      continue;
    }
    if (u.y >= DEFENSE_Y) {
      g.status = "lost";
      pop(g, u.x, u.y, 1, "OUCH");
    }
  }

  // Fights: a crowd member and an enemy that touch trade hit points.
  const grid: Unit[][] = new Array(COLS * ROWS);
  for (const r of g.red) {
    if (r.dead) continue;
    const c = Math.max(0, Math.min(COLS - 1, Math.floor(r.x / CELL)));
    const rr = Math.max(0, Math.min(ROWS - 1, Math.floor((r.y + CELL) / CELL)));
    (grid[rr * COLS + c] ??= []).push(r);
  }
  for (const u of g.blue) {
    if (u.dead) continue;
    const c0 = Math.floor(u.x / CELL);
    const r0 = Math.floor((u.y + CELL) / CELL);
    for (let dr = -1; dr <= 1 && !u.dead; dr++) {
      const rr = r0 + dr;
      if (rr < 0 || rr >= ROWS) continue;
      for (let dc = -1; dc <= 1 && !u.dead; dc++) {
        const cc = c0 + dc;
        if (cc < 0 || cc >= COLS) continue;
        const cell = grid[rr * COLS + cc];
        if (!cell) continue;
        for (const e of cell) {
          if (e.dead) continue;
          const reach = u.r + e.r;
          const dx = u.x - e.x;
          const dy = u.y - e.y;
          if (dx * dx + dy * dy > reach * reach) continue;
          const dmg = Math.min(u.hp, e.hp);
          u.hp -= dmg;
          e.hp -= dmg;
          if (e.hp <= 0) {
            e.dead = true;
            g.stats.kills++;
            if (e.big) pop(g, e.x, e.y, 1, "KO");
          }
          if (u.hp <= 0) {
            u.dead = true;
            pop(g, u.x, u.y, 0);
            break;
          }
        }
      }
    }
  }

  g.blue = g.blue.filter((u) => !u.dead);
  g.red = g.red.filter((u) => !u.dead);
  for (const p of g.pops) p.t += dt;
  g.pops = g.pops.filter((p) => p.t < 0.8);

  if (g.status === "playing" && g.bases.every((b) => b.hp <= 0)) {
    g.status = "won";
    for (const r of g.red) pop(g, r.x, r.y, 1);
    g.red = [];
  }
}

export function stars(level: Level, time: number) {
  if (time <= level.par) return 3;
  if (time <= level.par * 1.4) return 2;
  return 1;
}
