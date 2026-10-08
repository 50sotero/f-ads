"use client";

import "@fontsource/fredoka/600.css";
import "@fontsource/fredoka/700.css";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";

import { applyStartingLoadout, assaultEarlyRaid, bossBrace, bossBraceChampionIncoming, bossBreakthrough, bossDefenseDeadline, cannonBarrelPositions, championBossAim, championShieldAim, CHARGE_MAX, counterattackSideEntry, counterattackWaveRole, isShieldCleanup, launchChampion, newGame, stars, step, W, weaponForLevel, type CounterattackWaveRole, type Game } from "@/game/engine";
import { levels } from "@/game/levels";
import { createRenderer } from "@/game/render";
import { advanceTutorial, newTutorialProgress, tutorialLessons, tutorialLevel, type TutorialProgress } from "@/game/tutorial";
import { buyUpgrade, completeRoute, emptyCampaignSave, normalizeCampaignSave, startingLoadout, UPGRADE_DEFS, type CampaignSave, type UpgradeId } from "@/game/progression";

import styles from "./CrowdCannon.module.css";

const SAVE_KEY = "fads-crowd-cannon-v1";
const DT = 1 / 60;

type Save = CampaignSave;
type Screen = "menu" | "armory" | "playing" | "paused" | "won" | "lost" | "trained";
type SoundKind = "shot" | "pop" | "hit" | "champ" | "shield" | "slam" | "upgrade" | "alert" | "win" | "lose";
type AssaultHud = {
  encounter: number;
  encounters: number;
  travel: number;
  advance: number;
  tier: number;
  weaponLevel: number;
  weaponFlash: number;
  weaponHits: number;
  weaponMaxHits: number;
  upgradeFlash: number;
  reserve: number;
  frontline: number;
  phase: "battle" | "counterattack" | "advance";
  wave: number;
  waves: number;
  waveLane: number;
  waveWarning: number;
  waveRole: CounterattackWaveRole;
  entryLane: -1 | 0 | 1;
  entryCount: number;
  entrySeconds: number;
  raidLane: -1 | 0 | 1;
  raidCount: number;
  raidAim: "left" | "right" | "aligned" | null;
  otherRaidCount: number;
  remaining: number;
  shields: number;
  shieldAim: "left" | "right" | "aligned" | null;
  shieldCleanup: boolean;
  integrity: number;
  maxIntegrity: number;
  breachFlash: number;
  brace: ReturnType<typeof bossBrace>;
  breakthrough: ReturnType<typeof bossBreakthrough>;
  braceChampion: boolean;
  bossAim: "left" | "right" | "aligned" | null;
  bossCanInterrupt: boolean;
  deadline: ReturnType<typeof bossDefenseDeadline>;
};
type HudState = { crowd: number; time: number; charge: number; assault: AssaultHud };

const EMPTY: Save = emptyCampaignSave();
let cached: Save | null = null;
const listeners = new Set<() => void>();

const defaultAssault = (): AssaultHud => ({
  encounter: 0,
  encounters: 1,
  travel: 0,
  advance: 0,
  tier: 1,
  weaponLevel: 1,
  weaponFlash: 0,
  weaponHits: 14,
  weaponMaxHits: 14,
  upgradeFlash: 0,
  reserve: 0,
  frontline: 0,
  phase: "battle",
  wave: 0,
  waves: 0,
  waveLane: 0,
  waveWarning: 0,
  waveRole: "mixed",
  entryLane: 0,
  entryCount: 0,
  entrySeconds: 0,
  raidLane: 0,
  raidCount: 0,
  raidAim: null,
  otherRaidCount: 0,
  remaining: 0,
  shields: 0,
  shieldAim: null,
  shieldCleanup: false,
  integrity: 3,
  maxIntegrity: 3,
  breachFlash: 0,
  brace: null,
  breakthrough: null,
  braceChampion: false,
  bossAim: null,
  bossCanInterrupt: false,
  deadline: null,
});

function assaultHud(game: Game): AssaultHud {
  const assault = game.assault;
  const earlyRaid = assaultEarlyRaid(game);
  const earlyEntry = earlyRaid && earlyRaid.spawned < earlyRaid.reserved
    ? { ...earlyRaid.entry, count: earlyRaid.reserved - earlyRaid.spawned }
    : null;
  const entry = earlyEntry ?? counterattackSideEntry(game);
  const entryTimer = earlyEntry ? earlyRaid!.seconds : assault?.waveTimer ?? 0;
  const bossAim = championBossAim(game);
  const deadline = bossDefenseDeadline(game);
  let raidLane: -1 | 0 | 1 = 0, raidY = -Infinity, raidX = 0, leftRaid = 0, rightRaid = 0;
  for (const unit of game.red) {
    if (unit.dead || !unit.sideEntry) continue;
    if (unit.sideEntry < 0) leftRaid++; else rightRaid++;
    if (unit.y > raidY) { raidY = unit.y; raidX = unit.x; raidLane = unit.sideEntry; }
  }
  // The primary notice follows the closest physical raider. Compare its lane
  // with the actual barrel positions so a wide battery need not center on it.
  let raidOffset = Infinity;
  if (raidLane) for (const barrel of cannonBarrelPositions(assault?.tier ?? 1)) {
    const offset = raidX - game.cannonX - barrel.x;
    if (Math.abs(offset) < Math.abs(raidOffset)) raidOffset = offset;
  }
  return {
    encounter: Math.max(0, assault?.encounter ?? 0),
    encounters: Math.max(1, assault?.encounters ?? 1),
    travel: Math.max(0, assault?.travel ?? 0),
    advance: Math.max(0, Math.min(1, assault?.advance ?? 0)),
    tier: Math.max(1, assault?.tier ?? 1),
    weaponLevel: assault?.weaponLevel ?? 1,
    weaponFlash: assault?.weaponFlash ?? 0,
    weaponHits: assault?.weaponTarget?.hp ?? 0,
    weaponMaxHits: assault?.weaponTarget?.maxHp ?? 0,
    upgradeFlash: Math.max(0, assault?.upgradeFlash ?? 0),
    reserve: Math.max(0, assault?.reserve ?? 0),
    frontline: Math.max(0, assault?.frontline ?? 0),
    phase: assault?.phase ?? "battle",
    wave: assault?.wave ?? 0,
    waves: assault?.waves ?? 0,
    waveLane: assault?.waveLane ?? 0,
    waveWarning: assault?.waveWarning ?? 0,
    waveRole: counterattackWaveRole(game, assault?.wave ?? 0),
    entryLane: entry?.lane ?? 0,
    entryCount: entry?.count ?? 0,
    entrySeconds: entryTimer > 0.3 ? Math.ceil(entryTimer) : 0,
    raidLane,
    raidCount: raidLane < 0 ? leftRaid : rightRaid,
    raidAim: raidLane ? Math.abs(raidOffset) <= 10 ? "aligned" : raidOffset < 0 ? "left" : "right" : null,
    otherRaidCount: raidLane < 0 ? rightRaid : leftRaid,
    remaining: assault?.remaining ?? 0,
    shields: game.red.reduce((count, unit) => count + (unit.braced && !unit.dead ? 1 : 0), 0),
    shieldAim: championShieldAim(game)?.direction ?? null,
    shieldCleanup: isShieldCleanup(game),
    integrity: assault?.integrity ?? 3,
    maxIntegrity: assault?.maxIntegrity ?? 3,
    breachFlash: assault?.breachFlash ?? 0,
    brace: bossBrace(game),
    breakthrough: bossBreakthrough(game),
    braceChampion: bossBraceChampionIncoming(game),
    bossAim: bossAim?.direction ?? null,
    bossCanInterrupt: bossAim?.canInterrupt ?? false,
    deadline,
  };
}

function readSave(): Save {
  if (cached) return cached;
  cached = EMPTY;
  if (typeof window === "undefined") return cached;
  try {
    const value = JSON.parse(window.localStorage.getItem(SAVE_KEY) ?? "null");
    cached = normalizeCampaignSave(value);
  } catch {
    // Private browsing and blocked storage should not stop the game from loading.
  }
  return cached;
}

