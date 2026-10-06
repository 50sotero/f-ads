// Crowd Cannon game rules. Pure logic with no DOM, so the browser draws it and the
// tests (tests/game.test.mjs) can play every level headless with a bot.

export const W = 360;
export const H = 640;
export const CANNON_Y = 596;
/** Enemies that reach this line break the cannon and the level is lost. */
export const DEFENSE_Y = 572;
export const GATE_H = 16;
export const MAX_UNITS = 900;
export const FIRE_RATE = 11;
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
  /** Optional timing window for traps. A trap is harmful for `active` seconds per period. */
  pulse?: { period: number; active: number; phase?: number };
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
export type AssaultTheme = "fork" | "bridge" | "bend";
export type AssaultDef = {
  /** Number of defenders placed on the field when the encounter starts. */
  horde: number;
  /** Number of defenders released behind the initial formation over time. */
  reserve: number;
  /** Logical units per second the red battlefront advances toward the cannon. */
  speed: number;
  theme: AssaultTheme;
  /** Practice assault keeps the board safe while teaching the same controls. */
  practice?: boolean;
  /** Optional boss and encounter tuning. Campaign defaults intentionally stay small. */
  bossHp?: number;
  enemyHp?: number;
  gateValues?: number[];
  pickupEvery?: number;
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
  /** Temporarily accelerates regular waves: strength 1 means twice the normal rate. */
  surge?: { every: number; duration: number; strength: number; delay?: number };
  /** Campaign levels opt into the dense sequential boss assault simulation. */
  assault?: AssaultDef;
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
  /** Optional assault formation slot; legacy units leave this unset. */
  lane?: number;
};
export type Base = BaseDef & { maxHp: number; timer: number; bruteTimer: number; hitFlash: number; w: number; h: number };
export type Gate = GateDef & { cx: number; flash: number };
export type Spinner = SpinnerDef & { angle: number };
export type Pop = { x: number; y: number; t: number; color: number; text?: string };

export type AssaultPickup = { id: number; x: number; y: number; w: number; value: number };

/**
 * State consumed by the assault renderer. The first seven fields are kept
 * deliberately small and serializable so the UI can read them without knowing
 * about the simulation's private timers.
 */
export type AssaultState = {
  /** Zero-based active boss index. */
  encounter: number;
  /** Number of sequential bosses in this level. */
  encounters: number;
  /** Smooth accumulated logical forward distance used while changing bosses. */
  travel: number;
  /** 1 at the start of a boss transition, easing to 0 over about one second. */
  advance: number;
  /** Number of cannon barrels / parallel streams, clamped to 1..5. */
  tier: number;
  /** Brief visual feedback after a pickup or milestone upgrade. */
  upgradeFlash: number;
  pickups: AssaultPickup[];
  /** Defenders waiting to be released into the current encounter. */
  reserve: number;
  /** Leading red y position in logical field coordinates. */
  frontline: number;
  /** Internal encounter phase; renderer may use this for transition effects. */
  phase: "battle" | "advance";
  /** Useful to tutorial/UI code that compares upgrades earned in this run. */
  startingTier: number;
  /** Current horde size before queued reserve releases. */
  horde: number;
  /** Remaining transition time in seconds. */
  transition: number;
  /** Timer for the next reserve release. */
  spawnTimer: number;
  /** Timer for optional side-lane pickup spawns. */
  pickupTimer: number;
  /** Monotonic id source for pickup particles. */
  nextPickupId: number;
  /** Short contact interval keeps each giant readable as a battlefront. */
  bossTimer: number;
  /** Total blue +1 gates collected, including pickups after reaching tier 5. */
  pickupsCollected: number;
};

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
  /** Null for the original focused mechanics levels and tutorial variants. */
  assault: AssaultState | null;
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
const FLOW_CELL = 20;
const FLOW_COLS = Math.ceil(W / FLOW_CELL);
const FLOW_ROWS = Math.ceil(H / FLOW_CELL) + 2;
const FLOW_ACCEL = 120;

/** A modulo that stays in the [0, period) range for negative times too. */
function positiveModulo(value: number, period: number) {
  return ((value % period) + period) % period;
}

