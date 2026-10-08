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

/** Feet at zero, face toward -Z. Shoulders and separate feet read from behind. */
export function createMobGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(tint(form([[0.26, 0.03, 0.02], [0.39, 0.2, 0.15], [0.61, 0.245, 0.18], [0.79, 0.315, 0.19], [0.89, 0.17, 0.13], [0.94, 0.03, 0.03]], 10, 8, 2.3), 0xb9d0e3));
  parts.push(tint(placed(new THREE.CylinderGeometry(0.095, 0.12, 0.18, 8), 0, 0.96, -0.025), 0x9db6ca));
  parts.push(placed(new THREE.SphereGeometry(0.245, 10, 6), 0, 1.16, -0.035, 0.96, 1.04, 0.96));
  for (const side of [-1, 1]) {
    const arm = new THREE.CapsuleGeometry(0.105, 0.29, 2, 6);
    arm.rotateZ(side * 0.27); parts.push(stridePart(placed(arm, side * 0.335, 0.61, -0.025), side));
    parts.push(stridePart(tint(placed(new THREE.CapsuleGeometry(0.105, 0.23, 2, 6), side * 0.145, 0.205, -0.025, 1, 1, 1.2), 0x8ca6bd), side * 2));
    // Bright toes and darker legs retain two distinct steps at phone size.
    parts.push(stridePart(tint(placed(new THREE.SphereGeometry(0.12, 6, 4), side * 0.145, 0.07, -0.085, 1, 0.45, 1.65), 0xd5eafa), side * 2));
    parts.push(tint(placed(new THREE.SphereGeometry(0.029, 5, 3), side * 0.079, 1.18, -0.268, 0.75, 1.4, 0.28), 0x09274f, true));
  }
  return crowdMesh(parts);
}

/** Armored defenders share the same animated body, with a steel cap and shield. */
export function createGuardGeometry(braced = false): THREE.BufferGeometry {
  const parts = [createMobGeometry()];
  parts.push(tint(placed(new THREE.SphereGeometry(0.265, 10, 4, 0, Math.PI * 2, 0, Math.PI * 0.57), 0, 1.175, -0.035, 1, 1, 0.98), 0x354768, true));
  parts.push(tint(placed(new THREE.SphereGeometry(0.34, 8, 6), 0, braced ? 0.91 : 0.6, -0.3, braced ? 1.6 : 1, braced ? 2.5 : 1.13, 0.25), braced ? 0xffc13e : 0x344562, true));
  if (braced) {
    // A tall amber shield with a dark inset remains distinct from ordinary
    // steel guards even when the crowd covers the lower half of the body.
    parts.push(tint(placed(new THREE.SphereGeometry(0.3, 8, 6), 0, 0.91, -0.37, 1.55, 2.55, 0.12), 0x513546, true));
    parts.push(tint(placed(new THREE.BoxGeometry(0.12, 0.97, 0.035), 0, 1.01, -0.417), 0xffedac, true));
    parts.push(tint(placed(new THREE.BoxGeometry(0.52, 0.12, 0.035), 0, 1.15, -0.42), 0xffedac, true));
    parts.push(tint(placed(new THREE.CapsuleGeometry(0.09, 0.36, 2, 5), 0, 1.51, -0.035), 0xffc13e, true));
    for (const side of [-1, 1]) {
      parts.push(tint(placed(new THREE.SphereGeometry(0.19, 8, 5), side * 0.32, 0.88, 0, 1.25, 0.85, 1.1), 0xffc13e, true));
    }
  } else {
    parts.push(tint(placed(new THREE.BoxGeometry(0.075, 0.45, 0.035), 0, 0.62, -0.384), 0xffcb5a, true));
  }
  return crowdMesh(parts);
}

/** A pale angular helmet and dark sprint boots identify the close-range raider. */
export function createRaiderGeometry(): THREE.BufferGeometry {
  const parts = [createMobGeometry()];
  parts.push(tint(form([[1.12, 0.29, 0.275], [1.3, 0.3, 0.26], [1.44, 0.14, 0.18], [1.49, 0.025, 0.06]], 6, 4, 3), 0xfff0d6, true));
  parts.push(tint(placed(new THREE.BoxGeometry(0.43, 0.13, 0.09), 0, 1.19, -0.29), 0x263047, true));
  parts.push(tint(placed(new THREE.BoxGeometry(0.1, 0.18, 0.45), 0, 1.44, 0), 0xd92347, true));
  parts.push(tint(placed(new THREE.TorusGeometry(0.16, 0.065, 4, 8).rotateX(Math.PI / 2), 0, 0.89, 0), 0x263047, true));
  for (const side of [-1, 1]) {
    parts.push(stridePart(tint(placed(new THREE.SphereGeometry(0.14, 6, 4), side * 0.14, 0.105, -0.065, 1, 0.68, 1.55), 0x263047, true), side * 2));
  }
  return crowdMesh(parts);
}

