import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

/**
 * The combat art lives in this module so the renderer can choose how much of
 * the scene to instance without having to know anything about the individual
 * shapes.  All of the meshes are deliberately low-poly: broad silhouettes
 * read well at phone size, while the geometry remains cheap when a lane fills
 * with hundreds of fighters.
 */

function vertexColor(geometry: THREE.BufferGeometry, hex: number, face = 1): THREE.BufferGeometry {
  const position = geometry.getAttribute("position");
  const color = new THREE.Color(hex);
  const values = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i++) color.toArray(values, i * 3);
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(values, 3));
  geometry.setAttribute("faceMask", new THREE.Float32BufferAttribute(new Float32Array(position.count).fill(face), 1));
  return geometry;
}

function finishMerged(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  // The renderer keeps body vertices in the team tint, while the face mask
  // preserves white eyes and dark pupils without a second instanced draw.
  parts.forEach((part) => {
    if (!part.getAttribute("color")) vertexColor(part, 0xffffff, 0);
  });
  const merged = mergeGeometries(parts, false);
  parts.forEach((part) => part.dispose());
  if (!merged) throw new Error("Unable to merge assault art geometry");
  merged.computeVertexNormals();
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

function transform(
  geometry: THREE.BufferGeometry,
  x: number,
  y: number,
  z: number,
  sx = 1,
  sy = 1,
  sz = 1,
  rx = 0,
  ry = 0,
  rz = 0,
): THREE.BufferGeometry {
  geometry.scale(sx, sy, sz);
  if (rx) geometry.rotateX(rx);
  if (ry) geometry.rotateY(ry);
  if (rz) geometry.rotateZ(rz);
  geometry.translate(x, y, z);
  return geometry;
}

function sphere(
  radius: number,
  widthSegments: number,
  heightSegments: number,
  x: number,
  y: number,
  z: number,
  sx = 1,
  sy = 1,
  sz = 1,
): THREE.BufferGeometry {
  return transform(new THREE.SphereGeometry(radius, widthSegments, heightSegments), x, y, z, sx, sy, sz);
}

function capsule(
  radius: number,
  length: number,
  x: number,
  y: number,
  z: number,
  sx = 1,
  sy = 1,
  sz = 1,
  rx = 0,
  ry = 0,
  rz = 0,
): THREE.BufferGeometry {
  return transform(new THREE.CapsuleGeometry(radius, length, 1, 6), x, y, z, sx, sy, sz, rx, ry, rz);
}

function roundedBox(
  width: number,
  height: number,
  depth: number,
  x: number,
  y: number,
  z: number,
  sx = 1,
  sy = 1,
  sz = 1,
  rx = 0,
  ry = 0,
  rz = 0,
): THREE.BufferGeometry {
  // A bevelled box is overkill for the horde geometry.  The octagonal shape
  // gives the larger figures a toy-like edge without introducing a heavy
  // modifier dependency.
  return transform(new THREE.BoxGeometry(width, height, depth), x, y, z, sx, sy, sz, rx, ry, rz);
}

/**
 * One complete lane fighter.  The feet sit at y=0 and the face points toward
 * -Z.  Colours are intentionally supplied by the caller/instance: one
 * geometry can therefore serve blue and red teams without duplicate buffers.
 */
export function createMobGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  // A narrow capsule torso and a separate ball head preserve the person
  // silhouette from behind, even in a tightly packed phone-sized crowd.
  parts.push(capsule(0.225, 0.3, 0, 0.58, 0, 1, 1, 0.8));
  parts.push(vertexColor(sphere(0.08, 6, 3, 0, 0.68, 0.181, 0.85, 1.15, 0.18), 0xdaf5ff));
  parts.push(capsule(0.075, 0.08, 0, 0.91, 0));
  parts.push(sphere(0.255, 8, 5, 0, 1.15, -0.015, 1, 1, 0.94));
  parts.push(sphere(0.065, 5, 3, 0, 1.1, -0.245, 0.75, 0.75, 0.48));

  // Small forward-facing eyes give close rows a face without adding a second
  // material or per-unit node. The pupils sit a little farther toward -Z.
  for (const side of [-1, 1]) {
    parts.push(vertexColor(sphere(0.045, 6, 3, side * 0.085, 1.19, -0.248, 1, 0.9, 0.35), 0xffffff));
    parts.push(vertexColor(sphere(0.019, 4, 3, side * 0.085, 1.19, -0.263, 0.9, 0.84, 0.3), 0x162338));
  }

  for (const side of [-1, 1]) {
    // Shoulder caps and stubby arms hang just outside the torso.
    parts.push(sphere(0.14, 5, 3, side * 0.29, 0.72, 0, 1.0, 0.9, 0.82));
    parts.push(capsule(0.095, 0.19, side * 0.31, 0.53, 0, 1, 1, 1, 0, 0, side * 0.08));
    parts.push(sphere(0.105, 6, 3, side * 0.31, 0.39, -0.005, 0.92, 0.9, 0.9));

    // Short, planted legs and oversized feet make the figure feel stable when
    // the shader bobs an entire instanced crowd.
    parts.push(capsule(0.115, 0.19, side * 0.13, 0.2, 0, 1, 1, 1, 0, 0, side * 0.035));
    parts.push(sphere(0.14, 6, 3, side * 0.13, 0.095, -0.075, 1.05, 0.6, 1.45));
  }

  const geometry = finishMerged(parts);
  geometry.scale(1, 0.93, 1);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  // Ensure the documented origin is the feet even if a future silhouette
  // tweak changes one of the low-poly cap radii.
  if (geometry.boundingBox && geometry.boundingBox.min.y !== 0) {
    geometry.translate(0, -geometry.boundingBox.min.y, 0);
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
  }
  return geometry;
}

