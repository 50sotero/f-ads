"use client";

import "@fontsource/fredoka/600.css";
import "@fontsource/fredoka/700.css";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";

import { applyStartingLoadout, CHARGE_MAX, launchChampion, newGame, stars, step, W, weaponForLevel, type Game } from "@/game/engine";
import { levels } from "@/game/levels";
import { createRenderer } from "@/game/render";
import { advanceTutorial, newTutorialProgress, tutorialLessons, tutorialLevel, type TutorialProgress } from "@/game/tutorial";
import { buyUpgrade, completeRoute, emptyCampaignSave, normalizeCampaignSave, startingLoadout, UPGRADE_DEFS, type CampaignSave, type UpgradeId } from "@/game/progression";

import styles from "./CrowdCannon.module.css";

const SAVE_KEY = "fads-crowd-cannon-v1";
const DT = 1 / 60;

type Save = CampaignSave;
type Screen = "menu" | "armory" | "playing" | "paused" | "won" | "lost" | "trained";
type SoundKind = "shot" | "pop" | "hit" | "champ" | "upgrade" | "alert" | "win" | "lose";
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
  remaining: number;
  integrity: number;
  maxIntegrity: number;
  breachFlash: number;
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
  remaining: 0,
  integrity: 3,
  maxIntegrity: 3,
  breachFlash: 0,
});