/** The distant reserve retains the round head and two-legged silhouette. */
export function createHordeGeometry(): THREE.BufferGeometry {
  const parts = [placed(new THREE.SphereGeometry(0.235, 5, 3), 0, 0.94, 0),
    placed(new THREE.SphereGeometry(0.25, 5, 3), 0, 0.51, 0, 0.9, 1.4, 0.75)];
  for (const side of [-1, 1]) {
    parts.push(stridePart(placed(new THREE.PlaneGeometry(0.15, 0.37).rotateY(Math.PI), side * 0.255, 0.49, -0.06), side));
    parts.push(stridePart(placed(new THREE.PlaneGeometry(0.18, 0.27).rotateY(Math.PI), side * 0.115, 0.135, -0.08), side * 2));
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
  mesh(group, owned.geometry(new RoundedBoxGeometry(0.18, 0.065, 0.34, 2, 0.025)), cream, 0, 1.047, 0.23);
  if (includeChassis) {
    const chassisRed = owned.material(0xee4c5a, 0.4);
    mesh(group, owned.geometry(new RoundedBoxGeometry(1.3, 0.24, 1.4, 2, 0.1)), chassisRed, 0, 0.29, 0.13);
    mesh(group, owned.geometry(new THREE.SphereGeometry(1, 16, 12)), blue, 0, 0.61, 0.2, 0.53, 0.43, 0.52);
    const fender = owned.geometry(new RoundedBoxGeometry(0.28, 0.47, 1.13, 3, 0.13));
    const wheel = owned.geometry(new THREE.CylinderGeometry(0.28, 0.28, 0.2, 12).rotateZ(Math.PI / 2));
    const hub = owned.geometry(new THREE.CylinderGeometry(0.12, 0.12, 0.215, 10).rotateZ(Math.PI / 2));
    for (const side of [-1, 1]) {
      mesh(group, fender, blue, side * 0.52, 0.54, 0.05);
      for (const z of [-0.3, 0.54]) { mesh(group, wheel, rubber, side * 0.65, 0.28, z); mesh(group, hub, cream, side * 0.655, 0.28, z); }
    }
  }
  barrel.position.set(0, 0.78, -0.08); group.add(barrel);
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
  mesh(forms[1], tube, orange, 0, 0, 0, 1.35, 1.35, 1);
  mesh(forms[1], ring, gold, 0, 0, -1.045, 1.35, 1.35, 1);
  mesh(forms[1], collar, dark, 0, 0, -0.25, 1.45, 1.45, 1);
  mesh(forms[1], bore, rubber, 0, 0, -0.73, 1.35, 1.35, 1);
  const rail = owned.geometry(new RoundedBoxGeometry(0.095, 0.1, 0.6, 2, 0.03));
  for (const x of [-0.19, 0, 0.19]) mesh(forms[1], rail, cream, x, 0.34, -0.52);
  const feed = owned.geometry(new RoundedBoxGeometry(0.21, 0.4, 0.48, 2, 0.07));
  for (const side of [-1, 1]) mesh(forms[1], feed, gold, side * 0.41, 0.015, -0.3);

  // Cyclone: one spinning six-chamber assembly, with a fixed violet shroud.
  mesh(forms[2], owned.geometry(new THREE.CylinderGeometry(0.46, 0.41, 0.54, 16).rotateX(Math.PI / 2)), violet, 0, 0.02, -0.26);
  mesh(forms[2], collar, gold, 0, 0.02, -0.16, 1.7, 1.7, 1);
  const rotor = new THREE.Group(); forms[2].add(rotor);
  const chamber = owned.geometry(new THREE.CylinderGeometry(0.105, 0.11, 0.76, 10).rotateX(Math.PI / 2));
  const tip = owned.geometry(new THREE.TorusGeometry(0.095, 0.025, 5, 10));
  const chamberBore = owned.geometry(new THREE.CircleGeometry(0.075, 10).rotateY(Math.PI));
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * Math.PI * 2, x = Math.cos(a) * 0.285, y = Math.sin(a) * 0.285;
    mesh(rotor, chamber, dark, x, y, -0.62);
    mesh(rotor, tip, light, x, y, -1.015);
    mesh(rotor, chamberBore, rubber, x, y, -1.017);
  }
  mesh(rotor, owned.geometry(new THREE.TorusGeometry(0.365, 0.055, 7, 20)), gold, 0, 0, -0.77);
  const fins = owned.geometry(new RoundedBoxGeometry(0.095, 0.32, 0.56, 2, 0.03));
  for (const side of [-1, 1]) mesh(forms[2], fins, light, side * 0.42, 0.2, -0.26);
  function setWeapon(level: number) { forms.forEach((form, i) => { form.visible = i === Math.max(0, Math.min(2, level - 1)); }); }
  setWeapon(1);
  return { group, barrel, muzzle, rotor, setWeapon, dispose() { group.clear(); owned.dispose(); } };
}