/**
 * A deliberately tiny crowd proxy.  It keeps only the torso, head, feet and
 * arms, so a distant queue costs fewer than 100 triangles per figure.
 */
export function createHordeGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(roundedBox(0.42, 0.53, 0.28, 0, 0.43, 0));
  parts.push(roundedBox(0.28, 0.28, 0.27, 0, 0.84, -0.01));
  // A two-strip eye mark keeps the distant proxy from collapsing into a
  // featureless red/blue carpet while staying inside the 100-triangle budget.
  for (const side of [-1, 1]) {
    parts.push(vertexColor(roundedBox(0.07, 0.035, 0.012, side * 0.055, 0.86, -0.151), 0xffffff));
  }
  for (const side of [-1, 1]) {
    parts.push(roundedBox(0.13, 0.27, 0.15, side * 0.28, 0.48, 0, 1, 1, 1, 0, 0, side * 0.12));
    parts.push(roundedBox(0.14, 0.18, 0.19, side * 0.12, 0.11, -0.045));
  }
  const geometry = finishMerged(parts);
  if (geometry.boundingBox && geometry.boundingBox.min.y !== 0) {
    geometry.translate(0, -geometry.boundingBox.min.y, 0);
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
  }
  return geometry;
}

type OwnedResources = {
  geometries: Set<THREE.BufferGeometry>;
  materials: Set<THREE.Material>;
};

function ownGeometry<T extends THREE.BufferGeometry>(resources: OwnedResources, geometry: T): T {
  resources.geometries.add(geometry);
  return geometry;
}

function ownMaterial<T extends THREE.Material>(resources: OwnedResources, material: T): T {
  resources.materials.add(material);
  return material;
}

function disposeResources(resources: OwnedResources): void {
  resources.geometries.forEach((geometry) => geometry.dispose());
  resources.materials.forEach((material) => {
    const textureKeys = ["map", "normalMap", "roughnessMap", "metalnessMap", "emissiveMap", "aoMap"] as const;
    for (const key of textureKeys) {
      const texture = (material as unknown as Record<string, unknown>)[key];
      if (texture && texture instanceof THREE.Texture) texture.dispose();
    }
    material.dispose();
  });
  resources.geometries.clear();
  resources.materials.clear();
}