function assaultHud(game: Game): AssaultHud {
  const assault = game.assault;
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
    remaining: assault?.remaining ?? 0,
    integrity: assault?.integrity ?? 3,
    maxIntegrity: assault?.maxIntegrity ?? 3,
    breachFlash: assault?.breachFlash ?? 0,
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
  const lastRef = useRef<Record<SoundKind, number>>({ shot: 0, pop: 0, hit: 0, champ: 0, upgrade: 0, alert: 0, win: 0, lose: 0 });
  useEffect(() => () => {
    void contextRef.current?.close();
    contextRef.current = null;
  }, []);

  return useCallback(
    (kind: SoundKind) => {
      if (muted || typeof window === "undefined") return;
      const now = performance.now();
      const gap = kind === "shot" ? 45 : kind === "pop" ? 110 : kind === "hit" ? 120 : 0;
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
          upgrade: [[440, 0.1, "triangle"], [660, 0.1, "triangle"], [880, 0.22, "triangle"]],
          alert: [[587, 0.13, "triangle"], [440, 0.13, "triangle"], [587, 0.2, "triangle"]],
          win: [[523, 0.14, "triangle"], [659, 0.14, "triangle"], [784, 0.3, "triangle"]],
          lose: [[300, 0.2, "sawtooth"], [200, 0.35, "sawtooth"]],
        };
        let time = context.currentTime;
        for (const [frequency, length, oscillatorType] of notes[kind]) {
          const oscillator = context.createOscillator();
          const gain = context.createGain();
          oscillator.type = oscillatorType;
          oscillator.frequency.value = frequency;
          gain.gain.setValueAtTime(0.0001, time);
          gain.gain.exponentialRampToValueAtTime(kind === "shot" ? 0.035 : kind === "pop" ? 0.04 : 0.07, time + 0.004);
          if (kind === "shot") oscillator.frequency.exponentialRampToValueAtTime(100, time + length);
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
    let shown: Game | null = null;
    let hudAt = 0;
    let needsDraw = true;
    let seen = { fired: 0, multiplied: 0, baseHits: 0, champions: 0, weapon: 1, phase: "battle" };
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
        seen = { fired: 0, multiplied: 0, baseHits: 0, champions: 0, weapon: 1, phase: "battle" };
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
        seen = { fired: game.stats.fired, multiplied: game.stats.multiplied, baseHits: game.stats.baseHits, champions: game.stats.champions, weapon: game.assault?.weaponLevel ?? 1, phase: game.assault?.phase ?? "battle" };
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
          && previous.assault.remaining === nextAssault.remaining
          && previous.assault.integrity === nextAssault.integrity
          && previous.assault.breachFlash === nextAssault.breachFlash
          ? previous : { crowd: game.blue.length, time: game.t, charge: game.charge, assault: nextAssault });
      }

      try {
        if (screenRef.current === "playing" || needsDraw) {
          renderer.render(game, screenRef.current === "playing" ? elapsed : 0);
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
    const reset = () => {
      pointerRef.current = null;
      keysRef.current.clear();
      if (gameRef.current) gameRef.current.firing = false;
    };
    const down = (event: PointerEvent) => {
      const game = gameRef.current;
      if (!game || screenRef.current !== "playing") return;
      if (event.pointerType === "mouse" && event.button !== 0) return;
      if (pointerRef.current !== null) return;
      event.preventDefault();
      pointerRef.current = event.pointerId;
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
      if (event.pointerId !== pointerRef.current) return;
      try {
        canvas.releasePointerCapture(event.pointerId);
      } catch {
        // Pointer capture may already have been released by the browser.
      }
      reset();
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
    window.addEventListener("keydown", keydown);
    window.addEventListener("keyup", keyup);
    window.addEventListener("blur", reset);
    return () => {
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", up);
      canvas.removeEventListener("lostpointercapture", reset);
      window.removeEventListener("keydown", keydown);
      window.removeEventListener("keyup", keyup);
      window.removeEventListener("blur", reset);
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
    const onVisibilityChange = () => {
      if (document.hidden && screenRef.current === "playing") {
        screenRef.current = "paused";
        setScreen("paused");
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, []);

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
  const loadout = startingLoadout(save);
  const weapon = weaponForLevel(assault.weaponLevel);
  const tutorialLesson = tutorialStep !== null && tutorialStep < tutorialLessons.length ? tutorialLessons[tutorialStep] : null;
  const contextualHint = tutorialStep === null && levelIndex === 0
    ? hud.time < 4 ? "Hold + drag · Build your crowd through the gates"
      : hud.time < 8 && assault.weaponLevel === 1 ? "Side locks unlock extra cannons and better weapons"
        : hud.time < 12 ? "Protect the cyan line · Tap the star for a champion" : null
    : null;
  const hasNext = levelIndex + 1 < levels.length;
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
            <button type="button" className={styles.pauseButton} data-testid="pause-game" onClick={() => { screenRef.current = "paused"; setScreen("paused"); }} aria-label="Pause game"><span aria-hidden="true">Ⅱ</span></button>
            <div className={styles.levelPill} data-testid="assault-hud"><strong>CROWD<br /><em>CANNON</em></strong><span>{tutorialStep !== null ? `TRAINING ${Math.min(tutorialLessons.length, tutorialStep + 1)} / ${tutorialLessons.length}` : `LEVEL ${levelIndex + 1}`}</span></div>
            <div className={styles.encounterProgress} data-testid="encounter-progress" role="progressbar" aria-label="Assault stage progress" aria-valuemin={1} aria-valuemax={assault.encounters} aria-valuenow={Math.min(assault.encounters, assault.encounter + 1)}>
              <span className={styles.encounterLabel}>STAGE {Math.min(assault.encounters, assault.encounter + 1)} / {assault.encounters}</span>
              <span className={styles.encounterDots} aria-hidden="true">{Array.from({ length: assault.encounters }, (_, index) => <i key={index} data-done={index < assault.encounter} data-current={index === assault.encounter} />)}</span>
            </div>
          </div>
          {!tutorialLesson && assault.waves > 0 && <div className={styles.battleObjective} data-testid="battle-objective" data-phase={assault.phase} data-warning={assault.waveWarning > 0} data-compact={assault.phase === "counterattack" || assault.phase === "battle" && hud.time > 4}>
            <span className={styles.objectiveIcon} aria-hidden="true">{assault.phase === "counterattack" ? "!" : assault.phase === "advance" ? "»" : "⚑"}</span>
            <div><strong>{assault.phase === "counterattack" ? assault.waveWarning > 0 ? `${assault.waveLane < 0 ? "← LEFT" : assault.waveLane > 0 ? "RIGHT →" : "CENTER"} WAVE INCOMING` : `${assault.remaining} DEFENDERS LEFT` : assault.phase === "advance" ? "STAGE CLEARED" : "BREAK THEIR LEADER"}</strong>
              <span>{assault.phase === "counterattack"
                ? `${assault.remaining} enemies left · ${assault.waveWarning > 0 ? `${assault.waveLane < 0 ? "LEFT" : assault.waveLane > 0 ? "RIGHT" : "CENTER"} WAVE INCOMING` : `wave ${assault.wave} / ${assault.waves}`}`
                : assault.phase === "advance" ? "Keep your upgrades. Push forward!" : "Then survive the counterattack"}</span></div>
            {assault.phase === "counterattack" && <span className={styles.wavePips} aria-label={`${assault.wave} of ${assault.waves} waves deployed`}>{Array.from({ length: assault.waves }, (_, i) => <i key={i} data-done={i < assault.wave} />)}</span>}
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
          <button type="button" className={`${styles.championButton} ${hud.charge >= CHARGE_MAX ? styles.championReady : ""}`} data-testid="champion-button" onClick={launch} disabled={hud.charge < CHARGE_MAX} aria-label={hud.charge >= CHARGE_MAX ? "Launch champion" : `Champion charge ${Math.floor(hud.charge)} of ${CHARGE_MAX}`}>
            {hud.charge >= CHARGE_MAX && <span className={styles.championCallout} role="status"><strong>CHAMPION READY</strong><small>{assault.frontline > 505 ? "Save the line!" : "Tap ★ or press Space"}</small></span>}
            <span className={styles.championRing} style={{ background: `conic-gradient(from -90deg, #ffe37b ${Math.min(100, (hud.charge / CHARGE_MAX) * 100)}%, rgba(255,255,255,.2) 0)` }} />
            <span className={styles.championCore} aria-hidden="true">★</span>
            <span className={styles.championLabel}>{hud.charge >= CHARGE_MAX ? "GO!" : "CHARGE"}</span>
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

      {screen === "won" && <div className={`${styles.screenOverlay} ${styles.resultOverlay}`} role="dialog" aria-modal="true" aria-labelledby="win-title"><div className={`${styles.modalPanel} ${styles.winPanel}`}><div className={styles.modalTopline}><span className={styles.modalKicker}>ROUTE {levelIndex + 1}</span><Link href="/" className={styles.homeLink} aria-label="Back to F.ADS home">← Home</Link></div><div className={styles.resultBadge}>ASSAULT CLEARED</div><h2 id="win-title">{hasNext ? "Route cleared!" : "Army defeated!"}</h2><p>{hasNext ? `${level.name} secured. Leaders down, counterattacks defeated.` : "Every leader and every reinforcement defeated. The whole assault is yours."}</p><Stars n={result.stars} animated className={styles.resultStars} /><span className={styles.resultTime}>{result.time.toFixed(1)}s {result.best ? "· new best" : "· run complete"}</span><div className={styles.resultReward}><strong>◈ +{result.earned}</strong><small>UPGRADE CREDITS</small></div><div className={styles.modalActions}><button type="button" className={`${styles.actionButton} ${styles.secondaryAction}`} onClick={() => { setArmoryNotice(""); setScreen("armory"); }}>Upgrade your loadout <span aria-hidden="true">↗</span></button>{hasNext && <button type="button" className={`${styles.actionButton} ${styles.primaryAction}`} onClick={() => start(levelIndex + 1)}>Next route <span aria-hidden="true">→</span></button>}<button type="button" className={`${styles.actionButton} ${hasNext ? styles.secondaryAction : styles.primaryAction}`} onClick={() => start(levelIndex)}>Play again</button><button type="button" className={`${styles.actionButton} ${styles.ghostAction}`} onClick={() => setScreen("menu")}>Route select</button></div></div></div>}

      {screen === "lost" && <div className={`${styles.screenOverlay} ${styles.loseOverlay}`} role="dialog" aria-modal="true" aria-labelledby="lose-title"><div className={styles.defeatEmbers} aria-hidden="true">{Array.from({ length: 15 }, (_, i) => <i key={i} style={{ left: `${i * 7}%`, animationDelay: `${-(i % 5) * 0.48}s` }} />)}</div><div className={`${styles.modalPanel} ${styles.losePanel}`}><div className={styles.modalTopline}><span className={styles.modalKicker}>ROUTE {levelIndex + 1}</span><Link href="/" className={styles.homeLink} aria-label="Back to F.ADS home">← Home</Link></div><svg className={styles.brokenShield} viewBox="0 0 100 94" aria-hidden="true"><path d="M47 8 13 20v24c0 18 12 32 28 39l7-26-12-9 17-19Z" fill="#dfe9ef" stroke="#fff" strokeWidth="3" /><path d="m61 10 26 10v24c0 17-11 31-25 38l-8-20 12-14-13-12Z" fill="#ec6886" stroke="#ffbac1" strokeWidth="3" /><path d="m43 0 9 19-4 10 14 12-13 16 2 25" fill="none" stroke="#ffe5a1" strokeWidth="3" /></svg><div className={`${styles.resultBadge} ${styles.loseBadge}`}>LINE BREACHED</div><h2 id="lose-title">Overrun!</h2><p>The crowd reached your cannons.<br />Follow the incoming lane and launch your champion before the line breaks.</p><div className={styles.modalActions}><button type="button" className={`${styles.actionButton} ${styles.primaryAction}`} onClick={() => start(levelIndex)}>Fight back <span aria-hidden="true">↻</span></button><button type="button" className={`${styles.actionButton} ${styles.ghostAction}`} onClick={() => setScreen("menu")}>Route select</button></div></div></div>}
    </div>
  );
}