function writeSave(value: Save) {
  cached = value;
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(value));
  } catch {
    // The in-memory value still keeps progress for this session.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Tiny synth blips keep the arcade feel without loading sound assets. */
function useSound(muted: boolean, weaponLevel: number) {
  const contextRef = useRef<AudioContext | null>(null);
  const lastRef = useRef<Record<SoundKind, number>>({ shot: 0, pop: 0, hit: 0, champ: 0, shield: 0, slam: 0, upgrade: 0, alert: 0, win: 0, lose: 0 });
  useEffect(() => () => {
    void contextRef.current?.close();
    contextRef.current = null;
  }, []);

  return useCallback(
    (kind: SoundKind) => {
      if (muted || typeof window === "undefined") return;
      const now = performance.now();
      const gap = kind === "shot" ? 45 : kind === "pop" ? 110 : kind === "hit" ? 120 : kind === "shield" ? 90 : 0;
      if (now - lastRef.current[kind] < gap) return;
      lastRef.current[kind] = now;

      try {
        const audioWindow = window as typeof window & { webkitAudioContext?: typeof AudioContext };
        const AudioCtor = window.AudioContext ?? audioWindow.webkitAudioContext;
        if (!AudioCtor) return;
        contextRef.current ??= new AudioCtor();
        const context = contextRef.current;
        if (context.state === "suspended") void context.resume();
        const notes: Record<SoundKind, [number, number, OscillatorType][]> = {
          shot: [[220 + weaponLevel * 60, 0.045, weaponLevel === 3 ? "triangle" : "sine"]],
          pop: [[660 + Math.random() * 200, 0.06, "triangle"]],
          hit: [[140, 0.08, "square"]],
          champ: [[330, 0.12, "sawtooth"], [495, 0.15, "sawtooth"]],
          shield: [[130, 0.14, "triangle"], [1320, 0.08, "square"], [880, 0.2, "sine"]],
          slam: [[140, 0.12, "triangle"], [72, 0.22, "sine"]],
          upgrade: [[440, 0.1, "triangle"], [660, 0.1, "triangle"], [880, 0.22, "triangle"]],
          alert: [[587, 0.13, "triangle"], [440, 0.13, "triangle"], [587, 0.2, "triangle"]],
          win: [[523, 0.14, "triangle"], [659, 0.14, "triangle"], [784, 0.3, "triangle"]],
          lose: [[300, 0.2, "sawtooth"], [200, 0.35, "sawtooth"]],
        };
        let time = context.currentTime;
        if (kind === "shield") {
          const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * 0.09), context.sampleRate);
          const samples = buffer.getChannelData(0);
          for (let i = 0; i < samples.length; i++) samples[i] = (Math.random() * 2 - 1) * (1 - i / samples.length);
          const crack = context.createBufferSource(), gain = context.createGain();
          crack.buffer = buffer; gain.gain.setValueAtTime(0.11, time);
          gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.09);
          crack.connect(gain).connect(context.destination); crack.start(time);
          crack.onended = () => { crack.disconnect(); gain.disconnect(); };
        }
        for (const [frequency, length, oscillatorType] of notes[kind]) {
          const oscillator = context.createOscillator();
          const gain = context.createGain();
          oscillator.type = oscillatorType;
          oscillator.frequency.value = frequency;
          gain.gain.setValueAtTime(0.0001, time);
          gain.gain.exponentialRampToValueAtTime(kind === "shot" ? 0.035 : kind === "pop" ? 0.04 : 0.07, time + 0.004);
          if (kind === "shot" || kind === "shield" || kind === "slam") oscillator.frequency.exponentialRampToValueAtTime(kind === "shot" ? 100 : frequency * 0.55, time + length);
          gain.gain.exponentialRampToValueAtTime(0.0001, time + length);
          oscillator.connect(gain).connect(context.destination);
          oscillator.start(time);
          oscillator.stop(time + length);
          oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
          time += length * 0.8;
        }
      } catch {
        // Audio is an enhancement; browsers can reject a context before a gesture.
      }
    },
    [muted, weaponLevel],
  );
}

function Stars({ n, animated = false, className = "" }: { n: number; animated?: boolean; className?: string }) {
  return (
    <span className={`${styles.stars} ${className}`} aria-label={`${n} of 3 stars`}>
      {[0, 1, 2].map((index) => (
        <span
          key={index}
          className={`${styles.star} ${index < n ? styles.starOn : ""} ${animated ? styles.starReveal : ""}`}
          style={animated ? { animationDelay: `${index * 150}ms` } : undefined}
          aria-hidden="true"
        >
          ★
        </span>
      ))}
    </span>
  );
}

function UpgradeIcon({ kind }: { kind: UpgradeId }) {
  return <svg viewBox="0 0 72 72" className={styles.upgradeIcon} aria-hidden="true">
    <ellipse cx="36" cy="59" rx="25" ry="6" fill="#10244b" opacity=".25" />
    {kind === "champion" ? <>
      <path d="M36 8 59 18V36C59 49 49 59 36 64 23 59 13 49 13 36V18Z" fill="#ffbd3e" stroke="#ffe597" strokeWidth="3" />
      <path d="m39 19-15 22h12l-3 13 16-24H37Z" fill="#fff7c6" />
    </> : <>
      <rect x="12" y="44" width="48" height="15" rx="7" fill="#233966" />
      {[21, 51].map((x) => <circle key={x} cx={x} cy="56" r="7" fill="#10264e" stroke="#a5d7fa" strokeWidth="3" />)}
      <rect x="17" y="33" width="38" height="19" rx="9" fill={kind === "weapon" ? "#ff963a" : "#259eff"} />
      {(kind === "crew" ? [24, 47] : [24, 36, 48]).map((x) => <g key={x} transform={`rotate(-12 ${x} 33)`}>
        <rect x={x - 6} y="11" width="12" height="31" rx="5" fill={kind === "weapon" ? "#ffc64a" : "#63d3ff"} />
        <rect x={x - 7} y="10" width="14" height="8" rx="3" fill="#e9faff" />
        <rect x={x - 4} y="12" width="8" height="3" rx="1.5" fill="#234672" />
      </g>)}
    </>}
  </svg>;
}