function makeMesh(
  parent: THREE.Object3D,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  x = 0,
  y = 0,
  z = 0,
  sx = 1,
  sy = 1,
  sz = 1,
  rx = 0,
  ry = 0,
  rz = 0,
): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.scale.set(sx, sy, sz);
  mesh.rotation.set(rx, ry, rz);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

export type SiegeCannonArt = {
  group: THREE.Group;
  barrel: THREE.Group;
  muzzle: THREE.Mesh;
  dispose: () => void;
};

/**
 * Small blue siege cannon for the defense end of the lane.  The barrel group
 * is intentionally exposed so the renderer can slide it along -Z for recoil.
 */
export function createSiegeCannon(includeChassis = true): SiegeCannonArt {
  const resources: OwnedResources = { geometries: new Set(), materials: new Set() };
  const group = new THREE.Group();
  group.name = "siege-cannon";

  const cyan = ownMaterial(resources, new THREE.MeshStandardMaterial({ color: 0x18bde8, roughness: 0.34, metalness: 0.08 }));
  const cyanShade = ownMaterial(resources, new THREE.MeshStandardMaterial({ color: 0x0784bd, roughness: 0.4, metalness: 0.1 }));
  const navy = ownMaterial(resources, new THREE.MeshStandardMaterial({ color: 0x132e53, roughness: 0.54, metalness: 0.2 }));
  const bore = ownMaterial(resources, new THREE.MeshStandardMaterial({ color: 0x07162d, roughness: 0.78, metalness: 0.05 }));
  const gold = ownMaterial(resources, new THREE.MeshStandardMaterial({ color: 0xffc83d, roughness: 0.36, metalness: 0.22 }));
  const rimMaterial = ownMaterial(resources, new THREE.MeshStandardMaterial({ color: 0xf7f1e3, roughness: 0.42, metalness: 0.04 }));

  const chassisGeometry = ownGeometry(resources, new THREE.CapsuleGeometry(0.34, 0.64, 3, 10).rotateZ(Math.PI / 2));
  const wheelGeometry = ownGeometry(resources, new THREE.CylinderGeometry(0.37, 0.37, 0.2, 12));
  const hubGeometry = ownGeometry(resources, new THREE.CylinderGeometry(0.13, 0.13, 0.25, 10));
  const turretGeometry = ownGeometry(resources, new THREE.SphereGeometry(0.47, 12, 7));
  const tubeGeometry = ownGeometry(resources, new THREE.CylinderGeometry(0.24, 0.28, 0.94, 12));
  const capGeometry = ownGeometry(resources, new THREE.SphereGeometry(0.25, 10, 6));
  const rimGeometry = ownGeometry(resources, new THREE.TorusGeometry(0.27, 0.065, 8, 16));
  const boreGeometry = ownGeometry(resources, new THREE.CylinderGeometry(0.2, 0.2, 0.024, 16));
  const collarGeometry = ownGeometry(resources, new THREE.TorusGeometry(0.27, 0.038, 7, 14));

  // Grounded chassis and a rounded cyan turret.
  if (includeChassis) makeMesh(group, chassisGeometry, navy, 0, 0.25, 0.08, 0.88, 0.55, 0.8);
  makeMesh(group, turretGeometry, cyan, 0, 0.53, 0.12, 1.0, 0.64, 0.86);

  for (const side of includeChassis ? [-1, 1] : []) {
    const wheel = makeMesh(group, wheelGeometry, navy, side * 0.42, 0.37, 0.18, 1, 1, 1, 0, 0, Math.PI / 2);
    wheel.scale.set(1.0, 1.0, 1.0);
    makeMesh(group, hubGeometry, gold, side * 0.50, 0.37, 0.18, 1, 1, 1, 0, 0, Math.PI / 2);
  }

  const barrel = new THREE.Group();
  barrel.name = "recoil-barrel";
  barrel.position.set(0, 0.58, -0.08);
  group.add(barrel);

  // The cylinder axis is Y by default; rotate it so the weapon points -Z.
  makeMesh(barrel, tubeGeometry, cyanShade, 0, 0, -0.49, 1, 1, 1, Math.PI / 2);
  makeMesh(barrel, capGeometry, cyan, 0, 0, -0.96, 1.0, 1.0, 1.0);
  const collar = makeMesh(barrel, collarGeometry, rimMaterial, 0, 0, -0.12, 1, 1, 1, 0, 0, 0);
  collar.rotation.set(0, 0, 0);
  const rim = makeMesh(barrel, rimGeometry, rimMaterial, 0, 0, -1.04);
  rim.rotation.set(0, 0, 0);
  // Returned separately so hit effects can hide/replace the opening while the
  // white rim stays a stable part of the cannon silhouette.
  const muzzle = makeMesh(barrel, boreGeometry, bore, 0, 0, -1.045, 1, 1, 1, Math.PI / 2);
  muzzle.name = "muzzle-opening";

  const dispose = () => {
    group.clear();
    disposeResources(resources);
  };

  return { group, barrel, muzzle, dispose };
}

