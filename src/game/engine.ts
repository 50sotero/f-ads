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
/** Campaign champion charge earned per second while the cannon is held. */
export const CAMPAIGN_CHARGE_RATE = 7;

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
export type AssaultWaveKind = "runner" | "guard" | "brute";
export type AssaultCounterattackDef = {
  /** Number of finite reinforcement waves after each giant falls. */
  waves: number;
  /** Base number of fast runners in each wave. */
  runners?: number;
  /** Base number of durable guards in each wave. */
  guards?: number;
  /** Base number of slow brutes in each wave. */
  brutes?: number;
  /** Seconds between warning/deployment of consecutive waves. */
  interval?: number;
  /** Every Nth wave is centered; the other waves alternate the flanks. */
  flankEvery?: number;
};
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
  /** Seconds between nonlethal active-boss slams; omitted for early routes. */
  slamEvery?: number;
  /** Optional finite reinforcement phase after each campaign giant falls. */
  counterattack?: AssaultCounterattackDef;
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
  /** Stable speed variation used by formed assault groups and gate copies. */
  pace?: number;
  /** Counterattack role; legacy/custom assault units default to runner/brute. */
  kind?: AssaultWaveKind;
  /** A late-wave guard's visible brace; ordinary runners cannot damage it. */
  braced?: boolean;
  /** Stable outer-flank target for a late counterattack runner. */
  breakawayTargetX?: number;
  /** Starting row for the smooth road-to-road advance. */
  advanceFromY?: number;
};
export type Base = BaseDef & { maxHp: number; timer: number; bruteTimer: number; hitFlash: number; w: number; h: number };
/** Runtime gate state; `overrun` is a one-shot boss break signal for the renderer. */
export type Gate = GateDef & { cx: number; flash: number; overrun: boolean };
export type Spinner = SpinnerDef & { angle: number };
export type Pop = { x: number; y: number; t: number; color: number; text?: string };

export type AssaultPickup = { id: number; x: number; y: number; w: number; value: number };

export const WEAPONS = [
  { name: "Scout", description: "Steady single shots", burst: 1, burstGap: 0, cycle: 1 / 7.5 },
  { name: "Repeater", description: "Three-shot bursts", burst: 3, burstGap: 0.07, cycle: 0.3 },
  { name: "Cyclone", description: "Rapid continuous fire", burst: 1, burstGap: 0, cycle: 1 / 13.5 },
] as const;

export function weaponForLevel(level: number) {
  return WEAPONS[Math.max(0, Math.min(WEAPONS.length - 1, Math.floor(level) - 1))];
}

export type WeaponTarget = { x: number; y: number; w: number; h: number; hp: number; maxHp: number; hitFlash: number };

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
  /** Weapon evolution is separate from the number of cannons collected. */
  weaponLevel: number;
  weaponFlash: number;
  weaponTarget: WeaponTarget | null;
  weaponTargetsEnabled: boolean;
  weaponTargetTimer: number;
  /** Shootable lock that releases the campaign's left +1 pickup lane. */
  cannonTarget: WeaponTarget | null;
  /** Shots remaining in the current burst. Releasing fire cancels it. */
  burstRemaining: number;
  /** Last fired barrel and its sequence, used for individual recoil. */
  barrelShots: number[];
  /** Brief visual feedback after a pickup or milestone upgrade. */
  upgradeFlash: number;
  pickups: AssaultPickup[];
  /** Defenders waiting to be released into the current encounter. */
  reserve: number;
  /** Leading red y position in logical field coordinates. */
  frontline: number;
  /** Internal encounter phase; renderer may use this for transition effects. */
  phase: "battle" | "counterattack" | "advance";
  /** Number of counterattack waves already deployed in this encounter. */
  wave: number;
  /** Total finite counterattack waves configured for this level. */
  waves: number;
  /** Lane of the incoming or most recently deployed wave (-1/0/1). */
  waveLane: -1 | 0 | 1;
  /** 1 while the next counterattack wave is telegraphed, easing to 0 at spawn. */
  waveWarning: number;
  /** Living red units plus pending counterattack units. */
  remaining: number;
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
  /** Time spent in the current boss battle, used for delayed lane pressure. */
  bossTime: number;
  /** Base y at the start of the current encounter before the boss advances. */
  bossOriginY: number;
  /** Total blue +1 gates collected, including pickups after reaching tier 5. */
  pickupsCollected: number;
  /** 0..1 windup signal during the active boss's 0.8-second warning. */
  bossWarning: number;
  /** 1 at impact, then decays for renderer impact feedback. */
  bossPulse: number;
  /** Internal countdown until the next optional boss slam. */
  slamTimer: number;
  /** Internal counterattack deployment timer. */
  waveTimer: number;
  /** Number of units already placed from the currently deploying wave. */
  waveSpawned: number;
  /** Number of red impacts the cannon line can absorb before the run ends. */
  integrity: number;
  /** Starting integrity for the current run; public so HUDs can render pips. */
  maxIntegrity: number;
  /** Brief visual/audio feedback after a defender reaches the line. */
  breachFlash: number;
  /** Total defenders that have touched the line during this run. */
  breaches: number;
  /** Per-game simulation frame used to cadence crowd motion intents. */
  motionFrame: number;
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

function assaultGateDefs(level: Level): GateDef[] {
  if (!level.assault) return level.gates ?? [];
  if (level.gates?.length) return level.gates;
  const values = level.assault?.gateValues?.length ? level.assault.gateValues : [2, 3, 4];
  const ys = [510, 467, 424];
  return values.slice(0, 31).map((n, i) => ({ x: 180, y: ys[i] ?? 424 - (i - 2) * 43, w: 164, kind: "x" as const, n: Math.max(2, Math.round(n)) }));
}

function counterattackWaveTotal(config: AssaultDef | undefined) {
  return config?.counterattack ? Math.max(0, Math.min(12, Math.floor(config.counterattack.waves))) : 0;
}

