import type { Level } from "./engine";

// The field is 360 wide and 640 tall; the cannon sits at the bottom, enemy bases at the top.
// Gates work once per crowd member, so stacking them multiplies the crowd again.
export const levels: Level[] = [
  {
    name: "First Shot",
    tip: "Hold and drag to aim. Shoot through the ×2 gate to double your crowd.",
    par: 11,
    bases: [{ x: 180, y: 100, hp: 70, every: 3.2, group: 3 }],
    gates: [{ x: 180, y: 330, w: 150, kind: "x", n: 2 }],
  },
  {
    name: "Pick a Door",
    tip: "Bigger numbers make bigger crowds.",
    par: 13,
    bases: [{ x: 180, y: 100, hp: 140, every: 2.6, group: 5 }],
    gates: [
      { x: 95, y: 340, w: 110, kind: "x", n: 2 },
      { x: 265, y: 340, w: 110, kind: "x", n: 3 },
    ],
  },
  {
    name: "On the Move",
    tip: "Gates can slide. Follow the ×3.",
    par: 18,
    bases: [{ x: 180, y: 100, hp: 200, every: 2.4, group: 6 }],
    gates: [{ x: 180, y: 360, w: 100, kind: "x", n: 3, move: { range: 95, speed: 1.1 } }],
  },
  {
    name: "Double Stack",
    tip: "Line up two gates and the crowd multiplies twice.",
    par: 24,
    bases: [{ x: 180, y: 100, hp: 480, every: 2.2, group: 9 }],
    gates: [
      { x: 90, y: 420, w: 120, kind: "x", n: 2 },
      { x: 90, y: 260, w: 120, kind: "x", n: 3 },
      { x: 270, y: 340, w: 120, kind: "x", n: 2 },
    ],
    walls: [{ x: 168, y: 230, w: 24, h: 190 }],
  },
  {
    name: "Mind the Trap",
    tip: "Red gates swallow your crowd. Your champion walks straight through them.",
    par: 24,
    bases: [{ x: 180, y: 100, hp: 360, every: 2.2, group: 8 }],
    gates: [
      { x: 180, y: 440, w: 130, kind: "trap" },
      { x: 60, y: 300, w: 100, kind: "x", n: 4 },
      { x: 300, y: 300, w: 100, kind: "x", n: 2 },
    ],
  },
  {
    name: "Brute Force",
    tip: "Brutes take ten hits. Launch your champion when the meter is full.",
    par: 24,
    bases: [{ x: 180, y: 100, hp: 420, every: 2.6, group: 7, bruteEvery: 7, bruteHp: 20 }],
    gates: [
      { x: 180, y: 440, w: 120, kind: "x", n: 2 },
      { x: 280, y: 290, w: 120, kind: "x", n: 3, move: { range: 40, speed: 1.4 } },
    ],
  },
  {
    name: "Spin Cycle",
    tip: "Spinning bars sweep up anyone they touch. Time your shots.",
    par: 27,
    bases: [{ x: 180, y: 100, hp: 450, every: 2.2, group: 9 }],
    gates: [
      { x: 180, y: 470, w: 110, kind: "x", n: 3, move: { range: 80, speed: 1.3 } },
      { x: 180, y: 210, w: 200, kind: "x", n: 2 },
    ],
    spinners: [
      { x: 180, y: 330, r: 78, speed: 1.5 },
      { x: 40, y: 260, r: 38, speed: -2 },
      { x: 320, y: 260, r: 38, speed: 2 },
    ],
  },
  {
    name: "The Corridor",
    tip: "The ×5 is at the end of the narrow lane.",
    par: 18,
    bases: [{ x: 180, y: 100, hp: 600, every: 2, group: 9, bruteEvery: 8, bruteHp: 30 }],
    gates: [
      { x: 92, y: 470, w: 56, kind: "x", n: 2 },
      { x: 92, y: 250, w: 56, kind: "x", n: 5 },
      { x: 250, y: 360, w: 150, kind: "x", n: 2 },
    ],
    walls: [
      { x: 52, y: 230, w: 12, h: 260 },
      { x: 120, y: 230, w: 12, h: 260 },
    ],
  },
  {
    name: "Rush Hour",
    tip: "They come fast. Defend first, then push.",
    par: 28,
    bases: [{ x: 180, y: 100, hp: 520, every: 1.6, group: 8, bruteEvery: 7, bruteHp: 25, delay: 0.5 }],
    gates: [
      { x: 90, y: 440, w: 130, kind: "x", n: 3 },
      { x: 270, y: 440, w: 130, kind: "x", n: 2 },
      { x: 180, y: 270, w: 120, kind: "x", n: 2, move: { range: 100, speed: 0.9 } },
    ],
  },
  {
    name: "Twin Towers",
    tip: "Two bases. Take both down.",
    par: 36,
    bases: [
      { x: 80, y: 100, hp: 300, every: 2.6, group: 6, bruteEvery: 12, bruteHp: 20 },
      { x: 280, y: 100, hp: 300, every: 2.6, group: 6, bruteEvery: 12, bruteHp: 20, delay: 2.7 },
    ],
    gates: [
      { x: 180, y: 450, w: 120, kind: "x", n: 3 },
      { x: 80, y: 260, w: 110, kind: "x", n: 2 },
      { x: 280, y: 260, w: 110, kind: "x", n: 2 },
    ],
    walls: [{ x: 168, y: 150, w: 24, h: 150 }],
    spinners: [{ x: 180, y: 360, r: 46, speed: 2 }],
  },
  {
    name: "Gauntlet",
    tip: "Traps slide too. Watch the gaps.",
    par: 45,
    bases: [{ x: 180, y: 100, hp: 800, every: 2, group: 8, bruteEvery: 6, bruteHp: 30 }],
    gates: [
      { x: 180, y: 480, w: 100, kind: "trap", move: { range: 110, speed: 1.2 } },
      { x: 180, y: 400, w: 120, kind: "x", n: 3 },
      { x: 180, y: 300, w: 90, kind: "trap", move: { range: 120, speed: -1.5 } },
      { x: 180, y: 220, w: 160, kind: "x", n: 2 },
    ],
    spinners: [{ x: 60, y: 160, r: 40, speed: 2.2 }, { x: 300, y: 160, r: 40, speed: -2.2 }],
  },
  {
    name: "Iron Keep",
    tip: "The keep is huge and angry. Stack every gate you can.",
    par: 75,
    bases: [{ x: 180, y: 100, hp: 900, every: 1.8, group: 8, bruteEvery: 8, bruteHp: 30 }],
    gates: [
      { x: 70, y: 470, w: 110, kind: "x", n: 2 },
      { x: 290, y: 470, w: 110, kind: "trap" },
      { x: 180, y: 380, w: 110, kind: "x", n: 3, move: { range: 110, speed: 1 } },
      { x: 70, y: 280, w: 110, kind: "trap", move: { range: 30, speed: 2 } },
      { x: 290, y: 280, w: 110, kind: "x", n: 2 },
      { x: 180, y: 190, w: 200, kind: "x", n: 2 },
    ],
    spinners: [{ x: 180, y: 290, r: 42, speed: 1.8 }],
  },
];