export type WardenArt = {
  group: THREE.Group;
  animate: (time: number, hit: number, attack?: number) => void;
  dispose: () => void;
};

type WardenPalette = {
  body: number;
  bodyLight: number;
  bodyDark: number;
  armor: number;
  armorLight: number;
  eye: number;
  mouth: number;
};

const WARDEN_PALETTES: WardenPalette[] = [
  { body: 0xd78332, bodyLight: 0xf0ad54, bodyDark: 0x99532d, armor: 0x7d4d2c, armorLight: 0xb97838, eye: 0xffd15d, mouth: 0x301b23 },
  { body: 0xc89958, bodyLight: 0xe3bd79, bodyDark: 0x927044, armor: 0x6e5040, armorLight: 0x9d7653, eye: 0xffe28a, mouth: 0x39251e },
  { body: 0xc95848, bodyLight: 0xe27c5d, bodyDark: 0x8c3840, armor: 0x5b3345, armorLight: 0x8d4e58, eye: 0xffb14f, mouth: 0x321b2e },
];

function wardenMaterial(resources: OwnedResources, color: number, roughness = 0.74, metalness = 0.04, emissive?: number): THREE.MeshStandardMaterial {
  return ownMaterial(resources, new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness,
    emissive: emissive ?? 0,
    emissiveIntensity: emissive ? 0.65 : 0,
  }));
}

/**
 * A single warm, armoured warden.  The node hierarchy contains only the
 * handful of parts that need animation; static details are still regular
 * meshes so callers can cull the complete boss as one group.
 */