export type WardenArt = { group: THREE.Group; animate: (time: number, hit: number, windup?: number, impact?: number, stagger?: number, advance?: number) => void; dispose: () => void };

/** A low, broad guardian with oversized hands and a continuous rounded back. */
export function createWarden(variant = 0): WardenArt {
  const owned = resources(), group = new THREE.Group();
  group.name = "warden";
  const style = variant % 3;
  const body = owned.material([0xffce19, 0xff9243, 0xa382ed][style], 0.35);
  const cuff = owned.material([0xec582a, 0x354765, 0xffc550][style], 0.4), trim = owned.material(0x633954, 0.46);
  const armor = owned.material(style === 1 ? 0x415977 : 0xffd270, 0.32);
  const bodyColor = body.color.clone(), armorColor = armor.color.clone(), hitColor = new THREE.Color(0xfff7df);
  const eye = owned.material(0x3b2340), ivory = owned.material(0xffedb0);
  const ball = owned.geometry(new THREE.SphereGeometry(1, 20, 14));
  const round = (w: number, h: number, d: number, r: number) => owned.geometry(new RoundedBoxGeometry(w, h, d, 3, r));
  const feet = [-1, 1].map(side => {
    const leg = new THREE.Group(); leg.position.set(side * 0.76, 0.73, -0.08); group.add(leg);
    mesh(leg, ball, body, 0, 0.38, 0, 0.58, 0.85, 0.62);
    mesh(leg, round(1.25, 0.62, 1.63, 0.28), body, 0, -0.4, 0.44);
    return leg;
  });
  const upper = new THREE.Group(); upper.position.y = 1.43; group.add(upper);
  const back = owned.geometry(form([
    [-0.3, 0.59, 0.45, 0, 0.02], [0.1, 1.1, 0.76, 0, -0.02],
    [0.85, 1.71, 1.06, 0, -0.11], [1.55, 2.3, 1.14, 0, -0.15],
    [2.08, 2.3, 1.04, 0, -0.24], [2.54, 1.61, 0.84, 0, -0.32],
    [2.8, 0.7, 0.51, 0, -0.3], [2.86, 0.06, 0.05, 0, -0.3],
  ], 24, 24, 2.05));
  mesh(upper, back, body);
  const head = new THREE.Group(); head.position.set(0, 1.79, 0.88); upper.add(head);
  mesh(head, ball, body, 0, 0, 0, 0.85, 0.86, 0.79);
  for (const side of [-1, 1]) {
    mesh(head, ball, eye, side * 0.25, 0.04, 0.736, 0.068, 0.13, 0.033);
    mesh(head, ball, ivory, side * 0.27, 0.095, 0.764, 0.02, 0.028, 0.014);
  }
  mesh(head, round(0.27, 0.18, 0.22, 0.08), body, 0, -0.17, 0.75);
  // Three rounded crown plates give the original character a clear silhouette.
  for (const [i, z] of [-0.16, 0.08, 0.32].entries()) {
    const crest = mesh(head, round(0.19, 0.28 + i * 0.05, 0.26, 0.08), trim, 0, 0.77, z);
    crest.rotation.x = -0.25;
  }
  if (style === 1) {
    const helmet = owned.geometry(new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.48));
    mesh(head, helmet, armor, 0, 0.18, -0.08, 0.94, 0.89, 0.9);
    mesh(head, round(1.55, 0.2, 0.2, 0.08), armor, 0, 0.27, 0.68);
    mesh(upper, round(1.17, 1.3, 0.22, 0.16), armor, 0, 0.63, 0.86);
    mesh(upper, round(0.22, 0.72, 0.07, 0.04), ivory, 0, 0.63, 1.01);
  } else if (style === 2) {
    const horn = owned.geometry(new THREE.ConeGeometry(0.24, 0.85, 8));
    for (const side of [-1, 1]) {
      const point = mesh(head, horn, armor, side * 0.59, 0.75, 0.02);
      point.rotation.z = -side * 0.42;
    }
    mesh(upper, owned.geometry(new THREE.IcosahedronGeometry(0.48, 0)), armor, 0, 0.96, 1.01, 1, 1.25, 0.36);
  }
  const armShape = owned.geometry(form([
    [0.35, 0.08, 0.08], [0.18, 0.64, 0.67], [-0.36, 0.79, 0.77, 0.2, 0.1],
    [-0.9, 0.66, 0.65, 0.44, 0.3], [-1.39, 0.64, 0.62, 0.53, 0.48],
    [-1.68, 0.48, 0.45, 0.5, 0.59], [-1.76, 0.08, 0.08, 0.5, 0.59],
  ], 16, 18, 2));
  const arms = [-1, 1].map(side => {
    const arm = new THREE.Group(); arm.position.set(side * 1.96, 1.9, 0.12); upper.add(arm);
    const shape = armShape.clone();
    if (side < 0) {
      shape.scale(-1, 1, 1); const index = shape.getIndex()!;
      for (let i = 0; i < index.count; i += 3) { const a = index.getX(i); index.setX(i, index.getX(i + 2)); index.setX(i + 2, a); }
    }
    mesh(arm, owned.geometry(shape), body);
    if (style !== 0) {
      mesh(arm, round(1.58, 0.55, 1.5, 0.25), armor, side * 0.04, 0.12, 0.08);
      if (style === 2) {
        const spike = mesh(arm, owned.geometry(new THREE.ConeGeometry(0.19, 0.59, 7)), armor, side * 0.45, 0.56, 0.03);
        spike.rotation.z = -side * 0.28;
      }
    }
    mesh(arm, round(1.43, 0.57, 1.35, 0.23), cuff, side * 0.48, -1.32, 0.47);
    mesh(arm, round(1.46, 1.0, 1.18, 0.39), body, side * 0.49, -1.91, 0.69);
    // Separate rounded fingers read as a hand from the high camera.
    for (let finger = 0; finger < 4; finger++) {
      mesh(arm, ball, body, side * 0.49 + (finger - 1.5) * 0.31, -2.21, 1.09, 0.205, 0.42, 0.27);
    }
    mesh(arm, ball, body, -side * 0.23, -1.8, 1.01, 0.27, 0.42, 0.29);
    return arm;
  });
  function animate(time: number, hit: number, attack = 0, impact = 0, stagger = 0, advance = 0) {
    const t = Number.isFinite(time) ? time : 0;
    const windup = THREE.MathUtils.clamp(attack || 0, 0, 1);
    const strike = Math.pow(THREE.MathUtils.clamp(impact || 0, 0, 1), 0.65);
    // Incoming hits still flash, but cannot disguise the two-handed attack.
    const flash = THREE.MathUtils.clamp(hit || 0, 0, 1);
    const damage = flash * 0.28 * (1 - Math.max(windup, strike));
    const drive = THREE.MathUtils.clamp(advance, 0, 1);
    const stride = Math.sin(t * (drive > 0 ? 8.8 : 4.2)) * (1 - Math.max(windup, strike));
    upper.position.y = 1.43 + Math.abs(stride) * (0.07 + drive * 0.04) + windup * 0.12 - strike * 0.3;
    upper.position.z = -damage * 0.55 - windup * 0.16 + strike * 0.5;
    upper.rotation.x = 0.13 - damage * 0.62 - windup * 0.12 + strike * 0.32 - stagger * 0.48 + drive * 0.12;
    upper.rotation.z = stride * 0.028 + Math.sin(t * 36) * damage * 0.025 + Math.sin(t * 18) * stagger * 0.07;
    head.rotation.x = -0.15 - damage * 0.45 + windup * 0.18 - strike * 0.13 + stagger * 0.35;
    arms.forEach((arm, i) => {
      arm.rotation.x = -0.26 + stride * (i ? -0.19 : 0.19) - windup * 1.75 + strike * 0.62 + damage * 0.85;
      arm.rotation.z = (i ? 1 : -1) * (0.11 + windup * 0.16 + strike * 0.07);
    });
    feet.forEach((leg, i) => { leg.rotation.x = stride * (i ? -1 : 1) * (0.18 + drive * 0.36); });
    body.color.copy(bodyColor).lerp(hitColor, damage * 0.65);
    armor.color.copy(armorColor).lerp(hitColor, damage * 1.6);
    body.emissive.setHex(0xfff9e8); body.emissiveIntensity = damage * 0.15;
    armor.emissive.setHex(0xfff9e8); armor.emissiveIntensity = damage * 0.3;
  }
  animate(0, 0);
  return { group, animate, dispose() { group.clear(); owned.dispose(); } };
}
