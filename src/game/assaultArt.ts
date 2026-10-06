import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

// All art is generated once. Crowds share a single indexed mesh per team;
// only the six joints of each giant remain separate for animation.
type Resources = { geometries: Set<THREE.BufferGeometry>; materials: Set<THREE.Material> };
type Ring = [y: number, width: number, depth: number, x?: number, z?: number];

/** A continuous, softly squared volume with an explicitly designed silhouette. */
function form(rings: Ring[], sides = 16, rows = 20, roundness = 2.5): THREE.BufferGeometry {
  if (rings[0][0] > rings[rings.length - 1][0]) rings = [...rings].reverse();
  const silhouette = new THREE.CatmullRomCurve3(rings.map(([y, w, d]) => new THREE.Vector3(w, y, d)));
  const path = new THREE.CatmullRomCurve3(rings.map(([y, , , x = 0, z = 0]) => new THREE.Vector3(x, y, z)));
  const positions: number[] = [], uvs: number[] = [], indices: number[] = [];
  for (let row = 0; row <= rows; row++) {
    const t = row / rows, profile = silhouette.getPoint(t), center = path.getPoint(t);
    for (let side = 0; side <= sides; side++) {
      const a = side / sides * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      const exponent = 2 / roundness;
      positions.push(center.x + Math.sign(c) * Math.pow(Math.abs(c), exponent) * Math.max(0.001, profile.x),
        profile.y, center.z + Math.sign(s) * Math.pow(Math.abs(s), exponent) * Math.max(0.001, profile.z));
      uvs.push(side / sides, t);
      if (row < rows && side < sides) {
        const i = row * (sides + 1) + side;
        indices.push(i, i + sides + 1, i + 1, i + 1, i + sides + 1, i + sides + 2);
      }
    }
  }
  for (const row of [0, rows]) {
    const center = path.getPoint(row / rows), cap = positions.length / 3;
    positions.push(center.x, center.y, center.z); uvs.push(0.5, row / rows);
    for (let side = 0; side < sides; side++) {
      const i = row * (sides + 1) + side;
      if (row === 0) indices.push(cap, i, i + 1); else indices.push(cap, i + 1, i);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  // Average the duplicate seam normals so the sculpt has no lighting seam.
  const normals = geometry.getAttribute("normal"), normal = new THREE.Vector3();
  for (let row = 0; row <= rows; row++) {
    const a = row * (sides + 1), b = a + sides;
    normal.set(normals.getX(a) + normals.getX(b), normals.getY(a) + normals.getY(b), normals.getZ(a) + normals.getZ(b)).normalize();
    normals.setXYZ(a, normal.x, normal.y, normal.z); normals.setXYZ(b, normal.x, normal.y, normal.z);
  }
  return geometry;
}

function placed(geometry: THREE.BufferGeometry, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1): THREE.BufferGeometry {
  return geometry.scale(sx, sy, sz).translate(x, y, z);
}

function tint(geometry: THREE.BufferGeometry, hex: number, fixed = false): THREE.BufferGeometry {
  const count = geometry.getAttribute("position").count, color = new THREE.Color(hex), values = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) color.toArray(values, i * 3);
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(values, 3));
  geometry.setAttribute("faceMask", new THREE.Float32BufferAttribute(new Float32Array(count).fill(fixed ? 1 : 0), 1));
  return geometry;
}

function crowdMesh(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  parts.forEach((part) => {
    if (!part.getAttribute("color")) tint(part, 0xffffff);
    if (!part.getAttribute("stridePart")) stridePart(part, 0);
  });
  const merged = mergeGeometries(parts, false);
  parts.forEach((part) => part.dispose());
  if (!merged) throw new Error("Unable to merge crowd geometry");
  merged.computeBoundingBox(); merged.computeBoundingSphere();
  return merged;
}

function stridePart(geometry: THREE.BufferGeometry, part: number): THREE.BufferGeometry {
  geometry.setAttribute("stridePart", new THREE.Float32BufferAttribute(new Float32Array(geometry.getAttribute("position").count).fill(part), 1));
  return geometry;
}