export function createWarden(variant = 0): WardenArt {
  const palette = WARDEN_PALETTES[((variant % WARDEN_PALETTES.length) + WARDEN_PALETTES.length) % WARDEN_PALETTES.length];
  const resources: OwnedResources = { geometries: new Set(), materials: new Set() };
  const group = new THREE.Group();
  group.name = "warden";

  const body = wardenMaterial(resources, palette.body);
  const bodyLight = wardenMaterial(resources, palette.bodyLight);
  const bodyDark = wardenMaterial(resources, palette.bodyDark);
  const armor = wardenMaterial(resources, palette.armor, 0.64, 0.12);
  const armorLight = wardenMaterial(resources, palette.armorLight, 0.58, 0.14);
  const eye = wardenMaterial(resources, palette.eye, 0.36, 0.08, palette.eye);
  const mouth = wardenMaterial(resources, palette.mouth, 0.86, 0.02);

  const torsoGeometry = ownGeometry(resources, new THREE.SphereGeometry(1, 12, 8));
  const chestGeometry = ownGeometry(resources, new THREE.SphereGeometry(1, 10, 6));
  const bellyArmorGeometry = ownGeometry(resources, new THREE.BoxGeometry(1, 1, 1));
  const headGeometry = ownGeometry(resources, new THREE.SphereGeometry(1, 12, 8));
  const jawGeometry = ownGeometry(resources, new THREE.CapsuleGeometry(0.68, 0.44, 3, 10));
  const limbGeometry = ownGeometry(resources, new THREE.CapsuleGeometry(0.33, 0.86, 3, 8));
  const forearmGeometry = ownGeometry(resources, new THREE.CapsuleGeometry(0.44, 0.9, 3, 8));
  const fistGeometry = ownGeometry(resources, new THREE.SphereGeometry(0.74, 10, 7));
  const footGeometry = ownGeometry(resources, new THREE.SphereGeometry(1, 10, 6));
  const shoulderGeometry = ownGeometry(resources, new THREE.SphereGeometry(1, 10, 6));
  const browGeometry = ownGeometry(resources, new THREE.BoxGeometry(0.66, 0.18, 0.2));
  const eyeGeometry = ownGeometry(resources, new THREE.SphereGeometry(0.14, 8, 5));
  const mouthGeometry = ownGeometry(resources, new THREE.BoxGeometry(0.72, 0.14, 0.12));
  const crestGeometry = ownGeometry(resources, new THREE.ConeGeometry(0.3, 0.7, 6));
  const knuckleGeometry = ownGeometry(resources, new THREE.SphereGeometry(0.13, 7, 5));

  // Short legs are kept in their own groups for a small walk cycle.  All body
  // coordinates use a foot origin at y=0; the crown reaches about y=7.2.
  const leftLeg = new THREE.Group();
  const rightLeg = new THREE.Group();
  leftLeg.name = "left-leg";
  rightLeg.name = "right-leg";
  leftLeg.position.set(-0.73, 1.03, 0);
  rightLeg.position.set(0.73, 1.03, 0);
  group.add(leftLeg, rightLeg);
  makeMesh(leftLeg, limbGeometry, bodyDark, 0, 0, 0, 1.0, 1.15, 0.94);
  makeMesh(rightLeg, limbGeometry, bodyDark, 0, 0, 0, 1.0, 1.15, 0.94);
  makeMesh(leftLeg, footGeometry, body, 0, -0.72, 0.22, 0.74, 0.31, 1.15);
  makeMesh(rightLeg, footGeometry, body, 0, -0.72, 0.22, 0.74, 0.31, 1.15);

  const torso = new THREE.Group();
  torso.name = "torso";
  torso.position.set(0, 3.12, 0);
  group.add(torso);
  makeMesh(torso, torsoGeometry, body, 0, 0, 0, 1.6, 1.68, 0.9);
  // A raised chest plane breaks up the pear silhouette and catches a warm rim
  // light without a texture.
  makeMesh(torso, chestGeometry, bodyLight, 0, 0.26, 0.73, 1.18, 0.78, 0.24);
  makeMesh(torso, bellyArmorGeometry, armorLight, 0, -0.53, 0.38, 1.02, 0.21, 0.4);

  // Neck, head and a strong lower jaw give the boss an unambiguous face when
  // viewed from the lane camera (+Z).
  const neck = makeMesh(group, limbGeometry, bodyDark, 0, 4.62, 0, 0.9, 0.8, 0.72);
  neck.rotation.x = Math.PI / 2;
  const head = new THREE.Group();
  head.name = "head";
  head.position.set(0, 5.67, 0.05);
  group.add(head);
  makeMesh(head, headGeometry, body, 0, 0, 0, 1.14, 1.18, 0.92);
  makeMesh(head, jawGeometry, bodyLight, 0, -0.49, 0.17, 1.02, 0.62, 0.72, Math.PI / 2);

  // Brow plates are slanted in opposite directions, framing two glowing eyes.
  makeMesh(head, browGeometry, armor, -0.49, 0.22, 0.97, 1, 1, 1, 0, 0, -0.14);
  makeMesh(head, browGeometry, armor, 0.49, 0.22, 0.97, 1, 1, 1, 0, 0, 0.14);
  makeMesh(head, eyeGeometry, eye, -0.44, -0.02, 0.98, 1.12, 0.85, 0.64);
  makeMesh(head, eyeGeometry, eye, 0.44, -0.02, 0.98, 1.12, 0.85, 0.64);
  makeMesh(head, mouthGeometry, mouth, 0, -0.61, 0.89);

  // A compact crest is decorative rather than a branded emblem.  It is tilted
  // forward so it remains visible in the camera's elevated angle.
  const crest = makeMesh(head, crestGeometry, armorLight, 0, 1.05, 0.02, 1.35, 0.95, 0.78);
  crest.rotation.x = -0.24;

  const leftShoulder = makeMesh(group, shoulderGeometry, armor, -1.7, 4.05, 0, 0.86, 0.54, 0.82, 0, 0, -0.12);
  const rightShoulder = makeMesh(group, shoulderGeometry, armor, 1.7, 4.05, 0, 0.86, 0.54, 0.82, 0, 0, 0.12);
  leftShoulder.name = "left-shoulder-guard";
  rightShoulder.name = "right-shoulder-guard";

  const leftArm = new THREE.Group();
  const rightArm = new THREE.Group();
  leftArm.name = "left-arm";
  rightArm.name = "right-arm";
  leftArm.position.set(-1.72, 3.56, 0);
  rightArm.position.set(1.72, 3.56, 0);
  group.add(leftArm, rightArm);
  makeMesh(leftArm, limbGeometry, body, 0, -0.53, 0, 1.2, 1.18, 1.08, 0, 0, -0.12);
  makeMesh(rightArm, limbGeometry, body, 0, -0.53, 0, 1.2, 1.18, 1.08, 0, 0, 0.12);
  makeMesh(leftArm, forearmGeometry, bodyLight, 0, -1.42, 0.06, 1.08, 0.92, 1.04, 0, 0, -0.08);
  makeMesh(rightArm, forearmGeometry, bodyLight, 0, -1.42, 0.06, 1.08, 0.92, 1.04, 0, 0, 0.08);
  const leftFist = makeMesh(leftArm, fistGeometry, body, 0, -2.2, 0.2, 1.08, 0.96, 1.04);
  const rightFist = makeMesh(rightArm, fistGeometry, body, 0, -2.2, 0.2, 1.08, 0.96, 1.04);
  leftFist.name = "left-fist";
  rightFist.name = "right-fist";
  for (const side of [-1, 1]) {
    const fist = side < 0 ? leftFist : rightFist;
    for (let i = -1; i <= 1; i++) {
      const knuckle = makeMesh(fist, knuckleGeometry, bodyDark, i * 0.23, 0.2, 0.68, 1.08, 0.94, 0.82);
      knuckle.position.x = i * 0.23;
    }
  }

  const clamp01 = (value: number) => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  const animate = (time: number, hit: number, attack = 0) => {
    const t = Number.isFinite(time) ? time : 0;
    const hitAmount = clamp01(hit);
    const attackAmount = clamp01(attack);
    const breath = Math.sin(t * 2.15) * 0.045;
    const stride = Math.sin(t * 5.3) * 0.08;
    const stomp = Math.sin(attackAmount * Math.PI * 0.5);

    torso.scale.set(1, 1 + breath * 0.52, 1);
    torso.rotation.x = hitAmount * -0.08;
    head.position.set(0, 5.67 + breath * 1.35, 0.05 - hitAmount * 0.25);
    head.rotation.x = hitAmount * 0.12 + stomp * 0.05;
    leftLeg.rotation.x = stride;
    rightLeg.rotation.x = -stride;
    // The attack drives the right fist into a readable overhead-to-stomp arc;
    // hit recoil still wins slightly so damage never freezes the animation.
    leftArm.rotation.z = -0.08 - stride * 0.24;
    rightArm.rotation.z = 0.08 + stride * 0.24;
    leftArm.rotation.x = hitAmount * 0.18;
    rightArm.rotation.x = -hitAmount * 0.16 - stomp * 0.8;
    leftArm.rotation.y = hitAmount * 0.05;
    rightArm.rotation.y = -hitAmount * 0.07 + stomp * 0.18;
    leftFist.scale.set(1.07 + stomp * 0.06, 0.92 + stomp * 0.08, 1 + stomp * 0.06);
    rightFist.scale.set(1.07 + stomp * 0.1, 0.92 + stomp * 0.12, 1 + stomp * 0.08);
  };

  const dispose = () => {
    group.clear();
    disposeResources(resources);
  };

  return { group, animate, dispose };
}
