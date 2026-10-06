import type { Level } from "./engine";

// The campaign uses the dense sequential assault simulation. `bases` are the
// giant encounter hitboxes; the assault state supplies the moving defender
// formations and finite waiting reserve. The old gate/wave rules remain
// available to custom levels that omit `assault`.
const assaultGates = (last = 4, move?: { range: number; speed: number; phase?: number }) => [
  { x: 180, y: 510, w: 170, kind: "x" as const, n: 2 },
  { x: 180, y: 467, w: 170, kind: "x" as const, n: 3 },
  { x: 180, y: 424, w: 170, kind: "x" as const, n: last, ...(move ? { move } : {}) },
];

const boss = (hp: number) => ({ x: 180, y: 300, hp, every: 9999, group: 0, delay: 9999 });

export const levels: Level[] = [
  {
    name: "First Push",
    tip: "Build through the short chain, then keep the line centered against the giant.",
    par: 18,
    bases: [boss(520)],
    gates: assaultGates(4),
    assault: { horde: 320, reserve: 6000, speed: 16, theme: "fork", enemyHp: 1, pickupEvery: 10 },
  },
  {
    name: "Fork Run",
    tip: "Keep the line centered through the panels, then collect a side upgrade.",
    par: 21,
    bases: [boss(520)],
    gates: assaultGates(4),
    assault: { horde: 350, reserve: 6500, speed: 16.5, theme: "fork", enemyHp: 1, pickupEvery: 10 },
  },
  {
    name: "Bridgehead",
    tip: "Cross the bridge, then take down both giants in sequence.",
    par: 28,
    bases: [boss(500), boss(520)],
    gates: assaultGates(5),
    assault: { horde: 380, reserve: 7000, speed: 17, theme: "bridge", enemyHp: 1, pickupEvery: 10 },
  },
  {
    name: "Bend the Line",
    tip: "The road bends toward the first giant. A full chain keeps the front moving.",
    par: 31,
    bases: [boss(520), boss(540)],
    gates: assaultGates(5, { range: 20, speed: 0.8, phase: 0.3 }),
    assault: { horde: 400, reserve: 7500, speed: 17, theme: "bend", enemyHp: 1, pickupEvery: 10 },
  },
  {
    name: "Twin Bridge",
    tip: "Use the extra barrel when the second bridgehead enters the field.",
    par: 35,
    bases: [boss(520), boss(550)],
    gates: assaultGates(5, { range: 20, speed: 0.8, phase: 1.1 }),
    surge: { every: 10, duration: 1.5, strength: 0.18 },
    assault: { horde: 430, reserve: 8000, speed: 17.5, theme: "bridge", enemyHp: 1, pickupEvery: 9 },
  },
  {
    name: "Long Bend",
    tip: "The bend is crowded. Stay with the front and let the chain multiply behind it.",
    par: 39,
    bases: [boss(520), boss(560)],
    gates: assaultGates(6, { range: 20, speed: 0.8, phase: 2.2 }),
    surge: { every: 10, duration: 1.5, strength: 0.18 },
    assault: { horde: 450, reserve: 8500, speed: 18, theme: "bend", enemyHp: 1, pickupEvery: 9 },
  },
  {
    name: "Three Roads",
    tip: "Three giants share one road. Keep the cannon moving while the horde packs in.",
    par: 45,
    bases: [boss(410), boss(440), boss(470)],
    gates: assaultGates(6, { range: 28, speed: 0.9, phase: 0.5 }),
    surge: { every: 10, duration: 1.5, strength: 0.18 },
    assault: { horde: 480, reserve: 9000, speed: 18, theme: "fork", enemyHp: 1, pickupEvery: 9, slamEvery: 9 },
  },
  {
    name: "Bridgeworks",
    tip: "The bridge chain gets stronger at every encounter. Save the champion for the crush.",
    par: 49,
    bases: [boss(450), boss(480), boss(510)],
    gates: assaultGates(6, { range: 28, speed: 0.9, phase: 1.7 }),
    surge: { every: 10, duration: 1.5, strength: 0.18 },
    assault: { horde: 510, reserve: 9500, speed: 18.5, theme: "bridge", enemyHp: 1, pickupEvery: 8, slamEvery: 8.5 },
  },
  {
    name: "Red Divide",
    tip: "A divided red front still packs hard. The side pickups can carry the final push.",
    par: 53,
    bases: [boss(480), boss(510), boss(540)],
    gates: assaultGates(7, { range: 28, speed: 0.9, phase: 2.8 }),
    surge: { every: 10, duration: 1.5, strength: 0.18 },
    assault: { horde: 540, reserve: 10000, speed: 19, theme: "fork", enemyHp: 1, pickupEvery: 8, slamEvery: 8 },
  },
  {
    name: "Iron Switchback",
    tip: "The road turns twice. Keep firing through the chain and watch the next giant enter.",
    par: 57,
    bases: [boss(510), boss(540), boss(570)],
    gates: assaultGates(7, { range: 36, speed: 1, phase: 0.9 }),
    surge: { every: 8, duration: 1.8, strength: 0.22 },
    assault: { horde: 570, reserve: 10500, speed: 19, theme: "bend", enemyHp: 1, pickupEvery: 8, slamEvery: 7.7 },
  },
  {
    name: "The Gauntlet",
    tip: "A full chain and five barrels are the fastest way through the final road.",
    par: 61,
    bases: [boss(480), boss(500), boss(520)],
    gates: assaultGates(8, { range: 36, speed: 1, phase: 2.1 }),
    surge: { every: 8, duration: 1.8, strength: 0.22 },
    assault: { horde: 610, reserve: 11500, speed: 19.5, theme: "bridge", enemyHp: 1, pickupEvery: 7, slamEvery: 7.3 },
  },
  {
    name: "Final Surge",
    tip: "Everything converges here. Keep the front supplied and break every giant.",
    par: 65,
    bases: [boss(480), boss(500), boss(520)],
    gates: assaultGates(8, { range: 36, speed: 1, phase: 3.3 }),
    surge: { every: 8, duration: 1.8, strength: 0.22 },
    assault: { horde: 650, reserve: 12000, speed: 20, theme: "fork", enemyHp: 1, pickupEvery: 7, slamEvery: 7 },
  },
];