/**
 * Returns whether a trap is currently dangerous.
 *
 * Plain traps are always on. Pulsed traps are on for `active` seconds at the
 * start of every `period`, with `phase` shifting that window in time. The
 * helper deliberately uses a positive modulo so previews and boundary checks
 * behave the same for negative and positive timestamps.
 */
export function trapActive(gate: GateDef, time: number) {
  if (gate.kind !== "trap") return false;
  if (!gate.pulse) return true;
  const period = Math.max(0.0001, gate.pulse.period);
  const active = Math.max(0, Math.min(period, gate.pulse.active));
  if (active <= 0) return false;
  if (active >= period) return true;
  const phase = gate.pulse.phase ?? 0;
  return positiveModulo(time + phase, period) < active;
}

/** Returns whether an enemy spawn surge is active at this game time. */
export function surgeActive(level: Level, time: number) {
  const surge = level.surge;
  if (!surge) return false;
  const every = Math.max(0.0001, surge.every);
  const duration = Math.max(0, Math.min(every, surge.duration));
  if (duration <= 0 || time < (surge.delay ?? 8)) return false;
  if (duration >= every) return true;
  return positiveModulo(time - (surge.delay ?? 8), every) < duration;
}

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

function assaultGateDefs(level: Level) {
  if (!level.assault) return level.gates ?? [];
  if (level.gates?.length) return level.gates;
  const values = level.assault?.gateValues?.length ? level.assault.gateValues : [2, 3, 4];
  const ys = [510, 467, 424];
  return values.slice(0, 31).map((n, i) => ({ x: 180, y: ys[i] ?? 424 - (i - 2) * 43, w: 164, kind: "x" as const, n: Math.max(2, Math.round(n)) }));
}

function makeAssaultState(level: Level): AssaultState {
  const config = level.assault!;
  const horde = Math.max(0, Math.floor(config.horde));
  const practicePickups: AssaultPickup[] = [{ id: 1, x: 55, y: 500, w: 70, value: 1 }];
  const campaignPickups: AssaultPickup[] = [
    { id: 1, x: 55, y: 500, w: 70, value: 1 },
    { id: 2, x: 55, y: 465, w: 70, value: 1 },
    { id: 3, x: 55, y: 430, w: 70, value: 1 },
    { id: 4, x: 55, y: 395, w: 70, value: 1 },
  ];
  return {
    encounter: 0,
    encounters: Math.max(1, level.bases.length),
    travel: 0,
    advance: 0,
    tier: 1,
    upgradeFlash: 0,
    pickups: config.practice ? practicePickups : campaignPickups,
    reserve: Math.max(0, Math.floor(config.reserve)),
    frontline: config.practice || horde <= 0 ? CANNON_Y - 26 : 372,
    phase: "battle",
    startingTier: 1,
    horde,
    transition: 0,
    spawnTimer: 1.1,
    pickupTimer: Math.max(3, config.pickupEvery ?? 9),
    nextPickupId: config.practice ? 2 : 5,
    bossTimer: 0,
    pickupsCollected: 0,
  };
}

export function newGame(level: Level, seed = 1): Game {
  const assault = level.assault ? makeAssaultState(level) : null;
  const game: Game = {
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
    gates: assaultGateDefs(level).map((g) => ({ ...g, cx: g.x, flash: 0 })),
    walls: level.walls ?? [],
    spinners: (level.spinners ?? []).map((s) => ({ ...s, angle: 0 })),
    pops: [],
    assault,
    steerY: Math.max(
      Math.min(...level.bases.map((b) => b.y)) + 110,
      Math.min(Math.max(...level.bases.map((b) => b.y)) + 300, ...(level.gates ?? []).map((gt) => gt.y - GATE_H)),
    ),
    stats: { fired: 0, multiplied: 0, baseHits: 0, kills: 0, champions: 0 },
    rand: mulberry32(seed),
  };
  if (assault && !level.assault?.practice && assault.horde > 0) seedAssaultHorde(game, assault.horde);
  return game;
}

export function launchChampion(g: Game) {
  if (g.status !== "playing" || g.charge < CHARGE_MAX) return false;
  g.charge = 0;
  g.stats.champions++;
  g.blue.push({ x: g.cannonX, y: CANNON_Y - 26, vx: 0, hp: 14, r: 11, big: true, used: 0, dead: false, lane: 0 });
  return true;
}

