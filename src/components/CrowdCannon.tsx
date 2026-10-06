"use client";

import "@fontsource/fredoka/600.css";
import "@fontsource/fredoka/700.css";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

import { CHARGE_MAX, launchChampion, newGame, stars, step, W, type Game } from "@/game/engine";
import { levels } from "@/game/levels";
import { createRenderer } from "@/game/render";

import styles from "./CrowdCannon.module.css";

const SAVE_KEY = "fads-crowd-cannon-v1";
const DT = 1 / 60;

type Save = { stars: number[]; muted: boolean };
type Screen = "menu" | "playing" | "paused" | "won" | "lost";
type SoundKind = "pop" | "hit" | "champ" | "win" | "lose";

const EMPTY: Save = { stars: [], muted: false };
let cached: Save | null = null;
const listeners = new Set<() => void>();

function readSave(): Save {
  if (cached) return cached;
  cached = EMPTY;
  if (typeof window === "undefined") return cached;
  try {
    const value = JSON.parse(window.localStorage.getItem(SAVE_KEY) ?? "null");
    if (value && Array.isArray(value.stars)) cached = { stars: value.stars, muted: !!value.muted };
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
function useSound(muted: boolean) {
  const contextRef = useRef<AudioContext | null>(null);
  const lastRef = useRef<Record<SoundKind, number>>({ pop: 0, hit: 0, champ: 0, win: 0, lose: 0 });

  return useCallback(
    (kind: SoundKind) => {
      if (muted || typeof window === "undefined") return;
      const now = performance.now();
      const gap = kind === "pop" ? 70 : kind === "hit" ? 90 : 0;
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
          pop: [[660 + Math.random() * 200, 0.06, "triangle"]],
          hit: [[140, 0.08, "square"]],
          champ: [[330, 0.12, "sawtooth"], [495, 0.15, "sawtooth"]],
          win: [[523, 0.14, "triangle"], [659, 0.14, "triangle"], [784, 0.3, "triangle"]],
          lose: [[300, 0.2, "sawtooth"], [200, 0.35, "sawtooth"]],
        };
        let time = context.currentTime;
        for (const [frequency, length, oscillatorType] of notes[kind]) {
          const oscillator = context.createOscillator();
          const gain = context.createGain();
          oscillator.type = oscillatorType;
          oscillator.frequency.value = frequency;
          gain.gain.setValueAtTime(kind === "pop" ? 0.05 : 0.09, time);
          gain.gain.exponentialRampToValueAtTime(0.0001, time + length);
          oscillator.connect(gain).connect(context.destination);
          oscillator.start(time);
          oscillator.stop(time + length);
          time += length * 0.8;
        }
      } catch {
        // Audio is an enhancement; browsers can reject a context before a gesture.
      }
    },
    [muted],
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

export function CrowdCannon() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<ReturnType<typeof createRenderer> | null>(null);
  const gameRef = useRef<Game | null>(null);
  const previewRef = useRef<Game | null>(null);
  const pointerRef = useRef<number | null>(null);
  const keysRef = useRef(new Set<string>());
  const save = useSyncExternalStore(subscribe, readSave, () => EMPTY);
  const [screen, setScreen] = useState<Screen>("menu");
  const [levelIndex, setLevelIndex] = useState(0);
  const [result, setResult] = useState({ time: 0, stars: 0, best: false });
  const [tip, setTip] = useState(false);
  const [rendererError, setRendererError] = useState<string | null>(null);
  const [rendererNonce, setRendererNonce] = useState(0);
  const [hud, setHud] = useState({ crowd: 0, time: 0, charge: 0 });
  const sound = useSound(save.muted);
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
    gameRef.current = newGame(levels[index], (Date.now() ^ (index + 1) * 7919) & 0xffff);
    setHud({ crowd: 0, time: 0, charge: 0 });
    setResult({ time: 0, stars: 0, best: false });
    setScreen("playing");
    setTip(true);
  }, []);

  useEffect(() => {
    if (!tip) return;
    const timer = window.setTimeout(() => setTip(false), 3600);
    return () => window.clearTimeout(timer);
  }, [levelIndex, tip]);

  const finish = useCallback((game: Game) => {
    if (game.status === "won") {
      const index = levelRef.current;
      const rating = stars(game.level, game.t);
      const previous = readSave();
      const next = { ...previous, stars: [...previous.stars] };
      const best = rating > (next.stars[index] ?? 0);
      if (best) next.stars[index] = rating;
      writeSave(next);
      setResult({ time: game.t, stars: rating, best });
      soundRef.current("win");
      setScreen("won");
    } else {
      soundRef.current("lose");
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
    let seen = { multiplied: 0, baseHits: 0, champions: 0 };
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      renderer.resize(Math.max(1, rect.width), Math.max(1, rect.height));
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
        accumulator = 0;
        endAt = 0;
        seen = { multiplied: 0, baseHits: 0, champions: 0 };
      }

      if (screenRef.current === "playing") {
        accumulator += elapsed;
        while (accumulator >= DT) {
          step(game, DT);
          accumulator -= DT;
        }
        if (game.stats.multiplied > seen.multiplied) soundRef.current("pop");
        if (game.stats.baseHits > seen.baseHits) soundRef.current("hit");
        if (game.stats.champions > seen.champions) soundRef.current("champ");
        seen = { multiplied: game.stats.multiplied, baseHits: game.stats.baseHits, champions: game.stats.champions };
        if (game.status !== "playing") {
          endAt ||= now + 900;
          if (now >= endAt) finish(game);
        }
      } else {
        accumulator = 0;
      }

      if (now - hudAt > 80) {
        hudAt = now;
        setHud({ crowd: game.blue.length, time: game.t, charge: game.charge });
      }

      try {
        renderer.render(game, screenRef.current === "playing" ? elapsed : 0);
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
    const toWorldX = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const normalized = Math.max(0, Math.min(1, (event.clientX - rect.left) / Math.max(1, rect.width)));
      return rendererRef.current?.aimX(normalized) ?? normalized * W;
    };
    let keyTimer = 0;
    const reset = () => {
      if (keyTimer) window.clearTimeout(keyTimer);
      keyTimer = 0;
      pointerRef.current = null;
      keysRef.current.clear();
      if (gameRef.current) gameRef.current.firing = false;
    };
    const down = (event: PointerEvent) => {
      const game = gameRef.current;
      if (!game || screenRef.current !== "playing") return;
      if (pointerRef.current !== null) return;
      event.preventDefault();
      pointerRef.current = event.pointerId;
      try {
        canvas.setPointerCapture(event.pointerId);
      } catch {
        // Pointer capture is unavailable in a few embedded browsers.
      }
      game.targetX = toWorldX(event);
      game.firing = true;
    };
    const move = (event: PointerEvent) => {
      const game = gameRef.current;
      if (!game || event.pointerId !== pointerRef.current || screenRef.current !== "playing") return;
      game.targetX = toWorldX(event);
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
    const tickKeyboard = () => {
      keyTimer = 0;
      const game = gameRef.current;
      if (!game || screenRef.current !== "playing") {
        reset();
        return;
      }
      const keys = keysRef.current;
      const direction = (keys.has("ArrowRight") || keys.has("d") ? 1 : 0) - (keys.has("ArrowLeft") || keys.has("a") ? 1 : 0);
      if (direction) {
        game.targetX = Math.max(0, Math.min(W, game.cannonX + direction * 42));
        game.firing = true;
      } else if (keys.has("ArrowUp") || keys.has("w")) {
        game.targetX = game.cannonX;
        game.firing = true;
      } else if (pointerRef.current === null) {
        game.firing = false;
      }
      if (keys.size) keyTimer = window.setTimeout(tickKeyboard, 16);
    };
    const keydown = (event: KeyboardEvent) => {
      if (screenRef.current !== "playing") return;
      if (event.repeat) return;
      const game = gameRef.current;
      if (event.key === " ") {
        event.preventDefault();
        if (game && launchChampion(game)) soundRef.current("champ");
        return;
      }
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "a", "d", "w"].includes(event.key)) {
        event.preventDefault();
        keysRef.current.add(event.key);
        if (!keyTimer) tickKeyboard();
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
      if (document.hidden && screenRef.current === "playing") setScreen("paused");
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, []);

  const unlocked = (index: number) => index === 0 || (save.stars[index - 1] ?? 0) > 0;
  const totalStars = save.stars.reduce((total, value) => total + (value ?? 0), 0);
  const level = levels[levelIndex];
  const hasNext = levelIndex + 1 < levels.length;
  const firstUnbeaten = Math.max(0, levels.findIndex((_, index) => !save.stars[index]));
  const toggleMute = () => writeSave({ ...save, muted: !save.muted });
  const launch = () => {
    const game = gameRef.current;
    if (!game || screenRef.current !== "playing") return;
    if (launchChampion(game)) soundRef.current("champ");
  };

  return (
    <div className={styles.gameShell} data-screen={screen} data-level={levelIndex + 1} aria-label="Crowd Cannon arcade game">
      <canvas ref={canvasRef} className={styles.canvas} aria-label="Crowd Cannon game field. Hold and drag to aim and shoot." />
      <div className={styles.sceneShade} aria-hidden="true" />

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
            <button type="button" className={styles.pauseButton} onClick={() => setScreen("paused")} aria-label="Pause game"><span aria-hidden="true">Ⅱ</span></button>
            <div className={styles.levelPill}><span>LEVEL {levelIndex + 1}</span><strong>{level.name}</strong></div>
            <div className={styles.hudStats} aria-live="polite">
              <div className={styles.hudStat}><span className={styles.hudIcon} aria-hidden="true">●</span><strong>{hud.crowd}</strong><small>CROWD</small></div>
              <div className={styles.hudStat}><span className={styles.hudIcon} aria-hidden="true">◷</span><strong>{hud.time.toFixed(1)}</strong><small>TIME</small></div>
            </div>
          </div>
          {tip && level.tip && <div className={styles.tip}>{level.tip}</div>}
          <button type="button" className={`${styles.championButton} ${hud.charge >= CHARGE_MAX ? styles.championReady : ""}`} onClick={launch} disabled={hud.charge < CHARGE_MAX} aria-label={hud.charge >= CHARGE_MAX ? "Launch champion" : `Champion charge ${Math.floor(hud.charge)} of ${CHARGE_MAX}`}>
            <span className={styles.championRing} style={{ background: `conic-gradient(from -90deg, #ffe37b ${Math.min(100, (hud.charge / CHARGE_MAX) * 100)}%, rgba(255,255,255,.2) 0)` }} />
            <span className={styles.championCore} aria-hidden="true">★</span>
            <span className={styles.championLabel}>{hud.charge >= CHARGE_MAX ? "GO!" : "CHARGE"}</span>
          </button>
          <div className={styles.controlHint} aria-hidden="true"><span>HOLD + DRAG TO STEER</span><span>SPACE · CHAMPION</span></div>
        </>
      )}

      {screen === "menu" && (
        <div className={`${styles.screenOverlay} ${styles.menuOverlay}`}>
          <div className={styles.menuPanel}>
            <div className={styles.brandLockup}><span>F.ADS ARCADE</span><strong><em>CROWD</em> CANNON</strong></div>
            <p className={styles.menuLead}>Build your crew. Break their keep. Find the perfect line through every gate.</p>
            <div className={styles.progressCard}><div><span>YOUR RUN</span><strong>{totalStars}<small> / {levels.length * 3} stars</small></strong></div><Stars n={Math.min(3, Math.round(totalStars / Math.max(1, levels.length)))} /></div>
            <button type="button" className={`${styles.actionButton} ${styles.primaryAction} ${styles.playButton}`} onClick={() => start(firstUnbeaten)}><span>{totalStars ? "Continue run" : "Start run"}</span><span aria-hidden="true">→</span></button>
            <div className={styles.levelHeader}><span>SELECT A LEVEL</span><span>{levels.length} STAGES</span></div>
            <div className={styles.levelGrid}>
              {levels.map((item, index) => {
                const open = unlocked(index);
                return <button key={item.name} type="button" disabled={!open} data-level={index + 1} onClick={() => start(index)} title={item.name} aria-label={open ? `Level ${index + 1}: ${item.name}` : `Level ${index + 1} locked`} className={`${styles.levelButton} ${open ? styles.levelOpen : styles.levelLocked}`}><strong>{open ? index + 1 : "·"}</strong>{open ? <Stars n={save.stars[index] ?? 0} /> : <span className={styles.lock} aria-hidden="true">◆</span>}<small>{item.name}</small></button>;
              })}
            </div>
            <button type="button" className={styles.soundButton} onClick={toggleMute}><span className={styles.soundDot} data-muted={save.muted} />Sound {save.muted ? "off" : "on"}</button>
          </div>
        </div>
      )}

      {screen === "paused" && <div className={styles.screenOverlay} role="dialog" aria-modal="true" aria-labelledby="paused-title"><div className={styles.modalPanel}><span className={styles.modalKicker}>LEVEL {levelIndex + 1}</span><h2 id="paused-title">Paused</h2><p>Catch your breath, then send the crowd through the next gate.</p><div className={styles.modalActions}><button type="button" className={`${styles.actionButton} ${styles.primaryAction}`} onClick={() => setScreen("playing")}>Resume</button><button type="button" className={`${styles.actionButton} ${styles.secondaryAction}`} onClick={() => start(levelIndex)}>Restart level</button><button type="button" className={`${styles.actionButton} ${styles.ghostAction}`} onClick={() => setScreen("menu")}>Level select</button></div><button type="button" className={styles.soundButton} onClick={toggleMute}>Sound {save.muted ? "off" : "on"}</button></div></div>}

      {screen === "won" && <div className={`${styles.screenOverlay} ${styles.resultOverlay}`} role="dialog" aria-modal="true" aria-labelledby="win-title"><div className={`${styles.modalPanel} ${styles.winPanel}`}><div className={styles.resultBadge}>BASE DOWN</div><h2 id="win-title">{hasNext ? "Level cleared!" : "Victory!"}</h2><p>{hasNext ? `You cleared ${level.name}. Ready for the next push?` : "Every enemy keep is dust. The whole course is yours."}</p><Stars n={result.stars} animated className={styles.resultStars} /><span className={styles.resultTime}>{result.time.toFixed(1)}s {result.best ? "· new best" : "· run complete"}</span><div className={styles.modalActions}>{hasNext && <button type="button" className={`${styles.actionButton} ${styles.primaryAction}`} onClick={() => start(levelIndex + 1)}>Next level <span aria-hidden="true">→</span></button>}<button type="button" className={`${styles.actionButton} ${hasNext ? styles.secondaryAction : styles.primaryAction}`} onClick={() => start(levelIndex)}>Play again</button><button type="button" className={`${styles.actionButton} ${styles.ghostAction}`} onClick={() => setScreen("menu")}>Level select</button></div></div></div>}

      {screen === "lost" && <div className={styles.screenOverlay} role="dialog" aria-modal="true" aria-labelledby="lose-title"><div className={styles.modalPanel}><div className={`${styles.resultBadge} ${styles.loseBadge}`}>KEEP BREACHED</div><h2 id="lose-title">The line broke</h2><p>Pull the cannon across the lane to meet the red crew before they reach your base.</p><div className={styles.modalActions}><button type="button" className={`${styles.actionButton} ${styles.primaryAction}`} onClick={() => start(levelIndex)}>Try again</button><button type="button" className={`${styles.actionButton} ${styles.ghostAction}`} onClick={() => setScreen("menu")}>Level select</button></div></div></div>}
    </div>
  );
}