export function CrowdCannon() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<ReturnType<typeof createRenderer> | null>(null);
  const gameRef = useRef<Game | null>(null);
  const previewRef = useRef<Game | null>(null);
  const pointerRef = useRef<number | null>(null);
  const keysRef = useRef(new Set<string>());
  const tutorialRef = useRef<TutorialProgress | null>(null);
  const save = useSyncExternalStore(subscribe, readSave, () => EMPTY);
  const [screen, setScreen] = useState<Screen>("menu");
  const [levelIndex, setLevelIndex] = useState(0);
  const [result, setResult] = useState({ time: 0, stars: 0, best: false, earned: 0 });
  const [armoryNotice, setArmoryNotice] = useState("");
  const [tutorialStep, setTutorialStep] = useState<number | null>(null);
  const [rendererError, setRendererError] = useState<string | null>(null);
  const [rendererNonce, setRendererNonce] = useState(0);
  const [hud, setHud] = useState<HudState>({ crowd: 0, time: 0, charge: 0, assault: defaultAssault() });
  const sound = useSound(save.muted, hud.assault.weaponLevel);
  const screenRef = useRef(screen);
  const levelRef = useRef(levelIndex);
  const soundRef = useRef(sound);

  useEffect(() => {
    screenRef.current = screen;
    levelRef.current = levelIndex;
    soundRef.current = sound;
  }, [levelIndex, screen, sound]);

  const start = useCallback((requestedIndex: number) => {
    const index = Math.max(0, Math.min(levels.length - 1, requestedIndex));
    setLevelIndex(index);
    levelRef.current = index;
    tutorialRef.current = null;
    setTutorialStep(null);
    gameRef.current = newGame(levels[index], (Date.now() ^ (index + 1) * 7919) & 0xffff);
    applyStartingLoadout(gameRef.current, startingLoadout(readSave()));
    pointerRef.current = null;
    keysRef.current.clear();
    setHud({ crowd: 0, time: 0, charge: gameRef.current.charge, assault: assaultHud(gameRef.current) });
    setResult({ time: 0, stars: 0, best: false, earned: 0 });
    screenRef.current = "playing";
    setScreen("playing");
  }, []);

  const beginTutorial = useCallback(() => {
    tutorialRef.current = newTutorialProgress();
    setTutorialStep(0);
    gameRef.current = newGame(tutorialLevel, 2026);
    pointerRef.current = null;
    keysRef.current.clear();
    setHud({ crowd: 0, time: 0, charge: 0, assault: defaultAssault() });
    setScreen("playing");
  }, []);

  const finish = useCallback((game: Game) => {
    if (game.status === "won") {
      const index = levelRef.current;
      const rating = stars(game.level, game.t);
      const previous = readSave();
      const cleared = completeRoute(previous, index, rating, game.t);
      const best = !previous.bestTimes[index] || game.t < previous.bestTimes[index];
      writeSave(cleared.save);
      setResult({ time: game.t, stars: rating, best, earned: cleared.earned });
      soundRef.current("win");
      screenRef.current = "won";
      setScreen("won");
    } else {
      soundRef.current("lose");
      screenRef.current = "lost";
      setScreen("lost");
    }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let renderer: ReturnType<typeof createRenderer>;
    try {
      renderer = createRenderer(canvas);
      rendererRef.current = renderer;
    } catch {
      rendererRef.current = null;
      queueMicrotask(() => setRendererError("Your browser could not start the 3D arena. Try reloading or enabling hardware acceleration."));
      return;
    }

    let raf = 0;
    let last = performance.now();
    let accumulator = 0;
    let endAt = 0;
    let victoryDrawTime = 0;
    let shown: Game | null = null;
    let hudAt = 0;
    let needsDraw = true;
    let seen = { fired: 0, multiplied: 0, baseHits: 0, champions: 0, weapon: 1, phase: "battle", bossPulse: 0 };
    const heardCombatCues = new WeakSet<object>();
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      renderer.resize(Math.max(1, rect.width), Math.max(1, rect.height));
      needsDraw = true;
    };
    resize();

    const onContextLost = (event: Event) => {
      event.preventDefault();
      window.cancelAnimationFrame(raf);
      if (screenRef.current === "playing") {
        screenRef.current = "paused";
        setScreen("paused");
      }
      setRendererError("The 3D arena paused after losing its graphics context. Tap retry to rebuild it.");
    };
    canvas.addEventListener("webglcontextlost", onContextLost);
    const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(resize);
    resizeObserver?.observe(canvas);

    const frame = (now: number) => {
      raf = window.requestAnimationFrame(frame);
      const elapsed = Math.min(0.1, Math.max(0, (now - last) / 1000));
      last = now;
      const game = gameRef.current ?? (previewRef.current ??= newGame(levels[0], 2026));
      if (game !== shown) {
        shown = game;
        needsDraw = true;
        accumulator = 0;
        endAt = 0;
        victoryDrawTime = 0;
        seen = { fired: 0, multiplied: 0, baseHits: 0, champions: 0, weapon: 1, phase: "battle", bossPulse: 0 };
      }

      if (screenRef.current === "playing") {
        accumulator += elapsed;
        while (accumulator >= DT) {
          const keys = keysRef.current;
          const direction = (keys.has("ArrowRight") || keys.has("d") ? 1 : 0) - (keys.has("ArrowLeft") || keys.has("a") ? 1 : 0);
          if (direction) {
            game.targetX = game.cannonX + direction * 430 * DT;
            game.firing = true;
          } else if (keys.has("ArrowUp") || keys.has("w")) {
            game.firing = true;
          }
          step(game, DT);
          accumulator -= DT;
        }
        if (game.stats.fired > seen.fired) soundRef.current("shot");
        if (game.stats.multiplied > seen.multiplied) soundRef.current("pop");
        if (game.stats.baseHits > seen.baseHits) soundRef.current("hit");
        if (game.stats.champions > seen.champions) soundRef.current("champ");
        if ((game.assault?.weaponLevel ?? 1) > seen.weapon) soundRef.current("upgrade");
        if (game.assault?.phase === "counterattack" && seen.phase !== "counterattack") soundRef.current("alert");
        if ((game.assault?.bossPulse ?? 0) > seen.bossPulse + 0.1) soundRef.current("slam");
        for (const pop of game.pops) {
          if (!["SHIELD BREAK", "GIANT WINDING UP", "STAGGERED"].includes(pop.text ?? "") || heardCombatCues.has(pop)) continue;
          heardCombatCues.add(pop); soundRef.current(pop.text === "GIANT WINDING UP" ? "alert" : "shield");
        }
        seen = { fired: game.stats.fired, multiplied: game.stats.multiplied, baseHits: game.stats.baseHits, champions: game.stats.champions, weapon: game.assault?.weaponLevel ?? 1, phase: game.assault?.phase ?? "battle", bossPulse: game.assault?.bossPulse ?? 0 };
        const training = tutorialRef.current;
        if (training) {
          if (advanceTutorial(training, game)) {
            setTutorialStep(training.step);
            if (training.step < tutorialLessons.length) soundRef.current("pop");
          }
          if (training.step === tutorialLessons.length && game.t >= training.completedAt + 0.8) {
            writeSave({ ...readSave(), tutorialDone: true });
            soundRef.current("win");
            screenRef.current = "trained";
            setScreen("trained");
          }
        } else if (game.status !== "playing") {
          endAt ||= now + (game.status === "lost" ? 1250 : 900);
          if (now >= endAt) finish(game);
        }
      } else {
        accumulator = 0;
      }

      if (now - hudAt > 80) {
        hudAt = now;
        const nextAssault = assaultHud(game);
        setHud((previous) => previous.crowd === game.blue.length && previous.time === game.t && previous.charge === game.charge
          && previous.assault.encounter === nextAssault.encounter
          && previous.assault.encounters === nextAssault.encounters
          && previous.assault.travel === nextAssault.travel
          && previous.assault.advance === nextAssault.advance
          && previous.assault.tier === nextAssault.tier
          && previous.assault.weaponLevel === nextAssault.weaponLevel
          && previous.assault.weaponFlash === nextAssault.weaponFlash
          && previous.assault.weaponHits === nextAssault.weaponHits
          && previous.assault.upgradeFlash === nextAssault.upgradeFlash
          && previous.assault.reserve === nextAssault.reserve
          && previous.assault.frontline === nextAssault.frontline
          && previous.assault.phase === nextAssault.phase
          && previous.assault.wave === nextAssault.wave
          && previous.assault.waves === nextAssault.waves
          && previous.assault.waveLane === nextAssault.waveLane
          && previous.assault.waveWarning === nextAssault.waveWarning
          && previous.assault.waveRole === nextAssault.waveRole
          && previous.assault.entryLane === nextAssault.entryLane
          && previous.assault.entryCount === nextAssault.entryCount
          && previous.assault.entrySeconds === nextAssault.entrySeconds
          && previous.assault.raidLane === nextAssault.raidLane
          && previous.assault.raidCount === nextAssault.raidCount
          && previous.assault.otherRaidCount === nextAssault.otherRaidCount
          && previous.assault.remaining === nextAssault.remaining
          && previous.assault.shields === nextAssault.shields
          && previous.assault.shieldAim === nextAssault.shieldAim
          && previous.assault.shieldCleanup === nextAssault.shieldCleanup
          && previous.assault.integrity === nextAssault.integrity
          && previous.assault.breachFlash === nextAssault.breachFlash
          && previous.assault.deadline?.phase === nextAssault.deadline?.phase
          && previous.assault.deadline?.front === nextAssault.deadline?.front
          && previous.assault.deadline?.remaining === nextAssault.deadline?.remaining
          && previous.assault.deadline?.advance === nextAssault.deadline?.advance
          && previous.assault.deadline?.speed === nextAssault.deadline?.speed
          && previous.assault.deadline?.moving === nextAssault.deadline?.moving
          ? previous : { crowd: game.blue.length, time: game.t, charge: game.charge, assault: nextAssault });
      }

      try {
        // Finish the 2.8s confetti emission plus its maximum 2.55s lifetime.
        // Count rendered time so a background tab cannot truncate the collapse.
        const celebrating = screenRef.current === "won" && victoryDrawTime < 5.5;
        if (screenRef.current === "playing" || celebrating || needsDraw) {
          const drawTime = screenRef.current === "playing" || celebrating ? Math.min(elapsed, 0.05) : 0;
          renderer.render(game, drawTime);
          if (game.status === "won") victoryDrawTime += drawTime;
          needsDraw = false;
        }
      } catch {
        if (screenRef.current === "playing") {
          screenRef.current = "paused";
          setScreen("paused");
        }
        setRendererError("The 3D arena paused after a graphics error. Tap retry to rebuild it.");
        window.cancelAnimationFrame(raf);
      }
    };
    raf = window.requestAnimationFrame(frame);

    return () => {
      window.cancelAnimationFrame(raf);
      resizeObserver?.disconnect();
      canvas.removeEventListener("webglcontextlost", onContextLost);
      renderer.dispose();
      if (rendererRef.current === renderer) rendererRef.current = null;
    };
  }, [finish, rendererNonce]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const pointerX = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      return (event.clientX - rect.left) / Math.max(1, rect.width);
    };
    const toWorldX = (normalized: number) => rendererRef.current?.aimX(normalized) ?? normalized * W;
    let lastPointerX = 0;
    // A browser may send a compatibility click to a result button that appears
    // under a still-held firing finger. Remember the gesture through screen changes.
    let firingPointer: number | null = null;
    let firingRelease: { id: number; x: number; y: number } | null = null;
    const reset = () => {
      firingPointer = null;
      pointerRef.current = null;
      keysRef.current.clear();
      if (gameRef.current) gameRef.current.firing = false;
    };
    const pauseWhenAway = () => {
      pointerRef.current = null;
      keysRef.current.clear();
      const game = gameRef.current;
      if (game) game.firing = false;
      // Keep the held gesture until its release so it cannot click Resume.
      // Returning to the game requires an explicit resume and a fresh press.
      if (screenRef.current === "playing" && game?.status === "playing") {
        screenRef.current = "paused";
        setScreen("paused");
      }
    };
    const visibilityChanged = () => {
      if (document.hidden) pauseWhenAway();
    };
    const down = (event: PointerEvent) => {
      const game = gameRef.current;
      if (!game || screenRef.current !== "playing") return;
      if (event.pointerType === "mouse" && event.button !== 0) return;
      if (pointerRef.current !== null) return;
      event.preventDefault();
      pointerRef.current = event.pointerId;
      firingPointer = event.pointerId;
      try {
        canvas.setPointerCapture(event.pointerId);
      } catch {
        // Pointer capture is unavailable in a few embedded browsers.
      }
      lastPointerX = pointerX(event);
      if (event.pointerType === "mouse") game.targetX = toWorldX(lastPointerX);
      game.firing = true;
    };
    const move = (event: PointerEvent) => {
      const game = gameRef.current;
      if (!game || event.pointerId !== pointerRef.current || screenRef.current !== "playing") return;
      const x = pointerX(event);
      // Touch is a relative drag: touching down near a screen edge must not
      // teleport the cannon or make the player cover it with their thumb.
      // Project both points through the current camera so a combat zoom does
      // not add a sideways jump to the next touch movement.
      game.targetX = event.pointerType === "mouse" ? toWorldX(x) : game.targetX + toWorldX(x) - toWorldX(lastPointerX);
      lastPointerX = x;
    };
    const up = (event: PointerEvent) => {
      if (event.pointerId !== firingPointer) return;
      if (event.type === "pointerup") firingRelease = { id: event.pointerId, x: event.clientX, y: event.clientY };
      try {
        canvas.releasePointerCapture(event.pointerId);
      } catch {
        // Pointer capture may already have been released by the browser.
      }
      reset();
    };
    const newPress = () => { firingRelease = null; };
    const consumeFiringClick = (event: MouseEvent) => {
      const released = firingRelease;
      firingRelease = null;
      if (!released || event.detail === 0) return;
      if (Math.abs(event.clientX - released.x) > 2 || Math.abs(event.clientY - released.y) > 2) return;
      if ("pointerId" in event && event.pointerId !== released.id) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    const keydown = (event: KeyboardEvent) => {
      if (screenRef.current !== "playing") return;
      if (event.repeat) return;
      const game = gameRef.current;
      if (event.key === " ") {
        // Preserve native Space activation for focused controls during play.
        if (event.target instanceof Element && event.target.closest("button, a, input, textarea, select, [contenteditable]")) return;
        event.preventDefault();
        if (game) launchChampion(game);
        return;
      }
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "a", "d", "w"].includes(event.key)) {
        event.preventDefault();
        keysRef.current.add(event.key);
      }
    };
    const keyup = (event: KeyboardEvent) => {
      keysRef.current.delete(event.key);
      if (!keysRef.current.size && pointerRef.current === null && gameRef.current) gameRef.current.firing = false;
    };

    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);
    canvas.addEventListener("lostpointercapture", reset);
    document.addEventListener("pointerdown", newPress, true);
    document.addEventListener("click", consumeFiringClick, true);
    window.addEventListener("keydown", keydown);
    window.addEventListener("keyup", keyup);
    window.addEventListener("blur", pauseWhenAway);
    document.addEventListener("visibilitychange", visibilityChanged);
    return () => {
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", up);
      canvas.removeEventListener("lostpointercapture", reset);
      document.removeEventListener("pointerdown", newPress, true);
      document.removeEventListener("click", consumeFiringClick, true);
      window.removeEventListener("keydown", keydown);
      window.removeEventListener("keyup", keyup);
      window.removeEventListener("blur", pauseWhenAway);
      document.removeEventListener("visibilitychange", visibilityChanged);
      reset();
    };
  }, [rendererNonce]);

  useEffect(() => {
    if (screen !== "playing") {
      pointerRef.current = null;
      keysRef.current.clear();
      if (gameRef.current) gameRef.current.firing = false;
    }
  }, [screen]);

  useEffect(() => {
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (screenRef.current === "playing") {
        event.preventDefault();
        screenRef.current = "paused";
        setScreen("paused");
      } else if (["paused", "trained", "won", "lost", "armory"].includes(screenRef.current)) {
        event.preventDefault();
        screenRef.current = "menu";
        setScreen("menu");
      }
    };
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, []);

  const unlocked = (index: number) => index === 0 || (save.stars[index - 1] ?? 0) > 0;
  const totalStars = save.stars.reduce((total, value) => total + (value ?? 0), 0);
  const level = levels[levelIndex];
  const assault = hud.assault;
  const lineBroken = assault.integrity === 0;
  const roadCleared = !lineBroken && assault.phase === "counterattack" && assault.wave === assault.waves && assault.remaining === 0;
  const battleEnded = lineBroken || roadCleared;
  const giantWinding = !battleEnded && assault.brace?.phase === "winding";
  const giantStaggered = !battleEnded && assault.brace?.phase === "staggered";
  const giantAdvancing = !battleEnded && !!assault.breakthrough;
  // The engine only marks this cue while the eligible giant actually moved
  // during its latest pressure step. Walls and stagger therefore never turn
  // into a misleading time-like countdown in the objective banner.
  const giantDeadline = !battleEnded
    && assault.phase === "battle"
    && !giantWinding
    && !giantStaggered
    && !giantAdvancing
    && assault.deadline?.moving
    && (assault.deadline.phase === "ramping" || assault.deadline.phase === "rushing")
    ? assault.deadline
    : null;
  const bossInstruction = assault.bossAim === "left" ? "← Drag left" : "Drag right →";
  const shieldInstruction = assault.shieldAim === "left" ? "← Drag left" : assault.shieldAim === "right" ? "Drag right →" : "Aligned";
  const shieldAction = assault.shieldCleanup ? "KEEP FIRING" : hud.charge < CHARGE_MAX ? "CHARGE ★" : assault.shieldAim === "aligned" ? "TAP ★" : assault.shieldAim === "left" ? "← AIM LEFT" : "AIM RIGHT →";
  const incomingWave = assault.phase === "counterattack" && assault.waveWarning > 0 && !battleEnded;
  const incomingLane = assault.waveLane < 0 ? "← LEFT" : assault.waveLane > 0 ? "RIGHT →" : "CENTER";
  const sideThreat = !battleEnded && (assault.raidCount > 0 || assault.entryCount > 0);
  // While the hatch is only telegraphing, keep the interrupt action primary.
  // Live runners take priority without concealing the giant's slam countdown.
  const sideDanger = sideThreat && (!giantWinding || assault.raidCount > 0);
  const overlappingThreats = giantWinding && sideThreat;
  const sideLane = assault.raidCount > 0 ? assault.raidLane : assault.entryLane;
  const sideLabel = `${sideLane < 0 ? "← LEFT" : "RIGHT →"} SIDE RAID`;
  const parallelThreat = overlappingThreats
    ? sideDanger ? `SLAM ${Math.ceil(assault.brace!.seconds)}s`
      : `${sideLane < 0 ? "←" : "→"} RAID ${assault.entrySeconds > 0 ? `${assault.entrySeconds}s` : "READY"}`
    : null;
  const otherRaidLabel = `${sideLane < 0 ? "RIGHT →" : "← LEFT"} · ${assault.otherRaidCount} LIVE ${assault.otherRaidCount === 1 ? "RAIDER" : "RAIDERS"}`;
  const sideAction = assault.raidCount > 0
    ? assault.raidAim === "left" ? "← Move farther left. Fire at the red rings!"
      : assault.raidAim === "right" ? "Move farther right → Fire at the red rings!"
        : "On their lane. Keep firing and follow the red rings!"
    : assault.entrySeconds > 0 ? `Hatch opens in ${assault.entrySeconds}s. Move over and fire!` : "Runners at the hatch. Cover this lane!";
  const incomingLabel = `${incomingLane} ${assault.entryCount > 0 ? "SIDE RAID" : assault.waveRole === "flank" ? "RUNNER RUSH" : assault.waveRole === "shield" ? "SHIELD WAVE" : "WAVE INCOMING"}`;
  const incomingAction = assault.waveRole === "flank" ? "Cover the flank before they reach your line." : assault.waveRole === "shield" ? "Charge a champion to break their shield." : "Move your cannon to cover the incoming lane.";
  const loadout = startingLoadout(save);
  const weapon = weaponForLevel(assault.weaponLevel);
  const tutorialLesson = tutorialStep !== null && tutorialStep < tutorialLessons.length ? tutorialLessons[tutorialStep] : null;
  const battleObjectiveVisible = !tutorialLesson && assault.waves > 0;
  // Keep one clear champion instruction on screen when the objective already
  // carries the aim/launch step for a winding giant or shielded defenders.
  const topObjectiveHasChampionInstruction = battleObjectiveVisible
    && !battleEnded
    && !sideDanger
    && hud.charge >= CHARGE_MAX
    && (
      giantWinding && assault.bossCanInterrupt && !assault.braceChampion
      || !giantWinding && !giantStaggered && !giantAdvancing && !giantDeadline && assault.shields > 0 && !assault.shieldCleanup
    );
  const contextualHint = tutorialStep === null && levelIndex === 0
    ? hud.time < 4 ? "Hold + drag · Build your crowd through the gates"
      : hud.time < 8 && assault.weaponLevel === 1 ? "Side locks unlock extra cannons and better weapons"
        : hud.time < 12 ? "Protect the cyan line · Tap the star for a champion" : null
    : null;
  const hasNext = levelIndex + 1 < levels.length;
  const remixedGates = (level.assault?.horde ?? 0) > 0 && level.gates?.some((gate) => Math.abs(gate.x - W / 2) > 1);
  const firstUnbeaten = Math.max(0, levels.findIndex((_, index) => !save.stars[index]));
  const skipTutorial = () => {
    writeSave({ ...readSave(), tutorialDone: true });
    start(firstUnbeaten);
  };
  const toggleMute = () => writeSave({ ...save, muted: !save.muted });
  const purchase = (id: UpgradeId) => {
    const previous = readSave();
    const next = buyUpgrade(previous, id);
    if (next === previous) return;
    writeSave(next);
    setArmoryNotice(`${UPGRADE_DEFS.find((item) => item.id === id)?.title} upgraded. Equipped for your next route.`);
    soundRef.current("upgrade");
  };
  const launch = () => {
    const game = gameRef.current;
    if (!game || screenRef.current !== "playing") return;
    launchChampion(game);
  };
  const pause = () => {
    if (screenRef.current !== "playing") return;
    screenRef.current = "paused";
    setScreen("paused");
  };

  return (
    <div className={styles.gameShell} data-testid="crowd-cannon-game" data-screen={screen} data-level={levelIndex + 1} data-tutorial={tutorialStep ?? undefined} aria-label="Crowd Cannon arcade game">
      <canvas key={rendererNonce} ref={canvasRef} className={styles.canvas} data-testid="crowd-cannon-canvas" aria-label="Crowd Cannon game field. Hold and drag to aim and shoot." />
      <div className={styles.sceneShade} aria-hidden="true" />
      {screen === "playing" && assault.breachFlash > 0 && <div className={styles.breachFlash} style={{ opacity: assault.breachFlash }} aria-hidden="true" />}

      {(screen === "won" || screen === "trained") && (
        <div className={styles.confetti} aria-hidden="true">
          {Array.from({ length: 36 }, (_, index) => (
            <i key={index} style={{
              left: `${(index * 37) % 100}%`,
              background: ["#ffd84d", "#20bbff", "#ff5274", "#b86cff", "#49e4ba"][index % 5],
              animationDelay: `${-(index % 9) * 0.36}s`,
              animationDuration: `${2.5 + (index % 5) * 0.3}s`,
            }} />
          ))}
        </div>
      )}

      {rendererError && (
        <div className={styles.graphicsError} role="alert">
          <div className={styles.graphicsErrorCard}>
            <span className={styles.errorIcon} aria-hidden="true">◈</span>
            <strong>3D arena unavailable</strong>
            <p>{rendererError}</p>
            <button type="button" className={`${styles.actionButton} ${styles.primaryAction}`} onClick={() => { setRendererError(null); setRendererNonce((value) => value + 1); }}>
              Retry arena
            </button>
          </div>
        </div>
      )}

      {screen === "playing" && (
        <>
          <div className={styles.hud}>
            <button type="button" className={styles.pauseButton} data-testid="pause-game" onClick={pause} onPointerDown={(event) => {
              // As with the champion, a second thumb has no synthetic click.
              if (event.pointerType === "touch" && !event.isPrimary) {
                event.preventDefault();
                pause();
              }
            }} aria-label="Pause game"><span aria-hidden="true">Ⅱ</span></button>
            <div className={styles.levelPill} data-testid="assault-hud"><strong>CROWD<br /><em>CANNON</em></strong><span>{tutorialStep !== null ? `TRAINING ${Math.min(tutorialLessons.length, tutorialStep + 1)} / ${tutorialLessons.length}` : `LEVEL ${levelIndex + 1}`}</span></div>
            <div className={styles.encounterProgress} data-testid="encounter-progress" role="progressbar" aria-label="Assault stage progress" aria-valuemin={1} aria-valuemax={assault.encounters} aria-valuenow={Math.min(assault.encounters, assault.encounter + 1)}>
              <span className={styles.encounterLabel}>STAGE {Math.min(assault.encounters, assault.encounter + 1)} / {assault.encounters}</span>
              <span className={styles.encounterDots} aria-hidden="true">{Array.from({ length: assault.encounters }, (_, index) => <i key={index} data-done={index < assault.encounter} data-current={index === assault.encounter} />)}</span>
            </div>
          </div>
          {battleObjectiveVisible && <div className={styles.battleObjective} data-testid="battle-objective" data-phase={assault.phase} data-warning={incomingWave} data-wave-role={assault.waveRole} data-side-raid={sideDanger} data-brace={giantWinding ? "winding" : giantStaggered ? "staggered" : giantAdvancing ? "breaking" : undefined} data-deadline={giantDeadline ? "moving" : undefined} data-breached={lineBroken} data-cleared={roadCleared} data-shield={!battleEnded && !sideDanger && !giantDeadline && assault.shields > 0} data-cleanup={!battleEnded && !sideDanger && !giantDeadline && assault.shields > 0 && assault.shieldCleanup} data-compact={!battleEnded && !sideDanger && !giantWinding && !giantStaggered && !giantAdvancing && assault.shields === 0 && (assault.phase === "counterattack" || assault.phase === "battle" && hud.time > 4)}>
            <span className={styles.objectiveIcon} aria-hidden="true">{roadCleared ? "★" : lineBroken || assault.phase === "counterattack" ? "!" : assault.phase === "advance" ? "»" : giantDeadline ? "!" : "⚑"}</span>
            <div><strong>{lineBroken ? "LINE BREACHED" : roadCleared ? "ROAD CLEAR" : sideDanger ? sideLabel : giantWinding ? "GIANT WINDING UP" : giantStaggered ? "SLAM INTERRUPTED!" : giantAdvancing ? "GIANT ADVANCING" : giantDeadline ? "GIANT CLOSING IN" : assault.shields > 0 ? shieldAction : assault.phase === "counterattack" ? incomingWave ? incomingLabel : `${assault.remaining} DEFENDERS LEFT` : assault.phase === "advance" ? remixedGates ? "LANES SWITCHED" : "STAGE CLEARED" : "BREAK THEIR LEADER"}{parallelThreat && <span className={styles.parallelThreat} data-testid="parallel-threat">{parallelThreat}</span>}</strong>
              <span>{lineBroken ? "Your cannon defense is gone." : roadCleared ? "All defenders cleared." : sideDanger ? sideAction : giantWinding ? assault.braceChampion ? "Champion charging! Keep firing." : !assault.bossCanInterrupt ? "Slam incoming. Keep firing to rebuild the front!" : hud.charge >= CHARGE_MAX ? assault.bossAim === "aligned" ? "Aligned! Tap ★ to interrupt the slam." : `${bossInstruction} to line up the gold sight, then tap ★.` : "Keep firing to charge ★. Brace for the slam!" : giantStaggered ? "Keep firing! Their leader is exposed." : giantAdvancing ? "Hold the line! Rebuild your crowd through the gates." : giantDeadline ? "Stop the giant before it reaches your defense line." : assault.shields > 0 ? assault.shieldCleanup ? "Your crowd is cracking the last shields." : hud.charge >= CHARGE_MAX ? assault.shieldAim === "aligned" ? "Break the gold shield." : "Line up the gold sight with the shield." : assault.shieldAim === "aligned" ? "Keep firing. Your champion breaks the shield." : `${shieldInstruction}. Keep firing to charge.`
                : assault.phase === "counterattack"
                ? incomingWave ? incomingAction : `${assault.remaining} enemies left · wave ${assault.wave} / ${assault.waves}`
                : assault.phase === "advance" ? remixedGates ? "Find the new gate chain. Keep your upgrades!" : "Keep your upgrades. Push forward!" : "Then survive the counterattack"}</span></div>
            {!battleEnded && assault.phase === "counterattack" && <span className={styles.wavePips} aria-label={`${assault.wave} of ${assault.waves} waves deployed`}>{Array.from({ length: assault.waves }, (_, i) => <i key={i} data-done={i < assault.wave} />)}</span>}
            {sideDanger && assault.otherRaidCount > 0
              ? <span className={styles.incomingWave} data-testid="other-side-raid" data-role="active-raid">{otherRaidLabel}</span>
              : incomingWave && (assault.shields > 0 || sideDanger) && (!sideDanger || incomingLabel !== sideLabel) && <span className={styles.incomingWave} data-testid="incoming-wave" data-role={assault.waveRole}>{incomingLabel}</span>}
          </div>}
          {tutorialLesson ? (
            <div className={styles.tutorialCoach} data-testid="tutorial-coach" role="status" aria-live="polite">
              <div className={styles.lessonHeading}><span className={styles.lessonIcon}>{tutorialLesson.icon}</span><strong>{tutorialLesson.title}</strong><button type="button" onClick={skipTutorial}>Skip tutorial</button></div>
              <p>{tutorialLesson.text}</p>
              <div className={styles.lessonProgress}><span>{tutorialLesson.action}</span><div aria-hidden="true">{tutorialLessons.map((_, i) => <i key={i} data-done={i < tutorialStep!} data-current={i === tutorialStep} />)}</div></div>
            </div>
          ) : contextualHint && <div className={styles.tip} data-testid="contextual-hint" role="status">{contextualHint}</div>}
          {tutorialLesson && (assault.weaponFlash > 0 ? <div key={assault.weaponLevel} className={`${styles.upgradeFlash} ${styles.weaponUnlocked}`} data-testid="weapon-upgrade" role="status" aria-live="polite"><span>WEAPON UPGRADED · LV {assault.weaponLevel}</span><strong>{weapon.name}</strong><small>{weapon.description}</small></div>
            : assault.upgradeFlash > 0 && <div className={styles.upgradeFlash} data-testid="upgrade-flash" role="status" aria-live="polite">+1 CANNON <span>· {assault.tier} CANNONS</span></div>)}
          {!tutorialLesson && <div className={styles.weaponCard} data-testid="weapon-status" data-weapon={assault.weaponLevel} data-upgraded={assault.weaponFlash > 0 || assault.upgradeFlash > 0}>
            {assault.weaponFlash > 0 ? <span className={styles.weaponUpgradeTag} data-testid="weapon-upgrade" role="status" aria-live="polite">↑ WEAPON UPGRADED</span> : assault.upgradeFlash > 0 && <span className={styles.weaponUpgradeTag} data-testid="upgrade-flash" role="status" aria-live="polite">+1 CANNON · {assault.tier} TOTAL</span>}
            <span className={styles.weaponIcon} aria-hidden="true">{assault.weaponLevel === 3 ? "✺" : assault.weaponLevel === 2 ? "≋" : "↑"}</span>
            <div><span>WEAPON · LV {assault.weaponLevel}</span><strong>{weapon.name}</strong><small>{weapon.description}</small></div>
            {assault.weaponMaxHits > 0 && <div className={styles.weaponProgress} aria-label={`${assault.weaponHits} hits to weapon upgrade`}><i style={{ width: `${100 * (1 - assault.weaponHits / assault.weaponMaxHits)}%` }} /></div>}
          </div>}
          {!tutorialLesson && <div className={styles.defenseStatus} data-danger={assault.frontline > 505} role="meter" aria-label="Defense integrity" aria-valuemin={0} aria-valuemax={assault.maxIntegrity} aria-valuenow={assault.integrity}>
            <span>{assault.frontline > 505 ? "DEFEND THE LINE" : "DEFENSE"}</span>
            <div aria-hidden="true">{Array.from({ length: assault.maxIntegrity }, (_, i) => <i key={i} data-active={i < assault.integrity}>◆</i>)}</div>
          </div>}
          <div className={styles.assaultStats} aria-live="polite">
            <div className={styles.assaultStat} data-testid="crowd-count"><strong>{hud.crowd}</strong><span>CROWD</span></div>
            <div className={styles.assaultStat} data-testid="cannon-tier"><strong>{assault.tier}</strong><span>CANNONS</span></div>
            {assault.reserve > 0 && <div className={styles.assaultStat}><strong>{assault.reserve}</strong><span>RESERVE</span></div>}
          </div>
          <button type="button" className={`${styles.championButton} ${!battleEnded && hud.charge >= CHARGE_MAX ? styles.championReady : ""}`} data-testid="champion-button" onClick={launch} onPointerDown={(event) => {
            // A second thumb does not produce a compatibility click while the
            // steering thumb is held. Launch without releasing that drag.
            if (event.pointerType === "touch" && !event.isPrimary) {
              event.preventDefault();
              launch();
            }
          }} disabled={battleEnded || hud.charge < CHARGE_MAX} aria-label={battleEnded ? "Champion unavailable" : hud.charge >= CHARGE_MAX ? "Launch champion" : `Champion charge ${Math.floor(hud.charge)} of ${CHARGE_MAX}`}>
            {!battleEnded && !sideDanger && (!giantWinding || assault.bossCanInterrupt) && !contextualHint && hud.charge >= CHARGE_MAX && !topObjectiveHasChampionInstruction && <span className={styles.championCallout} role="status"><strong>{giantWinding ? assault.bossAim === "aligned" ? "ALIGNED · LAUNCH!" : "AIM AT THE GIANT" : assault.shields > 0 ? assault.shieldCleanup ? "FINISH THEM!" : assault.shieldAim === "aligned" ? "ALIGNED · LAUNCH!" : "BREAK THE SHIELD" : "CHAMPION READY"}</strong><small>{giantWinding ? assault.bossAim === "aligned" ? "Tap ★ or press Space" : `${bossInstruction} to aim your champion` : assault.shields > 0 ? assault.shieldCleanup ? "Keep firing, or tap ★ to break through" : assault.shieldAim === "aligned" ? "Tap ★ or press Space" : `${shieldInstruction} to aim your champion` : assault.frontline > 505 ? "Save the line!" : "Tap ★ or press Space"}</small></span>}
            <span className={styles.championRing} style={{ background: `conic-gradient(from -90deg, #ffe37b ${Math.min(100, (hud.charge / CHARGE_MAX) * 100)}%, rgba(255,255,255,.2) 0)` }} />
            <span className={styles.championCore} aria-hidden="true">★</span>
            <span className={styles.championLabel}>{battleEnded ? "ENDED" : hud.charge >= CHARGE_MAX ? "GO!" : "CHARGE"}</span>
          </button>
          <div className={styles.controlHint} aria-hidden="true"><span>HOLD + DRAG</span><span>W · FIRE</span><span>A D · STEER</span><span>SPACE · CHAMPION</span></div>
        </>
      )}

      {screen === "menu" && (
        <div className={`${styles.screenOverlay} ${styles.menuOverlay}`} data-testid="crowd-cannon-menu">
          <div className={styles.menuPanel}>
            <div className={styles.menuHero}>
            <div className={styles.menuTopline}>
              <Link href="/" className={styles.homeLink} data-testid="home-link" aria-label="Back to F.ADS home">← Home</Link>
              <span className={styles.menuMeta}>HORDE ASSAULT · {levels.length} ROUTES</span>
            </div>
            <div className={styles.brandLockup}><span>F.ADS ARCADE · HORDE ASSAULT</span><strong><em>CROWD</em> CANNON</strong></div>
            <p className={styles.menuLead}>Multiply your crowd. Build your firepower. Outlast the siege.</p>
            <div className={styles.progressCard}><div><span>CAMPAIGN</span><strong>★ {totalStars}<small> / {levels.length * 3}</small></strong></div><div className={styles.creditBalance}><span>UPGRADE CREDITS</span><strong>◈ {save.credits.toLocaleString()}</strong></div></div>
            <button type="button" className={`${styles.actionButton} ${styles.primaryAction} ${styles.playButton}`} data-testid="start-game" onClick={() => save.tutorialDone ? start(firstUnbeaten) : beginTutorial()}><span>{!save.tutorialDone ? "Learn to play" : totalStars ? "Continue run" : "Start run"}</span><span aria-hidden="true">→</span></button>
            <button type="button" className={styles.armoryEntry} data-testid="open-armory" onClick={() => { setArmoryNotice(""); setScreen("armory"); }}><UpgradeIcon kind="weapon" /><div><strong>THE ARMORY</strong><span>{loadout.tier} {loadout.tier === 1 ? "cannon" : "cannons"} · {weaponForLevel(loadout.weaponLevel).name} · upgrades stay with you</span></div><span aria-hidden="true">›</span></button>
            <div className={styles.trainingRow}><span>{save.tutorialDone ? "Hold + drag to steer. Tap the star to launch." : "Five quick drills. Then the full assault."}</span>{save.tutorialDone && <button type="button" onClick={beginTutorial}>Replay tutorial</button>}</div>
            </div>
            <div className={styles.menuRoutes}>
            <div className={styles.levelHeader}><span>CHOOSE A ROUTE</span><span>{levels.length} ROUTES</span></div>
            <p className={styles.routeUnlockHint}>{levels.every((_, index) => unlocked(index)) ? "All routes unlocked. Replay to earn more credits." : "Clear a route to unlock the next."}</p>
            <div className={styles.levelGrid}>
              {levels.map((item, index) => {
                const open = unlocked(index);
                return <button key={item.name} type="button" disabled={!open} data-level={index + 1} data-testid={`level-button-${index + 1}`} onClick={() => save.tutorialDone ? start(index) : beginTutorial()} title={item.name} aria-label={open ? `Level ${index + 1}: ${item.name}` : `Level ${index + 1} locked`} className={`${styles.levelButton} ${open ? styles.levelOpen : styles.levelLocked}`}><strong>{index + 1}</strong>{open ? <Stars n={save.stars[index] ?? 0} /> : <span className={styles.lock} aria-hidden="true" />}<small>{item.name}</small></button>;
              })}
            </div>
            <button type="button" className={styles.soundButton} onClick={toggleMute}><span className={styles.soundDot} data-muted={save.muted} />Sound {save.muted ? "off" : "on"}</button>
            </div>
          </div>
        </div>
      )}

      {screen === "armory" && <div className={`${styles.screenOverlay} ${styles.armoryOverlay}`} role="dialog" aria-modal="true" aria-labelledby="armory-title"><div className={`${styles.menuPanel} ${styles.armoryPanel}`}>
        <div className={styles.menuTopline}><button type="button" className={styles.homeLink} onClick={() => setScreen("menu")}>← Routes</button><span className={styles.armoryCredits}>◈ {save.credits.toLocaleString()}</span></div>
        <span className={styles.modalKicker}>BUILT FOR THE NEXT BATTLE</span><h2 id="armory-title">The Armory</h2><p className={styles.menuLead}>Permanent upgrades. Earn credits by clearing routes and improving your stars.</p>
        <div className={styles.earningGuide}><strong>WIN BATTLES → BUILD FIREPOWER</strong><span>First clear <b>+150</b> · Each new star <b>+40</b><br />Replay any cleared route for <b>+35</b></span></div>
        <div className={styles.loadoutSummary}>EQUIPPED <strong>{loadout.tier} {loadout.tier === 1 ? "cannon" : "cannons"} · {weaponForLevel(loadout.weaponLevel).name} · {loadout.charge}/30 charge</strong></div>
        <div className={styles.upgradeList}>{UPGRADE_DEFS.map((item) => {
          const rank = save.upgrades[item.id], cost = item.costs[rank], maxed = rank === item.maxrank;
          const next = item.id === "crew" ? `Start with ${Math.min(3, rank + 2)} cannons` : item.id === "weapon" ? `Start with ${weaponForLevel(Math.min(3, rank + 2)).name}` : `Start with ${Math.min(30, (rank + 1) * 10)}/30 champion charge`;
          return <div className={styles.upgradeCard} key={item.id} data-upgrade={item.id}><UpgradeIcon kind={item.id} /><div><strong>{item.title}</strong><span>{maxed ? "Fully equipped for every route" : next}</span><div className={styles.upgradeRanks} aria-label={`Rank ${rank} of ${item.maxrank}`}>{Array.from({ length: item.maxrank }, (_, i) => <i key={i} data-owned={i < rank} />)}</div></div><button type="button" onClick={() => purchase(item.id)} disabled={maxed || save.credits < cost} aria-label={maxed ? `${item.title} maxed` : `Upgrade ${item.title} for ${cost} credits`}>{maxed ? "MAX" : <>UPGRADE<strong>◈ {cost}</strong></>}</button></div>;
        })}</div>
        <p className={styles.armoryNotice} role="status">{armoryNotice || "Choose an upgrade. Equip it on every route."}</p>
        <button type="button" className={`${styles.actionButton} ${styles.primaryAction}`} onClick={() => save.tutorialDone ? start(firstUnbeaten) : beginTutorial()}>Take it into battle <span aria-hidden="true">→</span></button>
      </div></div>}

      {screen === "paused" && <div className={styles.screenOverlay} role="dialog" aria-modal="true" aria-labelledby="paused-title"><div className={styles.modalPanel}><div className={styles.modalTopline}><span className={styles.modalKicker}>{tutorialStep !== null ? "TRAINING" : `LEVEL ${levelIndex + 1}`}</span><Link href="/" className={styles.homeLink} data-testid="pause-home-link" aria-label="Back to F.ADS home">← Home</Link></div><h2 id="paused-title">Paused</h2><p>Catch your breath, then send the crowd through the next gate.</p><div className={styles.modalActions}><button type="button" className={`${styles.actionButton} ${styles.primaryAction}`} data-testid="resume-game" onClick={() => setScreen("playing")}>Resume</button><button type="button" className={`${styles.actionButton} ${styles.secondaryAction}`} onClick={() => tutorialStep !== null ? beginTutorial() : start(levelIndex)}>{tutorialStep !== null ? "Restart tutorial" : "Restart level"}</button><button type="button" className={`${styles.actionButton} ${styles.ghostAction}`} onClick={() => setScreen("menu")}>Level select</button></div><button type="button" className={styles.soundButton} onClick={toggleMute}>Sound {save.muted ? "off" : "on"}</button></div></div>}

      {screen === "trained" && <div className={`${styles.screenOverlay} ${styles.resultOverlay}`} role="dialog" aria-modal="true" aria-labelledby="trained-title"><div className={styles.modalPanel}><div className={styles.modalTopline}><span className={styles.modalKicker}>TRAINING</span><Link href="/" className={styles.homeLink} aria-label="Back to F.ADS home">← Home</Link></div><div className={styles.resultBadge}>TRAINING COMPLETE</div><h2 id="trained-title">Ready for the assault!</h2><p>Protect the cyan defense line. Each giant is followed by a counterattack—hold the line until every defender is gone.</p><ul className={styles.trainingRecap}><li><span>↔</span> Fire while you sweep across the lane.</li><li><span>×4</span> Chain the purple multiplier gates.</li><li><span>+1</span> Collect blue pickups to add a cannon.</li><li><span>↑</span> Break the red weapon lock to upgrade.</li><li><span>★</span> Launch a champion when the fight gets heavy.</li></ul><div className={styles.modalActions}><button type="button" className={`${styles.actionButton} ${styles.primaryAction}`} onClick={() => start(firstUnbeaten)}>{totalStars ? "Continue run" : "Play route 1"}<span aria-hidden="true">→</span></button><button type="button" className={`${styles.actionButton} ${styles.ghostAction}`} onClick={() => setScreen("menu")}>Route select</button></div></div></div>}

      {screen === "won" && <div className={`${styles.screenOverlay} ${styles.resultOverlay} ${!hasNext ? styles.campaignOverlay : ""}`} role="dialog" aria-modal="true" aria-labelledby="win-title">
        {!hasNext && <div className={styles.victoryConfetti} aria-hidden="true">{Array.from({ length: 24 }, (_, i) => <i key={i} style={{ left: `${(i * 37) % 100}%`, animationDelay: `${(i % 8) * 0.12}s`, background: ["#ffe279", "#65e3ff", "#f79aca", "#fff6ca"][i % 4] }} />)}</div>}
        <div className={`${styles.modalPanel} ${styles.winPanel} ${!hasNext ? styles.campaignPanel : ""}`}>
          <div className={styles.modalTopline}><span className={styles.modalKicker}>{hasNext ? `ROUTE ${levelIndex + 1}` : "CAMPAIGN FINALE"}</span><Link href="/" className={styles.homeLink} aria-label="Back to F.ADS home">← Home</Link></div>
          {!hasNext && <svg className={styles.campaignTrophy} viewBox="0 0 160 120" aria-hidden="true">
            <ellipse cx="80" cy="107" rx="40" ry="7" fill="#091d38" opacity=".35" />
            <path d="M48 25H25v12c0 21 12 31 29 31M112 25h23v12c0 21-12 31-29 31" fill="none" stroke="#dd9130" strokeWidth="12" strokeLinejoin="round" />
            <path d="M48 22H25v12c0 21 12 31 29 31M112 22h23v12c0 21-12 31-29 31" fill="none" stroke="#ffe491" strokeWidth="7" strokeLinejoin="round" />
            <path d="M70 64h20v26l17 9v8H53v-8l17-9Z" fill="#de9633" />
            <path d="M72 65h9v25l-15 9h33v5H60v-5l12-10Z" fill="#ffe27b" />
            <path d="M44 14h72l-6 35c-3 19-15 29-30 29S53 68 50 49Z" fill="#f6b947" stroke="#ffdf80" strokeWidth="3" />
            <path d="M48 18h32v55c-14 0-23-11-26-26Z" fill="#ffe888" />
            <path d="m80 28 6 12 14 2-10 10 2 14-12-7-12 7 2-14-10-10 14-2Z" fill="#c8752b" />
            <path d="m80 25 6 12 14 2-10 10 2 14-12-7-12 7 2-14-10-10 14-2Z" fill="#fff7c6" />
            <path d="m23 76 3 7 8 2-8 3-3 7-2-7-8-3 8-2Zm113-68 2 5 6 2-6 2-2 6-2-6-6-2 6-2Z" fill="#9ff5ff" />
          </svg>}
          <div className={styles.resultBadge}>{hasNext ? "ASSAULT CLEARED" : `ALL ${levels.length} ROUTES CONQUERED`}</div>
          <h2 id="win-title">{hasNext ? "Route cleared!" : "You held the line!"}</h2>
          <p>{hasNext ? `${level.name} secured. Leaders down, counterattacks defeated.` : "The last fortress has fallen. Your crowd conquered the whole campaign."}</p>
          <Stars n={result.stars} animated className={styles.resultStars} />
          <span className={styles.resultTime}>{result.time.toFixed(1)}s {result.best ? "· new best" : "· run complete"}</span>
          <span className={styles.resultTime}>Stars for speed · 3★ ≤ {level.par}s · 2★ ≤ {Number((level.par * 1.4).toFixed(1))}s</span>
          {!hasNext && <div className={styles.campaignStats}><div><strong>{totalStars}<small> / {levels.length * 3}</small></strong><span>CAMPAIGN STARS</span></div><div><strong>{hud.assault.integrity}<small> / {hud.assault.maxIntegrity}</small></strong><span>DEFENSE REMAINING</span></div></div>}
          <div className={styles.resultReward}><strong>◈ +{result.earned}</strong><small>UPGRADE CREDITS</small></div>
          <div className={styles.modalActions}>
            {!hasNext && <button type="button" className={`${styles.actionButton} ${styles.primaryAction}`} onClick={() => setScreen("menu")}>Return to your routes <span aria-hidden="true">→</span></button>}
            <button type="button" className={`${styles.actionButton} ${styles.secondaryAction}`} onClick={() => { setArmoryNotice(""); setScreen("armory"); }}>Upgrade your loadout <span aria-hidden="true">↗</span></button>
            {hasNext && <button type="button" className={`${styles.actionButton} ${styles.primaryAction}`} onClick={() => start(levelIndex + 1)}>Next route <span aria-hidden="true">→</span></button>}
            <button type="button" className={`${styles.actionButton} ${hasNext ? styles.secondaryAction : styles.ghostAction}`} onClick={() => start(levelIndex)}>{hasNext ? "Play again" : "Replay the final assault"}</button>
            {hasNext && <button type="button" className={`${styles.actionButton} ${styles.ghostAction}`} onClick={() => setScreen("menu")}>Route select</button>}
          </div>
        </div>
      </div>}

      {screen === "lost" && <div className={`${styles.screenOverlay} ${styles.loseOverlay}`} role="dialog" aria-modal="true" aria-labelledby="lose-title"><div className={styles.defeatEmbers} aria-hidden="true">{Array.from({ length: 15 }, (_, i) => <i key={i} style={{ left: `${i * 7}%`, animationDelay: `${-(i % 5) * 0.48}s` }} />)}</div><div className={`${styles.modalPanel} ${styles.losePanel}`}><div className={styles.modalTopline}><span className={styles.modalKicker}>ROUTE {levelIndex + 1}</span><Link href="/" className={styles.homeLink} aria-label="Back to F.ADS home">← Home</Link></div><svg className={styles.brokenShield} viewBox="0 0 100 94" aria-hidden="true"><path d="M47 8 13 20v24c0 18 12 32 28 39l7-26-12-9 17-19Z" fill="#dfe9ef" stroke="#fff" strokeWidth="3" /><path d="m61 10 26 10v24c0 17-11 31-25 38l-8-20 12-14-13-12Z" fill="#ec6886" stroke="#ffbac1" strokeWidth="3" /><path d="m43 0 9 19-4 10 14 12-13 16 2 25" fill="none" stroke="#ffe5a1" strokeWidth="3" /></svg><div className={`${styles.resultBadge} ${styles.loseBadge}`}>LINE BREACHED</div><h2 id="lose-title">Overrun!</h2><p>The crowd reached your cannons.<br />Follow the incoming lane and launch your champion before the line breaks.</p><div className={styles.modalActions}><button type="button" className={`${styles.actionButton} ${styles.primaryAction}`} onClick={() => start(levelIndex)}>Fight back <span aria-hidden="true">↻</span></button><button type="button" className={`${styles.actionButton} ${styles.ghostAction}`} onClick={() => setScreen("menu")}>Route select</button></div></div></div>}
    </div>
  );
}