function pop(g: Game, x: number, y: number, color: number, text?: string) {
  if (g.pops.length > 260) g.pops.shift();
  g.pops.push({ x, y, t: 0, color, text });
}

function assaultEnemyHp(g: Game, big = false) {
  const config = g.level.assault!;
  const baseHp = Math.max(1, config.enemyHp ?? 1);
  return big ? Math.max(2, Math.round(baseHp * 4)) : baseHp;
}

function makeAssaultEnemy(g: Game, x: number, y: number, big = false, lane = 0): Unit {
  return {
    x,
    y,
    vx: 0,
    hp: assaultEnemyHp(g, big),
    r: big ? 8.5 : 4.4,
    big,
    used: 0,
    dead: false,
    lane,
  };
}

/** Places a compact left-lane formation with a readable leading edge. */
function seedAssaultHorde(g: Game, count: number) {
  const assault = g.assault;
  if (!assault || count <= 0) return;
  const columns = Math.min(18, Math.max(10, Math.ceil(Math.sqrt(count * 1.08))));
  const spacing = columns > 1 ? 170 / (columns - 1) : 0;
  const front = 372;
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / columns);
    const column = i % columns;
    const x = Math.max(12, Math.min(W - 12, 40 + column * spacing + (g.rand() - 0.5) * 3));
    const y = front - row * 8.7 - g.rand() * 2.3;
    const big = i > 32 && i % 47 === 0;
    const lane = columns > 1 ? Math.round((column / (columns - 1)) * 8) - 4 : 0;
    g.red.push(makeAssaultEnemy(g, x, y, big, lane));
  }
  assault.frontline = front;
}