/** Feet at zero, face toward -Z. Broad head, pear-shaped body, soft mitten limbs. */
export function createMobGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(form([[0.28, 0.02, 0.02], [0.35, 0.17, 0.15], [0.53, 0.215, 0.17], [0.73, 0.21, 0.16], [0.85, 0.13, 0.12], [0.88, 0.015, 0.015]], 8, 8, 2));
  parts.push(placed(new THREE.SphereGeometry(0.285, 12, 8), 0, 1.07, -0.015, 1.03, 0.96, 0.94));
  for (const side of [-1, 1]) {
    const arm = new THREE.CapsuleGeometry(0.09, 0.24, 2, 6);
    arm.rotateZ(side * 0.2); parts.push(stridePart(placed(arm, side * 0.255, 0.57, -0.025), side));
    parts.push(stridePart(placed(new THREE.CapsuleGeometry(0.105, 0.15, 2, 6), side * 0.117, 0.195, -0.025, 1, 1, 1.25), side * 2));
    parts.push(tint(placed(new THREE.SphereGeometry(0.07, 6, 4), side * 0.105, 1.105, -0.268, 0.72, 1.12, 0.25), 0xffffff, true));
    parts.push(tint(placed(new THREE.SphereGeometry(0.031, 5, 3), side * 0.105, 1.1, -0.284, 0.84, 1.22, 0.25), 0x132b50, true));
  }
  return crowdMesh(parts);
}

/** The distant reserve retains the round head and two-legged silhouette. */
export function createHordeGeometry(): THREE.BufferGeometry {
  const parts = [placed(new THREE.SphereGeometry(0.26, 6, 4), 0, 0.89, 0),
    placed(new THREE.SphereGeometry(0.24, 6, 4), 0, 0.46, 0, 0.9, 1.4, 0.75)];
  for (const side of [-1, 1]) {
    parts.push(stridePart(placed(new THREE.CylinderGeometry(0.075, 0.075, 0.29, 4), side * 0.255, 0.48, 0), side));
    parts.push(stridePart(placed(new THREE.CylinderGeometry(0.09, 0.09, 0.23, 4), side * 0.115, 0.115, -0.015), side * 2));
  }
  return crowdMesh(parts);
}

function resources() {
  const owned: Resources = { geometries: new Set(), materials: new Set() };
  return {
    geometry<T extends THREE.BufferGeometry>(geometry: T): T {
      // RoundedBoxGeometry is non-indexed; baking requires a common layout.
      if (!geometry.index) geometry.setIndex(Array.from({ length: geometry.getAttribute("position").count }, (_, i) => i));
      owned.geometries.add(geometry); return geometry;
    },
    material(color: number, roughness = 0.45): THREE.MeshStandardMaterial {
      const material = new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 });
      owned.materials.add(material); return material;
    },
    dispose() { owned.geometries.forEach((value) => value.dispose()); owned.materials.forEach((value) => value.dispose()); },
  };
}

function mesh(parent: THREE.Object3D, geometry: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1): THREE.Mesh {
  const value = new THREE.Mesh(geometry, material);
  value.position.set(x, y, z); value.scale.set(sx, sy, sz);
  value.castShadow = value.receiveShadow = true; parent.add(value); return value;
}

export type SiegeCannonArt = { group: THREE.Group; barrel: THREE.Group; muzzle: THREE.Mesh; rotor: THREE.Group; setWeapon: (level: number) => void; dispose: () => void };

