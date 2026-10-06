import type { Level } from "./engine";

// The campaign uses the dense sequential assault simulation. `bases` are the
// giant encounter hitboxes; the assault state supplies the moving defender
// formations and finite waiting reserve. The old gate/wave rules remain
// available to custom levels that omit `assault`.
type AssaultRoute = "center" | "split" | "offset" | "weave" | "switchback" | "reverseWeave";

/**
 * Route panels are deliberately authored as gameplay geometry. A split has
 * two non-overlapping choices at each fork; weave and switchback move the
 * visible lane so the crowd's bend comes from the next panel rather than an
 * invisible centre magnet. The first route stays broad and straight while
 * later routes ask for increasingly deliberate launches.
 */
const assaultGates = (
  last = 4,
  move?: { range: number; speed: number; phase?: number },
  route: AssaultRoute = "center",
) => {
  const finish = { x: 180, y: 424, w: 170, kind: "x" as const, n: last, ...(move ? { move } : {}) };
  if (route === "split") {
    return [
      // Keep both branches clear of the side locks at x=55 and x=307.
      { x: 120, y: 510, w: 78, kind: "x" as const, n: 2 },
      { x: 240, y: 510, w: 78, kind: "x" as const, n: 4 },
      { x: 132, y: 467, w: 82, kind: "x" as const, n: 3 },
      { x: 228, y: 467, w: 82, kind: "x" as const, n: 2 },
      finish,
    ];
  }
  if (route === "weave") {
    return [
      { x: 140, y: 510, w: 155, kind: "x" as const, n: 2 },
      { x: 220, y: 467, w: 155, kind: "x" as const, n: 3 },
      finish,
    ];
  }
  if (route === "offset") {
    return [
      { x: 112, y: 510, w: 142, kind: "x" as const, n: 2 },
      { x: 180, y: 467, w: 170, kind: "x" as const, n: 3 },
      { x: 248, y: 424, w: 142, kind: "x" as const, n: last, ...(move ? { move } : {}) },
    ];
  }
  if (route === "switchback") {
    return [
      { x: 245, y: 510, w: 150, kind: "x" as const, n: 3 },
      { x: 115, y: 467, w: 150, kind: "x" as const, n: 2 },
      { x: 245, y: 424, w: 150, kind: "x" as const, n: last, ...(move ? { move } : {}) },
    ];
  }
  if (route === "reverseWeave") {
    return [
      { x: 238, y: 510, w: 155, kind: "x" as const, n: 2 },
      { x: 138, y: 467, w: 155, kind: "x" as const, n: 3 },
      { x: 220, y: 424, w: 165, kind: "x" as const, n: last, ...(move ? { move } : {}) },
    ];
  }
  return [
    { x: 180, y: 510, w: 170, kind: "x" as const, n: 2 },
    { x: 180, y: 467, w: 170, kind: "x" as const, n: 3 },
    finish,
  ];
};

const boss = (hp: number) => ({ x: 180, y: 300, hp, every: 9999, group: 0, delay: 9999 });
const counterattack = (waves: number, runners: number, guards: number, brutes: number, interval = 1.45) => ({
  waves,
  runners,
  guards,
  brutes,
  interval,
  flankEvery: 2,
});