/** Releases a finite reserve in tight rows behind the active formation. */
function releaseAssaultReserve(g: Game, count: number) {
  const assault = g.assault;
  if (!assault || count <= 0 || assault.reserve <= 0) return;
  const amount = Math.min(Math.floor(count), assault.reserve, ASSAULT_RED_CAP - g.red.length);
  if (amount <= 0) return;
  const columns = Math.min(16, Math.max(8, Math.ceil(Math.sqrt(amount * 1.1))));
  const spacing = columns > 1 ? 170 / (columns - 1) : 0;
  let rear = Infinity;
  for (const enemy of g.red) if (!enemy.dead) rear = Math.min(rear, enemy.y);
  // Reinforcements form a continuous carpet behind the last living row. If a
  // wave has been cleared completely, bring the next block to the old front
  // instead of leaving an empty screen between the cannon and the boss.
  const anchor = Number.isFinite(rear) ? rear : Math.min(372, assault.frontline);
  for (let i = 0; i < amount; i++) {
    const row = Math.floor(i / columns);
    const column = i % columns;
    const x = Math.max(12, Math.min(W - 12, 40 + column * spacing + (g.rand() - 0.5) * 3));
    const y = anchor - 8 - row * 8.7 - g.rand() * 2.3;
    const big = i > 12 && i % 43 === 0;
    const lane = columns > 1 ? Math.round((column / (columns - 1)) * 8) - 4 : 0;
    g.red.push(makeAssaultEnemy(g, x, y, big, lane));
  }
  assault.reserve -= amount;
  if (!Number.isFinite(rear)) assault.frontline = anchor;
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

/**
 * Finds a bounded lateral push for each crowd member using a spatial grid.
 *
 * Multiplication can place dozens of units in the same few rows. A full
 * pairwise pass would become quadratic near MAX_UNITS, so each unit only
 * inspects neighbouring cells. The result is acceleration rather than a
 * direct position edit; the normal wall-aware mover still owns edge and wall
 * collisions, which keeps the flow stable around obstacles.
 */
function flowPush(units: Unit[]) {
  const cells: Array<number[] | undefined> = new Array(FLOW_COLS * FLOW_ROWS);
  const push = new Float32Array(units.length);
  let maxRadius = 0;
  for (let i = 0; i < units.length; i++) {
    const u = units[i];
    if (u.dead) continue;
    const col = Math.max(0, Math.min(FLOW_COLS - 1, Math.floor(u.x / FLOW_CELL)));
    const row = Math.max(0, Math.min(FLOW_ROWS - 1, Math.floor((u.y + FLOW_CELL) / FLOW_CELL)));
    (cells[row * FLOW_COLS + col] ??= []).push(i);
    maxRadius = Math.max(maxRadius, u.r);
  }
  for (let i = 0; i < units.length; i++) {
    const u = units[i];
    if (u.dead) continue;
    const col = Math.max(0, Math.min(FLOW_COLS - 1, Math.floor(u.x / FLOW_CELL)));
    const row = Math.max(0, Math.min(FLOW_ROWS - 1, Math.floor((u.y + FLOW_CELL) / FLOW_CELL)));
    let lateral = 0;
    const searchRadius = Math.ceil((u.r + maxRadius + 2.4) / FLOW_CELL);
    for (let dr = -searchRadius; dr <= searchRadius; dr++) {
      const rr = row + dr;
      if (rr < 0 || rr >= FLOW_ROWS) continue;
      for (let dc = -searchRadius; dc <= searchRadius; dc++) {
        const cc = col + dc;
        if (cc < 0 || cc >= FLOW_COLS) continue;
        const cell = cells[rr * FLOW_COLS + cc];
        if (!cell) continue;
        for (const otherIndex of cell) {
          const other = units[otherIndex];
          if (otherIndex === i || other.dead) continue;
          const dx = u.x - other.x;
          const dy = u.y - other.y;
          const desired = u.r + other.r + 2.4;
          if (Math.abs(dy) >= desired) continue;
          const distance2 = dx * dx + dy * dy;
          if (distance2 >= desired * desired) continue;
          const distance = Math.sqrt(distance2);
          const side = Math.abs(dx) > 0.15 ? Math.sign(dx) : i < otherIndex ? -1 : 1;
          const proximity = 1 - distance / desired;
          const rowWeight = 1 - Math.abs(dy) / desired;
          lateral += side * proximity * rowWeight;
        }
      }
    }
    if ((u.x <= u.r + 1 && lateral < 0) || (u.x >= W - u.r - 1 && lateral > 0)) lateral = 0;
    push[i] = Math.max(-1.25, Math.min(1.25, lateral)) * FLOW_ACCEL;
  }
  return push;
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

function stepLegacy(g: Game, dt: number) {
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
  const blueFlow = flowPush(g.blue);
  for (let blueIndex = 0; blueIndex < g.blue.length; blueIndex++) {
    const u = g.blue[blueIndex];
    if (u.dead) continue;
    const target = nearestBase(g, u.x, u.y);
    if (target && u.y < g.steerY) {
      const pull = Math.min(1, (g.steerY - u.y) / 120);
      const want = Math.max(-90, Math.min(90, (target.x - u.x) * 2)) * pull;
      u.vx += (want - u.vx) * Math.min(1, dt * 4);
    } else {
      u.vx *= 1 - Math.min(1, dt * 3);
    }
    u.vx = Math.max(-130, Math.min(130, u.vx + blueFlow[blueIndex] * dt));
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
        if (trapActive(gt, g.t) && !u.big) {
          u.dead = true;
          pop(g, u.x, u.y, 2);
        }
        continue;
      }
      const n = gt.n ?? 2;
      const copies = u.big ? (n - 1) * 3 : n - 1;
      for (let k = 0; k < copies; k++) {
        if (g.blue.length + spawned.length >= MAX_UNITS) break;
        const side = k % 2 === 0 ? 1 : -1;
        const distance = 8 + Math.floor(k / 2) * 7;
        const off = side * distance * (u.big ? 1.7 : 1);
        const row = Math.floor(k / 4);
        const x = Math.max(gt.cx - gt.w / 2 + 3, Math.min(gt.cx + gt.w / 2 - 3, u.x + off + (g.rand() - 0.5) * 3));
        spawned.push({ x, y: u.y - row * 7 - g.rand() * 5, vx: side * (u.big ? 28 : 18), hp: 1, r: 4.2, big: false, used: u.used, dead: false });
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
    // Surges only accelerate regular wave timing. Brute timers intentionally
    // remain on their normal cadence so a surge stays readable rather than
    // stacking every enemy pressure source at once.
    b.timer -= dt * (surgeActive(g.level, g.t) ? 1 + Math.max(0, g.level.surge?.strength ?? 0) : 1);
    if (b.timer <= 0) {
      b.timer += b.every * rage;
      const columns = Math.min(6, Math.max(3, Math.ceil(Math.sqrt(b.group))));
      for (let k = 0; k < b.group; k++) {
        const row = Math.floor(k / columns);
        const rowCount = Math.min(columns, b.group - row * columns);
        const column = k % columns;
        const x = b.x + (column - (rowCount - 1) / 2) * 10 + (g.rand() - 0.5) * 4;
        const y = b.y + b.h / 2 + 6 + row * 10 + g.rand() * 5;
        g.red.push({ x, y, vx: 0, hp: 1, r: 4.4, big: false, used: 0, dead: false });
      }
    }
    b.bruteTimer -= dt;
    if (b.bruteTimer <= 0 && b.bruteEvery) {
      b.bruteTimer += b.bruteEvery * rage;
      g.red.push({ x: b.x, y: b.y + b.h / 2 + 12, vx: 0, hp: b.bruteHp ?? 10, r: 11, big: true, used: 0, dead: false });
    }
  }

  const redFlow = flowPush(g.red);
  for (let redIndex = 0; redIndex < g.red.length; redIndex++) {
    const u = g.red[redIndex];
    if (u.dead) continue;
    if (u.y > 300) {
      const want = Math.max(-60, Math.min(60, (g.cannonX - u.x) * 1.2));
      u.vx += (want - u.vx) * Math.min(1, dt * 2);
    }
    u.vx = Math.max(-90, Math.min(90, u.vx + redFlow[redIndex] * dt));
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

const ASSAULT_TRANSITION_SECONDS = 0.95;
const ASSAULT_TRAVEL_PER_BOSS = 240;
const ASSAULT_RED_CAP = 650;
const ASSAULT_FIRE_RATE = 7.5;
const ASSAULT_BLUE_SPEED = 98;
const ASSAULT_CHAMP_SPEED = 66;

function updateAssaultPickups(g: Game, dt: number) {
  const assault = g.assault;
  const config = g.level.assault;
  if (!assault || !config) return;
  const keep: AssaultPickup[] = [];
  for (const pickup of assault.pickups) {
    // The side gate travels toward the cannon's y line while staying in its
    // lane. The player must steer over it; this preserves the blue +1 choice.
    pickup.y += 36 * dt;
    if (pickup.y >= CANNON_Y - 35 && Math.abs(pickup.x - g.cannonX) <= pickup.w / 2 + 15) {
      assault.pickupsCollected++;
      const before = assault.tier;
      assault.tier = Math.max(1, Math.min(5, assault.tier + Math.max(1, pickup.value)));
      assault.upgradeFlash = 1;
      pop(g, g.cannonX, CANNON_Y - 30, 0, "UPGRADE");
      if (assault.tier > before) pop(g, g.cannonX, CANNON_Y - 42, 0, `+${assault.tier - before}`);
      continue;
    }
    if (pickup.y < H + 40) keep.push(pickup);
  }
  assault.pickups = keep;
  assault.upgradeFlash = Math.max(0, assault.upgradeFlash - dt * 2.4);

  assault.pickupTimer -= dt;
  if (assault.pickupTimer > 0 || assault.pickups.length >= 4) return;
  assault.pickupTimer += Math.max(3, config.pickupEvery ?? (config.practice ? 6 : 11));
  const side = config.practice ? 55 : assault.nextPickupId % 2 === 0 ? 305 : 55;
  assault.pickups.push({ id: assault.nextPickupId++, x: side, y: 474, w: 70, value: 1 });
}

function updateAssaultCannon(g: Game, dt: number) {
  const assault = g.assault;
  if (!assault) return;
  const maxMove = 620 * dt;
  g.targetX = Math.max(22, Math.min(W - 22, g.targetX));
  g.cannonX += Math.max(-maxMove, Math.min(maxMove, g.targetX - g.cannonX));
  g.cooldown -= dt;
  if (!g.firing || g.cooldown > 0) {
    if (!g.firing) g.cooldown = Math.max(g.cooldown, 0);
    return;
  }
  g.cooldown += 1 / ASSAULT_FIRE_RATE;
  if (g.cooldown < 0) g.cooldown = 0;
  const volley = Math.max(1, Math.min(5, assault.tier));
  for (let k = 0; k < volley && g.blue.length < MAX_UNITS; k++) {
    const offset = (k - (volley - 1) / 2) * 8;
    const lane = ((g.stats.fired + k) % 9) - 4;
    g.blue.push({ x: Math.max(8, Math.min(W - 8, g.cannonX + offset + (g.rand() - 0.5) * 2)), y: CANNON_Y - 22, vx: 0, hp: 1, r: 4.2, big: false, used: 0, dead: false, lane });
    g.stats.fired++;
    g.charge = Math.min(CHARGE_MAX, g.charge + 1);
  }
}

function updateAssaultGatesAndSpinners(g: Game, dt: number) {
  for (const gt of g.gates) {
    if (gt.move) gt.cx = gt.x + Math.sin(g.t * gt.move.speed + (gt.move.phase ?? 0)) * gt.move.range;
    gt.flash = Math.max(0, gt.flash - dt * 4);
  }
  for (const s of g.spinners) s.angle += s.speed * dt;
}

function updateAssaultBlue(g: Game, dt: number) {
  const assault = g.assault!;
  const active = g.bases[assault.encounter];
  const spawned: Unit[] = [];
  const blueFlow = flowPush(g.blue);
  for (let blueIndex = 0; blueIndex < g.blue.length; blueIndex++) {
    const u = g.blue[blueIndex];
    if (u.dead) continue;
    // The cannon steers the approach; once a runner reaches the boss throat it
    // naturally homes on the active giant so units cannot leak past it.
    const lane = Math.max(-4, Math.min(4, u.lane ?? 0));
    const laneOffset = lane * 11;
    let usedGates = 0;
    for (let mask = u.used; mask; mask &= mask - 1) usedGates++;
    const spread = usedGates <= 0 ? 4 : usedGates === 1 ? 18 : usedGates === 2 ? 28 : Math.min(65, 36 + (usedGates - 3) * 10);
    const desiredX = u.y > active.y + 86 ? Math.max(22, Math.min(W - 22, g.targetX + lane * (spread / 4))) : active.x + laneOffset;
    const want = Math.max(-150, Math.min(150, (desiredX - u.x) * 3.2));
    u.vx += (want - u.vx) * Math.min(1, dt * 5);
    u.vx = Math.max(-150, Math.min(150, u.vx + blueFlow[blueIndex] * dt));
    const dy = -(u.big ? ASSAULT_CHAMP_SPEED : ASSAULT_BLUE_SPEED) * dt;
    const prevY = u.y;
    move(g, u, dy, dt);

    // A living giant is a physical battlefront. Runners that reach its lower
    // edge queue there until the contact cadence consumes them; otherwise a
    // fast stream could pass through the narrow hitbox between damage ticks.
    if (!g.level.assault?.practice && active.hp > 0) {
      const front = active.y + active.h / 2 + u.r;
      if (u.y < front && Math.abs(u.x - active.x) < active.w / 2 + u.r) {
        u.y = front;
        u.vx += (active.x - u.x) * Math.min(1, dt * 6);
      }
    }

    for (let i = 0; i < g.gates.length; i++) {
      const gt = g.gates[i];
      if (u.used & (1 << i)) continue;
      if (prevY < gt.y || u.y > gt.y || Math.abs(u.x - gt.cx) > gt.w / 2) continue;
      u.used |= 1 << i;
      gt.flash = 1;
      if (gt.kind === "trap") {
        if (trapActive(gt, g.t) && !u.big) {
          u.dead = true;
          pop(g, u.x, u.y, 2);
        }
        continue;
      }
      const n = Math.max(2, gt.n ?? 2);
      const copies = u.big ? (n - 1) * 3 : n - 1;
      for (let k = 0; k < copies && g.blue.length + spawned.length < MAX_UNITS; k++) {
        const side = k % 2 === 0 ? 1 : -1;
        const distance = 8 + Math.floor(k / 2) * 7;
        const off = side * distance * (u.big ? 1.7 : 1);
        const row = Math.floor(k / 4);
        const x = Math.max(gt.cx - gt.w / 2 + 3, Math.min(gt.cx + gt.w / 2 - 3, u.x + off + (g.rand() - 0.5) * 3));
        spawned.push({ x, y: u.y - row * 7 - g.rand() * 5, vx: side * (u.big ? 28 : 18), hp: 1, r: 4.2, big: false, used: u.used, dead: false, lane: Math.max(-4, Math.min(4, (u.lane ?? 0) + (k % 3) - 1)) });
        g.stats.multiplied++;
      }
    }
    if (u.dead) continue;
    if (!u.big && hitsSpinner(g, u)) {
      u.dead = true;
      pop(g, u.x, u.y, 0);
      continue;
    }
    if (u.y < -10) u.dead = true;
  }
  for (const u of spawned) g.blue.push(u);
}

/** Keeps the assault front broad while still making units queue behind contact. */
function packAssaultBlueAgainstBoss(g: Game) {
  const assault = g.assault!;
  const active = g.bases[assault.encounter];
  if (!active || active.hp <= 0) return;
  const front = active.y + active.h / 2;
  const lanes: Unit[][] = Array.from({ length: 9 }, () => []);
  for (const u of g.blue) {
    if (u.dead || u.y < active.y - active.h / 2 || u.y > front + 132) continue;
    if (Math.abs(u.x - active.x) > active.w / 2 + 8) continue;
    const slot = Math.max(0, Math.min(8, Math.round((u.lane ?? 0) + 4)));
    lanes[slot].push(u);
  }
  for (const lane of lanes) {
    lane.sort((a, b) => a.y - b.y);
    for (let i = 0; i < lane.length; i++) {
      const minimumY = front + 4.2 + i * 7.2;
      if (lane[i].y < minimumY) lane[i].y = minimumY;
    }
  }
}

function updateAssaultRed(g: Game, dt: number) {
  const assault = g.assault!;
  const config = g.level.assault!;
  if (config.practice) return;
  if (assault.reserve > 0) {
    assault.spawnTimer -= dt;
    const activeTarget = Math.min(ASSAULT_RED_CAP, Math.max(0, assault.horde));
    if (assault.spawnTimer <= 0 || (g.red.length === 0 && activeTarget > 0)) {
      const deficit = Math.max(0, activeTarget - g.red.length);
      const amount = Math.max(12, Math.min(72, deficit || Math.round(assault.horde / 18)));
      releaseAssaultReserve(g, amount);
      assault.spawnTimer += Math.max(0.55, 1.65 - assault.encounter * 0.08);
    }
  }
  const active = g.bases[assault.encounter];
  const redFlow = flowPush(g.red);
  for (let redIndex = 0; redIndex < g.red.length; redIndex++) {
    const u = g.red[redIndex];
    if (u.dead) continue;
    const laneOffset = Math.max(-4, Math.min(4, u.lane ?? 0)) * 11;
    const want = Math.max(-80, Math.min(80, (active.x + laneOffset - u.x) * 1.3));
    u.vx += (want - u.vx) * Math.min(1, dt * 2.2);
    u.vx = Math.max(-100, Math.min(100, u.vx + redFlow[redIndex] * dt));
    move(g, u, config.speed * (u.big ? 0.74 : 1) * dt, dt);
    if (!u.big && hitsSpinner(g, u)) {
      u.dead = true;
      pop(g, u.x, u.y, 1);
      continue;
    }
    if (u.y >= DEFENSE_Y) {
      g.status = "lost";
      pop(g, u.x, u.y, 1, "OUCH");
      return;
    }
  }
  let front = -Infinity;
  for (const u of g.red) if (!u.dead) front = Math.max(front, u.y);
  if (front > -Infinity) assault.frontline = Math.min(DEFENSE_Y, front);
}

function resolveAssaultFights(g: Game) {
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
}

function finishAssaultEncounter(g: Game) {
  const assault = g.assault!;
  if (assault.phase !== "battle") return;
  const active = g.bases[assault.encounter];
  if (active.hp > 0) return;
  active.hp = 0;
  active.hitFlash = 1;
  pop(g, active.x, active.y, 0, "DOWN!");
  for (let k = 0; k < 18; k++) pop(g, active.x + (g.rand() - 0.5) * 80, active.y + (g.rand() - 0.5) * 45, 1);
  for (const r of g.red) if (!r.dead) pop(g, r.x, r.y, 1);
  g.red = [];

  if (assault.tier < 5) assault.tier++;
  assault.upgradeFlash = 1;
  pop(g, active.x, active.y - 30, 0, "UPGRADE");
  if (assault.encounter >= assault.encounters - 1) {
    g.status = "won";
    g.blue = g.blue.filter((u) => !u.dead);
    return;
  }

  assault.encounter++;
  assault.advance = 1;
  assault.phase = "advance";
  assault.transition = ASSAULT_TRANSITION_SECONDS;
  assault.horde = Math.max(0, Math.min(ASSAULT_RED_CAP, Math.floor((g.level.assault?.horde ?? 0) * (1 + assault.encounter * 0.08))));
  assault.reserve = Math.max(0, Math.floor((g.level.assault?.reserve ?? 0) * (1 + assault.encounter * 0.12)));
  assault.frontline = assault.horde > 0 ? 372 : CANNON_Y - 26;
  assault.spawnTimer = 1.1;
  assault.bossTimer = 0;
  for (const gt of g.gates) {
    if (gt.kind === "x") gt.n = Math.min(9, Math.max(2, (gt.n ?? 2) + 1));
  }
  for (const u of g.blue) {
    u.y = CANNON_Y - 22;
    u.vx = 0;
    u.used = 0;
  }
  if (!g.level.assault?.practice && assault.horde > 0) seedAssaultHorde(g, assault.horde);
  assault.pickups.push({ id: assault.nextPickupId++, x: assault.encounter % 2 ? 55 : 305, y: 470, w: 70, value: 1 });
}

function stepAssault(g: Game, dt: number) {
  const assault = g.assault!;
  if (g.status !== "playing") {
    for (const p of g.pops) p.t += dt;
    g.pops = g.pops.filter((p) => p.t < 0.8);
    assault.upgradeFlash = Math.max(0, assault.upgradeFlash - dt * 2.4);
    return;
  }
  g.t += dt;
  updateAssaultCannon(g, dt);
  updateAssaultGatesAndSpinners(g, dt);
  updateAssaultPickups(g, dt);

  if (assault.phase === "advance") {
    const portion = Math.min(dt, assault.transition);
    assault.travel += ASSAULT_TRAVEL_PER_BOSS * portion / ASSAULT_TRANSITION_SECONDS;
    assault.transition = Math.max(0, assault.transition - dt);
    assault.advance = Math.max(0, assault.transition / ASSAULT_TRANSITION_SECONDS);
    if (assault.transition <= 0) assault.phase = "battle";
  } else {
    updateAssaultBlue(g, dt);
    packAssaultBlueAgainstBoss(g);
    updateAssaultRed(g, dt);
    if (g.status === "playing") {
      resolveAssaultFights(g);
      const active = g.bases[assault.encounter];
      if (!g.level.assault?.practice && active && active.hp > 0) {
        assault.bossTimer -= dt;
        if (assault.bossTimer <= 0) {
          for (const u of g.blue) {
            if (u.dead) continue;
            if (Math.abs(u.x - active.x) > active.w / 2 + u.r) continue;
            if (u.y > active.y + active.h / 2 + u.r || u.y < active.y - active.h / 2 - u.r) continue;
            const damage = u.big ? Math.max(5, Math.floor(u.hp * 1.5)) : 1;
            active.hp = Math.max(0, active.hp - damage);
            active.hitFlash = 1;
            g.stats.baseHits += damage;
            u.dead = true;
            assault.bossTimer = 0.025;
            pop(g, u.x, u.y, 0, u.big ? "BOOM" : undefined);
            break;
          }
        }
      }
      if (g.status === "playing" && active && active.hp <= 0) finishAssaultEncounter(g);
    }
  }

  g.blue = g.blue.filter((u) => !u.dead);
  g.red = g.red.filter((u) => !u.dead);
  for (const p of g.pops) p.t += dt;
  g.pops = g.pops.filter((p) => p.t < 0.8);
}

export function step(g: Game, dt: number) {
  if (g.assault) stepAssault(g, dt);
  else stepLegacy(g, dt);
}

export function stars(level: Level, time: number) {
  if (time <= level.par) return 3;
  if (time <= level.par * 1.4) return 2;
  return 1;
}