/** A flared, hollow toy barrel on a low carriage. The muzzle faces -Z. */
export function createSiegeCannon(includeChassis = true): SiegeCannonArt {
  const owned = resources(), group = new THREE.Group(), barrel = new THREE.Group();
  group.name = "siege-cannon"; barrel.name = "recoil-barrel";
  const blue = owned.material(0x008cef, 0.3), light = owned.material(0x58dfff, 0.28);
  const dark = owned.material(0x16355d), rubber = owned.material(0x14233a, 0.8);
  const cream = owned.material(0xf7fcff, 0.28), gold = owned.material(0xffcc43, 0.32);
  const orange = owned.material(0xff9135, 0.32), violet = owned.material(0x8851e8, 0.3);
  const cradle = owned.geometry(new RoundedBoxGeometry(0.77, 0.4, 0.72, 2, 0.16));
  mesh(group, cradle, dark, 0, 0.36, 0.04);
  const housing = owned.geometry(new RoundedBoxGeometry(0.7, 0.6, 0.76, 3, 0.25));
  mesh(group, housing, blue, 0, 0.6, 0.02);
  mesh(group, owned.geometry(new RoundedBoxGeometry(0.18, 0.08, 0.4, 2, 0.03)), cream, 0, 0.907, 0.03);
  if (includeChassis) {
    mesh(group, owned.geometry(new RoundedBoxGeometry(1.13, 0.23, 1.03, 2, 0.1)), dark, 0, 0.2, 0.13);
    const wheel = owned.geometry(new THREE.CylinderGeometry(0.3, 0.3, 0.2, 16).rotateZ(Math.PI / 2));
    const hub = owned.geometry(new THREE.CylinderGeometry(0.14, 0.14, 0.21, 12).rotateZ(Math.PI / 2));
    for (const side of [-1, 1]) { mesh(group, wheel, rubber, side * 0.51, 0.3, 0.15); mesh(group, hub, gold, side * 0.52, 0.3, 0.15); }
  }
  barrel.position.set(0, 0.58, -0.08); group.add(barrel);
  const forms = [new THREE.Group(), new THREE.Group(), new THREE.Group()];
  barrel.add(...forms);
  // The profile doubles back inside the tube: no sphere or disk plugs its lip.
  const profile = [[0.24, 0.04], [0.28, 0.12], [0.26, 0.35], [0.255, 0.7], [0.32, 0.89], [0.32, 1.04], [0.22, 1.04], [0.215, 0.72]];
  const tube = owned.geometry(new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), 20).rotateX(-Math.PI / 2));
  mesh(forms[0], tube, blue);
  const ring = owned.geometry(new THREE.TorusGeometry(0.27, 0.055, 8, 20));
  mesh(forms[0], ring, cream, 0, 0, -1.045);
  const collar = owned.geometry(new THREE.TorusGeometry(0.263, 0.035, 6, 20));
  mesh(forms[0], collar, light, 0, 0, -0.22);
  const bore = owned.geometry(new THREE.CircleGeometry(0.219, 20).rotateY(Math.PI));
  const muzzle = mesh(forms[0], bore, rubber, 0, 0, -0.73);
  muzzle.name = "muzzle-opening";

  // Repeater: a broad orange jacket, three charge rails and a gold muzzle.
  mesh(forms[1], tube, orange, 0, 0, 0, 1.15, 1.15, 1);
  mesh(forms[1], ring, gold, 0, 0, -1.045, 1.15, 1.15, 1);
  mesh(forms[1], collar, dark, 0, 0, -0.25, 1.22, 1.22, 1);
  mesh(forms[1], bore, rubber, 0, 0, -0.73, 1.15, 1.15, 1);
  const rail = owned.geometry(new RoundedBoxGeometry(0.075, 0.085, 0.43, 2, 0.025));
  for (const x of [-0.13, 0, 0.13]) mesh(forms[1], rail, cream, x, 0.29, -0.5);
  const feed = owned.geometry(new RoundedBoxGeometry(0.15, 0.31, 0.34, 2, 0.06));
  for (const side of [-1, 1]) mesh(forms[1], feed, gold, side * 0.32, -0.025, -0.28);

  // Cyclone: one spinning six-chamber assembly, with a fixed violet shroud.
  mesh(forms[2], owned.geometry(new THREE.CylinderGeometry(0.37, 0.34, 0.4, 16).rotateX(Math.PI / 2)), violet, 0, 0, -0.24);
  mesh(forms[2], collar, gold, 0, 0, -0.16, 1.45, 1.45, 1);
  const rotor = new THREE.Group(); forms[2].add(rotor);
  const chamber = owned.geometry(new THREE.CylinderGeometry(0.087, 0.09, 0.76, 10).rotateX(Math.PI / 2));
  const tip = owned.geometry(new THREE.TorusGeometry(0.078, 0.023, 5, 10));
  const chamberBore = owned.geometry(new THREE.CircleGeometry(0.062, 10).rotateY(Math.PI));
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * Math.PI * 2, x = Math.cos(a) * 0.21, y = Math.sin(a) * 0.21;
    mesh(rotor, chamber, dark, x, y, -0.62);
    mesh(rotor, tip, light, x, y, -1.015);
    mesh(rotor, chamberBore, rubber, x, y, -1.017);
  }
  mesh(rotor, owned.geometry(new THREE.TorusGeometry(0.285, 0.05, 7, 20)), gold, 0, 0, -0.77);
  const fins = owned.geometry(new RoundedBoxGeometry(0.06, 0.23, 0.4, 2, 0.025));
  for (const side of [-1, 1]) mesh(forms[2], fins, light, side * 0.32, 0.15, -0.24);
  function setWeapon(level: number) { forms.forEach((form, i) => { form.visible = i === Math.max(0, Math.min(2, level - 1)); }); }
  setWeapon(1);
  return { group, barrel, muzzle, rotor, setWeapon, dispose() { group.clear(); owned.dispose(); } };
}