export const levels: Level[] = [
  {
    name: "First Push",
    tip: "Break the first giant, then watch for alternating flank waves before the next push.",
    par: 48,
    bases: [boss(1040), boss(1080)],
    gates: assaultGates(4, undefined, "center"),
    assault: { horde: 240, reserve: 700, speed: 16, theme: "fork", enemyHp: 1, pickupEvery: 10, counterattack: counterattack(2, 18, 4, 1) },
  },
  {
    name: "Fork Run",
    tip: "Keep the line centered through the panels, then aim for the side upgrade before the counterattack.",
    par: 50,
    bases: [boss(1040), boss(1080)],
    gates: assaultGates(4, undefined, "split"),
    assault: { horde: 260, reserve: 760, speed: 16.5, theme: "fork", enemyHp: 1, pickupEvery: 10, counterattack: counterattack(2, 20, 5, 1) },
  },
  {
    name: "Bridgehead",
    tip: "Cross the bridge, then take down both giants in sequence.",
    par: 55,
    bases: [boss(1000), boss(1040)],
    gates: assaultGates(5, undefined, "offset"),
    assault: { horde: 380, reserve: 900, speed: 17, theme: "bridge", enemyHp: 1, pickupEvery: 10, counterattack: counterattack(2, 20, 5, 1) },
  },
  {
    name: "Bend the Line",
    tip: "The road bends toward the first giant. A full chain keeps the front moving.",
    par: 58,
    bases: [boss(1040), boss(1080)],
    gates: assaultGates(5, { range: 20, speed: 0.8, phase: 0.3 }, "weave"),
    assault: { horde: 400, reserve: 1000, speed: 17, theme: "bend", enemyHp: 1, pickupEvery: 10, counterattack: counterattack(2, 22, 5, 1) },
  },
  {
    name: "Twin Bridge",
    tip: "Use the extra barrel when the second bridgehead enters the field.",
    par: 62,
    bases: [boss(1040), boss(1100)],
    gates: assaultGates(5, { range: 20, speed: 0.8, phase: 1.1 }, "split"),
    surge: { every: 10, duration: 1.5, strength: 0.18 },
    assault: { horde: 430, reserve: 1100, speed: 17.5, theme: "bridge", enemyHp: 1, pickupEvery: 9, counterattack: counterattack(3, 22, 5, 1) },
  },
  {
    name: "Long Bend",
    tip: "The bend is crowded. Stay with the front and let the chain multiply behind it.",
    par: 66,
    bases: [boss(1040), boss(1120)],
    gates: assaultGates(6, { range: 20, speed: 0.8, phase: 2.2 }, "switchback"),
    surge: { every: 10, duration: 1.5, strength: 0.18 },
    assault: { horde: 450, reserve: 1250, speed: 18, theme: "bend", enemyHp: 1, pickupEvery: 9, counterattack: counterattack(3, 24, 6, 1) },
  },
  {
    name: "Three Roads",
    tip: "Three giants share one road. Keep the cannon moving while the horde packs in.",
    par: 75,
    bases: [boss(820), boss(880), boss(940)],
    gates: assaultGates(6, { range: 28, speed: 0.9, phase: 0.5 }, "offset"),
    surge: { every: 10, duration: 1.5, strength: 0.18 },
    assault: { horde: 480, reserve: 1400, speed: 18, theme: "fork", enemyHp: 1, pickupEvery: 9, slamEvery: 9, counterattack: counterattack(3, 24, 6, 2) },
  },
  {
    name: "Bridgeworks",
    tip: "The bridge chain gets stronger at every encounter. Save the champion for the crush.",
    par: 78,
    bases: [boss(900), boss(960), boss(1020)],
    gates: assaultGates(6, { range: 28, speed: 0.9, phase: 1.7 }, "reverseWeave"),
    surge: { every: 10, duration: 1.5, strength: 0.18 },
    assault: { horde: 510, reserve: 1500, speed: 18.5, theme: "bridge", enemyHp: 1, pickupEvery: 8, slamEvery: 8.5, counterattack: counterattack(3, 26, 6, 2) },
  },
  {
    name: "Red Divide",
    tip: "A divided red front still packs hard. The side pickups can carry the final push.",
    par: 88,
    bases: [boss(960), boss(1020), boss(1080)],
    gates: assaultGates(7, { range: 28, speed: 0.9, phase: 2.8 }, "switchback"),
    surge: { every: 10, duration: 1.5, strength: 0.18 },
    assault: { horde: 540, reserve: 1650, speed: 19, theme: "fork", enemyHp: 1, pickupEvery: 8, slamEvery: 8, counterattack: counterattack(3, 26, 7, 2) },
  },
  {
    name: "Iron Switchback",
    tip: "The road turns twice. Keep firing through the chain and watch the next giant enter.",
    par: 92,
    bases: [boss(1020), boss(1080), boss(1140)],
    gates: assaultGates(7, { range: 36, speed: 1, phase: 0.9 }, "split"),
    surge: { every: 8, duration: 1.8, strength: 0.22 },
    assault: { horde: 570, reserve: 1800, speed: 19, theme: "bend", enemyHp: 1, pickupEvery: 8, slamEvery: 7.7, counterattack: counterattack(3, 28, 7, 2) },
  },
  {
    name: "The Gauntlet",
    tip: "A full chain and five barrels are the fastest way through the final road.",
    par: 96,
    bases: [boss(960), boss(1000), boss(1040)],
    gates: assaultGates(8, { range: 36, speed: 1, phase: 2.1 }, "reverseWeave"),
    surge: { every: 8, duration: 1.8, strength: 0.22 },
    assault: { horde: 560, reserve: 2000, speed: 19.5, theme: "bridge", enemyHp: 1, pickupEvery: 7, slamEvery: 7.3, counterattack: counterattack(4, 28, 8, 2) },
  },
  {
    name: "Final Surge",
    tip: "Everything converges here. Keep the front supplied and break every giant.",
    par: 100,
    bases: [boss(960), boss(1000), boss(1040)],
    gates: assaultGates(8, { range: 36, speed: 1, phase: 3.3 }, "split"),
    surge: { every: 8, duration: 1.8, strength: 0.22 },
    assault: { horde: 650, reserve: 2300, speed: 20, theme: "fork", enemyHp: 1, pickupEvery: 7, slamEvery: 7, counterattack: counterattack(4, 30, 8, 2) },
  },
];
