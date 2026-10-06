"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { H, W, launchChampion, newGame, stars, step, type Game } from "@/game/engine";
import { levels } from "@/game/levels";
import { CHAMP_BTN, draw } from "@/game/render";

const SAVE_KEY = "fads-crowd-cannon-v1";
const DT = 1 / 60;

type Save = { stars: number[]; muted: boolean };
type Screen = "menu" | "playing" | "paused" | "won" | "lost";

// Progress lives in this browser only. A small store so React reads it after hydration.
const EMPTY: Save = { stars: [], muted: false };
let cached: Save | null = null;
const listeners = new Set<() => void>();

function readSave(): Save {
  if (cached) return cached;
  cached = EMPTY;
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY) ?? "null");
    if (s && Array.isArray(s.stars)) cached = { stars: s.stars, muted: !!s.muted };
  } catch {}
  return cached;
}

function writeSave(s: Save) {
  cached = s;
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(s));
  } catch {}
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Tiny synth blips, so the game needs no sound files. */
function useSound(muted: boolean) {
  const ctxRef = useRef<AudioContext | null>(null);
  const last = useRef<Record<string, number>>({});
  return useCallback(
    (kind: "pop" | "hit" | "champ" | "win" | "lose") => {
      if (muted || typeof window === "undefined") return;
      const now = performance.now();
      const gap = kind === "pop" ? 70 : kind === "hit" ? 90 : 0;
      if (now - (last.current[kind] ?? 0) < gap) return;
      last.current[kind] = now;
      try {
        ctxRef.current ??= new AudioContext();
        const ac = ctxRef.current;
        if (ac.state === "suspended") void ac.resume();
        const notes: Record<string, [number, number, OscillatorType][]> = {
          pop: [[660 + Math.random() * 200, 0.06, "triangle"]],
          hit: [[140, 0.08, "square"]],
          champ: [[330, 0.12, "sawtooth"], [495, 0.15, "sawtooth"]],
          win: [[523, 0.14, "triangle"], [659, 0.14, "triangle"], [784, 0.3, "triangle"]],
          lose: [[300, 0.2, "sawtooth"], [200, 0.35, "sawtooth"]],
        };
        let t = ac.currentTime;
        for (const [freq, len, type] of notes[kind]) {
          const o = ac.createOscillator();
          const v = ac.createGain();
          o.type = type;
          o.frequency.value = freq;
          v.gain.setValueAtTime(kind === "pop" ? 0.05 : 0.09, t);
          v.gain.exponentialRampToValueAtTime(0.0001, t + len);
          o.connect(v).connect(ac.destination);
          o.start(t);
          o.stop(t + len);
          t += len * 0.8;
        }
      } catch {}
    },
    [muted],
  );
}

function Stars({ n, size = "text-lg" }: { n: number; size?: string }) {
  return (
    <span className={`${size} tracking-tight`} aria-label={`${n} of 3 stars`}>
      {[0, 1, 2].map((i) => (
        <span key={i} className={i < n ? "text-[#f5b301]" : "text-black/20"}>
          ★
        </span>
      ))}
    </span>
  );
}