export type WardenArt = { group: THREE.Group; animate: (time: number, hit: number, attack?: number) => void; dispose: () => void };

const PALETTES = [
  { body: 0xff7638, brow: 0xd44726, gloves: 0xffcc38, shorts: 0x333d75 },
  { body: 0xad65fa, brow: 0x6539b0, gloves: 0x81e9dc, shorts: 0x303a6c },
  { body: 0xff5064, brow: 0xbc254d, gloves: 0xffb94a, shorts: 0x39315e },
];

/** Broad-shouldered prizefighter: small head, tapered trunk and planted stance. */
export function createWarden(variant = 0): WardenArt {
  const palette = PALETTES[((variant % 3) + 3) % 3], owned = resources(), group = new THREE.Group();
  group.name = "warden";
  const body = owned.material(palette.body, 0.48), brow = owned.material(palette.brow);
  const gloves = owned.material(palette.gloves, 0.34), shorts = owned.material(palette.shorts);
  const white = owned.material(0xfff6dc), pupil = owned.material(0x202c4a), mouth = owned.material(0x863a43);
  const round = (w: number, h: number, d: number, r: number) => owned.geometry(new RoundedBoxGeometry(w, h, d, 2, r));

  const legShape = owned.geometry(form([[-1.05, 0.31, 0.32], [-0.82, 0.43, 0.39], [-0.25, 0.48, 0.43], [0.25, 0.5, 0.45], [0.43, 0.16, 0.18]], 12, 12));
  const legs = [-1, 1].map((side) => {
    const leg = new THREE.Group(); leg.position.set(side * 0.67, 1.42, 0); group.add(leg);
    mesh(leg, legShape, body);
    mesh(leg, round(1.08, 0.64, 1.5, 0.26), shorts, 0, -1.08, 0.26);
    mesh(leg, round(1.09, 0.13, 1.52, 0.06), white, 0, -1.355, 0.26);
    return leg;
  });
  mesh(group, owned.geometry(form([[1.31, 0.68, 0.53], [1.53, 1.01, 0.65], [1.94, 1.13, 0.67], [2.2, 0.97, 0.6]], 16, 9)), shorts);
  mesh(group, owned.geometry(form([[2.05, 0.98, 0.61], [2.18, 1.03, 0.64], [2.3, 1.03, 0.64]], 16, 4)), white);

  const upper = new THREE.Group(); upper.position.y = 2.25; group.add(upper);
  const torso = owned.geometry(form([[-0.15, 0.86, 0.53], [0.3, 1.09, 0.61], [1.05, 1.59, 0.77], [1.72, 1.97, 0.86], [2.12, 1.83, 0.77], [2.44, 1.19, 0.58], [2.53, 0.3, 0.2]], 24, 25, 2.65));
  const chest = torso.getAttribute("position");
  for (let i = 0; i < chest.count; i++) {
    const x = chest.getX(i), y = chest.getY(i), z = chest.getZ(i);
    if (z > 0) {
      const pec = Math.exp(-Math.pow((Math.abs(x) - 0.8) / 0.65, 2) - Math.pow((y - 1.7) / 0.43, 2));
      chest.setZ(i, z + pec * 0.16 * Math.min(1, z / 0.6));
    }
  }
  torso.computeVertexNormals();
  mesh(upper, torso, body);

  const head = new THREE.Group(); head.position.set(0, 2.65, 0.36); upper.add(head);
  mesh(head, owned.geometry(form([[-0.35, 0.24, 0.3], [-0.23, 0.63, 0.58], [0.2, 0.74, 0.64], [0.66, 0.72, 0.6], [0.89, 0.5, 0.42], [0.95, 0.04, 0.04]], 20, 18, 3)), body);
  // One broad headband and a forward face remain readable from the high camera.
  mesh(head, owned.geometry(form([[0.57, 0.735, 0.618], [0.68, 0.72, 0.605], [0.78, 0.67, 0.567]], 20, 5, 3)), white);
  for (const side of [-1, 1]) {
    mesh(head, round(0.31, 0.25, 0.095, 0.06), white, side * 0.295, 0.23, 0.639);
    mesh(head, round(0.115, 0.16, 0.04, 0.035), pupil, side * 0.278, 0.208, 0.695);
    const eyebrow = mesh(head, round(0.41, 0.13, 0.14, 0.05), brow, side * 0.3, 0.403, 0.65);
    eyebrow.rotation.z = side * 0.12;
  }
  mesh(head, round(0.24, 0.2, 0.21, 0.075), body, 0, 0.075, 0.7);
  mesh(head, round(0.39, 0.085, 0.07, 0.032), mouth, 0, -0.13, 0.61);

  const armShape = owned.geometry(form([[0.43, 0.09, 0.08], [0.28, 0.61, 0.62], [-0.13, 0.74, 0.69, 0.13], [-0.7, 0.59, 0.56, 0.32, 0.07], [-1.13, 0.5, 0.51, 0.39, 0.15], [-1.64, 0.49, 0.49, 0.37, 0.28], [-1.78, 0.18, 0.2, 0.36, 0.3]], 16, 22));
  const glove = round(1.32, 1.28, 1.3, 0.43), cuff = round(1.07, 0.33, 1.04, 0.13);
  const arms = [-1, 1].map((side) => {
    const arm = new THREE.Group(); arm.position.set(side * 1.7, 1.94, 0.02); upper.add(arm);
    const shape = armShape.clone();
    if (side < 0) {
      // Mirror positions and triangle winding, retaining correct outward normals.
      shape.scale(-1, 1, 1); const index = shape.getIndex()!;
      for (let i = 0; i < index.count; i += 3) { const a = index.getX(i); index.setX(i, index.getX(i + 2)); index.setX(i + 2, a); }
    }
    mesh(arm, owned.geometry(shape), body);
    mesh(arm, cuff, white, side * 0.37, -1.57, 0.27);
    mesh(arm, glove, gloves, side * 0.39, -2.12, 0.43);
    mesh(arm, round(0.42, 0.65, 0.63, 0.2), gloves, -side * 0.13, -1.92, 0.78);
    return arm;
  });

  function animate(time: number, hit: number, attack = 0) {
    const t = Number.isFinite(time) ? time : 0;
    const damage = THREE.MathUtils.clamp(Number.isFinite(hit) ? hit : 0, 0, 1);
    const windup = THREE.MathUtils.clamp(Number.isFinite(attack) ? attack : 0, 0, 1);
    const breathe = Math.sin(t * 2.4), sway = Math.sin(t * 1.8);
    upper.position.y = 2.25 + breathe * 0.045 - windup * 0.19;
    upper.rotation.x = -damage * 0.13 + windup * 0.13;
    upper.rotation.z = sway * 0.013 + Math.sin(t * 9) * damage * 0.025;
    head.rotation.x = 0.04 + damage * 0.16;
    arms.forEach((arm, i) => {
      const jab = (0.5 + 0.5 * Math.sin(t * 5 + i * Math.PI)) * damage * 0.75;
      arm.rotation.x = -0.17 + Math.sin(t * 2.4 + i * Math.PI) * 0.055 - jab - windup * (i ? 1.8 : 0.4);
      arm.rotation.z = (i ? 1 : -1) * (0.075 + windup * 0.19);
    });
    legs.forEach((leg, i) => { leg.rotation.x = Math.sin(t * 1.8 + i * Math.PI) * 0.025; });
  }
  animate(0, 0);
  return { group, animate, dispose() { group.clear(); owned.dispose(); } };
}