function makeAssaultState(level: Level): AssaultState {
  const config = level.assault!;
  const horde = Math.max(0, Math.floor(config.horde));
  const waves = counterattackWaveTotal(config);
  const practicePickups: AssaultPickup[] = [{ id: 1, x: 55, y: 500, w: 70, value: 1 }];
  const campaignPickups: AssaultPickup[] = [
    { id: 1, x: 55, y: 485, w: 70, value: 1 },
    { id: 2, x: 55, y: 450, w: 70, value: 1 },
    { id: 3, x: 55, y: 415, w: 70, value: 1 },
    { id: 4, x: 55, y: 380, w: 70, value: 1 },
  ];
  return {
    encounter: 0,
    encounters: Math.max(1, level.bases.length),
    travel: 0,
    advance: 0,
    tier: 1,
    weaponLevel: 1,
    weaponFlash: 0,
    weaponTarget: config.practice ? null : makeWeaponTarget(1),
    weaponTargetsEnabled: !config.practice,
    weaponTargetTimer: 0,
    cannonTarget: config.practice ? null : makeCannonTarget(),
    burstRemaining: 0,
    barrelShots: [0, 0, 0, 0, 0],
    upgradeFlash: 0,
    pickups: config.practice ? practicePickups : campaignPickups,
    reserve: Math.max(0, Math.floor(config.reserve)),
    frontline: config.practice || horde <= 0 ? CANNON_Y - 26 : 372,
    phase: "battle",
    wave: 0,
    waves,
    waveLane: 0,
    waveWarning: 0,
    remaining: horde + Math.max(0, Math.floor(config.reserve)),
    startingTier: 1,
    horde,
    transition: 0,
    spawnTimer: 1.1,
    pickupTimer: Math.max(3, config.pickupEvery ?? 9),
    nextPickupId: config.practice ? 2 : 5,
    bossTimer: 0,
    bossTime: 0,
    bossOriginY: level.bases[0]?.y ?? 300,
    pickupsCollected: 0,
    bossWarning: 0,
    bossPulse: 0,
    slamTimer: Math.max(0.1, config.slamEvery ?? Infinity),
    waveTimer: 0,
    waveSpawned: 0,
    integrity: 3,
    maxIntegrity: 3,
    breachFlash: 0,
    breaches: 0,
    motionFrame: 0,
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
    bases: level.bases.map((b) => {
      const hp = b.hp;
      return {
        ...b,
        hp,
        maxHp: hp,
        timer: b.delay ?? 1.5,
        bruteTimer: b.bruteEvery ? b.bruteEvery * 0.6 + (b.delay ?? 0) : Infinity,
        hitFlash: 0,
        w: assault ? ASSAULT_BOSS_W : BASE_W,
        h: BASE_H,
      };
    }),
    gates: assaultGateDefs(level).map((g) => ({ ...g, cx: g.x, flash: 0, overrun: false })),
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

/** Champions leave the middle of the battery, even with several cannons. */
export function championShieldAim(game: Game): { target: Unit; direction: "left" | "right" | "aligned" } | null {
  let target: Unit | null = null;
  for (const unit of game.red) {
    if (!unit.dead && unit.braced && (!target || unit.y > target.y)) target = unit;
  }
  if (!target) return null;
  const offset = target.x - game.cannonX;
  const direction = Math.abs(offset) <= 14 ? "aligned" : offset < 0 ? "left" : "right";
  return { target, direction };
}

// Keep engagement metadata outside Unit. Adding fields to runners mid-battle
// changes their object shapes and slows the shared crowd-neighbour hot loop.
const championTargets = new WeakMap<Unit, Unit>();
const counterCommitments = new WeakMap<Unit, { owner: AssaultState; encounter: number }>();
const shieldBraceFatigue = new WeakMap<Unit, { owner: Game; seconds: number }>();
type BossSlamRecoilState = {
  owner: Game;
  assault: AssaultState;
  encounter: number;
  /** Simulation frame of the impact; the tail starts on the following frame. */
  startFrame: number;
  elapsed: number;
  extra: number;
};
const bossSlamRecoilStates = new WeakMap<Unit, BossSlamRecoilState>();
const SHIELD_BRACE_FATIGUE_SECONDS = 1.25;
const ASSAULT_BOSS_SLAM_DURATION = 0.35;
const ASSAULT_BOSS_SLAM_DECAY = 8;
const ASSAULT_BOSS_SLAM_END_ENVELOPE = Math.exp(-ASSAULT_BOSS_SLAM_DECAY * ASSAULT_BOSS_SLAM_DURATION);
const ASSAULT_BOSS_SLAM_DECAY_NORMALIZER = 1 - ASSAULT_BOSS_SLAM_END_ENVELOPE;
const ASSAULT_BOSS_SLAM_INITIAL_KICK = 10;
const ASSAULT_BOSS_SLAM_RUNNER_EXTRA = 26;
const ASSAULT_BOSS_SLAM_CHAMPION_EXTRA = 2;

/**
 * The final counterattack cleanup lets ordinary contact wear down a remaining
 * guard. It is intentionally narrow: a campaign counterattack must have
 * deployed every configured wave and have no more than six living red units.
 * Count actual units rather than `assault.remaining`, which also includes
 * waves that have not spawned yet.
 */
export function isShieldCleanup(game: Game) {
  const assault = game.assault;
  const config = game.level.assault;
  if (
    game.status !== "playing"
    || !assault
    || !config
    || config.practice
    || !config.counterattack
    || assault.phase !== "counterattack"
    || assault.wave < assault.waves
  ) return false;

  let livingRed = 0;
  for (const unit of game.red) {
    if (!unit.dead && ++livingRed > 6) return false;
  }
  return true;
}

/** Returns the current 0..1 ordinary-contact fatigue on a braced guard. */
export function shieldBracePressure(game: Game, unit: Unit) {
  if (!isShieldCleanup(game) || unit.dead || !unit.braced) return 0;
  const fatigue = shieldBraceFatigue.get(unit);
  if (!fatigue || fatigue.owner !== game) return 0;
  return Math.max(0, Math.min(1, fatigue.seconds / SHIELD_BRACE_FATIGUE_SECONDS));
}

function applyShieldBraceFatigue(game: Game, guards: Set<Unit>, dt: number) {
  if (!isShieldCleanup(game)) return;
  const contactSeconds = Math.max(0, dt);
  if (contactSeconds <= 0) return;
  for (const guard of guards) {
    if (guard.dead || !guard.braced) continue;
    const previous = shieldBraceFatigue.get(guard);
    const seconds = Math.min(
      SHIELD_BRACE_FATIGUE_SECONDS,
      (previous?.owner === game ? previous.seconds : 0) + contactSeconds,
    );
    if (seconds >= SHIELD_BRACE_FATIGUE_SECONDS) {
      guard.braced = false;
      shieldBraceFatigue.delete(guard);
      pop(game, guard.x, guard.y, 1, "SHIELD BREAK");
    } else {
      shieldBraceFatigue.set(guard, { owner: game, seconds });
    }
  }
}

function activeBossSlamRecoilState(game: Game, unit: Unit) {
  const assault = game.assault;
  const config = game.level.assault;
  if (
    !assault
    || !config
    || config.practice
    || !config.slamEvery
    || game.status !== "playing"
    || assault.phase !== "battle"
    || unit.dead
  ) return null;
  const state = bossSlamRecoilStates.get(unit);
  if (
    !state
    || state.owner !== game
    || state.assault !== assault
    || state.encounter !== assault.encounter
  ) return null;
  return state;
}

/**
 * Returns the current normalized impact envelope for a unit hit by the active
 * boss slam. The map is deliberately external to Unit so the shared crowd
 * objects keep their hot-loop shape. It is read-only here: decay is advanced
 * by the simulation using `dt`, never by renderer wall-clock time.
 */
export function bossSlamRecoil(game: Game, unit: Unit) {
  const state = activeBossSlamRecoilState(game, unit);
  if (!state) return 0;
  const envelope = Math.exp(-ASSAULT_BOSS_SLAM_DECAY * state.elapsed);
  return Math.max(0, Math.min(1, (envelope - ASSAULT_BOSS_SLAM_END_ENVELOPE) / ASSAULT_BOSS_SLAM_DECAY_NORMALIZER));
}

export function launchChampion(g: Game) {
  if (g.status !== "playing" || g.charge < CHARGE_MAX) return false;
  g.charge = 0;
  g.stats.champions++;
  const aim = championShieldAim(g);
  const champion: Unit = { x: g.cannonX, y: CANNON_Y - 26, vx: 0, hp: 14, r: 11, big: true, used: 0, dead: false };
  if (aim?.direction === "aligned") championTargets.set(champion, aim.target);
  g.blue.push(champion);
  return true;
}

export type AssaultLoadout = { tier: number; weaponLevel: number; charge: number };

/**
 * Applies a persisted starter loadout before a campaign run begins. Keeping
 * this beside the simulation's weapon target creation avoids UI code having to
 * reach into private target details when a player has earned a new starter
 * cannon or weapon. Practice remains fixed to the teaching state.
 */
export function applyStartingLoadout(g: Game, loadout: AssaultLoadout) {
  const assault = g.assault;
  if (!assault || g.level.assault?.practice || g.status !== "playing") return g;
  const tier = Math.max(1, Math.min(3, Math.floor(loadout.tier || 1)));
  const weaponLevel = Math.max(1, Math.min(WEAPONS.length, Math.floor(loadout.weaponLevel || 1)));
  assault.tier = tier;
  assault.startingTier = tier;
  assault.weaponLevel = weaponLevel;
  g.charge = Math.max(0, Math.min(CHARGE_MAX, Math.floor(loadout.charge || 0)));
  assault.weaponTarget = weaponLevel < WEAPONS.length ? makeWeaponTarget(weaponLevel) : null;
  assault.weaponTargetsEnabled = weaponLevel < WEAPONS.length;
  assault.weaponTargetTimer = 0;
  assault.burstRemaining = 0;
  g.cooldown = 0;
  assault.barrelShots.fill(0);
  return g;
}

function pop(g: Game, x: number, y: number, color: number, text?: string) {
  if (g.pops.length > 260) {
    // A large contact wave can otherwise evict a shield break in the same
    // simulation step, before the renderer and audio ever observe it.
    const ordinary = g.pops.findIndex((value) => !value.text);
    const expendable = ordinary >= 0 ? ordinary : g.pops.findIndex((value) => value.text !== "SHIELD BREAK");
    g.pops.splice(Math.max(0, expendable), 1);
  }
  g.pops.push({ x, y, t: 0, color, text });
}

function assaultEnemyHp(g: Game, big = false, kind?: AssaultWaveKind) {
  const config = g.level.assault!;
  const baseHp = Math.max(1, config.enemyHp ?? 1);
  if (kind === "guard") return Math.max(2, Math.round(baseHp * 2));
  return big ? Math.max(2, Math.round(baseHp * 4)) : baseHp;
}

function makeAssaultEnemy(g: Game, x: number, y: number, big = false, lane = 0, kind?: AssaultWaveKind): Unit {
  const variation = stableMotionVariation(x, y, big ? 17 : kind === "guard" ? 29 : 0);
  const enemy: Unit = {
    x,
    y,
    vx: 0,
    hp: assaultEnemyHp(g, big, kind),
    r: big ? 8.5 : kind === "guard" ? 5.2 : 4.4,
    big,
    used: 0,
    dead: false,
    lane,
    pace: 0.94 + variation * 0.12,
  };
  if (kind) enemy.kind = kind;
  return enemy;
}

function stableMotionVariation(x: number, y: number, salt = 0) {
  const value = Math.sin(x * 12.9898 + y * 78.233 + salt * 37.719) * 43758.5453;
  return value - Math.floor(value);
}

const ASSAULT_FORMATION_FRONT_SPAN = 160;
const ASSAULT_FORMATION_REAR_SPAN = 240;
const ASSAULT_FORMATION_ROW_SPACING = 9.7;

/**
 * Keeps the authored formation broad while breaking up its hard rectangular
 * outline. The row breathing and alternating phase are deterministic; the
 * small seeded jitter keeps equal-depth runners from sharing one rail.
 */
function organicFormationRearSpan(center: number) {
  // Side-centred fixtures keep the original playable envelope while the
  // campaign's centred road can open to the wider rear footprint.
  const half = Math.min(ASSAULT_FORMATION_REAR_SPAN / 2, Math.max(90, center - 35));
  return half * 2;
}

function organicFormationSpan(center: number, row: number) {
  const rearSpan = organicFormationRearSpan(center);
  const frontSpan = Math.min(ASSAULT_FORMATION_FRONT_SPAN, rearSpan);
  const taper = Math.min(1, row / 6);
  return frontSpan + (rearSpan - frontSpan) * taper;
}

function organicFormationRowColumns(columns: number, frontColumns: number, row: number) {
  const taper = Math.min(1, row / 6);
  return Math.max(3, Math.min(columns, Math.round(frontColumns + (columns - frontColumns) * taper)));
}

function organicFormationSlot(index: number, columns: number, frontColumns: number) {
  let row = 0;
  let column = index;
  while (column >= organicFormationRowColumns(columns, frontColumns, row)) {
    column -= organicFormationRowColumns(columns, frontColumns, row);
    row++;
  }
  return { row, column, columns: organicFormationRowColumns(columns, frontColumns, row) };
}

function organicFormationX(center: number, row: number, column: number, rowColumns: number, jitter: number) {
  const span = organicFormationSpan(center, row);
  const spacing = rowColumns > 1 ? span / (rowColumns - 1) : 0;
  const breathing = 0.975 + 0.025 * (0.5 + 0.5 * Math.sin(row * 1.71 + center * 0.02));
  const stagger = (row & 1 ? 0.34 : -0.18) * spacing;
  const drift = Math.sin(row * 2.37 + center * 0.013) * 1.25;
  const raw = center + (column - (rowColumns - 1) / 2) * spacing * breathing + stagger + drift + (jitter - 0.5) * 0.6;
  const edge = span / 2;
  return Math.max(12, Math.min(W - 12, Math.max(center - edge, Math.min(center + edge, raw))));
}

function organicFormationY(anchor: number, row: number, jitter: number) {
  const wave = Math.sin(row * 1.63 + anchor * 0.013) * 0.18;
  return anchor - row * ASSAULT_FORMATION_ROW_SPACING + wave + (jitter - 0.5) * 0.16;
}

/** Places a tapered formation with a readable leading edge. */
function assaultFormationColumns(count: number, center: number, spacing: number, minimum: number) {
  const byWidth = Math.ceil(organicFormationRearSpan(center) / spacing) + 1;
  const byCount = Math.ceil(Math.sqrt(count * 1.08));
  return Math.min(23, Math.max(minimum, byWidth, byCount));
}

function seedAssaultHorde(g: Game, count: number) {
  const assault = g.assault;
  if (!assault || count <= 0) return;
  const center = g.bases[assault.encounter]?.x ?? W / 2;
  const columns = assaultFormationColumns(count, center, 11, 10);
  const frontColumns = Math.max(3, Math.min(columns, Math.round(organicFormationSpan(center, 0) / 10) + 1));
  const front = 372;
  for (let i = 0; i < count; i++) {
    const slot = organicFormationSlot(i, columns, frontColumns);
    const x = organicFormationX(center, slot.row, slot.column, slot.columns, g.rand());
    const y = organicFormationY(front, slot.row, g.rand());
    const big = i > 32 && i % 47 === 0;
    const lane = slot.columns > 1 ? Math.round((slot.column / (slot.columns - 1)) * 8) - 4 : 0;
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
  const center = g.bases[assault.encounter]?.x ?? W / 2;
  const columns = assaultFormationColumns(amount, center, 14, 8);
  const frontColumns = Math.max(3, Math.min(columns, Math.round(organicFormationSpan(center, 0) / 10) + 1));
  let rear = Infinity;
  for (const enemy of g.red) if (!enemy.dead) rear = Math.min(rear, enemy.y);
  // Reinforcements form a continuous carpet behind the last living row. If a
  // wave has been cleared completely, bring the next block to the old front
  // instead of leaving an empty screen between the cannon and the boss.
  const anchor = Number.isFinite(rear) ? rear : Math.min(372, assault.frontline);
  for (let i = 0; i < amount; i++) {
    const slot = organicFormationSlot(i, columns, frontColumns);
    const x = organicFormationX(center, slot.row, slot.column, slot.columns, g.rand());
    const y = organicFormationY(anchor - 8, slot.row, g.rand());
    const big = i > 12 && i % 43 === 0;
    const lane = slot.columns > 1 ? Math.round((slot.column / (slot.columns - 1)) * 8) - 4 : 0;
    g.red.push(makeAssaultEnemy(g, x, y, big, lane));
  }
  assault.reserve -= amount;
  if (!Number.isFinite(rear)) assault.frontline = anchor;
}

function counterattackLane(config: AssaultCounterattackDef | undefined, waveIndex: number, encounter = 0): -1 | 0 | 1 {
  const flankEvery = Math.max(1, Math.floor(config?.flankEvery ?? 2));
  // With the default cadence the pattern is left, centre, right, centre. This
  // keeps the flank telegraph readable while making each successive wave ask
  // for a different cannon position.
  if ((waveIndex + 1) % flankEvery === 0) return 0;
  const flank = Math.floor(waveIndex / flankEvery) % 2 === 0 ? -1 : 1;
  return (encounter % 2 === 0 ? flank : -flank) as -1 | 1;
}

export type CounterattackWaveRole = "mixed" | "flank" | "shield";

/**
 * Describes the authored role for a counterattack wave without changing the
 * wave or game state. Early encounters and one-wave fixtures retain the
 * original mixed composition; later slam encounters use their existing lane
 * cadence to distinguish fast flanks from centered shield waves.
 */
export function counterattackWaveRole(game: Game, waveIndex: number): CounterattackWaveRole {
  const assault = game.assault;
  const config = game.level.assault;
  const counterattack = config?.counterattack;
  const index = Math.floor(waveIndex);
  if (
    !Number.isFinite(index)
    || !assault
    || !config
    || config.practice
    || !config.slamEvery
    || !counterattack
    || assault.encounter <= 0
    || assault.waves <= 1
    || index < 0
    || index >= assault.waves
  ) return "mixed";
  const authoredPlan = counterattackWavePlan(counterattack, index);
  if (counterattackLane(counterattack, index, assault.encounter) === 0) {
    // A centered wave cannot advertise a shield role without a scaled guard
    // to brace. Zero-authored guards stay a runner/brute mixed wave.
    return authoredPlan.guards > 0 ? "shield" : "mixed";
  }
  // A flank role is a runner rush. Keep a runnerless custom wave mixed so the
  // telegraph never promises runners that the authored plan cannot provide.
  return authoredPlan.runners > 0 ? "flank" : "mixed";
}

function counterattackWavePlan(
  config: AssaultCounterattackDef | undefined,
  waveIndex: number,
  role: CounterattackWaveRole = "mixed",
) {
  if (!config) return { runners: 0, guards: 0, brutes: 0 };
  const scale = 1 + Math.max(0, waveIndex) * 0.08;
  const plan = {
    runners: Math.max(0, Math.round(Math.max(0, config.runners ?? 0) * scale)),
    guards: Math.max(0, Math.round(Math.max(0, config.guards ?? 0) * scale)),
    brutes: Math.max(0, Math.round(Math.max(0, config.brutes ?? 0) * scale)),
  };
  if (role === "flank" && plan.guards > 0) {
    const redistributed = Math.min(plan.guards, Math.max(0, Math.round(plan.guards * 0.75)));
    plan.runners += redistributed;
    plan.guards -= redistributed;
  } else if (role === "shield" && plan.guards > 0 && plan.runners > 0) {
    const redistributed = Math.min(6, plan.runners, Math.max(0, Math.round(plan.guards * 0.75)));
    plan.runners -= redistributed;
    plan.guards += redistributed;
  }
  return plan;
}

function counterattackWaveSize(g: Game, waveIndex: number) {
  const config = g.level.assault?.counterattack;
  const plan = counterattackWavePlan(config, waveIndex, counterattackWaveRole(g, waveIndex));
  return plan.runners + plan.guards + plan.brutes;
}

/**
 * Gives a late counterattack runner a readable, local sidestep. The target is
 * derived at spawn time from its authored wave lane and x position so a later
 * wave cannot silently retarget runners from an earlier one.
 */
function counterattackBreakawayTarget(centerX: number, lane: -1 | 0 | 1, x: number, spawnIndex: number) {
  const direction = lane === 0
    ? (x < centerX - 2 ? -1 : x > centerX + 2 ? 1 : spawnIndex % 2 === 0 ? -1 : 1)
    : lane;
  const offset = Math.min(88, Math.max(70, Math.abs(x - centerX) + 36));
  return Math.max(18, Math.min(W - 18, centerX + direction * offset));
}

function refreshAssaultRemaining(g: Game) {
  const assault = g.assault;
  if (!assault) return;
  let remaining = 0;
  for (const unit of g.red) if (!unit.dead) remaining++;
  if (assault.phase === "counterattack") {
    if (assault.wave < assault.waves) {
      remaining += Math.max(0, counterattackWaveSize(g, assault.wave) - assault.waveSpawned);
      for (let wave = assault.wave + 1; wave < assault.waves; wave++) remaining += counterattackWaveSize(g, wave);
    }
  } else {
    remaining += Math.max(0, assault.reserve);
  }
  assault.remaining = remaining;
}

function spawnCounterattackWave(g: Game, waveIndex: number) {
  const assault = g.assault;
  const config = g.level.assault?.counterattack;
  const active = assault ? g.bases[assault.encounter] : undefined;
  if (!assault || !config || !active) return;
  const role = counterattackWaveRole(g, waveIndex);
  const plan = counterattackWavePlan(config, waveIndex, role);
  const lane = counterattackLane(config, waveIndex, assault.encounter);
  const center = active.x + lane * 105;
  const total = plan.runners + plan.guards + plan.brutes;
  if (total <= 0) return 0;
  const columns = Math.min(8, Math.max(3, Math.ceil(Math.sqrt(total * 1.15))));
  const spacing = columns > 1 ? 58 / (columns - 1) : 0;
  const spawnY = active.y - active.h / 2 - 42;
  const roles: AssaultWaveKind[] = [];
  for (let i = 0; i < plan.runners; i++) roles.push("runner");
  for (let i = 0; i < plan.guards; i++) roles.push("guard");
  for (let i = 0; i < plan.brutes; i++) roles.push("brute");
  const start = Math.max(0, Math.min(roles.length, assault.waveSpawned));
  let spawned = 0;
  for (let i = start; i < roles.length && g.red.length < ASSAULT_RED_CAP; i++) {
    const kind = roles[i];
    const row = Math.floor(i / columns);
    const column = i % columns;
    const x = Math.max(10, Math.min(W - 10, center - 29 + column * spacing + (g.rand() - 0.5) * 2.5));
    const y = spawnY - row * 8.5 - g.rand() * 2.4;
    const enemy = makeAssaultEnemy(g, x, y, kind === "brute", lane * 2 + column - Math.floor(columns / 2), kind);
    if (kind === "guard"
      && i === plan.runners
      && !g.level.assault?.practice
      && assault.encounter > 0
      && g.level.assault?.slamEvery !== undefined
      && (assault.waves <= 1 || lane === 0)) {
      enemy.braced = true;
    }
    if (kind === "runner" && !g.level.assault?.practice && assault.encounter > 0 && g.level.assault?.slamEvery !== undefined) {
      enemy.breakawayTargetX = counterattackBreakawayTarget(center, lane, x, i);
    }
    g.red.push(enemy);
    spawned++;
  }
  assault.waveSpawned += spawned;
  assault.frontline = Math.max(assault.frontline, spawnY);
  if (start === 0 && spawned > 0) pop(g, center, spawnY - 18, 1, role === "flank" ? "RUNNER RUSH" : role === "shield" ? "SHIELD WAVE" : lane === 0 ? "CENTER WAVE" : lane < 0 ? "LEFT WAVE" : "RIGHT WAVE");
  return spawned;
}

function updateAssaultCounterattack(g: Game, dt: number) {
  const assault = g.assault;
  const config = g.level.assault?.counterattack;
  if (!assault || assault.phase !== "counterattack" || !config || assault.wave >= assault.waves) {
    if (assault) assault.waveWarning = 0;
    return;
  }
  const interval = Math.max(0.65, config.interval ?? 1.4);
  assault.waveTimer -= dt;
  if (assault.waveTimer > 0) {
    assault.waveWarning = Math.max(0, Math.min(1, assault.waveTimer / interval));
    return;
  }
  const deployedLane = counterattackLane(config, assault.wave, assault.encounter);
  spawnCounterattackWave(g, assault.wave);
  if (assault.waveSpawned < counterattackWaveSize(g, assault.wave)) {
    // A preserved battle army can temporarily fill the red cap. Keep the
    // wave pending and deploy its remainder as soon as blue clears space,
    // instead of advancing the wave counter and silently dropping units.
    assault.waveLane = deployedLane;
    assault.waveTimer = 0.25;
    assault.waveWarning = 1;
    refreshAssaultRemaining(g);
    return;
  }
  assault.wave++;
  assault.waveSpawned = 0;
  assault.waveLane = deployedLane;
  if (assault.wave < assault.waves) {
    assault.waveTimer = interval;
    assault.waveWarning = 1;
    assault.waveLane = counterattackLane(config, assault.wave, assault.encounter);
  } else {
    assault.waveTimer = 0;
    assault.waveWarning = 0;
  }
  refreshAssaultRemaining(g);
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
const ASSAULT_TRAVEL_PER_BOSS = 360;
const ASSAULT_RED_CAP = 650;
const ASSAULT_BLUE_SPEED = 98;
const ASSAULT_CHAMP_SPEED = 66;

/**
 * Horizontal spacing shared by the simulation and the renderer's cannon
 * battery. Keeping this in the engine makes a volley originate from the
 * visible barrel that owns it instead of drifting away from the turret.
 */
export const CANNON_BARREL_SPACING = 24;

const CANNON_BARREL_LAYOUTS = [
  [{ x: 0, y: -12 }],
  [{ x: -12, y: -12 }, { x: 12, y: -12 }],
  [{ x: -24, y: -12 }, { x: 0, y: -12 }, { x: 24, y: -12 }],
  [{ x: -24, y: -12 }, { x: 24, y: -12 }, { x: -12, y: 4 }, { x: 12, y: 4 }],
  [{ x: -24, y: -12 }, { x: 0, y: -12 }, { x: 24, y: -12 }, { x: -12, y: 4 }, { x: 12, y: 4 }],
] as const;

/** Logical barrel positions relative to the shared flight-spawn reference. */
export function cannonBarrelPositions(tier: number) {
  const index = Math.max(0, Math.min(CANNON_BARREL_LAYOUTS.length - 1, Math.floor(tier) - 1));
  return CANNON_BARREL_LAYOUTS[index].map((position) => ({ ...position }));
}

export function cannonBarrelOffsets(tier: number) {
  return cannonBarrelPositions(tier).map((position) => position.x);
}

function makeWeaponTarget(weaponLevel: number): WeaponTarget {
  const hp = weaponLevel === 1 ? 14 : 24;
  return { x: 307, y: 510, w: 62, h: 36, hp, maxHp: hp, hitFlash: 0 };
}

function makeCannonTarget(): WeaponTarget {
  const hp = 20;
  return { x: 55, y: 510, w: 58, h: 34, hp, maxHp: hp, hitFlash: 0 };
}

function updateWeaponTarget(g: Game, dt: number) {
  const assault = g.assault!;
  assault.weaponFlash = Math.max(0, assault.weaponFlash - dt * 0.5);
  if (assault.cannonTarget) {
    assault.cannonTarget.hitFlash = Math.max(0, assault.cannonTarget.hitFlash - dt * 7);
  }
  if (assault.weaponTarget) {
    assault.weaponTarget.hitFlash = Math.max(0, assault.weaponTarget.hitFlash - dt * 7);
  } else if (assault.weaponLevel < WEAPONS.length && assault.weaponTargetsEnabled) {
    assault.weaponTargetTimer -= dt;
    if (assault.weaponTargetTimer <= 0) assault.weaponTarget = makeWeaponTarget(assault.weaponLevel);
  }
}

function resolveWeaponTarget(g: Game) {
  const assault = g.assault!, target = assault.weaponTarget;
  if (!target) return;
  for (const unit of g.blue) {
    if (unit.dead || unit.y < target.y - target.h / 2 || unit.y > target.y + target.h / 2 + unit.r || Math.abs(unit.x - target.x) > target.w / 2 + unit.r) continue;
    target.hp = Math.max(0, target.hp - (unit.big ? 5 : 1));
    target.hitFlash = 1;
    unit.dead = true;
    pop(g, unit.x, unit.y, 1);
    if (target.hp === 0) {
      assault.weaponLevel = Math.min(WEAPONS.length, assault.weaponLevel + 1);
      assault.weaponFlash = 1;
      assault.weaponTarget = null;
      assault.weaponTargetTimer = 2.5;
      assault.burstRemaining = 0;
      g.cooldown = 0;
      pop(g, target.x, target.y, 1, "WEAPON UP!");
      break;
    }
  }
}

function resolveCannonTarget(g: Game) {
  const assault = g.assault!;
  const target = assault.cannonTarget;
  if (!target) return;
  for (const unit of g.blue) {
    if (unit.dead || unit.y < target.y - target.h / 2 || unit.y > target.y + target.h / 2 + unit.r || Math.abs(unit.x - target.x) > target.w / 2 + unit.r) continue;
    target.hp = Math.max(0, target.hp - (unit.big ? 5 : 1));
    target.hitFlash = 1;
    unit.dead = true;
    pop(g, unit.x, unit.y, 0);
    if (target.hp === 0) {
      assault.cannonTarget = null;
      pop(g, target.x, target.y, 0, "BREAK!");
      break;
    }
  }
}

function updateAssaultPickups(g: Game, dt: number) {
  const assault = g.assault;
  const config = g.level.assault;
  if (!assault || !config) return;
  const keep: AssaultPickup[] = [];
  for (const pickup of assault.pickups) {
    // Only hold the pickups staged behind the lock. A pickup already below
    // the target may be a player-created/test pickup or a release that has
    // reached the cannon line and must remain collectable.
    const lockBottom = assault.cannonTarget
      ? assault.cannonTarget.y + assault.cannonTarget.h / 2
      : -Infinity;
    if (assault.cannonTarget && pickup.x < 150 && pickup.y < lockBottom) {
      keep.push(pickup);
      continue;
    }
    // The side gate travels toward the cannon's y line while staying in its
    // lane. The player must steer over it; this preserves the blue +1 choice.
    pickup.y += 36 * dt;
    if (pickup.y >= CANNON_Y - 35 && Math.abs(pickup.x - g.cannonX) <= pickup.w / 2 + 15) {
      assault.pickupsCollected++;
      const before = assault.tier;
      assault.tier = Math.max(1, Math.min(5, assault.tier + Math.max(1, pickup.value)));
      if (assault.tier > before) {
        assault.upgradeFlash = 1;
        pop(g, g.cannonX, CANNON_Y - 30, 0, "UPGRADE");
        pop(g, g.cannonX, CANNON_Y - 42, 0, `+${assault.tier - before}`);
      } else {
        // At tier five a campaign pickup is a clear five-point refill. Keep
        // practice's ten-point reward generous while the player learns.
        const refill = config.practice ? 10 : 5;
        g.charge = Math.min(CHARGE_MAX, g.charge + refill);
        pop(g, g.cannonX, CANNON_Y - 30, 0, `+${refill} CHARGE`);
      }
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
  const positions = cannonBarrelPositions(assault.tier);
  const edge = 22 + Math.max(...positions.map((position) => Math.abs(position.x)));
  g.targetX = Math.max(edge, Math.min(W - edge, g.targetX));
  g.cannonX += Math.max(-maxMove, Math.min(maxMove, g.targetX - g.cannonX));
  g.cooldown -= dt;
  if (!g.firing) assault.burstRemaining = 0;
  // Campaign charge is time based so picking up a barrel or weapon never
  // silently makes the champion harder to refill. It also continues while a
  // full crowd is queued at MAX_UNITS.
  if (g.firing && !g.level.assault?.practice) {
    g.charge = Math.min(CHARGE_MAX, g.charge + dt * CAMPAIGN_CHARGE_RATE);
  }
  if (!g.firing || g.cooldown > 0) {
    if (!g.firing) g.cooldown = Math.max(g.cooldown, 0);
    return;
  }
  const weapon = weaponForLevel(assault.weaponLevel);
  if (assault.burstRemaining === 0) assault.burstRemaining = weapon.burst;
  assault.burstRemaining--;
  g.cooldown += assault.burstRemaining > 0 ? weapon.burstGap : weapon.cycle - weapon.burstGap * (weapon.burst - 1);
  if (g.cooldown < 0) g.cooldown = 0;
  const volley = positions.length;
  for (let k = 0; k < volley && g.blue.length < MAX_UNITS; k++) {
    const position = positions[k];
    const x = g.cannonX + position.x + (g.rand() - 0.5) * 0.8;
    const y = CANNON_Y - 22 + position.y;
    const pace = 0.94 + stableMotionVariation(x, y, g.stats.fired + k) * 0.12;
    g.blue.push({ x, y, vx: 0, hp: 1, r: 4.2, big: false, used: 0, dead: false, pace });
    g.stats.fired++;
    assault.barrelShots[k]++;
    if (g.level.assault?.practice) g.charge = Math.min(CHARGE_MAX, g.charge + 1);
  }
}

function updateAssaultGatesAndSpinners(g: Game, dt: number) {
  for (const gt of g.gates) {
    if (gt.move) gt.cx = gt.x + Math.sin(g.t * gt.move.speed + (gt.move.phase ?? 0)) * gt.move.range;
    gt.flash = Math.max(0, gt.flash - dt * 4);
  }
  for (const s of g.spinners) s.angle += s.speed * dt;
}

const ASSAULT_UNIT_SPACING = 8.4;
const ASSAULT_MOTION_CELL = 16;
const ASSAULT_LATERAL_ACCEL = 1400;
const ASSAULT_RED_LATERAL_ACCEL = 520;
const ASSAULT_MAX_NEIGHBOURS = 48;
const ASSAULT_MAX_CELL_SAMPLES = 8;
const ASSAULT_MOTION_COLS = Math.ceil(W / ASSAULT_MOTION_CELL);
const ASSAULT_MOTION_ROWS = Math.ceil((H + ASSAULT_MOTION_CELL) / ASSAULT_MOTION_CELL) + 1;
const ASSAULT_MOTION_SEARCH = 2;
const ASSAULT_MOTION_NEIGHBOUR_COUNT = (ASSAULT_MOTION_SEARCH * 2 + 1) ** 2;
const ASSAULT_MOTION_CELL_COUNT = ASSAULT_MOTION_COLS * ASSAULT_MOTION_ROWS;
// The motion query visits the same bounded 5x5 neighborhood every frame.
// Store valid cell order, hash adjustments, and sampled offsets once so the
// hot path does not redo boundary checks, divisions, or modulo wrapping.
const assaultMotionNeighbourCounts = new Uint8Array(ASSAULT_MOTION_CELL_COUNT);
const assaultMotionNeighbourCells = new Int16Array(ASSAULT_MOTION_CELL_COUNT * ASSAULT_MOTION_NEIGHBOUR_COUNT);
const assaultMotionNeighbourHashAdjust = new Int16Array(assaultMotionNeighbourCells.length);
const ASSAULT_MOTION_SAMPLE_STRIDE = ASSAULT_MAX_CELL_SAMPLES;
const assaultMotionSampleOffsets = new Uint16Array((MAX_UNITS + 1) * ASSAULT_MOTION_SAMPLE_STRIDE);
for (let cellLength = 1; cellLength <= MAX_UNITS; cellLength++) {
  const sampleCount = Math.min(cellLength, ASSAULT_MAX_CELL_SAMPLES);
  const sampleOffset = cellLength * ASSAULT_MOTION_SAMPLE_STRIDE;
  for (let sample = 0; sample < sampleCount; sample++) {
    assaultMotionSampleOffsets[sampleOffset + sample] = Math.floor(sample * cellLength / sampleCount);
  }
}
for (let row = 0; row < ASSAULT_MOTION_ROWS; row++) {
  for (let col = 0; col < ASSAULT_MOTION_COLS; col++) {
    const baseCellIndex = row * ASSAULT_MOTION_COLS + col;
    const baseOffset = baseCellIndex * ASSAULT_MOTION_NEIGHBOUR_COUNT;
    let count = 0;
    for (let dr = -ASSAULT_MOTION_SEARCH; dr <= ASSAULT_MOTION_SEARCH; dr++) {
      const rr = row + dr;
      if (rr < 0 || rr >= ASSAULT_MOTION_ROWS) continue;
      for (let dc = -ASSAULT_MOTION_SEARCH; dc <= ASSAULT_MOTION_SEARCH; dc++) {
        const cc = col + dc;
        if (cc < 0 || cc >= ASSAULT_MOTION_COLS) continue;
        assaultMotionNeighbourCells[baseOffset + count] = rr * ASSAULT_MOTION_COLS + cc;
        assaultMotionNeighbourHashAdjust[baseOffset + count] = dr * 17 + dc * 13;
        count++;
      }
    }
    assaultMotionNeighbourCounts[baseCellIndex] = count;
  }
}
const assaultMotionCells: Array<number[] | undefined> = new Array(ASSAULT_MOTION_COLS * ASSAULT_MOTION_ROWS);
const assaultMotionCellGeneration = new Uint32Array(ASSAULT_MOTION_COLS * ASSAULT_MOTION_ROWS);
let assaultMotionGeneration = 0;
let assaultMotionForward = new Float32Array(MAX_UNITS);
let assaultMotionLateral = new Float32Array(MAX_UNITS);
let assaultMotionUnitRows = new Int16Array(MAX_UNITS);
let assaultMotionUnitCols = new Int16Array(MAX_UNITS);
// Intent refreshes at 30 Hz, while movement, collision, and combat still run
// every 60 Hz. WeakMap identity keys keep eligibility stable across array
// compaction and make a newly created unit refresh on its first observation.
const ASSAULT_MOTION_REFRESH_FRAMES = 2;
type AssaultMotionIntent = {
  forward: number;
  lateral: number;
  direction: -1 | 1;
  nextRefreshFrame: number;
  owner: AssaultState;
};
const assaultMotionIntentCache = new WeakMap<Unit, AssaultMotionIntent>();
const ASSAULT_RED_SPEED_SCALE = 0.85;
const ASSAULT_BOSS_W = 140;
const ASSAULT_CORRIDOR_HALF = 72;
const ASSAULT_BOSS_FLANK_BUFFER = 80;
const ASSAULT_BOSS_PRESSURE_DELAY = 3;
const ASSAULT_BOSS_PRESSURE_SPEED = 12;
const ASSAULT_BOSS_PRESSURE_TRAVEL = 120;
const ASSAULT_COUNTER_TARGET_LATERAL = 90;
const ASSAULT_COUNTER_TARGET_DEPTH = 120;
const ASSAULT_COUNTER_TARGET_ALIGN = 36;
const ASSAULT_COUNTER_FORWARD_RELEASE_DEPTH = 96;
const ASSAULT_COUNTER_REVERSE_DEPTH = ASSAULT_COUNTER_TARGET_DEPTH;
const ASSAULT_COUNTER_TARGET_MAX_CELL_SAMPLES = 8;
const ASSAULT_COUNTER_TARGET_MAX_CANDIDATES = 32;
const ASSAULT_COUNTER_STAGING_GAP = 24;
const ASSAULT_COUNTER_STEER_SPEED = 100;
const ASSAULT_COUNTER_STEER_ACCEL = 240;
const ASSAULT_COUNTER_REVERSE_SPEED = 42;
const ASSAULT_BREAKAWAY_SPEED = 96;
const ASSAULT_BREAKAWAY_ACCEL = 260;
const ASSAULT_RED_REAR_PRESSURE_START = 50;
const ASSAULT_RED_REAR_PRESSURE_END = 200;
const ASSAULT_RED_REAR_CORRIDOR_HALF = 124;
const ASSAULT_COUNTER_TARGET_COLS = COLS;
const ASSAULT_COUNTER_TARGET_ROWS = ROWS;
const assaultCounterTargetCells: Array<Unit[] | undefined> = new Array(ASSAULT_COUNTER_TARGET_COLS * ASSAULT_COUNTER_TARGET_ROWS);
const assaultCounterTargetCellGeneration = new Uint32Array(ASSAULT_COUNTER_TARGET_COLS * ASSAULT_COUNTER_TARGET_ROWS);
const assaultCounterTargetOffsetEntries: Array<{ dr: number; dc: number }> = [];
for (let dr = -Math.ceil(ASSAULT_COUNTER_TARGET_DEPTH / CELL); dr <= Math.ceil(ASSAULT_COUNTER_TARGET_DEPTH / CELL); dr++) {
  for (let dc = -Math.ceil(ASSAULT_COUNTER_TARGET_LATERAL / CELL); dc <= Math.ceil(ASSAULT_COUNTER_TARGET_LATERAL / CELL); dc++) {
    assaultCounterTargetOffsetEntries.push({ dr, dc });
  }
}
assaultCounterTargetOffsetEntries.sort((a, b) => {
  const distanceA = a.dr * a.dr + a.dc * a.dc;
  const distanceB = b.dr * b.dr + b.dc * b.dc;
  return distanceA - distanceB || a.dr - b.dr || a.dc - b.dc;
});
// Keep the exact nearest-cell order above, but use flat typed arrays in the
// hot query. This removes object property accesses from each of the 99
// candidate cells examined by a survivor.
const assaultCounterTargetOffsetRows = new Int8Array(assaultCounterTargetOffsetEntries.length);
const assaultCounterTargetOffsetCols = new Int8Array(assaultCounterTargetOffsetEntries.length);
const assaultCounterTargetOffsetDeltas = new Int16Array(assaultCounterTargetOffsetEntries.length);
const assaultCounterOccupiedOffsets: Array<number[] | undefined> = new Array(ASSAULT_COUNTER_TARGET_COLS * ASSAULT_COUNTER_TARGET_ROWS);
const assaultCounterOccupiedGeneration = new Uint32Array(ASSAULT_COUNTER_TARGET_COLS * ASSAULT_COUNTER_TARGET_ROWS);
for (let i = 0; i < assaultCounterTargetOffsetEntries.length; i++) {
  const { dr, dc } = assaultCounterTargetOffsetEntries[i];
  assaultCounterTargetOffsetRows[i] = dr;
  assaultCounterTargetOffsetCols[i] = dc;
  assaultCounterTargetOffsetDeltas[i] = dr * ASSAULT_COUNTER_TARGET_COLS + dc;
}
let assaultCounterTargetGeneration = 0;
let assaultCounterTargetCount = 0;
let assaultCounterTargetMinX = Infinity;
let assaultCounterTargetMaxX = -Infinity;
let assaultCounterTargetMinY = Infinity;
let assaultCounterTargetMaxY = -Infinity;

/**
 * Indexes living red units for a counterattack-local query. The index is
 * rebuilt once before the blue pass, then reused by every survivor in that
 * pass. Generation stamps keep old cell contents out without clearing the
 * whole grid every frame, including after the uint32 generation wraps.
 */
function prepareAssaultCounterattackTargets(units: Unit[]) {
  assaultCounterTargetGeneration = (assaultCounterTargetGeneration + 1) >>> 0;
  if (assaultCounterTargetGeneration === 0) {
    assaultCounterTargetCellGeneration.fill(0);
    assaultCounterOccupiedGeneration.fill(0);
    assaultCounterTargetGeneration = 1;
  }
  assaultCounterTargetCount = 0;
  assaultCounterTargetMinX = Infinity;
  assaultCounterTargetMaxX = -Infinity;
  assaultCounterTargetMinY = Infinity;
  assaultCounterTargetMaxY = -Infinity;
  for (let i = 0; i < units.length; i++) {
    const unit = units[i];
    if (unit.dead) continue;
    if (unit.x < assaultCounterTargetMinX) assaultCounterTargetMinX = unit.x;
    if (unit.x > assaultCounterTargetMaxX) assaultCounterTargetMaxX = unit.x;
    if (unit.y < assaultCounterTargetMinY) assaultCounterTargetMinY = unit.y;
    if (unit.y > assaultCounterTargetMaxY) assaultCounterTargetMaxY = unit.y;
    const col = Math.max(0, Math.min(ASSAULT_COUNTER_TARGET_COLS - 1, Math.floor(unit.x / CELL)));
    const row = Math.max(0, Math.min(ASSAULT_COUNTER_TARGET_ROWS - 1, Math.floor((unit.y + CELL) / CELL)));
    const cellIndex = row * ASSAULT_COUNTER_TARGET_COLS + col;
    let cell = assaultCounterTargetCells[cellIndex];
    if (assaultCounterTargetCellGeneration[cellIndex] !== assaultCounterTargetGeneration) {
      if (!cell) {
        cell = [];
        assaultCounterTargetCells[cellIndex] = cell;
      } else {
        cell.length = 0;
      }
      assaultCounterTargetCellGeneration[cellIndex] = assaultCounterTargetGeneration;
    }
    cell!.push(unit);
    assaultCounterTargetCount++;
  }
}

function nearestAssaultCounterattackTarget(unit: Unit) {
  if (assaultCounterTargetCount === 0) return null;
  const unitX = unit.x;
  const unitY = unit.y;
  const col = Math.max(0, Math.min(ASSAULT_COUNTER_TARGET_COLS - 1, Math.floor(unitX / CELL)));
  const row = Math.max(0, Math.min(ASSAULT_COUNTER_TARGET_ROWS - 1, Math.floor((unitY + CELL) / CELL)));
  const baseCellIndex = row * ASSAULT_COUNTER_TARGET_COLS + col;
  // Survivors in the same grid cell share the occupied neighbour cells for
  // this red pass. Preserve the exact offset order and per-unit samples, but
  // avoid probing the same 99 mostly empty cells for every nearby runner.
  let occupied = assaultCounterOccupiedOffsets[baseCellIndex];
  if (!occupied || assaultCounterOccupiedGeneration[baseCellIndex] !== assaultCounterTargetGeneration) {
    if (!occupied) occupied = assaultCounterOccupiedOffsets[baseCellIndex] = [];
    occupied.length = 0;
    for (let offset = 0; offset < assaultCounterTargetOffsetRows.length; offset++) {
      const rr = row + assaultCounterTargetOffsetRows[offset];
      const cc = col + assaultCounterTargetOffsetCols[offset];
      if (rr < 0 || rr >= ASSAULT_COUNTER_TARGET_ROWS || cc < 0 || cc >= ASSAULT_COUNTER_TARGET_COLS) continue;
      const cellIndex = baseCellIndex + assaultCounterTargetOffsetDeltas[offset];
      if (assaultCounterTargetCellGeneration[cellIndex] === assaultCounterTargetGeneration
        && assaultCounterTargetCells[cellIndex]?.length) occupied.push(offset);
    }
    assaultCounterOccupiedGeneration[baseCellIndex] = assaultCounterTargetGeneration;
  }
  // This hash is stable for the whole query. Hoisting it out of the nonempty
  // cell loop preserves the original sample order without recomputing the
  // same unit coordinates up to 99 times.
  const sampleHash = Math.floor(unitX) * 17 + Math.floor(unitY) * 13 + row * 7 + col * 5;
  let best: Unit | null = null;
  let bestDistance = Infinity;
  let inspected = 0;
  for (const offsetIndex of occupied) {
    const dr = assaultCounterTargetOffsetRows[offsetIndex];
    const rr = row + dr;
    if (rr < 0 || rr >= ASSAULT_COUNTER_TARGET_ROWS) continue;
    const dc = assaultCounterTargetOffsetCols[offsetIndex];
    const cc = col + dc;
    if (cc < 0 || cc >= ASSAULT_COUNTER_TARGET_COLS) continue;
    const cellIndex = baseCellIndex + assaultCounterTargetOffsetDeltas[offsetIndex];
    if (assaultCounterTargetCellGeneration[cellIndex] !== assaultCounterTargetGeneration) continue;
    const cell = assaultCounterTargetCells[cellIndex];
    if (!cell || cell.length === 0) continue;
    const sampleCount = Math.min(cell.length, ASSAULT_COUNTER_TARGET_MAX_CELL_SAMPLES);
    const sampleStart = cell.length > 1
      ? ((sampleHash + dr * 7 + dc * 5) % cell.length + cell.length) % cell.length
      : 0;
    for (let sample = 0; sample < sampleCount; sample++) {
      if (inspected >= ASSAULT_COUNTER_TARGET_MAX_CANDIDATES) return best;
      inspected++;
      const sampleOffset = Math.floor(sample * cell.length / sampleCount);
      const target = cell[(sampleStart + sampleOffset) % cell.length];
      if (!target || target.dead) continue;
      const dx = target.x - unitX;
      const dy = target.y - unitY;
      if (Math.abs(dx) > ASSAULT_COUNTER_TARGET_LATERAL || Math.abs(dy) > ASSAULT_COUNTER_TARGET_DEPTH) continue;
      const distance = dx * dx + dy * dy;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = target;
      }
    }
  }
  return best;
}

/** Applies bounded lateral intent while preserving the runner's forward path. */
function applyAssaultCounterattackGuidance(u: Unit, target: Unit, dt: number) {
  const desired = Math.max(-ASSAULT_COUNTER_STEER_SPEED, Math.min(ASSAULT_COUNTER_STEER_SPEED, (target.x - u.x) * 3.2));
  const current = u.vx;
  const maxDelta = ASSAULT_COUNTER_STEER_ACCEL * dt;
  u.vx = current + Math.max(-maxDelta, Math.min(maxDelta, desired - current));
}

/** Gives late counterattack runners a small, committed sidestep toward their own flank. */
function applyAssaultRunnerBreakaway(u: Unit, dt: number) {
  if (u.breakawayTargetX === undefined) return;
  const offset = u.breakawayTargetX - u.x;
  const desired = Math.max(-ASSAULT_BREAKAWAY_SPEED, Math.min(ASSAULT_BREAKAWAY_SPEED, offset * 2.4));
  const maxDelta = ASSAULT_BREAKAWAY_ACCEL * dt;
  u.vx += Math.max(-maxDelta, Math.min(maxDelta, desired - u.vx));
}

/**
 * Keeps a crowd flowing toward the next visible panel after it has crossed a
 * previous one. This replaces the old always-on pull toward the boss centre:
 * a side route now bends because there is an actual panel there, rather than
 * because an invisible corridor magnet changed the player's launch decision.
 */
function applyAssaultGateGuidance(u: Unit, targetX: number, targetW: number, dt: number) {
  const safeHalf = Math.max(18, targetW / 2 - u.r - 12);
  const offset = targetX - u.x;
  if (Math.abs(offset) <= safeHalf) return;
  const desired = Math.max(-150, Math.min(150, offset * 3.1));
  u.vx += (desired - u.vx) * Math.min(1, dt * 4.5);
}

/** Enemy formations still converge on the active giant's visible footprint. */
function applyAssaultCorridorPressure(u: Unit, centerX: number, dt: number, corridorHalf = ASSAULT_CORRIDOR_HALF) {
  const half = Math.max(20, corridorHalf - u.r);
  const offset = u.x - centerX;
  const penetration = Math.abs(offset) - half;
  if (penetration <= 0) return;
  const towardCenter = offset < 0 ? 1 : -1;
  if (u.vx * towardCenter < 0) u.vx *= Math.exp(-10 * dt);
  u.vx += towardCenter * Math.min(10000, penetration * 180) * dt;
}

function updateAssaultBossPressure(g: Game, dt: number) {
  const assault = g.assault!;
  if (g.level.assault?.practice || assault.phase !== "battle") return;
  const active = g.bases[assault.encounter];
  if (!active || active.hp <= 0) return;
  assault.bossTime += dt;
  if (assault.bossTime <= ASSAULT_BOSS_PRESSURE_DELAY) return;
  // A live front holds the giant in place. Advancing through engaged runners
  // leaves them stranded behind their target and makes the battle slide.
  if (g.blue.some((u) => !u.dead
    && Math.abs(u.x - active.x) <= active.w / 2 + u.r
    && u.y >= active.y - active.h / 2 - u.r - 0.5
    && u.y <= active.y + active.h / 2 + u.r + 0.5)) return;
  const limit = assault.bossOriginY + ASSAULT_BOSS_PRESSURE_TRAVEL;
  active.y = Math.min(limit, active.y + ASSAULT_BOSS_PRESSURE_SPEED * dt);
}

/**
 * Lets a living campaign boss break a multiplier panel after its front reaches
 * the panel's logical line. The gate stays in the array and keeps its bit
 * index; runners that cross it afterward simply mark it used without creating
 * another wave. Practice and horde-free fixtures retain the original route.
 */
function updateAssaultGateOverruns(g: Game) {
  const assault = g.assault;
  const config = g.level.assault;
  if (!assault || !config || config.practice || assault.horde <= 0 || assault.phase !== "battle") return;
  const active = g.bases[assault.encounter];
  if (!active || active.hp <= 0) return;
  const bossFront = active.y + active.h / 2;
  for (const gate of g.gates) {
    if (gate.overrun || bossFront < gate.y) continue;
    gate.overrun = true;
    gate.flash = 1;
    pop(g, gate.cx, gate.y, 1, "GATE DOWN");
  }
}

/**
 * Returns a soft forward-speed limit from actual nearby neighbours.
 *
 * The old implementation sorted fixed x-columns and assigned a hard y slot,
 * which made runners form regimented lanes and freeze in a vertical slab. A
 * spatial grid keeps this bounded at the unit cap while allowing a crowded
 * runner to slow briefly, drift around the neighbour, and resume its own
 * pace. `forwardDirection` keeps the same pass correct for blue (-y) and red
 * (+y) formations. No position is edited here, so the result cannot move a
 * unit backward.
 */
function assaultMotionPhase(unit: Unit, forwardDirection: -1 | 1) {
  // The initial stagger is derived from stable spawn properties instead of a
  // process-global counter. This keeps the same unit on the same phase when a
  // separate game is simulated before this one, including when a Unit object
  // is deliberately reused by a fixture.
  const seed = Math.floor(unit.x * 17)
    + Math.floor(unit.y * 13)
    + Math.floor((unit.pace ?? 1) * 100)
    + Math.floor((unit.lane ?? 0) * 7)
    + (unit.big ? 11 : 0)
    + (unit.kind === "guard" ? 3 : unit.kind === "brute" ? 5 : 0)
    + (forwardDirection === -1 ? 0 : 1);
  return seed & 1;
}

function assaultForwardSlots(units: Unit[], forwardDirection: -1 | 1, owner: AssaultState) {
  if (units.length > assaultMotionForward.length) {
    const size = Math.max(units.length, assaultMotionForward.length * 2);
    assaultMotionForward = new Float32Array(size);
    assaultMotionLateral = new Float32Array(size);
    assaultMotionUnitRows = new Int16Array(size);
    assaultMotionUnitCols = new Int16Array(size);
  }
  const frame = owner.motionFrame;
  let refresh = false;
  for (let i = 0; i < units.length; i++) {
    const unit = units[i];
    if (unit.dead) continue;
    const intent = assaultMotionIntentCache.get(unit);
    if (!intent || intent.owner !== owner || intent.direction !== forwardDirection || intent.nextRefreshFrame <= frame) {
      refresh = true;
      break;
    }
    assaultMotionForward[i] = intent.forward;
    assaultMotionLateral[i] = intent.lateral;
  }
  if (!refresh) return { forward: assaultMotionForward, lateral: assaultMotionLateral };

  assaultMotionGeneration = (assaultMotionGeneration + 1) >>> 0;
  if (assaultMotionGeneration === 0) {
    assaultMotionCellGeneration.fill(0);
    assaultMotionGeneration = 1;
  }
  const generation = assaultMotionGeneration;
  const cells = assaultMotionCells;
  const cellGeneration = assaultMotionCellGeneration;
  const motionCols = ASSAULT_MOTION_COLS;

  for (let i = 0; i < units.length; i++) {
    const unit = units[i];
    if (unit.dead) continue;
    const col = Math.max(0, Math.min(ASSAULT_MOTION_COLS - 1, Math.floor(unit.x / ASSAULT_MOTION_CELL)));
    const row = Math.max(0, Math.min(ASSAULT_MOTION_ROWS - 1, Math.floor((unit.y + ASSAULT_MOTION_CELL) / ASSAULT_MOTION_CELL)));
    const cellIndex = row * motionCols + col;
    assaultMotionUnitRows[i] = row;
    assaultMotionUnitCols[i] = col;
    let cell = cells[cellIndex];
    if (cellGeneration[cellIndex] !== generation) {
      if (!cell) {
        cell = [];
        cells[cellIndex] = cell;
      } else {
        cell.length = 0;
      }
      cellGeneration[cellIndex] = generation;
    }
    cell!.push(i);
  }

  const verticalReach = ASSAULT_UNIT_SPACING + 4.5;
  const direction = forwardDirection;
  for (let i = 0; i < units.length; i++) {
    const unit = units[i];
    if (unit.dead) continue;
    const cachedIntent = assaultMotionIntentCache.get(unit);
    if (cachedIntent
      && cachedIntent.owner === owner
      && cachedIntent.direction === forwardDirection
      && cachedIntent.nextRefreshFrame > frame) {
      assaultMotionForward[i] = cachedIntent.forward;
      assaultMotionLateral[i] = cachedIntent.lateral;
      continue;
    }
    const unitX = unit.x;
    const unitY = unit.y;
    const unitRadius = unit.r;
    const col = assaultMotionUnitCols[i];
    const row = assaultMotionUnitRows[i];
    const baseCellIndex = row * motionCols + col;
    const sampleHash = i * 31 + row * 17 + col * 13;
    const neighbourStart = baseCellIndex * ASSAULT_MOTION_NEIGHBOUR_COUNT;
    const neighbourCellCount = assaultMotionNeighbourCounts[baseCellIndex];
    let limit = 1;
    let sideForce = 0;
    let neighbourCount = 0;
    let inspected = 0;
    neighbourSearch: for (let offsetIndex = 0; offsetIndex < neighbourCellCount; offsetIndex++) {
      const neighbourOffset = neighbourStart + offsetIndex;
      const cellIndex = assaultMotionNeighbourCells[neighbourOffset];
      if (cellGeneration[cellIndex] !== generation) continue;
      const cell = cells[cellIndex];
      if (!cell || cell.length === 0) continue;
      // Dense multiplication can put hundreds of units in one cell. Sample
      // evenly and cap the total work per runner instead of reopening a
      // quadratic all-pairs pass.
      const cellLength = cell.length;
      const sampleCount = Math.min(cellLength, ASSAULT_MAX_CELL_SAMPLES);
      const sampleStart = sampleCount > 1
        ? ((sampleHash + assaultMotionNeighbourHashAdjust[neighbourOffset]) % cellLength + cellLength) % cellLength
        : 0;
      for (let sample = 0; sample < sampleCount; sample++) {
        if (inspected >= ASSAULT_MAX_NEIGHBOURS) break neighbourSearch;
        inspected++;
        const sampleOffset = cellLength <= MAX_UNITS
          ? assaultMotionSampleOffsets[cellLength * ASSAULT_MOTION_SAMPLE_STRIDE + sample]
          : Math.floor(sample * cellLength / sampleCount);
        const sampleIndex = sampleStart + sampleOffset;
        const otherIndex = cell[sampleIndex < cellLength ? sampleIndex : sampleIndex - cellLength];
        if (otherIndex === i) continue;
        const other = units[otherIndex];
        if (!other || other.dead) continue;
        const signedDx = unitX - other.x;
        const verticalGap = unitY - other.y;
        const lateralReach = unitRadius + other.r + 12;
        const absDx = Math.abs(signedDx);
        const absDy = Math.abs(verticalGap);
        if (absDx > lateralReach || absDy > verticalReach) continue;
        const forwardGap = (other.y - unitY) * direction;
        const lateralRatio = absDx / lateralReach;
        const verticalRatio = absDy / verticalReach;
        const distance = Math.sqrt(lateralRatio * lateralRatio + verticalRatio * verticalRatio);
        if (distance >= 1) continue;

        const proximity = 1 - distance;
        neighbourCount++;
        const side = absDx > 0.15 ? Math.sign(signedDx) : i < otherIndex ? -1 : 1;
        sideForce += side * proximity;

        // A neighbour at the same y is also a forward blockage: the crowd
        // must first open a lateral gap before those runners can advance.
        if (forwardGap >= -0.5) {
          const lateralOverlap = Math.max(0, 1 - absDx / lateralReach);
          const gapOverlap = Math.max(0, 1 - Math.max(0, forwardGap) / verticalReach);
          // Leave enough motion for the lateral flow to open a gap. A hard
          // zero here recreates the old stationary queue at the boss edge.
          limit = Math.min(limit, 1 - lateralOverlap * gapOverlap * 0.96);
        }
      }
    }
    assaultMotionForward[i] = Math.max(0, limit);
    // A lone pair should drift apart gently; reserve the stronger impulse for
    // an actually compressed wave where several neighbours compete for the
    // same space. This keeps boss slams readable while opening dense rows.
    const crowdFactor = Math.min(1, neighbourCount / 6);
    const lateral = Math.max(-2.2, Math.min(2.2, sideForce)) * ASSAULT_LATERAL_ACCEL * crowdFactor;
    assaultMotionLateral[i] = lateral;
    const sameOwner = cachedIntent?.owner === owner && cachedIntent.direction === forwardDirection;
    if (sameOwner) {
      cachedIntent.forward = assaultMotionForward[i];
      cachedIntent.lateral = lateral;
      cachedIntent.direction = forwardDirection;
      cachedIntent.owner = owner;
      cachedIntent.nextRefreshFrame = frame + ASSAULT_MOTION_REFRESH_FRAMES;
    } else {
      // The first pass is immediate for every new identity. Its next refresh
      // gets a stable one-frame phase so initial crowds and later spawns do
      // not all create the same-frame physics spike.
      const firstGap = 1 + assaultMotionPhase(unit, forwardDirection);
      if (cachedIntent) {
        cachedIntent.forward = assaultMotionForward[i];
        cachedIntent.lateral = lateral;
        cachedIntent.direction = forwardDirection;
        cachedIntent.owner = owner;
        cachedIntent.nextRefreshFrame = frame + firstGap;
      } else {
        assaultMotionIntentCache.set(unit, {
          forward: assaultMotionForward[i],
          lateral,
          direction: forwardDirection,
          nextRefreshFrame: frame + firstGap,
          owner,
        });
      }
    }
  }
  return { forward: assaultMotionForward, lateral: assaultMotionLateral };
}

/** Applies one frame of a live boss-slam tail after ordinary crowd motion. */
function applyAssaultBossSlamRecoil(g: Game, u: Unit, dt: number, state = activeBossSlamRecoilState(g, u)) {
  if (!state || u.dead) return;
  const assault = g.assault!;
  // The initial kick is intentionally visible for a complete frame. Starting
  // the tail on the next frame preserves the old >=8px one-step slam motion.
  if (assault.motionFrame <= state.startFrame) return;
  const available = ASSAULT_BOSS_SLAM_DURATION - state.elapsed;
  if (available <= 0) {
    bossSlamRecoilStates.delete(u);
    return;
  }
  const slice = Math.min(Math.max(0, dt), available);
  if (slice <= 0) return;
  const nextElapsed = state.elapsed + slice;
  const startEnvelope = Math.exp(-ASSAULT_BOSS_SLAM_DECAY * state.elapsed);
  const endEnvelope = Math.exp(-ASSAULT_BOSS_SLAM_DECAY * nextElapsed);
  const dy = state.extra * (startEnvelope - endEnvelope) / ASSAULT_BOSS_SLAM_DECAY_NORMALIZER;
  if (dy > 0) {
    // `move` owns walls and horizontal bounds. A zero horizontal timestep keeps
    // recoil from replaying ordinary vx motion when it is applied after the
    // forward pass. Clamp the vertical request at the cannon line as well.
    const maxY = CANNON_Y - u.r - 2;
    const boundedDy = Math.max(0, Math.min(dy, maxY - u.y));
    if (boundedDy > 0) move(g, u, boundedDy, 0);
  }
  state.elapsed = nextElapsed;
  if (state.elapsed >= ASSAULT_BOSS_SLAM_DURATION) bossSlamRecoilStates.delete(u);
}

function updateAssaultBlue(g: Game, dt: number) {
  const assault = g.assault!;
  const active = g.bases[assault.encounter];
  const spawned: Unit[] = [];
  if (assault.phase === "counterattack") prepareAssaultCounterattackTargets(g.red);
  const assaultMotion = assaultForwardSlots(g.blue, -1, assault);
  const lastGateY = g.gates.length ? Math.min(...g.gates.map((gate) => gate.y)) : active.y + active.h / 2 + 48;
  let counterApproachY = Infinity;
  if (assault.phase === "counterattack") {
    for (const gate of g.gates) if (!gate.overrun) counterApproachY = Math.min(counterApproachY, gate.y - GATE_H);
    if (!Number.isFinite(counterApproachY)) counterApproachY = active.y + active.h / 2 + ASSAULT_COUNTER_STAGING_GAP;
  }
  const trackedGateCount = Math.min(30, g.gates.length);
  const allGatesMask = trackedGateCount > 0 ? (1 << trackedGateCount) - 1 : 0;
  for (let blueIndex = 0; blueIndex < g.blue.length; blueIndex++) {
    const u = g.blue[blueIndex];
    if (u.dead) continue;

    // A runner's x position is its launch decision. Once the shot leaves the
    // cannon, changing the cannon target must not bend that runner's path; the
    // previous target-following code made every in-flight unit swing toward the
    // latest pointer position and made the controls feel like remote steering.
    const lane = Math.max(-4, Math.min(4, u.lane ?? 0));
    const selectedGuard = u.big ? championTargets.get(u) : null;
    const championTarget = selectedGuard && !selectedGuard.dead && selectedGuard.braced ? selectedGuard : null;
    const guidedChampion = championTarget && Math.abs(championTarget.x - u.x) <= ASSAULT_COUNTER_TARGET_LATERAL
      && Math.abs(championTarget.y - u.y) <= ASSAULT_COUNTER_TARGET_DEPTH;
    const crossedFirstGate = !championTarget && assault.phase === "battle" && g.gates.some((_, gateIndex) => (u.used & (1 << gateIndex)) !== 0);
    // Before the first actual gate, keep the launch decision readable. Once a
    // runner has crossed a panel, guide it only toward the next panel that is
    // visibly ahead. Panels sharing one y coordinate are a genuine branch;
    // they are skipped here so a left choice cannot be magnetised into the
    // other branch before it has even cleared the split.
    u.vx *= Math.exp(-3 * dt);
    const lateralScale = crossedFirstGate ? 1 : 0.2;
    const lateralCap = 420;
    u.vx = Math.max(-lateralCap, Math.min(lateralCap, u.vx + assaultMotion.lateral[blueIndex] * lateralScale * dt));
    if (crossedFirstGate) {
      // A branch stores its panels in authored left/right order, so a plain
      // array find can accidentally pull a right-lane runner toward the first
      // left panel in the next row. Resolve the nearest row first, then choose
      // the closest live multiplier within that row. Trap/overrun panels are
      // intentionally excluded: guidance must never steer into a hazard or a
      // panel the boss has already broken.
      let nextGate: Gate | null = null;
      let nextRowY = -Infinity;
      let nextDistance = Infinity;
      for (let gateIndex = 0; gateIndex < g.gates.length; gateIndex++) {
        const gate = g.gates[gateIndex];
        if (u.used & (1 << gateIndex) || gate.kind !== "x" || gate.overrun) continue;
        if (gate.y >= u.y - GATE_H * 0.5) continue;
        if (gate.y > nextRowY + 0.001) {
          nextGate = gate;
          nextRowY = gate.y;
          nextDistance = Math.abs(gate.cx - u.x);
        } else if (Math.abs(gate.y - nextRowY) <= 0.001) {
          const distance = Math.abs(gate.cx - u.x);
          if (distance < nextDistance) {
            nextGate = gate;
            nextDistance = distance;
          }
        }
      }
      if (nextGate) {
        applyAssaultGateGuidance(u, nextGate.cx, nextGate.w, dt);
      } else if (g.gates.every((gate, gateIndex) => (u.used & (1 << gateIndex)) !== 0)) {
        // Once a runner has cleared the authored route, the living boss is
        // the visible destination. A restrained footprint pull keeps the
        // broad center route cohesive without steering between panels.
        applyAssaultCorridorPressure(u, active.x, dt);
      }
    }
    let dy = -(u.big ? ASSAULT_CHAMP_SPEED : ASSAULT_BLUE_SPEED) * dt
      * assaultMotion.forward[blueIndex] * (u.pace ?? 1);

    // After the final gate there is a short, explicit boss approach. This is
    // the only deliberate attraction in the assault path, and keeps a missed
    // lane from leaking past the giant while leaving the gate choices under
    // direct player control. The lane offset is deliberately small so the
    // front still reads as a broad crowd rather than nine homing streams.
    // If the boss has advanced below the last gate, start the flank turn ahead
    // of its front so a side launch still has room to reach the footprint.
    // Before that pressure arrives, the last gate line remains the approach
    // boundary and side shots keep their chosen channel.
    const bossFlankLine = Math.max(lastGateY - GATE_H, active.y + active.h / 2 + ASSAULT_BOSS_FLANK_BUFFER);
    const passedFinalGate = assault.phase === "battle" && (u.y <= bossFlankLine || (allGatesMask !== 0 && (u.used & allGatesMask) === allGatesMask));
    // Begin the flank turn as soon as the runner clears the last gate line.
    // Waiting until the boss's current y made side launches pass its entire
    // footprint before their lateral velocity had time to reach the flank.
    if (passedFinalGate && !championTarget) {
      // Keep a runner's own lane while it is already over the fortress. Only
      // steer a missed shot back to the nearest edge of the boss footprint;
      // pulling every survivor toward the centre creates a single broad row
      // at the collision plane when a multiplied wave arrives together.
      // Aim a few logical units inside the footprint so floating-point
      // settling cannot leave a side launch parked exactly on the miss edge.
      const bossHalf = Math.max(0, active.w / 2 + u.r - 4);
      const offsetFromBoss = u.x - active.x;
      const desiredX = Math.abs(offsetFromBoss) > bossHalf
        ? active.x + Math.sign(offsetFromBoss) * bossHalf
        : u.x + lane * 0.25;
      const missedFlank = Math.abs(offsetFromBoss) > bossHalf;
      const want = Math.max(-180, Math.min(180, (desiredX - u.x) * (missedFlank ? 3.4 : 2.4)));
      u.vx += (want - u.vx) * Math.min(1, dt * (missedFlank ? 9 : 4.5));
    }

    // A counterattack is a local reversal around the defeated giant, not a
    // new destination for every runner on the board. Preserve a shot's launch
    // direction until this same final approach line, then give only nearby
    // surviving runners a bounded lateral reaction to a live red unit. The
    // depth cap includes reds just behind a runner, so a flank can engage as
    // its wave arrives without steering toward a distant army.
    // Only a deliberately aligned champion can correct toward its selected
    // moving guard before the final approach. Fresh ordinary shots keep their
    // launch lane, and shield damage still requires the normal contact test.
    if (guidedChampion) applyAssaultCounterattackGuidance(u, championTarget, dt);
    const commitment = assault.phase === "counterattack" ? counterCommitments.get(u) : null;
    const alreadyCommitted = commitment?.owner === assault && commitment.encounter === assault.encounter;
    const passedCounterattackLine = assault.phase === "counterattack"
      && (alreadyCommitted || u.y <= counterApproachY || (allGatesMask !== 0 && (u.used & allGatesMask) === allGatesMask));
    if (passedCounterattackLine) {
      // Crossing the final approach commits this survivor to the current
      // fight. Turning back across that line must not turn it into a fresh
      // forward-only shot again; that feedback pinned whole rows to the gate.
      if (!alreadyCommitted) counterCommitments.set(u, { owner: assault, encounter: assault.encounter });
      // A red outside the global expanded bounding box cannot be a local
      // target. This exact rejection avoids the 99-cell query for staged
      // survivors that are still far from the incoming wave.
      const hasNearbyRed = assaultCounterTargetCount > 0
        && u.x >= assaultCounterTargetMinX - ASSAULT_COUNTER_TARGET_LATERAL
        && u.x <= assaultCounterTargetMaxX + ASSAULT_COUNTER_TARGET_LATERAL
        && u.y >= assaultCounterTargetMinY - ASSAULT_COUNTER_TARGET_DEPTH
        && u.y <= assaultCounterTargetMaxY + ASSAULT_COUNTER_TARGET_DEPTH;
      const target = guidedChampion ? championTarget : hasNearbyRed ? nearestAssaultCounterattackTarget(u) : null;
      if (target && !guidedChampion) applyAssaultCounterattackGuidance(u, target, dt);

      const targetDepth = target ? target.y - u.y : 0;

      // Stop at a staging line just above the defeated boss's old front when
      // there is no close engagement. Runners already beyond the line are
      // never repositioned backward unless a bounded, aligned red target asks
      // them to turn and meet a nearby unit behind them. A close target ahead
      // also releases the line so the survivor can close the engagement.
      // Stable personal arrival depths keep a waiting crowd from snapping into
      // one ruler-straight row. Existing pace variation survives gate copies.
      const arrivalOffset = Math.max(-1, Math.min(1, ((u.pace ?? 1) - 1) / 0.1)) * 18;
      const stagingY = active.y + active.h / 2 + ASSAULT_COUNTER_STAGING_GAP + arrivalOffset;
      const targetAligned = target !== null
        && Math.abs(target.x - u.x) <= ASSAULT_COUNTER_TARGET_ALIGN;
      const targetCanReverse = targetAligned && targetDepth > 0 && targetDepth <= ASSAULT_COUNTER_REVERSE_DEPTH;
      const targetCanAdvance = targetAligned && targetDepth <= 0 && targetDepth >= -ASSAULT_COUNTER_FORWARD_RELEASE_DEPTH;
      if (targetCanReverse) {
        // A nearby red that has already passed the survivor is behind it in
        // logical road space. Turn back at a low bounded speed. This is a
        // physical step on the next frame, never a position rewrite.
        dy = Math.min(ASSAULT_COUNTER_REVERSE_SPEED, Math.max(18, targetDepth * 2.4)) * dt;
      } else if (!targetCanAdvance) {
        if (u.y <= stagingY) dy = 0;
        else dy = Math.max(dy, -(u.y - stagingY) * Math.min(1, dt * 5));
      }
    }

    if (guidedChampion) {
      // Ease into contact while correcting sideways, rather than running past
      // a drifting guard and waiting for the distant gate line to turn back.
      dy = Math.max(-ASSAULT_CHAMP_SPEED, Math.min(ASSAULT_CHAMP_SPEED, (championTarget.y - u.y) * 4)) * dt;
    }

    // Stop at the living boss's front edge before moving. This preserves a
    // unit's forward-only motion; the old post-move correction snapped runners
    // backward into a queue every frame, which looked like a sticky conveyor.
    if (!g.level.assault?.practice && active.hp > 0) {
      const front = active.y + active.h / 2 + u.r;
      const inBossLane = Math.abs(u.x - active.x) < active.w / 2 + u.r;
      const withinBossHitbox = u.y >= active.y - active.h / 2 - u.r;
      if (inBossLane && withinBossHitbox) {
        if (u.y > front) dy = -Math.min(-dy, u.y - front);
        else dy = 0;
      }
    }
    const activeSlamRecoil = activeBossSlamRecoilState(g, u);
    // The recoil is a visible reversal in world space. Hold only ordinary
    // forward travel while its positive tail is active; lateral flow and the
    // collision-aware recoil move still run normally. Forward travel resumes
    // on the first frame after the state expires.
    if (activeSlamRecoil && dy < 0) dy = 0;
    const prevY = u.y;
    move(g, u, dy, dt);

    for (let i = 0; i < g.gates.length; i++) {
      const gt = g.gates[i];
      if (u.used & (1 << i)) continue;
      if (prevY < gt.y || u.y > gt.y || Math.abs(u.x - gt.cx) > gt.w / 2) continue;
      u.used |= 1 << i;
      gt.flash = 1;
      if (gt.overrun) continue;
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
        // Copies enter just behind the parent. Their small stable pace offset
        // and actual-neighbour flow create a loose wave without birth slots.
        const pace = 0.9 + stableMotionVariation(x, u.y, k + g.stats.multiplied) * 0.2;
        spawned.push({ x, y: Math.min(CANNON_Y - 24, u.y + 4 + row * 5 + g.rand() * 2), vx: side * (u.big ? 28 : 18), hp: 1, r: 4.2, big: false, used: u.used, dead: false, pace });
        g.stats.multiplied++;
      }
    }
    applyAssaultBossSlamRecoil(g, u, dt, activeSlamRecoil);
    if (u.dead) continue;
    if (!u.big && hitsSpinner(g, u)) {
      u.dead = true;
      pop(g, u.x, u.y, 0);
      continue;
    }
    if (g.level.assault?.practice && active) {
      // The immortal training target absorbs completed shots. Letting them
      // run through it filled the lesson panel with an offscreen crowd.
      const atTarget = u.y <= active.y + active.h / 2 + u.r
        && Math.abs(u.x - active.x) <= active.w / 2 + u.r;
      if (atTarget) {
        active.hitFlash = Math.max(active.hitFlash, 0.35);
        u.dead = true;
      } else if (u.y < active.y - active.h / 2 - 10) u.dead = true;
    } else if (u.y < -10) u.dead = true;
  }
  for (const u of spawned) g.blue.push(u);
}

function updateAssaultRed(g: Game, dt: number) {
  const assault = g.assault!;
  const config = g.level.assault!;
  if (config.practice) return;
  assault.breachFlash = Math.max(0, assault.breachFlash - dt * 3.5);
  if (assault.phase === "battle" && assault.reserve > 0) {
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
  const assaultMotion = assaultForwardSlots(g.red, 1, assault);
  const surgeSpeed = surgeActive(g.level, g.t) ? 1 + Math.max(0, g.level.surge?.strength ?? 0) : 1;
  for (let redIndex = 0; redIndex < g.red.length; redIndex++) {
    const u = g.red[redIndex];
    if (u.dead) continue;
    // Formation lanes establish the initial spread; after release, neighbours
    // and inertia decide the path. Homing each unit to a quantized lane center
    // made the red horde look like nine synchronized rails.
    u.vx *= Math.exp(-2.8 * dt);
    u.vx = Math.max(-180, Math.min(180, u.vx + assaultMotion.lateral[redIndex] * (ASSAULT_RED_LATERAL_ACCEL / ASSAULT_LATERAL_ACCEL) * dt));
    if (assault.phase === "battle" && active) {
      const rearDepth = active.y - u.y;
      const rearProgress = Math.max(0, Math.min(1,
        (rearDepth - ASSAULT_RED_REAR_PRESSURE_START)
        / (ASSAULT_RED_REAR_PRESSURE_END - ASSAULT_RED_REAR_PRESSURE_START)));
      const rearCorridorHalf = ASSAULT_CORRIDOR_HALF
        + (ASSAULT_RED_REAR_CORRIDOR_HALF - ASSAULT_CORRIDOR_HALF) * rearProgress;
      applyAssaultCorridorPressure(u, active.x, dt, rearCorridorHalf);
    }
    if (assault.phase === "counterattack" && u.kind === "runner") applyAssaultRunnerBreakaway(u, dt);
    const roleSpeed = u.kind === "runner" ? 1.3 : u.kind === "guard" ? 0.84 : 1;
    move(g, u, config.speed * surgeSpeed * ASSAULT_RED_SPEED_SCALE * (u.big ? 0.74 : 1) * roleSpeed * (u.pace ?? 1) * assaultMotion.forward[redIndex] * dt, dt);
    if (!u.big && hitsSpinner(g, u)) {
      u.dead = true;
      pop(g, u.x, u.y, 1);
      continue;
    }
    if (u.y >= DEFENSE_Y) {
      // A breach is a hit against the cannon line, not an instant full reset.
      // Consume the defender that made contact so a packed wave cannot delete
      // the whole army in one frame. Brutes are dangerous enough to cost two
      // pips, while runners and guards each cost one.
      const damage = u.big || u.kind === "brute" ? 2 : 1;
      assault.breaches++;
      assault.integrity = Math.max(0, assault.integrity - damage);
      assault.breachFlash = 1;
      u.dead = true;
      pop(g, u.x, u.y, 1, damage > 1 ? "BRUTE BREACH" : "BREACH");
      if (assault.integrity <= 0) {
        g.status = "lost";
        pop(g, u.x, u.y, 1, "LINE DOWN");
        return;
      }
    }
  }
  let front = -Infinity;
  for (const u of g.red) if (!u.dead) front = Math.max(front, u.y);
  if (front > -Infinity) assault.frontline = Math.min(DEFENSE_Y, front);
}

function resolveAssaultFights(g: Game, dt: number) {
  const grid: Unit[][] = new Array(COLS * ROWS);
  const braceContacts = isShieldCleanup(g) ? new Set<Unit>() : null;
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
          if (e.braced && !u.big) {
            // A braced guard visibly holds the line until a champion arrives.
            // Ordinary runners are consumed on contact without weakening the
            // guard, while the existing collision path remains unchanged once
            // the brace has been broken. Count each guard once after the
            // complete collision pass so a dense same-frame pileup cannot
            // multiply its fatigue.
            braceContacts?.add(e);
            u.dead = true;
            pop(g, u.x, u.y, 0);
            break;
          }
          if (e.braced) {
            e.braced = false;
            pop(g, e.x, e.y, 1, "SHIELD BREAK");
          }
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
  if (braceContacts) applyShieldBraceFatigue(g, braceContacts, dt);
}

function updateAssaultBossSlam(g: Game, dt: number) {
  const assault = g.assault!;
  const config = g.level.assault!;
  assault.bossPulse = Math.max(0, assault.bossPulse - dt * 4);
  assault.bossWarning = 0;
  if (config.practice || assault.phase !== "battle" || !config.slamEvery) return;
  const active = g.bases[assault.encounter];
  if (!active || active.hp <= 0) return;
  const every = Math.max(1, config.slamEvery);
  assault.slamTimer -= dt;
  if (assault.slamTimer <= 0) {
    assault.slamTimer += every;
    assault.bossPulse = 1;
    pop(g, active.x, active.y - active.h / 2 - 10, 1, "SLAM");
    const front = active.y + active.h / 2;
    const targets = g.blue
      .filter((u) => !u.dead && u.y >= active.y - active.h / 2 && u.y <= front + 112 && Math.abs(u.x - active.x) <= active.w / 2 + 30)
      .sort((a, b) => a.y - b.y)
      .slice(0, 120);
    for (const u of targets) {
      bossSlamRecoilStates.set(u, {
        owner: g,
        assault,
        encounter: assault.encounter,
        startFrame: assault.motionFrame,
        elapsed: 0,
        extra: u.big ? ASSAULT_BOSS_SLAM_CHAMPION_EXTRA : ASSAULT_BOSS_SLAM_RUNNER_EXTRA,
      });
      // Preserve the original immediate shove. The longer tail is applied
      // after ordinary movement on following frames, so the boss clamp cannot
      // erase the visible reversal and the slam itself never changes hp.
      const maxY = CANNON_Y - u.r - 2;
      const kick = Math.max(0, Math.min(ASSAULT_BOSS_SLAM_INITIAL_KICK, maxY - u.y));
      if (kick > 0) move(g, u, kick, 0);
    }
    return;
  }
  if (assault.slamTimer < 0.8) assault.bossWarning = Math.max(0, Math.min(1, 1 - assault.slamTimer / 0.8));
}

/**
 * Rebuild the next assault encounter's panel orientation from authored route
 * geometry. Later campaign encounters alternate the branch direction so a
 * player has to make a fresh launch decision after every giant. The runtime
 * gate objects retain their width, row, multiplier and overrun mask; only the
 * lane centre and (when present) the mirrored movement phase change.
 */
function remixAssaultGates(g: Game, encounter: number) {
  const config = g.level.assault;
  if (!config || config.practice || config.horde <= 0 || g.gates.length === 0) return;

  const authored = assaultGateDefs(g.level);
  const mirror = encounter % 2 === 1;
  for (let index = 0; index < g.gates.length; index++) {
    const gate = g.gates[index];
    const source = authored[index];
    if (!source) continue;

    const sourceX = source.x;
    const sourceMove = source.move;
    const sourceOffset = sourceMove
      ? Math.sin(g.t * sourceMove.speed + (sourceMove.phase ?? 0)) * sourceMove.range
      : 0;
    gate.x = mirror ? W - sourceX : sourceX;
    gate.cx = mirror ? W - sourceX - sourceOffset : sourceX + sourceOffset;

    // Mirroring the speed and phase keeps a moving panel's live trajectory a
    // true left/right reflection while preserving the authored range.
    if (sourceMove) {
      gate.move = mirror
        ? { ...sourceMove, speed: -sourceMove.speed, phase: -(sourceMove.phase ?? 0) }
        : { ...sourceMove };
    } else {
      delete gate.move;
    }
  }
}

function beginAssaultAdvance(g: Game) {
  const assault = g.assault!;
  const active = g.bases[assault.encounter];
  assault.encounter++;
  assault.advance = 1;
  assault.phase = "advance";
  assault.transition = ASSAULT_TRANSITION_SECONDS;
  assault.horde = Math.max(0, Math.min(ASSAULT_RED_CAP, Math.floor((g.level.assault?.horde ?? 0) * (1 + assault.encounter * 0.08))));
  assault.reserve = Math.max(0, Math.floor((g.level.assault?.reserve ?? 0) * (1 + assault.encounter * 0.12)));
  assault.frontline = assault.horde > 0 ? 372 : CANNON_Y - 26;
  assault.spawnTimer = 1.1;
  assault.bossTimer = 0;
  assault.bossTime = 0;
  assault.bossOriginY = g.bases[assault.encounter]?.y ?? active?.y ?? 300;
  assault.bossWarning = 0;
  assault.bossPulse = 0;
  assault.slamTimer = Math.max(1, g.level.assault?.slamEvery ?? Infinity);
  assault.wave = 0;
  assault.waveLane = 0;
  assault.waveWarning = 0;
  assault.waveTimer = 0;
  assault.waveSpawned = 0;
  for (const gt of g.gates) {
    // Each new giant gets a fresh set of panels. Keep the array indices stable
    // so surviving runners retain their `used` mask across the transition.
    gt.overrun = false;
    gt.flash = 0;
    if (gt.kind === "x") gt.n = Math.min(9, Math.max(2, (gt.n ?? 2) + 1));
  }
  remixAssaultGates(g, assault.encounter);
  // Preserve the surviving formation's lanes and row order during travel.
  // Its depth settles into the new approach, keeping the leading runners in
  // front of the next giant without snapping the entire army to the cannon.
  for (const u of g.blue) if (!u.dead) u.advanceFromY = u.y;
  if (!g.level.assault?.practice && assault.horde > 0) seedAssaultHorde(g, assault.horde);
  assault.pickups.push({ id: assault.nextPickupId++, x: assault.encounter % 2 ? 55 : 305, y: 470, w: 70, value: 1 });
  refreshAssaultRemaining(g);
}

function startAssaultCounterattack(g: Game, active: Base) {
  const assault = g.assault!;
  const config = g.level.assault?.counterattack;
  if (!config || assault.waves <= 0) return false;
  g.red = g.red.filter((unit) => !unit.dead);
  assault.phase = "counterattack";
  assault.horde = 0;
  assault.reserve = 0;
  assault.wave = 0;
  assault.waveLane = counterattackLane(config, 0, assault.encounter);
  assault.waveTimer = Math.max(0.65, config.interval ?? 1.4);
  assault.waveWarning = 1;
  assault.waveSpawned = 0;
  assault.bossTimer = 0;
  assault.bossWarning = 0;
  assault.bossPulse = 0;
  assault.frontline = Math.max(assault.frontline, active.y - active.h / 2 - 42);
  pop(g, active.x, active.y - active.h / 2 - 18, 1, "COUNTERATTACK");
  refreshAssaultRemaining(g);
  return true;
}

function finishAssaultCounterattack(g: Game) {
  const assault = g.assault!;
  if (assault.phase !== "counterattack" || assault.wave < assault.waves || g.red.some((unit) => !unit.dead)) return;
  assault.waveWarning = 0;
  assault.remaining = 0;
  if (assault.encounter >= assault.encounters - 1) {
    g.status = "won";
    g.blue = g.blue.filter((u) => !u.dead);
    pop(g, W / 2, 170, 0, "ROAD CLEAR");
    return;
  }
  beginAssaultAdvance(g);
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

  if (assault.tier < 5) {
    assault.tier++;
    assault.upgradeFlash = 1;
    pop(g, active.x, active.y - 30, 0, "UPGRADE");
  }
  if (startAssaultCounterattack(g, active)) return;

  for (const r of g.red) if (!r.dead) pop(g, r.x, r.y, 1);
  g.red = [];
  if (assault.encounter >= assault.encounters - 1) {
    g.status = "won";
    g.blue = g.blue.filter((u) => !u.dead);
    assault.remaining = 0;
    return;
  }
  beginAssaultAdvance(g);
}

function stepAssault(g: Game, dt: number) {
  const assault = g.assault!;
  if (g.status !== "playing") {
    for (const p of g.pops) p.t += dt;
    g.pops = g.pops.filter((p) => p.t < 0.8);
    assault.upgradeFlash = Math.max(0, assault.upgradeFlash - dt * 2.4);
    assault.bossWarning = 0;
    assault.bossPulse = Math.max(0, assault.bossPulse - dt * 4);
    assault.breachFlash = Math.max(0, assault.breachFlash - dt * 3.5);
    return;
  }
  g.t += dt;
  assault.motionFrame++;
  updateAssaultCannon(g, dt);
  updateAssaultGatesAndSpinners(g, dt);
  updateAssaultPickups(g, dt);
  updateWeaponTarget(g, dt);
  updateAssaultBossPressure(g, dt);
  updateAssaultGateOverruns(g);
  updateAssaultBossSlam(g, dt);
  updateAssaultCounterattack(g, dt);

  if (assault.phase === "advance") {
    const portion = Math.min(dt, assault.transition);
    assault.travel += ASSAULT_TRAVEL_PER_BOSS * portion / ASSAULT_TRANSITION_SECONDS;
    assault.transition = Math.max(0, assault.transition - dt);
    assault.advance = Math.max(0, assault.transition / ASSAULT_TRANSITION_SECONDS);
    for (const u of g.blue) {
      if (u.advanceFromY === undefined) continue;
      const nextBoss = g.bases[assault.encounter];
      const front = nextBoss.y + nextBoss.h / 2 + 20;
      const row = Math.max(0, Math.min(1, (u.advanceFromY + 10) / (CANNON_Y + 10)));
      const destination = front + row * (CANNON_Y - 24 - front);
      u.y = u.advanceFromY + (destination - u.advanceFromY) * (1 - assault.advance);
      if (assault.transition <= 0) delete u.advanceFromY;
    }
    if (assault.transition <= 0) assault.phase = "battle";
  } else {
    updateAssaultBlue(g, dt);
    resolveCannonTarget(g);
    resolveWeaponTarget(g);
    updateAssaultRed(g, dt);
    if (g.status === "playing") {
      resolveAssaultFights(g, dt);
      const active = g.bases[assault.encounter];
      if (!g.level.assault?.practice && active && active.hp > 0) {
        assault.bossTimer -= dt;
        if (assault.bossTimer <= 0) {
          // A full row can strike across the giant's broad front. Resolving
          // twelve contacts keeps a multiplied wave flowing while the giant
          // stands against it, without a pile of overlapping idle runners.
          let contacts = 0;
          for (const u of g.blue) {
            if (u.dead) continue;
            if (Math.abs(u.x - active.x) > active.w / 2 + u.r) continue;
            if (u.y > active.y + active.h / 2 + u.r + 0.5 || u.y < active.y - active.h / 2 - u.r - 0.5) continue;
            const damage = u.big ? Math.max(5, Math.floor(u.hp * 1.5)) : 1;
            active.hp = Math.max(0, active.hp - damage);
            active.hitFlash = 1;
            g.stats.baseHits += damage;
            u.dead = true;
            assault.bossTimer = 0.025;
            pop(g, u.x, u.y, 0, u.big ? "BOOM" : undefined);
            if (++contacts >= 12 || active.hp <= 0) break;
          }
        }
      }
      if (g.status === "playing" && active && active.hp <= 0) finishAssaultEncounter(g);
    }
  }

  g.blue = g.blue.filter((u) => !u.dead);
  g.red = g.red.filter((u) => !u.dead);
  if (g.status === "playing" && assault.phase === "counterattack") finishAssaultCounterattack(g);
  refreshAssaultRemaining(g);
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