export function CrowdCannon() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const save = useSyncExternalStore(subscribe, readSave, () => EMPTY);
  const [screen, setScreen] = useState<Screen>("menu");
  const [levelIndex, setLevelIndex] = useState(0);
  const [result, setResult] = useState({ time: 0, stars: 0, best: false });
  const [tip, setTip] = useState(false);
  const sound = useSound(save.muted);
  const screenRef = useRef(screen);
  const levelRef = useRef(levelIndex);
  const soundRef = useRef(sound);
  useEffect(() => {
    screenRef.current = screen;
    levelRef.current = levelIndex;
    soundRef.current = sound;
  });

  const start = useCallback((i: number) => {
    setLevelIndex(i);
    gameRef.current = newGame(levels[i], Date.now() & 0xffff);
    setScreen("playing");
    setTip(true);
  }, []);

  useEffect(() => {
    if (!tip) return;
    const t = setTimeout(() => setTip(false), 3500);
    return () => clearTimeout(t);
  }, [tip, levelIndex]);

  const finish = useCallback((g: Game) => {
    if (g.status === "won") {
      const i = levelRef.current;
      const s = stars(g.level, g.t);
      const prev = readSave();
      const next = { ...prev, stars: [...prev.stars] };
      const best = s > (next.stars[i] ?? 0);
      if (best) next.stars[i] = s;
      writeSave(next);
      setResult({ time: g.t, stars: s, best });
      soundRef.current("win");
      setScreen("won");
    } else {
      soundRef.current("lose");
      setScreen("lost");
    }
  }, []);

  // Main loop: fixed 60 Hz steps, drawn every animation frame.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let endAt = 0;
    let seen = { multiplied: 0, baseHits: 0, champions: 0 };
    let shown: Game | null = null;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const g = gameRef.current;
      const elapsed = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (g && g !== shown) {
        shown = g;
        endAt = 0;
        seen = { multiplied: 0, baseHits: 0, champions: 0 };
      }
      if (g && screenRef.current === "playing") {
        acc += elapsed;
        while (acc >= DT) {
          step(g, DT);
          acc -= DT;
        }
        if (g.stats.multiplied > seen.multiplied) soundRef.current("pop");
        if (g.stats.baseHits > seen.baseHits) soundRef.current("hit");
        if (g.stats.champions > seen.champions) soundRef.current("champ");
        seen = { multiplied: g.stats.multiplied, baseHits: g.stats.baseHits, champions: g.stats.champions };
        if (g.status !== "playing") {
          endAt ||= now + 900;
          if (now >= endAt) finish(g);
        }
      } else {
        acc = 0;
      }
      ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
      if (g) draw(ctx, g);
      else {
        ctx.fillStyle = "#f3e3c3";
        ctx.fillRect(0, 0, W, H);
      }
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [finish]);

  // Controls: hold and drag to aim and fire; tap the star (or press Space) for a champion.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const toWorld = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
    };
    let pointer: number | null = null;
    const down = (e: PointerEvent) => {
      const g = gameRef.current;
      if (!g || screenRef.current !== "playing") return;
      e.preventDefault();
      const p = toWorld(e);
      if (Math.hypot(p.x - CHAMP_BTN.x, p.y - CHAMP_BTN.y) < CHAMP_BTN.r + 6) {
        launchChampion(g);
        return;
      }
      pointer = e.pointerId;
      canvas.setPointerCapture(e.pointerId);
      g.targetX = p.x;
      g.firing = true;
    };
    const moveP = (e: PointerEvent) => {
      const g = gameRef.current;
      if (!g || e.pointerId !== pointer) return;
      g.targetX = toWorld(e).x;
    };
    const up = (e: PointerEvent) => {
      if (e.pointerId !== pointer) return;
      pointer = null;
      if (gameRef.current) gameRef.current.firing = false;
    };
    const keys = new Set<string>();
    let keyTimer = 0;
    const tick = () => {
      const g = gameRef.current;
      if (g && screenRef.current === "playing") {
        const dir = (keys.has("ArrowRight") || keys.has("d") ? 1 : 0) - (keys.has("ArrowLeft") || keys.has("a") ? 1 : 0);
        if (dir) {
          g.targetX = g.cannonX + dir * 30;
          g.firing = true;
        } else if (keys.has("ArrowUp") || keys.has("w")) {
          g.targetX = g.cannonX;
          g.firing = true;
        } else if (pointer === null) g.firing = false;
      }
      keyTimer = keys.size ? window.setTimeout(tick, 16) : 0;
    };
    const keydown = (e: KeyboardEvent) => {
      if (screenRef.current !== "playing") return;
      const g = gameRef.current;
      if (e.key === " ") {
        e.preventDefault();
        if (g) launchChampion(g);
        return;
      }
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "a", "d", "w"].includes(e.key)) {
        e.preventDefault();
        keys.add(e.key);
        if (!keyTimer) tick();
      }
    };
    const keyup = (e: KeyboardEvent) => keys.delete(e.key);
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", moveP);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);
    window.addEventListener("keydown", keydown);
    window.addEventListener("keyup", keyup);
    return () => {
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", moveP);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", up);
      window.removeEventListener("keydown", keydown);
      window.removeEventListener("keyup", keyup);
      clearTimeout(keyTimer);
    };
  }, []);

  // Pause when the tab is hidden.
  useEffect(() => {
    const vis = () => {
      if (document.hidden && screenRef.current === "playing") setScreen("paused");
    };
    document.addEventListener("visibilitychange", vis);
    return () => document.removeEventListener("visibilitychange", vis);
  }, []);

  const unlocked = (i: number) => i === 0 || (save.stars[i - 1] ?? 0) > 0;
  const totalStars = save.stars.reduce((a, b) => a + (b ?? 0), 0);
  const level = levels[levelIndex];
  const hasNext = levelIndex + 1 < levels.length;
  const firstUnbeaten = levels.findIndex((_, i) => !save.stars[i]);

  const toggleMute = () => writeSave({ ...save, muted: !save.muted });

  const overlay = "absolute inset-0 flex flex-col items-center justify-center bg-[#2a221b]/55 p-5 text-center backdrop-blur-[2px]";
  const card = "w-full max-w-[300px] rounded-2xl bg-[#fffdf8] p-5 text-[#1f1a14] shadow-xl";
  const primary =
    "w-full rounded-xl bg-[#e2531f] px-4 py-3 font-extrabold text-white shadow-[0_3px_0_#9c3510] active:translate-y-[2px] active:shadow-none";
  const secondary = "w-full rounded-xl border border-[#eadfca] px-4 py-2.5 font-bold text-[#1f1a14] hover:bg-[#fdf6e9]";

  return (
    <div
      className="relative mx-auto aspect-[9/16] w-full max-w-[440px] select-none overflow-hidden rounded-2xl border border-line shadow-lg"
      style={{ width: "min(100%, calc((100dvh - 150px) * 0.5625))", minWidth: "min(100%, 280px)" }}
    >
      <canvas
        ref={canvasRef}
        className="block h-full w-full touch-none"
        aria-label="Crowd Cannon game field. Hold and drag to aim and shoot; tap the star for a champion."
      />

      {screen === "playing" && (
        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-2">
          <button
            type="button"
            onClick={() => setScreen("paused")}
            className="pointer-events-auto rounded-lg bg-[#2a221b]/70 px-2.5 py-1 text-sm font-bold text-white"
            aria-label="Pause"
          >
            ❚❚
          </button>
        </div>
      )}

      {screen === "menu" && (
        <div className={`${overlay} justify-start overflow-y-auto`}>
          <div className={`${card} mt-2`}>
            <p className="text-xs font-bold tracking-widest text-[#e2531f] uppercase">F.ADS Arcade</p>
            <h2 className="mt-1 text-3xl font-black tracking-tight">Crowd Cannon</h2>
            <p className="mt-2 text-sm text-[#6b5f50]">
              Fire your crowd through the gates, multiply it and knock down the enemy base before they reach your cannon.
            </p>
            <div className="mt-4 grid grid-cols-4 gap-2">
              {levels.map((l, i) => {
                const open = unlocked(i);
                return (
                  <button
                    key={l.name}
                    type="button"
                    disabled={!open}
                    onClick={() => start(i)}
                    title={l.name}
                    className={`flex aspect-square flex-col items-center justify-center rounded-xl border text-lg font-black ${
                      open
                        ? "border-[#e2531f]/40 bg-[#fdf6e9] hover:bg-[#ffe9dc]"
                        : "cursor-not-allowed border-[#eadfca] bg-[#f4efe6] text-black/25"
                    }`}
                  >
                    {open ? i + 1 : "🔒"}
                    {open && <Stars n={save.stars[i] ?? 0} size="text-[10px]" />}
                  </button>
                );
              })}
            </div>
            <p className="mt-3 text-xs text-[#6b5f50]">
              ★ {totalStars} / {levels.length * 3}
            </p>
            <button type="button" className={`${primary} mt-3`} onClick={() => start(Math.max(0, firstUnbeaten))}>
              {totalStars ? "Continue" : "Play"}
            </button>
            <button type="button" className="mt-3 text-xs text-[#6b5f50] underline" onClick={toggleMute}>
              Sound: {save.muted ? "off" : "on"}
            </button>
          </div>
        </div>
      )}

      {screen === "playing" && tip && level.tip && (
        <div className="pointer-events-none absolute inset-x-4 top-[46%] rounded-xl bg-[#2a221b]/75 px-3 py-2 text-center text-sm font-semibold text-white">
          {level.tip}
        </div>
      )}

      {screen === "paused" && (
        <div className={overlay}>
          <div className={card}>
            <h2 className="text-2xl font-black">Paused</h2>
            <p className="mt-1 text-sm text-[#6b5f50]">
              {levelIndex + 1}. {level.name}
            </p>
            <div className="mt-4 flex flex-col gap-2">
              <button type="button" className={primary} onClick={() => setScreen("playing")}>
                Resume
              </button>
              <button type="button" className={secondary} onClick={() => start(levelIndex)}>
                Restart
              </button>
              <button type="button" className={secondary} onClick={() => setScreen("menu")}>
                Levels
              </button>
              <button type="button" className="mt-1 text-xs text-[#6b5f50] underline" onClick={toggleMute}>
                Sound: {save.muted ? "off" : "on"}
              </button>
            </div>
          </div>
        </div>
      )}

      {screen === "won" && (
        <div className={overlay}>
          <div className={`${card} animate-[pop_0.25s_ease-out]`}>
            <p className="text-xs font-bold tracking-widest text-[#1f7a4d] uppercase">Base destroyed</p>
            <h2 className="mt-1 text-2xl font-black">{hasNext ? "Level cleared!" : "You beat every level!"}</h2>
            <div className="mt-2">
              <Stars n={result.stars} size="text-4xl" />
            </div>
            <p className="mt-1 text-sm text-[#6b5f50]">
              {result.time.toFixed(1)}s{result.stars < 3 ? ` · beat ${level.par}s for 3 stars` : ""}
              {result.best ? " · new best" : ""}
            </p>
            <div className="mt-4 flex flex-col gap-2">
              {hasNext && (
                <button type="button" className={primary} onClick={() => start(levelIndex + 1)}>
                  Next level
                </button>
              )}
              <button type="button" className={hasNext ? secondary : primary} onClick={() => start(levelIndex)}>
                Play again
              </button>
              <button type="button" className={secondary} onClick={() => setScreen("menu")}>
                Levels
              </button>
            </div>
          </div>
        </div>
      )}

      {screen === "lost" && (
        <div className={overlay}>
          <div className={`${card} animate-[pop_0.25s_ease-out]`}>
            <p className="text-xs font-bold tracking-widest text-[#b42318] uppercase">They broke through</p>
            <h2 className="mt-1 text-2xl font-black">Try again</h2>
            <p className="mt-2 text-sm text-[#6b5f50]">
              Keep enemies off the dashed line. Swing the cannon over to block them, and save the star for brutes.
            </p>
            <div className="mt-4 flex flex-col gap-2">
              <button type="button" className={primary} onClick={() => start(levelIndex)}>
                Retry
              </button>
              <button type="button" className={secondary} onClick={() => setScreen("menu")}>
                Levels
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
