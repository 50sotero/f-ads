import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { CANNON_Y, CHARGE_MAX, DEFENSE_Y, MAX_UNITS, W, cannonBarrelPositions, surgeActive, trapActive, weaponForLevel, type Game, type Unit } from "./engine";
import { createGuardGeometry, createHordeGeometry, createMobGeometry, createSiegeCannon, createWarden } from "./assaultArt";
import { championShieldAim } from "./targeting";

// The simulation uses a moving local battlefield. The long road and bridges
// stay in world space while the camera follows each new encounter's arena.
const SX = 0.052, SZ = 0.115;
const wx = (x: number) => (x - W / 2) * SX;
// The long approach separates the multiplier decisions from the battlefront.
const wz = (y: number) => (y - CANNON_Y) * SZ;
const BLUE = 0x00a7ff, RED = 0xf00c2d;
type Particle = { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; size: number; color: number };
type Label = { sprite: THREE.Sprite; write: (text: string, fill?: string, plateFill?: string) => void };
type GateView = { group: THREE.Group; panel: THREE.Mesh; material: THREE.MeshStandardMaterial; frame: THREE.MeshStandardMaterial; hazard: THREE.Group; label: Label; value: string; selected: boolean; nextBurst: number; brokenAt: number };

export type CrowdRenderer = {
  render: (game: Game, dt: number) => void;
  resize: (width: number, height: number) => void;
  aimX: (normalizedX: number) => number;
  dispose: () => void;
};

export function createRenderer(canvas: HTMLCanvasElement): CrowdRenderer {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(41, 390 / 844, 0.2, 380);
  const cameraHome = new THREE.Vector3(7.5, 40, 20);
  const cameraTarget = new THREE.Vector3(0, 0, -18);
  let combatFocus = 0, framingFov = 43, cameraFollow = 0, combatLookZ = -18, displayedFov = 43;
  const stage = new THREE.Group(); scene.add(stage);
  let theme = "fork", travel = 0;
  const worldCurve = (z: number) => theme === "bend" ? Math.sin(z * 0.018) * 1.3 : 0;
  const curve = (z: number) => worldCurve(z - travel);
  scene.fog = new THREE.Fog(0xe4e5eb, 180, 340);
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  const geo = <T extends THREE.BufferGeometry>(value: T) => { geometries.add(value); return value; };
  const mat = <T extends THREE.Material>(value: T) => { materials.add(value); return value; };
  const texture = <T extends THREE.Texture>(value: T) => { textures.add(value); return value; };
  const standard = (color: number, options: THREE.MeshStandardMaterialParameters = {}) => mat(new THREE.MeshStandardMaterial({ color, roughness: 0.75, ...options }));
  const basic = (color: number, options: THREE.MeshBasicMaterialParameters = {}) => mat(new THREE.MeshBasicMaterial({ color, ...options }));
  const cube = geo(new THREE.BoxGeometry(1, 1, 1));
  const sand = standard(0xafd4c7);
  const ivory = standard(0xe1dce3), metal = standard(0x77777f), dark = standard(0x3e414b);
  const white = standard(0xffffff);
  let randomSeed = 413;
  function random() { randomSeed = (Math.imul(randomSeed, 1664525) + 1013904223) >>> 0; return randomSeed / 4294967296; }
  function mesh(parent: THREE.Object3D, shape: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number) {
    const object = new THREE.Mesh(shape, material);
    object.position.set(x, y, z); object.scale.set(sx, sy, sz);
    object.castShadow = true; object.receiveShadow = true; parent.add(object); return object;
  }
  const box = (parent: THREE.Object3D, material: THREE.Material, x: number, y: number, z: number, a: number, b: number, c: number) => c > 25
    ? mesh(parent, geo(new THREE.BoxGeometry(a, b, c, 1, 1, Math.ceil(c / 3))), material, x, y, z, 1, 1, 1)
    : mesh(parent, cube, material, x, y, z, a, b, c);
  function bake(group: THREE.Group) {
    group.updateMatrixWorld(true);
    const buckets = new Map<string, { material: THREE.Material; parts: THREE.BufferGeometry[]; cast: boolean; receive: boolean }>();
    for (const child of [...group.children]) {
      if (!(child instanceof THREE.Mesh) || Array.isArray(child.material) || child.children.length || child.name === "muzzle-opening" || child.renderOrder) continue;
      const part = child.geometry.clone().applyMatrix4(child.matrix);
      const key = `${child.material.id}:${child.castShadow}:${child.receiveShadow}`;
      const bucket = buckets.get(key) ?? { material: child.material, parts: [] as THREE.BufferGeometry[], cast: child.castShadow, receive: child.receiveShadow };
      bucket.parts.push(part); buckets.set(key, bucket); group.remove(child);
    }
    for (const { material, parts, cast, receive } of buckets.values()) {
      const combined = geo(mergeGeometries(parts)); parts.forEach((part) => part.dispose());
      const object = new THREE.Mesh(combined, material); object.castShadow = cast; object.receiveShadow = receive; group.add(object);
    }
  }

  const skyCanvas = document.createElement("canvas"); skyCanvas.width = 4; skyCanvas.height = 256;
  const skyContext = skyCanvas.getContext("2d")!;
  const skyGradient = skyContext.createLinearGradient(0, 0, 0, 256);
  skyGradient.addColorStop(0, "#78c8f2"); skyGradient.addColorStop(0.55, "#c7e8f4"); skyGradient.addColorStop(1, "#e3efed");
  skyContext.fillStyle = skyGradient; skyContext.fillRect(0, 0, 4, 256);
  const sky = texture(new THREE.CanvasTexture(skyCanvas)); sky.colorSpace = THREE.SRGBColorSpace; scene.background = sky;
  scene.add(new THREE.HemisphereLight(0xe6f3ff, 0x586981, 1.45));
  const sun = new THREE.DirectionalLight(0xfff8ed, 3.1);
  sun.position.set(-25, 45, -12); sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024); sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.08;
  Object.assign(sun.shadow.camera, { left: -24, right: 24, top: 42, bottom: -42, near: 1, far: 130 });
  scene.add(sun, sun.target);

  // A restrained, fine-grained road texture keeps the enormous crowd readable.
  const roadCanvas = document.createElement("canvas"); roadCanvas.width = 256; roadCanvas.height = 256;
  const roadContext = roadCanvas.getContext("2d")!;
  roadContext.fillStyle = "#c9c2cb"; roadContext.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1800; i++) {
    roadContext.fillStyle = random() > 0.5 ? "rgba(76,69,89,.035)" : "rgba(255,255,255,.035)";
    roadContext.fillRect(random() * 256, random() * 256, 1 + random() * 2, 1 + random() * 2);
  }
  const roadTexture = texture(new THREE.CanvasTexture(roadCanvas)); roadTexture.colorSpace = THREE.SRGBColorSpace;
  roadTexture.wrapS = roadTexture.wrapT = THREE.RepeatWrapping; roadTexture.repeat.set(3, 53);
  const roadMaterial = standard(0xffffff, { map: roadTexture });
  box(scene, sand, 0, -0.42, -110, 520, 0.6, 520).castShadow = false;
  const road = mesh(scene, geo(new THREE.BoxGeometry(18.7, 0.22, 320, 1, 1, 100)), roadMaterial, 0, -0.12, -112, 1, 1, 1); road.castShadow = false;
  // Raised concrete approach, three lanes, then a broad holding arena.
  const scenery = new THREE.Group(); stage.add(scenery);
  for (const side of [-1, 1]) {
    box(scenery, dark, side * 9.65, 0.3, -4, 0.5, 0.8, 32);
    box(scenery, ivory, side * 9.65, 0.73, -4, 0.62, 0.12, 32);
    box(scenery, white, side * 3.2, 0.006, 5, 0.18, 0.018, 24).castShadow = false;
    // The side drop is a visible depth cue, with a ribbed concrete retaining wall.
    box(scenery, ivory, side * 13.4, -1.14, -4, 6.2, 0.18, 32).castShadow = false;
    for (let z = 11; z > -20; z -= 1.05) {
      const rib = box(scenery, metal, side * 12.5, -0.66, z, 2.7, 0.13, 0.16);
      rib.rotation.z = side * -0.45;
    }
  }
  bake(scenery);
  const arena = new THREE.Group(); stage.add(arena);
  box(arena, roadMaterial, 0, -0.09, -91.2, 32, 0.2, 143).castShadow = false;
  for (const side of [-1, 1]) {
    box(arena, dark, side * 12.9, 0.4, -19.7, 6.3, 1, 0.6);
    box(arena, ivory, side * 12.9, 0.95, -19.7, 6.3, 0.12, 0.76);
    box(arena, ivory, side * 16, 0.4, -81, 0.7, 1, 123);
  }
  // Divider walls give the +1 lane and the weapon lane a physical boundary.
  const dividers = new THREE.Group(); stage.add(dividers);
  for (const side of [-1, 1]) {
    box(dividers, dark, side * 4.5, 0.38, -16, 0.32, 0.8, 11);
    box(dividers, ivory, side * 4.5, 0.81, -16, 0.42, 0.1, 11);
    const shoulder = box(dividers, dark, side * 7.1, 0.38, -21.4, 5.5, 0.8, 0.4);
    shoulder.rotation.y = side * -0.16;
  }
  bake(arena); bake(dividers);
  // Sparse sculpted scenery frames the playable road without hiding a lane.
  const landscape = new THREE.Group(); scene.add(landscape);
  const foliage = [standard(0x47a98b), standard(0x77c5a2), standard(0x398c7c)];
  const trunk = standard(0x947d73), rock = standard(0xc9d7d4);
  const crown = geo(new THREE.IcosahedronGeometry(1, 0));
  const stem = geo(new THREE.CylinderGeometry(0.14, 0.22, 1, 5));
  for (const side of [-1, 1]) {
    for (let i = 0; i < 30; i++) {
      const z = 10 - i * 7.7, x = side * (z > -20 ? 16.5 + random() * 4 : 19 + random() * 5);
      const scale = 1.05 + random() * 0.6;
      mesh(landscape, stem, trunk, x, scale * 0.7, z, scale, scale * 1.4, scale);
      mesh(landscape, crown, foliage[i % 3], x, 2.1 * scale, z, 1.1 * scale, 1.65 * scale, 1.1 * scale);
      if (i % 2 === 0) mesh(landscape, crown, rock, x - side * 2.3, 0.2, z + 1.8, 0.75, 0.5, 0.65);
    }
  }
  bake(landscape);
  // Low silhouettes outside the arena give each route family a distinct place.
  // They are merged once; no extra per-frame crowd or terrain work is needed.
  const meadow = new THREE.Group(), lagoon = new THREE.Group(), canyon = new THREE.Group();
  scene.add(meadow, lagoon, canyon);
  const hill = standard(0x72b99b), hillLight = standard(0x96cfab);
  const island = standard(0xe7d8b4), cliff = standard(0xbd8f84), cliffTop = standard(0xdbb59d);
  const landform = geo(new THREE.IcosahedronGeometry(1, 1));
  const cliffForm = geo(new THREE.CylinderGeometry(0.72, 1, 1, 6));
  for (const side of [-1, 1]) {
    for (let i = 0; i < 15; i++) {
      const z = 8 - i * 17.3, x = side * (29 + random() * 7), size = 3 + random() * 3;
      mesh(meadow, landform, i % 2 ? hill : hillLight, x, -0.5, z, size * 1.9, size, size * 2.3).castShadow = false;
      mesh(lagoon, landform, island, side * (z > -20 ? 20 : 22), -0.78, z, 8, 1.25, 12).castShadow = false;
      const mesa = mesh(canyon, cliffForm, cliff, x, size * 0.6 - 0.5, z, size * 1.5, size * 1.2, size * 2.1);
      mesa.rotation.y = i * 1.73;
      const cap = mesh(canyon, cliffForm, cliffTop, x, size * 1.2 - 0.4, z, size * 1.12, 0.38, size * 1.56);
      cap.rotation.y = mesa.rotation.y;
    }
  }
  bake(meadow); bake(lagoon); bake(canyon);
  const fortress = new THREE.Group(); stage.add(fortress);
  const castleStone = standard(0x657b9b), castleLight = standard(0x9dadc3), banner = standard(0xf23862);
  box(fortress, castleStone, 0, 2.4, -78, 29, 4.8, 3.2);
  box(fortress, dark, 0, 2, -76.25, 4.8, 4, 0.2);
  for (const x of [-14, -8, 8, 14]) {
    mesh(fortress, geo(new THREE.CylinderGeometry(2.1, 2.3, 7, 8)), castleLight, x, 3.5, -77, 1, 1, 1);
    mesh(fortress, geo(new THREE.CylinderGeometry(2.5, 2.5, 0.6, 8)), castleStone, x, 7.1, -77, 1, 1, 1);
    for (let k = 0; k < 8; k++) box(fortress, castleLight, x + Math.cos(k * Math.PI / 4) * 2.1, 7.7, -77 + Math.sin(k * Math.PI / 4) * 2.1, 0.8, 0.85, 0.8);
    box(fortress, banner, x, 4.8, -74.85, 1.4, 2.7, 0.12);
  }
  for (let x = -13; x <= 13; x += 2) box(fortress, castleLight, x, 5.2, -78, 1, 1, 3.3);
  bake(fortress);
  fortress.position.z = -35;
  const bridges = new THREE.Group(); scene.add(bridges);
  const water = standard(0x4dadc0, { roughness: 0.34, metalness: 0.12 });
  const foam = basic(0xa4d9ce, { transparent: true, opacity: 0.45 });
  for (const z of [-24, -61, -98]) {
    box(bridges, water, 0, -0.095, z, 170, 0.02, 17).castShadow = false;
    for (const bank of [-1, 1]) box(bridges, ivory, 0, -0.075, z + bank * 8.6, 170, 0.035, 0.35).castShadow = false;
    for (let i = 0; i < 22; i++) {
      const x = (random() - 0.5) * 100;
      if (Math.abs(x) < 10) continue;
      box(bridges, foam, x, -0.073, z + (random() - 0.5) * 15, 0.8 + random() * 2.5, 0.01, 0.06).castShadow = false;
    }
  }
  bake(bridges);
  type Bendable = { geometry: THREE.BufferGeometry; original: Float32Array; offset: number };
  function bendables(group: THREE.Object3D, offset = 0): Bendable[] {
    const result: Bendable[] = [];
    group.traverse((object) => {
      if (!(object instanceof THREE.Mesh || object instanceof THREE.LineSegments)) return;
      result.push({ geometry: object.geometry, original: new Float32Array(object.geometry.attributes.position.array), offset });
    });
    return result;
  }
  const worldBends = bendables(road, -112);
  const stageBends = [...bendables(scenery), ...bendables(arena), ...bendables(dividers)];
  function bendGeometry(parts: Bendable[], offset = 0) {
    for (const part of parts) {
      const attribute = part.geometry.attributes.position;
      for (let i = 0; i < attribute.count; i++) attribute.setX(i, part.original[i * 3] + worldCurve(part.original[i * 3 + 2] + part.offset + offset));
      attribute.needsUpdate = true; part.geometry.computeBoundingSphere();
    }
  }

  function makeLabel(text: string, width: number, height: number, fill = "#ffffff", fontSize = 135, plate = false): Label {
    const source = document.createElement("canvas"); source.width = 512; source.height = 192;
    const context = source.getContext("2d")!;
    const map = texture(new THREE.CanvasTexture(source)); map.colorSpace = THREE.SRGBColorSpace;
    const material = mat(new THREE.SpriteMaterial({ map, transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
    const sprite = new THREE.Sprite(material); sprite.scale.set(width, height, 1); sprite.renderOrder = 5;
    const write = (value: string, color = fill, plateFill = "#27324be8") => {
      context.clearRect(0, 0, 512, 192); context.textAlign = "center"; context.textBaseline = "middle";
      context.font = `700 ${fontSize}px Fredoka, Arial, sans-serif`; context.lineJoin = "round";
      const textWidth = context.measureText(value).width;
      if (textWidth > 472) context.font = `700 ${Math.floor(fontSize * 472 / textWidth)}px Fredoka, Arial, sans-serif`;
      if (plate) {
        const plateWidth = Math.min(504, context.measureText(value).width + 38);
        context.fillStyle = plateFill; context.strokeStyle = "#ffffffb0"; context.lineWidth = 4;
        context.beginPath(); context.roundRect(256 - plateWidth / 2, 14, plateWidth, 170, 27); context.fill(); context.stroke();
      }
      context.strokeStyle = "#31263e"; context.lineWidth = 14; context.strokeText(value, 256, 104);
      context.fillStyle = color; context.fillText(value, 256, 104); map.needsUpdate = true;
    };
    write(text); return { sprite, write };
  }
  function gate(color: number, text: string, castShadow = true): GateView {
    const group = new THREE.Group(); stage.add(group);
    const material = standard(color, { emissive: color, emissiveIntensity: 0.22, transparent: true, opacity: 0.48, roughness: 0.3, depthWrite: false });
    const frameMaterial = standard(color, { roughness: 0.32 });
    const panel = box(group, material, 0, 1.32, 0, 1, 2.4, 0.12); panel.castShadow = false;
    box(group, frameMaterial, 0, 0.13, 0, 1.04, 0.24, 0.48);
    for (const x of [-0.51, 0.51]) box(group, frameMaterial, x, 1.36, 0, 0.027, 2.72, 0.28);
    const label = makeLabel(text, 5.4, 2.05, "#ffffff", text.startsWith("+") ? 165 : 151, true);
    // Keep the decision legible above moving heads at every camera angle.
    // The translucent structure stays in world space; its value faces the player.
    label.sprite.position.set(0, 1.98, 0.13); group.add(label.sprite);
    const hazard = new THREE.Group(); group.add(hazard); hazard.visible = false;
    const stripe = basic(0xffe37b);
    for (let i = -4; i <= 4; i++) {
      box(hazard, stripe, i * 0.112, 0.28, 0.135, 0.05, 0.12, 0.02).castShadow = false;
      box(hazard, stripe, i * 0.112, 2.46, 0.135, 0.05, 0.1, 0.02).castShadow = false;
    }
    bake(hazard);
    if (!castShadow) group.traverse((object) => { object.castShadow = false; });
    bake(group);
    return { group, panel, material, frame: frameMaterial, hazard, label, value: text, selected: false, nextBurst: 0, brokenAt: -1 };
  }
  const gates: GateView[] = [];
  const pickups = Array.from({ length: 10 }, () => gate(0x019bff, "+1"));
  function bakeArt(group: THREE.Group) {
    for (const child of group.children) if (child instanceof THREE.Group) bakeArt(child);
    bake(group);
  }
  const paintedMaterial = standard(0xffffff, { vertexColors: true, roughness: 0.34 });
  function paintedMesh(source: THREE.Object3D, recursive: boolean) {
    source.updateMatrixWorld(true);
    const inverse = new THREE.Matrix4().copy(source.matrixWorld).invert();
    const parts: THREE.BufferGeometry[] = [];
    const collect = (object: THREE.Object3D) => {
      if (!(object instanceof THREE.Mesh) || Array.isArray(object.material) || object.name === "muzzle-opening") return;
      const geometry = object.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, object.matrixWorld));
      const tint = (object.material as THREE.MeshStandardMaterial).color;
      const colors = new Float32Array(geometry.attributes.position.count * 3);
      for (let i = 0; i < colors.length; i += 3) { colors[i] = tint.r; colors[i + 1] = tint.g; colors[i + 2] = tint.b; }
      geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3)); parts.push(geometry);
    };
    if (recursive) source.traverse(collect); else for (const child of source.children) if (child instanceof THREE.Mesh) child.traverse(collect);
    const combined = geo(mergeGeometries(parts)); parts.forEach((part) => part.dispose());
    return new THREE.Mesh(combined, paintedMaterial);
  }
  function bakeCannon(group: THREE.Group) {
    for (const child of group.children) if (child instanceof THREE.Group) bakeCannon(child);
    if (group.children.some((child) => child instanceof THREE.Mesh && child.name !== "muzzle-opening")) {
      const combined = paintedMesh(group, false);
      for (const child of [...group.children]) if (child instanceof THREE.Mesh && child.name !== "muzzle-opening") group.remove(child);
      group.add(combined);
    }
  }
  const cannon = Array.from({ length: 5 }, () => {
    const value = createSiegeCannon(true); bakeCannon(value.group);
    value.group.traverse((object) => { object.castShadow = true; }); stage.add(value.group);
    return { ...value, shots: 0, recoil: 0 };
  });

  function targetChest(title: string) {
    const group = new THREE.Group(); stage.add(group);
    const lacquer = standard(0xc64452, { roughness: 0.36 });
    const steel = standard(0x414753, { metalness: 0.25, roughness: 0.42 });
    const body = geo(new THREE.CylinderGeometry(1.05, 1.05, 3.15, 20).rotateZ(Math.PI / 2));
    mesh(group, body, lacquer, 0, 1.17, 0, 1, 1, 1);
    const hoop = geo(new THREE.TorusGeometry(1.07, 0.12, 6, 20).rotateY(Math.PI / 2));
    for (const side of [-1, 1]) {
      mesh(group, hoop, steel, side * 1.55, 1.17, 0, 1, 1, 1);
      box(group, steel, side * 1.45, 0.14, 0.2, 0.49, 0.3, 2.2);
    }
    const gold = standard(0xffdf23, { roughness: 0.27, emissive: 0xffca00, emissiveIntensity: 0.15 });
    const boltShape = new THREE.Shape(); boltShape.moveTo(0.1,0.48); boltShape.lineTo(-0.3,-0.03); boltShape.lineTo(-0.03,-0.03); boltShape.lineTo(-0.11,-0.45); boltShape.lineTo(0.35,0.15); boltShape.lineTo(0.08,0.15); boltShape.closePath();
    const bolt = geo(new THREE.ExtrudeGeometry(boltShape, { depth: 0.12, bevelEnabled: true, bevelSegments: 2, steps: 1, bevelSize: 0.035, bevelThickness: 0.03 }));
    mesh(group, bolt, gold, 0, 2.28, 0.53, 1, 1, 1);
    const count = makeLabel("20", 3.1, 1.8, "#ffffff", 147); count.sprite.position.set(0, 1.05, 1.1); group.add(count.sprite);
    const caption = makeLabel(title, 4.8, 1.15, "#fff1a3", 103); caption.sprite.position.set(0, 3.1, 0); group.add(caption.sprite);
    bake(group);
    return { group, count, lacquer };
  }
  const weaponChest = targetChest("WEAPON ↑"), cannonChest = targetChest("CANNON +1");
  const weaponCrate = weaponChest.group, crateCount = weaponChest.count;
  const prize = createSiegeCannon(true); bakeCannon(prize.group); prize.group.scale.setScalar(1.25); prize.group.rotation.y = Math.PI;
  prize.group.position.set(0, 0.12, -4.8); weaponCrate.add(prize.group);
  const upgradeRails = new THREE.Group(); weaponCrate.add(upgradeRails);
  const railGold = standard(0xffdf39, { emissive: 0xffd000, emissiveIntensity: 0.2, transparent: true, opacity: 0.7 });
  for (let i = 0; i < 6; i++) {
    box(upgradeRails, railGold, 0, 0.17, -2.6 - i * 0.86, 3.1, 0.26, 0.3).castShadow = false;
  }
  bake(upgradeRails);
  let crateHp = -1, crateMax = -1, cannonLockHp = -1;
  const batteryShadowMaterial = basic(0x513e48, { transparent: true, opacity: 0.2, depthWrite: false });
  const circle = geo(new THREE.CircleGeometry(1, 16)); circle.rotateX(-Math.PI / 2);
  const batteryShadow = mesh(stage, circle, batteryShadowMaterial, 0, 0.03, 0, 1.15, 1, 0.85); batteryShadow.castShadow = false;
  const aimRingMaterial = basic(0xd1f7ff, { transparent: true, opacity: 0.55, depthWrite: false });
  const aimRingGeometry = geo(new THREE.RingGeometry(0.94, 1, 32)); aimRingGeometry.rotateX(-Math.PI / 2);
  const aimRing = mesh(stage, aimRingGeometry, aimRingMaterial, 0, 0.025, 0, 1, 1, 0.65); aimRing.castShadow = false;
  const RING_CAPACITY = 20;
  const ringMaterial = basic(0xffffff, { transparent: true, opacity: 1, depthWrite: false });
  ringMaterial.vertexColors = true;
  const ringGeometry = geo(aimRingGeometry.clone());
  const ringAlpha = new THREE.InstancedBufferAttribute(new Float32Array(RING_CAPACITY), 1).setUsage(THREE.DynamicDrawUsage);
  const ringAlphaArray = ringAlpha.array;
  ringGeometry.setAttribute("ringAlpha", ringAlpha);
  ringMaterial.onBeforeCompile = (shader) => {
    shader.vertexShader = `attribute float ringAlpha; varying float vRingAlpha;\n${shader.vertexShader}`
      .replace("#include <begin_vertex>", "#include <begin_vertex>\n        vRingAlpha = ringAlpha;");
    shader.fragmentShader = `varying float vRingAlpha;\n${shader.fragmentShader}`
      .replace("#include <color_fragment>", "#include <color_fragment>\n        diffuseColor.a *= vRingAlpha;");
  };
  ringMaterial.customProgramCacheKey = () => "arena-ring-alpha-v1";
  const ringMesh = new THREE.InstancedMesh(ringGeometry, ringMaterial, RING_CAPACITY);
  ringMesh.frustumCulled = false; ringMesh.visible = false; ringMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); stage.add(ringMesh);
  const ringColors = new THREE.InstancedBufferAttribute(new Float32Array(RING_CAPACITY * 3), 3).setUsage(THREE.DynamicDrawUsage);
  ringMesh.instanceColor = ringColors;
  const ringColorArray = ringColors.array;
  const ringMatrixArray = ringMesh.instanceMatrix.array;
  for (let i = 0; i < RING_CAPACITY; i++) {
    const matrixOffset = i * 16;
    ringMatrixArray[matrixOffset] = ringMatrixArray[matrixOffset + 5] = ringMatrixArray[matrixOffset + 10] = ringMatrixArray[matrixOffset + 15] = 1;
    ringColorArray[i * 3] = 0.714;
    ringColorArray[i * 3 + 1] = 0.961;
    ringColorArray[i * 3 + 2] = 1;
  }
  let ringColorDirty = true;
  const trajectoryMaterial = basic(0x8eefff, { transparent: true, opacity: 0.25, depthWrite: false });
  const trajectory = new THREE.InstancedMesh(cube, trajectoryMaterial, 50); trajectory.frustumCulled = false; stage.add(trajectory);
  const selectedGates = new Set<number>();
  const warningMaterial = basic(0xff543b, { transparent: true, opacity: 0, depthWrite: false });
  const warningRing = mesh(stage, aimRingGeometry, warningMaterial, 0, 0.045, -18, 4, 1, 2.5); warningRing.castShadow = false;
  const flankMaterial = basic(0xff713d, { transparent: true, opacity: 0, depthWrite: false });
  const flankWarning = new THREE.Group(); stage.add(flankWarning);
  mesh(flankWarning, aimRingGeometry, flankMaterial, 0, 0.055, 0, 2.4, 1, 1.45).castShadow = false;
  const chevronShape = new THREE.Shape();
  chevronShape.moveTo(-0.7, 0); chevronShape.lineTo(0, 0.65); chevronShape.lineTo(0.7, 0);
  chevronShape.lineTo(0.7, -0.35); chevronShape.lineTo(0, 0.3); chevronShape.lineTo(-0.7, -0.35); chevronShape.closePath();
  const chevronGeometry = geo(new THREE.ShapeGeometry(chevronShape).rotateX(-Math.PI / 2).rotateY(Math.PI));
  const flankArrows = [0, 1, 2].map((i) => {
    const arrow = mesh(flankWarning, chevronGeometry, flankMaterial, 0, 0.065, 2.2 + i * 1.25, 1, 1, 1);
    arrow.castShadow = false; return arrow;
  });
  const rushMaterial = basic(0xff374b, { transparent: true, opacity: 0, depthWrite: false });
  const rushEdges = [-1, 1].map((side) => { const edge = box(stage, rushMaterial, side * 9.05, 0.02, -8, 0.18, 0.02, 23); edge.castShadow = false; return edge; });
  const defenseMaterial = basic(0x6ef3e4, { transparent: true, opacity: 0.82 });
  const defense = new THREE.Group(); stage.add(defense);
  const defenseZ = wz(DEFENSE_Y);
  const laneGuideMaterial = basic(0xffb65c, { transparent: true, opacity: 0.4, depthTest: false, depthWrite: false });
  const laneGuide = new THREE.InstancedMesh(chevronGeometry, laneGuideMaterial, 12);
  laneGuide.instanceMatrix.setUsage(THREE.DynamicDrawUsage); laneGuide.frustumCulled = false; laneGuide.renderOrder = 3; stage.add(laneGuide);
  const laneBeacon = box(stage, laneGuideMaterial, 0, 0.055, defenseZ, 3.2, 0.02, 0.5); laneBeacon.castShadow = false; laneBeacon.renderOrder = 3;
  let guideX = W / 2;
  for (let i = 0; i < 24; i++) {
    box(defense, defenseMaterial, -9 + i * 0.78, 0.038, defenseZ, 0.46, 0.025, 0.18).castShadow = false;
  }
  for (const side of [-1, 1]) {
    box(defense, dark, side * 9.15, 0.28, defenseZ, 0.46, 0.56, 0.7);
    box(defense, defenseMaterial, side * 9.15, 0.61, defenseZ, 0.37, 0.1, 0.54).castShadow = false;
  }
  const dangerMaterial = basic(0xff335c, { transparent: true, opacity: 0, depthWrite: false });
  const dangerStrip = box(stage, dangerMaterial, 0, 0.022, defenseZ - 1.35, 18.2, 0.01, 2.6);
  dangerStrip.castShadow = false;
  const wallViews: THREE.Group[] = [], spinnerViews: THREE.Group[] = [];
  const hazardMetal = standard(0x405775), hazardTop = standard(0xffc547);
  function wallView() {
    const group = new THREE.Group(); stage.add(group);
    box(group, hazardMetal, 0, 0.4, 0, 1, 0.8, 1);
    box(group, ivory, 0, 0.84, 0, 1.04, 0.1, 1.04);
    for (let i = -2; i <= 2; i++) box(group, hazardTop, i * 0.18, 0.9, 0, 0.08, 0.015, 0.85).castShadow = false;
    bake(group); return group;
  }
  function spinnerView() {
    const group = new THREE.Group(); stage.add(group);
    box(group, hazardTop, 0, 0.3, 0, 2, 0.32, 0.18);
    box(group, hazardMetal, 0, 0.3, 0, 0.18, 0.34, 2);
    mesh(group, geo(new THREE.CylinderGeometry(0.12, 0.16, 0.65, 8)), dark, 0, 0.35, 0, 1, 1, 1);
    bake(group); return group;
  }

  const animationTime = { value: 0 }, reserveRout = { value: 0 };
  function crowdMaterial(color: number) {
    const material = standard(color, { roughness: 0.32, vertexColors: true });
    material.onBeforeCompile = (shader) => {
      shader.uniforms.runTime = animationTime;
      shader.uniforms.reserveRout = reserveRout;
      shader.vertexShader = `uniform float runTime; uniform float reserveRout; attribute float faceMask; attribute float stridePart; attribute vec4 runMotion; varying float vFaceMask; varying float vGateGlow;\n${shader.vertexShader}`.replace("#include <beginnormal_vertex>", `
        #include <beginnormal_vertex>
        float runPhase = runMotion.w < -0.5 ? runTime * 17.0 + runMotion.x : runMotion.x;
        float stride = sin(runPhase) * runMotion.y;
        float limbAngle = stride * sign(stridePart) * (abs(stridePart) > 1.5 ? 0.95 : -0.8);
        if (abs(stridePart) > 0.5 && abs(stridePart) < 1.5) limbAngle += runMotion.z * (0.8 + sin(runTime * 14.0 + runMotion.x + stridePart * 1.57) * 0.55);
        float limbCos = cos(limbAngle), limbSin = sin(limbAngle);
        objectNormal.yz = mat2(limbCos, limbSin, -limbSin, limbCos) * objectNormal.yz;
      `).replace("#include <begin_vertex>", `
        #include <begin_vertex>
        vFaceMask = faceMask;
        vGateGlow = max(0.0, runMotion.w);
        if (abs(stridePart) > 0.5) {
          float pivot = abs(stridePart) > 1.5 ? 0.36 : 0.75;
          transformed.yz = mat2(limbCos, limbSin, -limbSin, limbCos) * vec2(position.y - pivot, position.z);
          transformed.y += pivot;
        }
        transformed.y += abs(stride) * 0.075;
        transformed.y += (0.5 + 0.5 * sin(runTime * 3.0 + runMotion.x)) * 0.02 * (1.0 - runMotion.y);
        transformed.x += stride * 0.02 * position.y;
        if (runMotion.w < -0.5) {
          // Each reserve row walks forward and wraps beyond the far camera
          // edge. Wrapping rows separately avoids a whole-field snap.
          float rowZ = instanceMatrix[3].z;
          float flowingZ = rowZ + sin(runTime * 0.8 + floor(-rowZ / 0.72) * 0.12) * 0.18;
          float scaleSquared = dot(instanceMatrix[2].xyz, instanceMatrix[2].xyz);
          transformed.xz += vec2(instanceMatrix[0].z, instanceMatrix[2].z) * (flowingZ - rowZ) / scaleSquared;
          float scatter = max(0.0, reserveRout - fract(runMotion.x * 0.317) * 0.8);
          transformed.x -= sign(instanceMatrix[3].x + sin(runMotion.x)) * scatter * (4.0 + fract(runMotion.x) * 4.0);
          transformed.z += scatter * scatter * (3.0 + fract(runMotion.x * 7.7) * 5.0);
        }
      `);
      shader.fragmentShader = `varying float vFaceMask; varying float vGateGlow;\n${shader.fragmentShader}`.replace("#include <color_fragment>", `
        #include <color_fragment>
        diffuseColor.rgb = mix(diffuseColor.rgb, vColor.rgb, vFaceMask);
      `).replace("#include <opaque_fragment>", `
        float rim = pow(1.0 - max(0.0, dot(normal, normalize(vViewPosition))), 1.6);
        outgoingLight *= 1.0 - rim * 0.2;
        outgoingLight += vec3(0.18, 0.9, 1.5) * vGateGlow * (0.3 + rim * 1.8);
        #include <opaque_fragment>
      `);
    };
    material.customProgramCacheKey = () => "arena-speed-stride-v11"; return material;
  }
  const mobGeometry = geo(createMobGeometry()), reserveGeometry = geo(createHordeGeometry());
  const friendMaterial = crowdMaterial(BLUE), enemyMaterial = crowdMaterial(0xffffff);
  const friends = new THREE.InstancedMesh(geo(mobGeometry.clone()), friendMaterial, MAX_UNITS + 32);
  const enemies = new THREE.InstancedMesh(geo(mobGeometry.clone()), enemyMaterial, 1600);
  const guards = new THREE.InstancedMesh(geo(createGuardGeometry()), crowdMaterial(0xe72a55), 1600);
  const bracedGuards = new THREE.InstancedMesh(geo(createGuardGeometry(true)), crowdMaterial(0xdb2851), 16);
  const regularUnits: Unit[] = [], guardUnits: Unit[] = [], bracedUnits: Unit[] = [];
  const shieldLabel = makeLabel("SHIELD", 4.3, 1.45, "#ffe5a0", 127, true);
  stage.add(shieldLabel.sprite); shieldLabel.sprite.visible = false; shieldLabel.sprite.renderOrder = 7;
  const shieldHalo = new THREE.InstancedMesh(geo(new THREE.RingGeometry(0.72, 1, 24).rotateX(-Math.PI / 2)), basic(0xffd66c, { transparent: true, opacity: 0.8, depthTest: false, depthWrite: false }), 16);
  shieldHalo.instanceMatrix.setUsage(THREE.DynamicDrawUsage); shieldHalo.frustumCulled = false; shieldHalo.renderOrder = 2; stage.add(shieldHalo);
  // A marker for every shield keeps separated late threats readable at phone
  // scale. The center sight shows the champion's real launch lane; it never
  // bends toward a guard that the player has not lined up with.
  const markerCanvas = document.createElement("canvas"); markerCanvas.width = 64; markerCanvas.height = 96;
  const markerContext = markerCanvas.getContext("2d")!;
  markerContext.beginPath(); markerContext.moveTo(21, 9); markerContext.lineTo(43, 9);
  markerContext.lineTo(43, 44); markerContext.lineTo(56, 44); markerContext.lineTo(32, 84);
  markerContext.lineTo(8, 44); markerContext.lineTo(21, 44); markerContext.closePath();
  markerContext.lineJoin = "round"; markerContext.lineWidth = 10; markerContext.strokeStyle = "#42301d";
  markerContext.stroke(); markerContext.fillStyle = "#ffe58a"; markerContext.fill();
  const markerTexture = texture(new THREE.CanvasTexture(markerCanvas)); markerTexture.colorSpace = THREE.SRGBColorSpace;
  const shieldMarkers = new THREE.InstancedMesh(geo(new THREE.PlaneGeometry(1.45, 2.15)), basic(0xffffff, { map: markerTexture, transparent: true, depthTest: false, depthWrite: false, toneMapped: false }), 16);
  shieldMarkers.instanceMatrix.setUsage(THREE.DynamicDrawUsage); shieldMarkers.frustumCulled = false; shieldMarkers.renderOrder = 6; stage.add(shieldMarkers);
  const championSightMaterial = basic(0xffdc64, { transparent: true, opacity: 0.8, depthTest: false, depthWrite: false });
  const championSight = new THREE.InstancedMesh(cube, championSightMaterial, 20);
  championSight.instanceMatrix.setUsage(THREE.DynamicDrawUsage); championSight.frustumCulled = false; championSight.renderOrder = 4; stage.add(championSight);
  let shieldCaption = "SHIELD";
  type UploadRange = { start: number; count: number };
  const queueUpdate = (attribute: THREE.BufferAttribute, range: UploadRange, start: number, count: number) => {
    if (count <= 0) return;
    range.start = start; range.count = count;
    if (attribute.updateRanges.length === 0) attribute.updateRanges.push(range);
    attribute.needsUpdate = true;
  };
  type Fallen = { x: number; z: number; travel: number; side: number; angle: number; life: number; size: number; color: THREE.Color };
  const fallen: Fallen[] = [], previousUnits: Unit[] = [];
  const fallenMesh = new THREE.InstancedMesh(geo(mobGeometry.clone()), crowdMaterial(0xffffff), 96);
  fallenMesh.geometry.setAttribute("runMotion", new THREE.InstancedBufferAttribute(new Float32Array(96 * 4), 4));
  fallenMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); fallenMesh.frustumCulled = false; stage.add(fallenMesh);
  // Twelve thousand silhouettes already cover the visible reserve field;
  // deeper rows sit above the viewport and would only add vertex work.
  const reserves = new THREE.InstancedMesh(reserveGeometry, crowdMaterial(RED), 12000);
  for (const object of [friends, enemies, guards, bracedGuards, reserves]) {
    object.frustumCulled = false; object.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    object.geometry.setAttribute("runMotion", new THREE.InstancedBufferAttribute(new Float32Array(object.instanceMatrix.count * 4), 4).setUsage(THREE.DynamicDrawUsage));
    stage.add(object);
  }
  const friendColorKeys = new Int8Array(friends.instanceMatrix.count).fill(-1);
  const enemyColorKeys = new Int8Array(enemies.instanceMatrix.count).fill(-1);
  const guardColorKeys = new Int8Array(guards.instanceMatrix.count).fill(-1);
  const bracedColorKeys = new Int8Array(bracedGuards.instanceMatrix.count).fill(-1);
  for (const object of [friends, enemies, guards, bracedGuards]) {
    object.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(object.instanceMatrix.count * 3), 3).setUsage(THREE.DynamicDrawUsage);
  }
  const friendMatrixRange: UploadRange = { start: 0, count: 0 }, enemyMatrixRange: UploadRange = { start: 0, count: 0 }, guardMatrixRange: UploadRange = { start: 0, count: 0 };
  const friendMotionRange: UploadRange = { start: 0, count: 0 }, enemyMotionRange: UploadRange = { start: 0, count: 0 }, guardMotionRange: UploadRange = { start: 0, count: 0 };
  const bracedMatrixRange: UploadRange = { start: 0, count: 0 }, bracedMotionRange: UploadRange = { start: 0, count: 0 }, bracedColorRange: UploadRange = { start: 0, count: 0 };
  const friendColorRange: UploadRange = { start: 0, count: 0 }, enemyColorRange: UploadRange = { start: 0, count: 0 }, guardColorRange: UploadRange = { start: 0, count: 0 };
  const shadowSource = document.createElement("canvas"); shadowSource.width = shadowSource.height = 32;
  const shadowContext = shadowSource.getContext("2d")!;
  const shadowGradient = shadowContext.createRadialGradient(16, 16, 2, 16, 16, 16);
  shadowGradient.addColorStop(0, "rgba(27,26,53,.54)");
  shadowGradient.addColorStop(0.55, "rgba(27,26,53,.32)"); shadowGradient.addColorStop(1, "rgba(27,26,53,0)");
  shadowContext.fillStyle = shadowGradient; shadowContext.fillRect(0, 0, 32, 32);
  const shadowMaterial = basic(0xffffff, { map: texture(new THREE.CanvasTexture(shadowSource)), transparent: true, depthWrite: false });
  const shadowGeometry = geo(new THREE.PlaneGeometry(1, 1)); shadowGeometry.rotateX(-Math.PI / 2);
  const shadows = new THREE.InstancedMesh(shadowGeometry, shadowMaterial, MAX_UNITS + 1632); shadows.frustumCulled = false; stage.add(shadows);
  shadows.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const shadowMatrixRange: UploadRange = { start: 0, count: 0 };
  const dummy = new THREE.Object3D();
  const unitWhite = new THREE.Color(0xffffff), blueChampion = new THREE.Color(0xa8f4ff);
  const redSoldier = new THREE.Color(RED), redBrute = new THREE.Color(0xc81a4b), redRunner = new THREE.Color(0xff7135);
  const motion = new WeakMap<Unit, { x: number; y: number; travel: number; time: number; angle: number; run: number; phase: number; launchedAt: number; used: number; glow: number; enemy: boolean }>();
  let unitSequence = 0;
  let shadowCount = 0;
  let hasRenderedUnits = false;
  function drawUnits(units: Unit[], object: THREE.InstancedMesh, enemy: boolean, entry: number, colorKeys: Int8Array, matrixRange: UploadRange, motionRange: UploadRange, colorRange: UploadRange) {
    const count = Math.min(units.length, object.instanceMatrix.count); object.count = count;
    // At the crowd cap, slightly smaller ordinary runners keep the spaces
    // between heads readable. Champions and opponents retain their silhouette.
    const crowdScale = enemy ? 1 : 1 - Math.min(1, Math.max(0, (count - 600) / 300)) * 0.13;
    // Match the densely packed head width to the simulation's lateral spacing.
    // Preserve height and champion size so the mob still reads as people.
    const crowdFootprint = enemy ? 1 : 1 - Math.min(1, Math.max(0, (count - 450) / 450)) * 0.19;
    const runMotion = object.geometry.getAttribute("runMotion") as THREE.InstancedBufferAttribute;
    const runMotionArray = runMotion.array;
    const matrices = object.instanceMatrix.array, shadowMatrices = shadows.instanceMatrix.array;
    const colors = object.instanceColor!.array;
    let colorsDirty = false;
    let colorStart = count, colorEnd = -1;
    const time = currentGame?.t ?? 0;
    const boss = currentGame?.bases[currentGame.assault?.encounter ?? 0];
    const front = currentGame?.assault?.frontline ?? boss?.y ?? 300;
    for (let i = 0; i < count; i++) {
      const unit = units[i];
      const runner = enemy && unit.kind === "runner", guard = enemy && unit.kind === "guard";
      const size = unit.big ? (enemy ? 1.9 : 2.1) : guard ? unit.braced ? 1.7 : 1.18 : enemy ? 0.99 : 1.2 * crowdScale;
      const unitWorldZ = wz(unit.y), z = unitWorldZ - (enemy ? entry : 0), unitCurve = curve(z);
      let state = motion.get(unit);
      if (!state) {
        state = {
        x: unit.x, y: unit.y, travel, time, angle: enemy ? Math.PI : 0, run: 1,
        phase: (unitSequence++ * 2.39996) % (Math.PI * 2),
        launchedAt: !enemy && unit.used === 0 && unit.y >= CANNON_Y - 40 ? time : -Infinity,
        used: unit.used, glow: !enemy && unit.used !== 0 && hasRenderedUnits ? 1 : 0, enemy,
        };
        motion.set(unit, state);
      }
      // Flight ends on a clock, even if a crowd ahead blocks ground movement.
      // Position-based arcs left queued runners hovering above the muzzle.
      const flight = Math.max(0, Math.min(1, (time - state.launchedAt) / 0.34));
      const shotFlight = flight < 1 ? (1 - flight) * 0.7 + Math.sin(flight * Math.PI) * 0.65 : 0;
      const elapsed = time - state.time;
      state.glow = Math.max(0, state.glow - elapsed * 4);
      if (!enemy && unit.used !== state.used) { state.glow = 1; state.used = unit.used; }
      if (elapsed > 0) {
        const stateWorldZ = wz(state.y);
        const dx = (unit.x - state.x) * SX + unitCurve - curve(stateWorldZ);
        const dz = unitWorldZ - stateWorldZ - (travel - state.travel);
        const speed = Math.sqrt(dx * dx + dz * dz) / elapsed;
        if (speed > 0.8) {
          const target = Math.atan2(-dx, -dz);
          let delta = target - state.angle;
          delta -= Math.floor((delta + Math.PI) / (Math.PI * 2)) * Math.PI * 2;
          state.angle += delta * Math.min(1, elapsed * 14);
        }
        state.run += (Math.min(1, speed / (enemy ? 1.8 : 7)) - state.run) * Math.min(1, elapsed * 12);
        // Integrate stride from actual ground speed. Multiplying absolute time
        // by a changing cadence makes feet snap when a runner brakes or turns.
        state.phase += elapsed * (9 + Math.min(14, speed) * 2) * Math.max(0.15, state.run);
      }
      state.x = unit.x; state.y = unit.y; state.travel = travel; state.time = time;
      const fighting = shotFlight === 0 && state.run < 0.55 && (Math.abs(unit.y - front) < 32 || !!boss && Math.abs(unit.y - boss.y - boss.h / 2) < 25) ? (0.55 - state.run) / 0.55 : 0;
      const motionOffset = i * 4;
      runMotionArray[motionOffset] = state.phase; runMotionArray[motionOffset + 1] = shotFlight > 0 ? 0.15 : state.run;
      runMotionArray[motionOffset + 2] = fighting; runMotionArray[motionOffset + 3] = state.glow;
      const landing = flight >= 1 ? Math.max(0, 1 - (time - state.launchedAt - 0.34) / 0.12) : 0;
      const pitch = shotFlight > 0 ? -0.42 * Math.sin(flight * Math.PI) : (runner ? -0.26 : -0.14) * state.run;
      const cy = Math.cos(state.angle), sy = Math.sin(state.angle), cp = Math.cos(pitch), sp = Math.sin(pitch);
      const popScale = 1 + Math.sin(state.glow * Math.PI) * 0.18;
      const footprint = unit.big ? 1 : crowdFootprint;
      const sx = size * footprint * (1 + landing * 0.1) * popScale * (runner ? 0.83 : 1), syScale = size * (1 - landing * 0.16) * popScale * (runner ? 1.08 : 1);
      const x = wx(unit.x) + unitCurve, offset = i * 16;
      // Compose yaw × forward lean directly into the instance buffer. Avoid
      // thousands of Object3D Euler/quaternion callbacks per crowded frame.
      matrices[offset] = cy * sx; matrices[offset + 1] = 0; matrices[offset + 2] = -sy * sx; matrices[offset + 3] = 0;
      matrices[offset + 4] = sy * sp * syScale; matrices[offset + 5] = cp * syScale; matrices[offset + 6] = cy * sp * syScale; matrices[offset + 7] = 0;
      matrices[offset + 8] = sy * cp * sx; matrices[offset + 9] = -sp * sx; matrices[offset + 10] = cy * cp * sx; matrices[offset + 11] = 0;
      matrices[offset + 12] = x; matrices[offset + 13] = 0.025 + shotFlight; matrices[offset + 14] = z; matrices[offset + 15] = 1;
      const tintKey = enemy ? unit.big ? 1 : runner ? 2 : guard ? 3 : 4 : unit.big ? 5 : 6;
      if (colorKeys[i] !== tintKey) {
        const tint = enemy ? unit.big ? redBrute : runner ? redRunner : guard ? unitWhite : redSoldier : unit.big ? blueChampion : unitWhite;
        const colorOffset = i * 3;
        colors[colorOffset] = tint.r; colors[colorOffset + 1] = tint.g; colors[colorOffset + 2] = tint.b;
        colorKeys[i] = tintKey;
        colorsDirty = true;
        colorStart = Math.min(colorStart, i); colorEnd = i;
      }
      const shadowOffset = shadowCount++ * 16;
      // Contact shadows remain axis aligned; all other entries retain the
      // identity values initialized by InstancedMesh.
      shadowMatrices[shadowOffset] = size * footprint * 1.5; shadowMatrices[shadowOffset + 10] = size * footprint * 1.1;
      // The sun offset follows body height, which the footprint keeps intact.
      shadowMatrices[shadowOffset + 12] = x + 0.34 * size; shadowMatrices[shadowOffset + 13] = 0.025; shadowMatrices[shadowOffset + 14] = z + 0.19 * size;
    }
    queueUpdate(object.instanceMatrix, matrixRange, 0, count * 16);
    queueUpdate(runMotion, motionRange, 0, count * 4);
    if (colorsDirty) queueUpdate(object.instanceColor!, colorRange, colorStart * 3, (colorEnd - colorStart + 1) * 3);
  }

  const impactCanvas = document.createElement("canvas"); impactCanvas.width = impactCanvas.height = 256;
  const impactContext = impactCanvas.getContext("2d")!;
  impactContext.fillStyle = "#fffbe7"; impactContext.strokeStyle = "#ffd267"; impactContext.lineWidth = 5;
  impactContext.shadowColor = "#ffbb42"; impactContext.shadowBlur = 12;
  impactContext.beginPath();
  for (let i = 0; i < 16; i++) {
    const angle = i * Math.PI / 8, radius = i % 2 ? 25 : i % 4 ? 70 : 112;
    const x = 128 + Math.cos(angle) * radius, y = 128 + Math.sin(angle) * radius;
    if (i === 0) impactContext.moveTo(x, y); else impactContext.lineTo(x, y);
  }
  impactContext.closePath(); impactContext.fill(); impactContext.stroke();
  const impactTexture = texture(new THREE.CanvasTexture(impactCanvas)); impactTexture.colorSpace = THREE.SRGBColorSpace;
  type BossView = { art: ReturnType<typeof createWarden>; label: Label; bar: THREE.Group; fill: THREE.Mesh; impact: THREE.Sprite; hitX: number; hp: number; deadAt: number; damageAt: number; deathX: number; deathZ: number; deathTravel: number };
  const bosses: BossView[] = [];
  function ensureBosses(count: number) {
    while (bosses.length < count) {
      const art = createWarden(bosses.length); bakeArt(art.group); stage.add(art.group);
      const label = makeLabel("500", 5.8, 1.9, "#ffffff", 144); stage.add(label.sprite);
      const bar = new THREE.Group(); stage.add(bar);
      box(bar, dark, 0, 0, 0, 5.4, 0.65, 0.18);
      const fill = box(bar, standard(0xff294e, { emissive: 0xff1734, emissiveIntensity: 0.3 }), 0, 0, 0.11, 5.15, 0.46, 0.1);
      const impact = new THREE.Sprite(mat(new THREE.SpriteMaterial({ map: impactTexture, transparent: true, opacity: 0, depthWrite: false, depthTest: false })));
      impact.renderOrder = 4; impact.visible = false; stage.add(impact);
      bosses.push({ art, label, bar, fill, impact, hitX: 0, hp: -1, deadAt: -99, damageAt: -99, deathX: 0, deathZ: 0, deathTravel: 0 });
    }
  }
  const particleList: Particle[] = [];
  const particleColors = new Map<number, THREE.Color>();
  const particleMaterial = basic(0xffffff);
  const particles = new THREE.InstancedMesh(geo(new THREE.IcosahedronGeometry(1, 1)), particleMaterial, 720); particles.frustumCulled = false; stage.add(particles);
  function burst(x: number, y: number, z: number, hex: number, count: number, force = 1, confetti = false) {
    for (let i = 0; i < count; i++) {
      if (particleList.length >= 720) particleList.shift();
      const angle = random() * Math.PI * 2, speed = (1.2 + random() * 3.3) * force;
      const life = (0.3 + random() * 0.55) * (confetti ? 3 : 1);
      particleList.push({ x, y, z, vx: Math.cos(angle) * speed, vy: (2 + random() * 4) * force, vz: Math.sin(angle) * speed, life, size: (0.08 + random() * 0.14) * force, color: confetti ? [BLUE, 0xffd43b, 0xf13686, 0x9e44ff, 0x78edc9][i % 5] : hex });
    }
  }
  const ringAge = new Float32Array(RING_CAPACITY); ringAge.fill(2);
  const ringMax = new Float32Array(RING_CAPACITY); ringMax.fill(1);
  const ringActive = new Uint8Array(RING_CAPACITY);
  const ringColor = new THREE.Color();
  let ringCursor = 0;
  function ring(x: number, z: number, hex: number, max = 2) {
    const index = ringCursor++ % RING_CAPACITY;
    ringAge[index] = 0; ringMax[index] = max; ringActive[index] = 1; ringColor.setHex(hex);
    const colorOffset = index * 3;
    ringColorArray[colorOffset] = ringColor.r; ringColorArray[colorOffset + 1] = ringColor.g; ringColorArray[colorOffset + 2] = ringColor.b;
    const matrixOffset = index * 16;
    ringMatrixArray[matrixOffset] = ringMatrixArray[matrixOffset + 5] = ringMatrixArray[matrixOffset + 10] = 0.3;
    ringMatrixArray[matrixOffset + 12] = x; ringMatrixArray[matrixOffset + 13] = 0.045; ringMatrixArray[matrixOffset + 14] = z;
    ringColorDirty = true;
  }
  const tags = Array.from({ length: 10 }, () => { const value = makeLabel("", 3.1, 1.1, "#ffffff", 96); stage.add(value.sprite); return { ...value, age: 2, y: 0 }; });
  let tagCursor = 0;
  function tag(text: string, x: number, z: number, fill: string) {
    const value = tags[tagCursor++ % tags.length]; value.write(text, fill); value.age = 0; value.y = 2.8; value.sprite.position.set(x, value.y, z);
  }
  const seenPops = new WeakSet<object>();
  let currentGame: Game | null = null, shot = 0, shake = 0, previousTier = 1, previousWeapon = 1, winAt = -1, lostAt = -1, reserveInitialized = 0, previousTravel = -1;
  let previousStatus = "playing", frameTime = 0, shadowAt = 0, previousPulse = 0, wasRushing = false, previousBreaches = 0;
  let previousPhase = "battle", previousWave = 0, previousWaveLane = 0, counterattackAt = -99, retreatCount = 0, retreatZ = -57;
  let reserveAnchor = NaN;
  const projected = new THREE.Vector3();
  function updateCamera(dt = 1) {
    const followX = cameraFollow;
    const portrait = camera.aspect < 0.85;
    camera.clearViewOffset();
    camera.position.copy(cameraHome); camera.position.z -= travel;
    camera.position.y -= combatFocus * 5;
    camera.position.z -= combatFocus * 2;
    camera.fov = framingFov - combatFocus * 2; camera.updateProjectionMatrix();
    camera.position.x += curve(0) + followX;
    camera.position.x += Math.sin(frameTime * 57) * shake * 0.09;
    camera.position.y += Math.cos(frameTime * 43) * shake * 0.06;
    camera.lookAt(cameraTarget.x + curve(combatLookZ) + followX, cameraTarget.y, combatLookZ - travel); camera.updateMatrixWorld();
    // Frame the actual battery and actionable panels. Fitting both empty
    // cannon extremes at once kept the camera too far from every collision.
    let framingScale = 1, minX = Infinity, maxX = -Infinity, topY = -Infinity;
    const framePoint = (x: number, y: number, z: number, bottom = 0.86) => {
      projected.set(x + curve(z), y, z - travel).project(camera);
      minX = Math.min(minX, projected.x); maxX = Math.max(maxX, projected.x);
      topY = Math.max(topY, projected.y);
      if (!portrait) framingScale = Math.max(framingScale, Math.abs(projected.x) / 0.93, Math.max(0, -projected.y) / bottom);
    };
    const cannonX = wx(currentGame?.cannonX ?? W / 2);
    const batteryHalf = currentGame ? Math.max(...cannonBarrelPositions(currentGame.assault?.tier ?? 1).map((barrel) => Math.abs(barrel.x) * SX)) + 1.2 : 1.2;
    framePoint(cannonX - batteryHalf, 0.4, 0.8);
    framePoint(cannonX + batteryHalf, 0.4, 0.8);
    projected.set(cannonX + curve(0.8), 0.4, 0.8 - travel).project(camera);
    const cannonY = projected.y;
    for (const gate of currentGame?.gates ?? []) {
      if (gate.overrun) continue;
      framePoint(wx(gate.cx - gate.w / 2) - 0.2, 1.5, wz(gate.y));
      framePoint(wx(gate.cx + gate.w / 2) + 0.2, 1.5, wz(gate.y));
    }
    for (const pickup of currentGame?.assault?.pickups ?? []) {
      if (pickup.y > CANNON_Y) continue;
      framePoint(wx(pickup.x - pickup.w / 2) - 0.2, 1.5, wz(pickup.y));
      framePoint(wx(pickup.x + pickup.w / 2) + 0.2, 1.5, wz(pickup.y));
    }
    for (const lock of [currentGame?.assault?.cannonTarget, currentGame?.assault?.weaponTarget]) {
      if (!lock) continue;
      framePoint(wx(lock.x) - 2.65, 3.1, wz(lock.y));
      framePoint(wx(lock.x) + 2.65, 3.1, wz(lock.y));
    }
    for (const unit of currentGame?.red ?? []) {
      if (unit.dead || !unit.braced) continue;
      // The shield cue can sit above the crowd's leading edge. Keep its
      // complete label below the HUD, including the first incoming guard.
      framePoint(wx(unit.x) - 2.15, 6.6, wz(unit.y));
      framePoint(wx(unit.x) + 2.15, 6.6, wz(unit.y));
      if (!portrait) framingScale = Math.max(framingScale, projected.y / 0.68);
    }
    const active = currentGame?.bases[currentGame.assault?.encounter ?? 0];
    if (active) {
      const combatY = currentGame?.assault?.phase === "counterattack" ? currentGame.assault.frontline : active.y;
      const combatZ = wz(combatY), height = active.hp > 0 ? 6.2 : 2.8;
      projected.set(wx(active.x) + curve(combatZ), height, combatZ - travel).project(camera);
      // Reserve ranks may extend beyond the horizon; the actual collision
      // front must stay below the HUD even when a counterattack moves uphill.
      topY = Math.max(topY, projected.y);
      if (!portrait) framingScale = Math.max(framingScale, projected.y / 0.68);
      for (const x of [-8.8, 8.8]) framePoint(x, 1.5, combatZ);
    }
    if (portrait) {
      // Fit the useful road between the battery and battlefront, then place
      // that composition lower in the screen. A centered lens left a large
      // empty foreground whenever an edge battery forced a wider view.
      framingScale = Math.max(1, (maxX - minX) / 1.86, (topY - cannonY) / 1.32);
    }
    const baseFov = camera.fov;
    if (framingScale > 1) {
      camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * framingScale));
      camera.updateProjectionMatrix();
    }
    // Open immediately when a control needs space, then return to the closer
    // composition smoothly when an offscreen pickup expires or a wave ends.
    displayedFov = Math.max(camera.fov, displayedFov + (camera.fov - displayedFov) * Math.min(1, dt * 2.5));
    camera.fov = displayedFov;
    camera.updateProjectionMatrix();
    if (portrait) {
      const scale = Math.tan(THREE.MathUtils.degToRad(baseFov / 2)) / Math.tan(THREE.MathUtils.degToRad(displayedFov / 2));
      const centerX = (minX + maxX) * 0.5 * scale;
      const centerY = cannonY * scale + 0.64;
      camera.setViewOffset(camera.aspect * 1000, 1000, centerX * camera.aspect * 500, -centerY * 500, camera.aspect * 1000, 1000);
    }
    sun.position.set(-25, 45, -12 - travel); sun.target.position.set(0, 0, -20 - travel);
  }
  function render(game: Game, dt: number) {
    dt = Math.min(dt, 0.05); frameTime += dt;
    if (currentGame !== game) {
      currentGame = game; shot = game.stats.fired; previousTier = game.assault?.tier ?? 1;
      hasRenderedUnits = false; combatFocus = 0; cameraFollow = 0; combatLookZ = -18; displayedFov = framingFov;
      previousWeapon = game.assault?.weaponLevel ?? 1; crateHp = crateMax = cannonLockHp = -1;
      cannon.forEach((value, i) => { value.shots = game.assault?.barrelShots[i] ?? 0; value.recoil = 0; });
      shadowAt = 0;
      theme = game.level.assault?.theme ?? "fork"; travel = (game.assault?.travel ?? 0) * SZ;
      meadow.visible = theme === "fork"; lagoon.visible = theme === "bridge"; canyon.visible = theme === "bend";
      const palette = theme === "bridge"
        ? { ground: 0x73c9d3, trees: [0x3ea393, 0x81cbb1, 0x287e83], rock: 0xe3d5b6 }
        : theme === "bend"
          ? { ground: 0xd4b7a1, trees: [0xdb8e71, 0xe3b77c, 0xad7c82], rock: 0xb48c88 }
          : { ground: 0xb1d6b9, trees: [0x41a17e, 0x77c49b, 0x328770], rock: 0xc5d7c5 };
      sand.color.setHex(palette.ground); rock.color.setHex(palette.rock);
      foliage.forEach((material, index) => material.color.setHex(palette.trees[index]));
      bridges.visible = theme === "bridge"; dividers.visible = game.gates.every((gate) => gate.kind === "x" && Math.abs(gate.x - 180) < 15); bendGeometry(worldBends); bendGeometry(stageBends, -travel); previousTravel = travel;
      previousStatus = "playing"; winAt = lostAt = -1; guideX = W / 2;
      fortress.position.set(0, 0, -35); fortress.rotation.set(0, 0, 0); previousBreaches = 0;
      previousPulse = 0; wasRushing = false;
      previousPhase = game.assault?.phase ?? "battle"; previousWave = game.assault?.wave ?? 0; previousWaveLane = game.assault?.waveLane ?? 0; counterattackAt = -99; retreatCount = 0; reserveAnchor = NaN;
      particleList.length = 0; fallen.length = previousUnits.length = 0;
      bosses.forEach((boss) => { boss.hp = -1; boss.deadAt = -99; boss.damageAt = -99; });
      gates.forEach((value) => { value.group.visible = false; value.nextBurst = 0; value.brokenAt = -1; });
      tags.forEach((value) => { value.age = 2; }); ringAge.fill(2); ringActive.fill(0); ringAlpha.array.fill(0); ringAlpha.needsUpdate = true;
    }
    const assault = game.assault;
    const encounter = assault?.encounter ?? 0, tier = assault?.tier ?? 1;
    const weaponLevel = assault?.weaponLevel ?? 1;
    const barrelPositions = cannonBarrelPositions(tier);
    const barrelOffsets = barrelPositions.map((value) => value.x);
    travel = (assault?.travel ?? 0) * SZ; stage.position.z = -travel;
    if (travel !== previousTravel) { bendGeometry(stageBends, -travel); previousTravel = travel; }
    const entry = (assault?.advance ?? 0) * 25;
    const warning = assault?.bossWarning ?? 0, pulse = assault?.bossPulse ?? 0;
    const activeBoss = game.bases[encounter];
    const counterattack = assault?.phase === "counterattack";
    const danger = !game.level.assault?.practice && game.red.length > 0 ? Math.max(0, Math.min(1, ((assault?.frontline ?? 0) - 490) / (DEFENSE_Y - 490))) : 0;
    if (game.status === "lost" && previousStatus !== "lost") {
      lostAt = frameTime; shake = 1.5;
      burst(wx(game.cannonX) + curve(0), 0.8, 0, 0xff8862, 50, 2.1);
      burst(wx(game.cannonX) + curve(0), 0.6, 0, 0x657386, 30, 1.6);
      ring(wx(game.cannonX) + curve(0), 0, 0xff5470, 5);
    }
    const wreck = lostAt < 0 ? 0 : Math.min(1, (frameTime - lostAt) / 0.7);
    if ((assault?.breaches ?? 0) > previousBreaches) {
      previousBreaches = assault?.breaches ?? 0;
      burst(wx(game.cannonX), 0.5, defenseZ, 0xff4267, 35, 1.2); shake = 1.15;
    }
    defense.position.x = curve(defenseZ);
    dangerStrip.position.x = curve(defenseZ);
    defenseMaterial.color.setHex(danger > 0.4 ? 0xff5470 : 0x6ef3e4);
    defenseMaterial.opacity = danger > 0.4 ? 0.7 + Math.sin(game.t * 14) * 0.3 : 0.85;
    dangerMaterial.opacity = danger * (0.13 + Math.sin(game.t * 12) * 0.055);
    while (wallViews.length < game.walls.length) wallViews.push(wallView());
    wallViews.forEach((view, i) => {
      const wall = game.walls[i]; view.visible = !!wall; if (!wall) return;
      const z = wz(wall.y + wall.h / 2); view.position.set(wx(wall.x + wall.w / 2) + curve(z), 0, z);
      view.scale.set(wall.w * SX, 1, Math.abs(wz(wall.y + wall.h) - wz(wall.y)));
    });
    while (spinnerViews.length < game.spinners.length) spinnerViews.push(spinnerView());
    spinnerViews.forEach((view, i) => {
      const value = game.spinners[i]; view.visible = !!value; if (!value) return;
      const z = wz(value.y); view.position.set(wx(value.x) + curve(z), 0, z);
      view.scale.set(value.r * SX, 1, value.r * SZ); view.rotation.y = -value.angle;
    });
    const rushing = !!assault && assault.phase === "battle" && surgeActive(game.level, game.t) && game.status === "playing";
    rushMaterial.opacity = rushing ? 0.35 + Math.sin(game.t * 14) * 0.2 : 0;
    rushEdges.forEach((edge, i) => { edge.position.x = (i ? 1 : -1) * 9.05 + curve(-8); });
    if (rushing && !wasRushing) tag("ENEMY RUSH", wx(activeBoss.x) + curve(wz(activeBoss.y)), wz(activeBoss.y) + 4, "#ffb49a");
    wasRushing = rushing;
    warningRing.visible = warning > 0 && game.status === "playing";
    if (activeBoss) {
      const z = wz(activeBoss.y + 33), x = wx(activeBoss.x) + curve(z);
      warningRing.position.set(x, 0.045, z); warningRing.scale.set(3.3 + warning * 0.7, 1, 2.3 + warning * 0.5);
      warningMaterial.opacity = 0.2 + warning * 0.55;
      if (pulse > previousPulse + 0.1) {
        ring(x, z, 0xffc658, 6.5); ring(x, z + 0.4, 0xfff1c5, 4.3);
        burst(x, 0.2, z, 0xd9c3b5, 32, 2); burst(x, 0.4, z, 0xffc36a, 18, 2.4); shake = 1;
      }
    }
    previousPulse = pulse;
    if (counterattack && previousPhase !== "counterattack") {
      counterattackAt = game.t; retreatCount = reserves.count; retreatZ = reserves.position.z;
      shake = Math.max(shake, 0.8);
    }
    previousPhase = assault?.phase ?? "battle";
    const waveWarning = assault?.waveWarning ?? 0;
    laneGuide.visible = laneBeacon.visible = counterattack && game.red.length > 0 && game.status === "playing";
    if (laneGuide.visible) {
      let nearest = game.red[0];
      for (const unit of game.red) if (unit.y > nearest.y) nearest = unit;
      const targetX = waveWarning > 0 ? (activeBoss?.x ?? W / 2) + (assault?.waveLane ?? 0) * 105 : nearest.x;
      guideX += (targetX - guideX) * Math.min(1, dt * 6);
      const startZ = wz(waveWarning > 0 ? (activeBoss?.y ?? 419) - 60 : nearest.y);
      for (let i = 0; i < 12; i++) {
        const z = startZ + (defenseZ - startZ) * ((i + game.t * 2 % 1) / 12);
        dummy.position.set(wx(guideX) + curve(z), 0.075, z); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(1.15); dummy.updateMatrix();
        laneGuide.setMatrixAt(i, dummy.matrix);
      }
      laneGuide.instanceMatrix.needsUpdate = true;
      laneGuideMaterial.color.setHex(danger > 0.4 ? 0xff5268 : waveWarning > 0 ? 0xff9e28 : 0xffb54b);
      laneGuideMaterial.opacity = waveWarning > 0 ? 0.78 : 0.48;
      laneBeacon.position.x = wx(guideX) + curve(defenseZ);
    }
    flankWarning.visible = counterattack && waveWarning > 0 && game.status === "playing";
    if (flankWarning.visible) {
      const laneX = (activeBoss?.x ?? W / 2) + (assault?.waveLane ?? 0) * 105;
      const laneZ = wz((activeBoss?.y ?? 419) - (activeBoss?.h ?? 54) / 2 - 42);
      flankWarning.position.set(wx(laneX) + curve(laneZ), 0, laneZ);
      flankMaterial.opacity = 0.4 + Math.sin(game.t * 15) * 0.2 + waveWarning * 0.2;
      flankArrows.forEach((arrow, i) => { arrow.position.z = 2.2 + i * 1.25 + (game.t * 2 % 1); });
    }
    if (counterattack && (assault?.wave ?? 0) > previousWave) {
      const z = wz((activeBoss?.y ?? 419) - (activeBoss?.h ?? 54) / 2 - 42);
      const x = wx((activeBoss?.x ?? W / 2) + previousWaveLane * 105) + curve(z);
      ring(x, z, 0xff6a35, 3.3); burst(x, 0.35, z, 0xffbf83, 18, 0.9);
    }
    previousWave = assault?.wave ?? 0;
    previousWaveLane = assault?.waveLane ?? 0;
    animationTime.value = game.t;
    shake = Math.max(0, shake - dt * 7);
    const fired = game.stats.fired > shot;
    if (fired) shot = game.stats.fired;
    if (tier > previousTier) {
      const x = wx(game.cannonX) + curve(0);
      burst(x, 0.6, 0, 0xffd33c, 45, 1.5); ring(x, 0, 0xffdb39, 3); previousTier = tier;
    }
    if (weaponLevel > previousWeapon) {
      const x = wx(game.cannonX) + curve(0);
      burst(x, 1, 0, 0xffdc54, 65, 1.8); ring(x, 0, 0xffdc54, 5);
      tag(weaponForLevel(weaponLevel).name.toUpperCase(), x, -2, "#ffea86");
      if (crateHp >= 0) burst(weaponCrate.position.x, 1.4, weaponCrate.position.z, 0xffcd4e, 35, 1.2);
      previousWeapon = weaponLevel; shake = Math.max(shake, 0.6);
    }
    const target = assault?.weaponTarget;
    weaponCrate.visible = !!target;
    if (target) {
      const z = wz(target.y);
      weaponCrate.position.set(wx(target.x) + curve(z), 0, z);
      weaponCrate.rotation.z = Math.sin(game.t * 65) * target.hitFlash * 0.035;
      weaponCrate.scale.setScalar(1 + target.hitFlash * 0.035);
      if (crateHp !== target.hp || crateMax !== target.maxHp) {
        if (crateHp >= 0 && crateMax === target.maxHp && target.hp < crateHp) burst(weaponCrate.position.x, 1.4, z + 1.6, 0xffec86, 6, 0.5);
        crateCount.write(`${target.hp}`); crateHp = target.hp; crateMax = target.maxHp;
      }
      prize.setWeapon(weaponLevel + 1); prize.group.position.y = 0.25 + Math.sin(game.t * 3) * 0.08;
      prize.rotor.rotation.z = game.t * 3;
    }
    const lock = assault?.cannonTarget;
    cannonChest.group.visible = !!lock;
    if (lock) {
      const z = wz(lock.y);
      cannonChest.group.position.set(wx(lock.x) + curve(z), 0, z);
      cannonChest.group.rotation.z = Math.sin(game.t * 60) * lock.hitFlash * 0.035;
      if (cannonLockHp !== lock.hp) {
        if (cannonLockHp >= 0 && lock.hp < cannonLockHp) burst(cannonChest.group.position.x, 1.2, z + 1, 0xffed99, 5, 0.5);
        cannonChest.count.write(`${lock.hp}`); cannonLockHp = lock.hp;
      }
    } else if (cannonLockHp >= 0) {
      burst(cannonChest.group.position.x, 1.3, cannonChest.group.position.z, 0xffdf45, 45, 1.3);
      cannonLockHp = -1;
    }
    cannon.forEach((value, i) => {
      value.group.visible = i < tier;
      value.setWeapon(weaponLevel);
      value.recoil = Math.max(0, value.recoil - dt * 15);
      const shots = assault?.barrelShots[i] ?? game.stats.fired;
      const barrelFired = shots > value.shots;
      if (barrelFired) { value.recoil = 1; value.shots = shots; }
      const offset = barrelOffsets[i] ?? 0;
      const barrelZ = (barrelPositions[i]?.y ?? -12) * SZ;
      value.group.position.set(wx(game.cannonX + offset) + curve(barrelZ) + (i % 2 ? -1 : 1) * wreck * 0.28, 0.02 - wreck * 0.12, barrelZ);
      value.group.rotation.set(wreck * 0.16, 0, (i % 2 ? -1 : 1) * wreck * 0.42);
      value.barrel.rotation.x = wreck * 0.6;
      const pop = assault?.upgradeFlash ? Math.sin(Math.min(1, assault.upgradeFlash) * Math.PI) * 0.1 : 0;
      value.group.scale.set(1.22 + pop, 1.4 + pop, 1.62 + pop); value.barrel.position.z = -0.08 + value.recoil * 0.18;
      value.barrel.rotation.y = Math.asin(THREE.MathUtils.clamp((curve(0) - curve(wz(CANNON_Y - 22))) / 1.3585, -0.4, 0.4));
      value.rotor.rotation.z += dt * (game.firing ? 22 : 2);
      value.muzzle.scale.setScalar(1 + value.recoil * 0.12);
      if (barrelFired && i < tier) burst(wx(game.cannonX + offset) + curve(barrelZ - 2.1), 0.96, barrelZ - 2.1, weaponLevel === 2 ? 0xffe09d : 0xd9ffff, 3, 0.25);
    });
    batteryShadow.position.x = aimRing.position.x = wx(game.cannonX) + curve(0);
    batteryShadow.scale.x = 0.9 + tier * 0.6;
    aimRing.scale.set(0.75 + tier * 0.6, 1, 1);
    aimRingMaterial.opacity = game.firing ? 0.3 : 0.5;
    selectedGates.clear();
    let firstGateY = -Infinity;
    for (const gate of game.gates) if (!gate.overrun) firstGateY = Math.max(firstGateY, gate.y);
    trajectory.count = tier * 10; trajectoryMaterial.opacity = game.firing ? 0.5 : 0.2;
    trajectory.visible = game.status === "playing" && assault?.phase !== "advance";
    for (let barrel = 0; barrel < tier; barrel++) {
      const launchX = game.cannonX + barrelOffsets[barrel];
      let endY = Number.isFinite(firstGateY) ? firstGateY + 3 : CANNON_Y - 120;
      let hitsLock = false;
      for (const lock of [assault?.cannonTarget, assault?.weaponTarget]) {
        if (lock && Math.abs(launchX - lock.x) <= lock.w / 2 + 4.2 && lock.y + lock.h / 2 >= endY) {
          endY = lock.y + lock.h / 2 + 4.2; hitsLock = true;
        }
      }
      if (!hitsLock) game.gates.forEach((gate, index) => {
        if (!gate.overrun && gate.y === firstGateY && Math.abs(launchX - gate.cx) <= gate.w / 2 - 4.2) selectedGates.add(index);
      });
      // Show the committed launch lane up to its first decision. Do not bend
      // this preview toward a gate that the player has not lined up with.
      const endZ = Math.min(-4.1, wz(endY));
      for (let dot = 0; dot < 10; dot++) {
        const z = -3.6 + (endZ + 3.6) * ((dot + (game.firing ? game.t * 3 % 1 : 0)) / 10);
        dummy.position.set(wx(launchX) + curve(z), 0.035, z);
        dummy.rotation.set(0, 0, 0); dummy.scale.set(0.22, 0.015, Math.abs(endZ + 3.6) / 16); dummy.updateMatrix(); trajectory.setMatrixAt(barrel * 10 + dot, dummy.matrix);
      }
    }
    trajectory.instanceMatrix.needsUpdate = true;

    while (gates.length < game.gates.length) gates.push(gate(0x9e20ef, "×2"));
    gates.forEach((view, i) => {
      const value = game.gates[i]; view.group.visible = !!value; if (!value) return;
      const text = value.kind === "trap" ? "!" : `×${value.n ?? 2}`;
      const selected = value.kind !== "trap" && selectedGates.has(i) && game.status === "playing" && assault?.phase !== "advance";
      if (view.value !== text || view.selected !== selected) {
        view.label.write(text, "#ffffff", selected ? "#047d9f" : "#27324be8");
        view.label.sprite.renderOrder = selected ? 6 : 5;
        view.value = text; view.selected = selected;
      }
      const z = wz(value.y);
      const entrance = assault?.phase === "advance" ? Math.min(1, assault.advance * 1.6) : 0;
      view.group.position.set(wx(value.cx) + curve(z), 0.025 - entrance * 2.8, z);
      view.label.sprite.visible = entrance < 0.25;
      if (value.overrun && view.brokenAt < 0) {
        view.brokenAt = game.t;
        burst(view.group.position.x, 1.5, z, 0xc355ff, 32, 1.6);
        burst(view.group.position.x, 0.6, z, 0xffffff, 20, 1.2);
        shake = Math.max(shake, 0.65);
      } else if (!value.overrun) view.brokenAt = -1;
      const collapse = view.brokenAt < 0 ? 0 : Math.min(1, (game.t - view.brokenAt) / 0.32);
      view.group.rotation.x = collapse * Math.PI * 0.5;
      view.group.position.y -= collapse * 0.6;
      view.group.visible = collapse < 1;
      const flash = Math.min(1, value.flash * 4);
      view.group.scale.set(value.w * SX, 1 + flash * 0.04, 1);
      view.label.sprite.scale.x = 5.4 / view.group.scale.x;
      view.material.color.setHex(value.kind === "trap" ? 0xff274f : 0xa521ee);
      view.material.emissive.setHex(value.kind === "trap" ? 0xff274f : 0xa521ee);
      view.frame.color.setHex(value.kind === "trap" ? 0xff3956 : selected ? 0x80e7ff : 0x9236e8);
      view.frame.emissive.setHex(selected ? 0x258cac : 0x000000);
      view.frame.emissiveIntensity = selected ? 0.28 : 0;
      const dangerous = value.kind !== "trap" || trapActive(value, game.t);
      view.material.opacity = dangerous ? 0.48 : 0.1;
      view.hazard.visible = value.kind === "trap" && dangerous;
      view.frame.transparent = !dangerous; view.frame.opacity = dangerous ? 1 : 0.35;
      view.material.emissiveIntensity = 0.2 + flash * 0.7;
      if (!value.overrun && flash > 0.05 && game.t > view.nextBurst) {
        burst(view.group.position.x + (random() - 0.5) * value.w * SX * 0.65, 0.9, z - 0.4, 0xb3f8ff, 7, 0.55);
        ring(view.group.position.x, z - 0.45, 0x9aefff, value.w * SX * 0.36); view.nextBurst = game.t + 0.24;
      }
    });
    pickups.forEach((view, i) => {
      const pickup = assault?.pickups[i]; view.group.visible = !!pickup;
      if (!pickup) return;
      const reward = tier >= 5 ? "★" : "+1";
      if (view.value !== reward) { view.label.write(reward, tier >= 5 ? "#fff2a2" : "#ffffff"); view.value = reward; }
      view.group.position.set(wx(pickup.x) + curve(wz(pickup.y)), 0.03, wz(pickup.y)); view.group.scale.set(pickup.w * SX, 1.04, 1);
      view.label.sprite.scale.x = 5.4 / view.group.scale.x;
      view.material.emissiveIntensity = 0.4 + Math.sin(game.t * 4 + i) * 0.12;
    });

    // A defeated runner briefly tumbles out of the contact point. This carries
    // the direction of the hit through the frame instead of just deleting it.
    for (const unit of previousUnits) {
      if (!unit.dead || fallen.length >= fallenMesh.instanceMatrix.count) continue;
      const state = motion.get(unit);
      if (!state) continue;
      const enemy = state.enemy;
      const z = wz(unit.y);
      fallen.push({ x: wx(unit.x) + curve(z), z, travel, side: Math.sin(state.phase) < 0 ? -1 : 1,
        angle: state.angle, life: 0, size: unit.big ? 1.8 : enemy ? 0.99 : 1.2, color: enemy ? redSoldier : friendMaterial.color });
    }
    previousUnits.length = 0;
    previousUnits.push(...game.blue, ...game.red);
    regularUnits.length = guardUnits.length = bracedUnits.length = 0;
    for (const unit of game.red) (unit.braced ? bracedUnits : unit.kind === "guard" ? guardUnits : regularUnits).push(unit);
    shadowCount = 0;
    drawUnits(game.blue, friends, false, 0, friendColorKeys, friendMatrixRange, friendMotionRange, friendColorRange);
    drawUnits(regularUnits, enemies, true, entry, enemyColorKeys, enemyMatrixRange, enemyMotionRange, enemyColorRange);
    drawUnits(guardUnits, guards, true, entry, guardColorKeys, guardMatrixRange, guardMotionRange, guardColorRange);
    drawUnits(bracedUnits, bracedGuards, true, entry, bracedColorKeys, bracedMatrixRange, bracedMotionRange, bracedColorRange);
    shieldHalo.count = Math.min(bracedUnits.length, shieldHalo.instanceMatrix.count);
    const shieldAim = championShieldAim(game);
    shieldMarkers.count = game.status === "playing" ? shieldHalo.count : 0;
    for (let index = 0; index < shieldHalo.count; index++) {
      const unit = bracedUnits[index], z = wz(unit.y) - entry;
      dummy.position.set(wx(unit.x) + curve(z), 0.06, z); dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar((unit === shieldAim?.target ? 1.2 : 1) + Math.sin(game.t * 5) * 0.05); dummy.updateMatrix(); shieldHalo.setMatrixAt(index, dummy.matrix);
      dummy.position.set(wx(unit.x) + curve(z), 3.75 + Math.sin(game.t * 4 + index) * 0.1, z);
      dummy.quaternion.copy(camera.quaternion); dummy.scale.setScalar(unit === shieldAim?.target ? 1.1 : 0.85);
      dummy.updateMatrix(); shieldMarkers.setMatrixAt(index, dummy.matrix);
    }
    if (shieldHalo.count > 0) shieldHalo.instanceMatrix.needsUpdate = true;
    if (shieldMarkers.count > 0) shieldMarkers.instanceMatrix.needsUpdate = true;
    shieldLabel.sprite.visible = bracedUnits.length > 0 && game.status === "playing";
    championSight.visible = !!shieldAim && game.status === "playing";
    if (shieldAim && shieldLabel.sprite.visible) {
      const frontGuard = shieldAim.target, z = wz(frontGuard.y) - entry;
      const aligned = shieldAim.direction === "aligned";
      const caption = aligned ? "ALIGNED" : "SHIELD";
      if (caption !== shieldCaption) { shieldLabel.write(caption, aligned ? "#b8fff1" : "#ffe5a0"); shieldCaption = caption; }
      shieldLabel.sprite.position.set(wx(frontGuard.x) + curve(z), 5.6, z);
      championSightMaterial.color.setHex(aligned ? 0x8cffe2 : 0xffdc64);
      championSightMaterial.opacity = game.charge >= CHARGE_MAX ? 0.8 : 0.4;
      const endZ = Math.min(-3.3, z), startZ = wz(CANNON_Y - 26);
      for (let dot = 0; dot < 18; dot++) {
        const along = startZ + (endZ - startZ) * dot / 17;
        dummy.position.set(wx(game.cannonX) + curve(along), 0.065, along); dummy.rotation.set(0, 0, 0);
        dummy.scale.set(0.24, 0.025, Math.max(0.08, Math.abs(endZ - startZ) / 32));
        dummy.updateMatrix(); championSight.setMatrixAt(dot, dummy.matrix);
      }
      for (let arm = 0; arm < 2; arm++) {
        dummy.position.set(wx(game.cannonX) + curve(endZ), 0.07, endZ); dummy.rotation.set(0, 0, 0);
        dummy.scale.set(arm ? 0.18 : 1.3, 0.025, arm ? 1.3 : 0.18);
        dummy.updateMatrix(); championSight.setMatrixAt(18 + arm, dummy.matrix);
      }
      championSight.instanceMatrix.needsUpdate = true;
    }
    hasRenderedUnits = true;
    shadows.count = shadowCount; queueUpdate(shadows.instanceMatrix, shadowMatrixRange, 0, shadowCount * 16);
    // Uncommitted reserves break formation with staggered, individual motion.
    // The counterattack itself always consists of real simulated opponents.
    const retreat = counterattack ? Math.min(4, game.t - counterattackAt) : 0;
    const waiting = counterattack ? (retreat < 4 ? retreatCount : 0) : Math.min(reserves.instanceMatrix.count, assault?.reserve ?? 0);
    // The finite reserve queues immediately behind the rearmost live ranks.
    // A curved, widening queue joins the active formation without a hard seam.
    let rear = 240;
    if (game.red.length > 0) {
      rear = Infinity;
      for (const unit of game.red) rear = Math.min(rear, unit.y);
    }
    const reserveTarget = Math.min(-38, wz(rear) - 0.35) - entry;
    reserveAnchor = Number.isFinite(reserveAnchor) ? reserveAnchor + (reserveTarget - reserveAnchor) * Math.min(1, dt * 6) : reserveTarget;
    const reserveZ = counterattack ? retreatZ : reserveAnchor;
    reserveRout.value = retreat;
    reserves.count = waiting;
    // Reserve formations are immutable local instances. Reuse their buffers
    // when the count shrinks or the camera travels to the next giant.
    if (waiting > reserveInitialized) {
      const reserveMotion = reserves.geometry.getAttribute("runMotion") as THREE.InstancedBufferAttribute;
      for (let i = reserveInitialized; i < waiting; i++) {
        let column = i, row = 0, columns = 22;
        while (column >= columns) { column -= columns; row++; columns = Math.min(48, 22 + row * 2); }
        const x = (column - (columns - 1) / 2) * 0.58 + Math.sin(i * 13.1) * 0.11;
        const z = -row * 0.75 - Math.cos(i * 9.7) * 0.15;
        // A shallow curve makes the waiting horde feed into the central throat.
        const front = -Math.pow(Math.abs(x) / 13, 2) * 5;
        dummy.position.set(x, 0.02, z + front);
        dummy.rotation.set(0, Math.PI + Math.sin(i * 2.3) * 0.14, 0); dummy.scale.setScalar(0.96); dummy.updateMatrix(); reserves.setMatrixAt(i, dummy.matrix);
        reserveMotion.setXYZW(i, i * 2.39996, 0.6, 0, -1);
      }
      reserveInitialized = waiting;
      reserves.instanceMatrix.needsUpdate = true; reserveMotion.needsUpdate = true;
    }
    reserves.position.z = reserveZ;
    ensureBosses(game.bases.length);
    bosses.forEach((view, i) => {
      const base = game.bases[i];
      if (!base) { view.art.group.visible = view.label.sprite.visible = view.bar.visible = false; return; }
      const active = i === encounter;
      const approaching = active ? assault?.advance ?? 0 : 0;
      // The next guardian is a visible destination. During travel, preserve
      // that same starting position instead of popping it into the foreground.
      let z = active ? THREE.MathUtils.lerp(wz(base.y), -52, approaching) : -52 - Math.max(0, i - encounter - 1) * 24 - entry;
      let x = wx(base.x) + curve(z);
      const waitingSide = i % 2 ? 3 : -3;
      if (!active && base.hp > 0) x += waitingSide + Math.sin(game.t * 0.35 + i) * 0.6;
      else if (approaching > 0) x += (waitingSide + Math.sin(game.t * 0.35 + i) * 0.6) * approaching;
      if (base.hp <= 0 && view.hp > 0) { view.deathX = view.art.group.position.x; view.deathZ = view.art.group.position.z; view.deathTravel = travel; }
      if (base.hp <= 0) { x = view.deathX; z = view.deathZ + travel - view.deathTravel; }
      if (view.hp >= 0 && base.hp < view.hp && base.hp > 0 && game.t > view.damageAt + 0.3) {
        view.hitX = (random() - 0.5) * 2.2;
        view.impact.material.rotation = (random() - 0.5) * 0.65;
        burst(x + view.hitX, 1.1, z + 3.2, 0xfff7cf, 16, 1.6);
        burst(x, 1.8, z + 2.8, 0xffd25b, 7, 1.3); view.damageAt = game.t; shake = Math.max(shake, 0.55);
      }
      if (base.hp <= 0 && view.hp > 0) {
        view.deadAt = frameTime;
        burst(x, 2, z, [0xffbf4d, 0xff985b, 0xc2a2ff][i % 3], 65, 2.8);
        burst(x, 0.4, z, 0xfff0ce, 35, 2);
        ring(x, z, 0xffd34c, 8); ring(x, z + 0.5, 0xfff7cb, 5);
        tag("BOSS DOWN", x, z, "#ffe570"); shake = 1.7;
      }
      if (view.hp !== base.hp) { view.label.write(game.level.assault?.practice ? "PRACTICE" : `${Math.max(0, Math.ceil(base.hp))}`); view.hp = base.hp; }
      const death = base.hp <= 0 ? Math.min(1, (frameTime - view.deadAt) / 0.85) : 0;
      view.art.group.visible = ((active || i === encounter + 1) && base.hp > 0) || death < 1 && base.hp <= 0;
      view.label.sprite.visible = view.bar.visible = active && base.hp > 0;
      const hit = base.hp > 0 ? Math.max(base.hitFlash * 0.18, 1 - (game.t - view.damageAt) / 0.22, 0) : 0;
      const impact = Math.max(0, 1 - (game.t - view.damageAt) / 0.17);
      view.impact.visible = active && base.hp > 0 && impact > 0;
      view.impact.material.opacity = impact * 0.9;
      view.impact.position.set(x + view.hitX, 2.2, z + 3.1);
      view.impact.scale.setScalar(3.2 + (1 - impact) * 1.6);
      view.art.group.position.set(x, -death * 2, z - hit * 1.05);
      view.art.group.scale.setScalar((active ? 1.2 - approaching * 0.18 : 1.02) * (1 - death * 0.65));
      view.art.group.rotation.z = death * -1.3;
      if (view.art.group.visible) view.art.animate(game.t + i * 2.3, hit, active ? Math.max(warning, pulse) : 0);
      view.label.sprite.position.set(x, 6.05, z); view.label.sprite.scale.set(3.5, 1.15, 1);
      view.bar.position.set(x, 5.6, z); view.bar.scale.set(0.86, 0.65, 1);
      const fraction = Math.max(0, base.hp / base.maxHp); view.fill.scale.x = 5.15 * fraction; view.fill.position.x = -2.575 * (1 - fraction);
    });

    for (const pop of game.pops) {
      if (seenPops.has(pop)) continue; seenPops.add(pop);
      const z = wz(pop.y), x = wx(pop.x) + curve(z);
      if (pop.text?.includes("UPGRADE")) continue;
      burst(x, 0.5, z, [0xf4fbff, 0xe9edee, 0xff426a][pop.color] ?? 0xffffff, pop.text ? 9 : 4, pop.text ? 0.65 : 0.9);
      // Direction is already carried by the HUD warning and the lane arrows.
      // A second floating wave label covers the shield guard at its spawn.
      if (pop.text && !pop.text.startsWith("×") && !["KO", "DOWN", "DOWN!", "COUNTERATTACK", "LEFT WAVE", "RIGHT WAVE", "CENTER WAVE"].includes(pop.text)) tag(pop.text, x, z, "#fff3b4");
    }
    if (game.status === "won" && previousStatus !== "won") {
      winAt = frameTime; shake = 0.75;
      for (const x of [-14, -8, 0, 8, 14]) { burst(x, 4, -111, 0x91a8c8, 50, 2.8); ring(x, -111, 0xffd887, 7); }
    }
    if (winAt > 0) {
      const collapse = Math.min(1, (frameTime - winAt) / 1.5);
      fortress.position.y = -8 * collapse * collapse;
      fortress.rotation.z = Math.sin(frameTime * 31) * 0.02 * (1 - collapse);
    }
    if (winAt > 0 && frameTime - winAt < 2.8 && random() > 0.55) burst((random() - 0.5) * 16, 11, -8 - random() * 18, BLUE, 14, 0.7, true);
    previousStatus = game.status;
    let particleCount = 0;
    for (let i = particleList.length - 1; i >= 0; i--) {
      const value = particleList[i]; value.life -= dt;
      if (value.life <= 0) { particleList.splice(i, 1); continue; }
      value.x += value.vx * dt; value.y += value.vy * dt; value.z += value.vz * dt; value.vy -= 12 * dt;
      if (value.y < 0.07) { value.y = 0.07; value.vy *= -0.35; }
      // Round puffs need only scale and translation. Write their instances
      // directly instead of recomputing hundreds of Euler/quaternion pairs.
      const scale = value.size * Math.min(1, value.life / 0.18), offset = particleCount * 16;
      const matrices = particles.instanceMatrix.array;
      matrices[offset] = matrices[offset + 5] = matrices[offset + 10] = scale;
      matrices[offset + 12] = value.x; matrices[offset + 13] = value.y; matrices[offset + 14] = value.z;
      let tint = particleColors.get(value.color);
      if (!tint) { tint = new THREE.Color(value.color); particleColors.set(value.color, tint); }
      particles.setColorAt(particleCount++, tint);
    }
    particles.count = particleCount; particles.instanceMatrix.needsUpdate = true; if (particles.instanceColor) particles.instanceColor.needsUpdate = true;
    for (let i = fallen.length - 1; i >= 0; i--) {
      const body = fallen[i]; body.life += dt;
      if (body.life > 0.55) { fallen.splice(i, 1); continue; }
    }
    fallen.forEach((body, i) => {
      const t = body.life / 0.55, scale = body.size * (1 - Math.max(0, (t - 0.65) / 0.35));
      dummy.position.set(body.x + body.side * t * 1.8, 0.04 + Math.sin(t * Math.PI) * 2.4, body.z + travel - body.travel + t * 0.8);
      dummy.rotation.set(t * 2.3, body.angle, body.side * t * 2.5); dummy.scale.setScalar(scale); dummy.updateMatrix();
      fallenMesh.setMatrixAt(i, dummy.matrix); fallenMesh.setColorAt(i, body.color);
      (fallenMesh.geometry.getAttribute("runMotion") as THREE.InstancedBufferAttribute).setXYZW(i, body.angle + t * 8, 0.7, 0.35, 0);
    });
    fallenMesh.count = fallen.length; fallenMesh.instanceMatrix.needsUpdate = true;
    fallenMesh.geometry.getAttribute("runMotion").needsUpdate = true;
    if (fallenMesh.instanceColor) fallenMesh.instanceColor.needsUpdate = true;
    let activeRings = false;
    let ringAlphaDirty = false;
    let ringMatrixDirty = false;
    for (let i = 0; i < RING_CAPACITY; i++) {
      if (!ringActive[i]) continue;
      const age = ringAge[i] += dt * 2.8;
      if (age >= 1) {
        ringAlphaArray[i] = 0; ringActive[i] = 0; ringAge[i] = 2; ringAlphaDirty = true;
        continue;
      }
      activeRings = true; ringAlphaDirty = true; ringMatrixDirty = true;
      const scale = 0.3 + age * ringMax[i];
      ringAlphaArray[i] = Math.max(0, 0.55 * (1 - age));
      const offset = i * 16;
      ringMatrixArray[offset] = ringMatrixArray[offset + 5] = ringMatrixArray[offset + 10] = scale;
    }
    ringMesh.visible = activeRings;
    if (ringMatrixDirty) ringMesh.instanceMatrix.needsUpdate = true;
    if (ringAlphaDirty) ringAlpha.needsUpdate = true;
    if (ringColorDirty) { ringColors.needsUpdate = true; ringColorDirty = false; }
    tags.forEach((value) => { value.age += dt; value.sprite.visible = value.age < 0.85; value.sprite.position.y = value.y + value.age * 2; value.sprite.material.opacity = Math.max(0, 1 - value.age / 0.85); });
    // Crowds use inexpensive soft contact shadows. The slower-moving scenery
    // shadow map can be refreshed at 15 Hz without repeating its draw calls
    // for every animation frame on a phone.
    if (frameTime >= shadowAt) { renderer.shadowMap.needsUpdate = true; shadowAt = frameTime + 1 / 15; }
    // Close in gently as the front meets the giant, then open the view for
    // flank warnings and travel. Keep the full cannon lane in frame throughout.
    const inContact = assault?.phase === "counterattack" || assault?.phase === "battle" && !!activeBoss && activeBoss.hp < activeBoss.maxHp && activeBoss.hp > 0;
    combatFocus += ((inContact ? 1 : 0) - combatFocus) * Math.min(1, dt * 1.6);
    cameraFollow += (wx(game.cannonX) * 0.18 - cameraFollow) * Math.min(1, dt * 4);
    const combatY = assault?.phase === "counterattack" ? assault.frontline : activeBoss?.y ?? 300;
    const desiredLookZ = assault?.phase === "advance" ? cameraTarget.z : Math.max(-30, Math.min(-14, wz(combatY) * 0.5));
    combatLookZ += (desiredLookZ - combatLookZ) * Math.min(1, dt * 2.5);
    updateCamera(dt); renderer.render(scene, camera);
  }
  function resize(width: number, height: number) {
    camera.aspect = width / height;
    // Preserve the full aiming lane on a phone without shrinking the fighters.
    framingFov = Math.max(42, THREE.MathUtils.radToDeg(2 * Math.atan(8.2 / (cameraHome.length() * camera.aspect))));
    camera.fov = framingFov;
    camera.updateProjectionMatrix(); renderer.setSize(width, height, false); updateCamera();
  }
  resize(canvas.clientWidth || 390, canvas.clientHeight || 844);
  return {
    render, resize,
    aimX(normalizedX: number) {
      const target = normalizedX * 2 - 1;
      let low = -W, high = W * 2;
      for (let i = 0; i < 12; i++) {
        const middle = (low + high) / 2;
        // Invert the camera follow as well as perspective, so a stationary
        // pointer continues to correspond to the final cannon position.
        projected.set(wx(middle) + curve(0), 0, -travel).project(camera);
        if (projected.x < target) low = middle; else high = middle;
      }
      return (low + high) / 2;
    },
    dispose() {
      cannon.forEach((value) => value.dispose()); prize.dispose(); bosses.forEach((value) => value.art.dispose());
      geometries.forEach((value) => value.dispose()); materials.forEach((value) => value.dispose()); textures.forEach((value) => value.dispose()); renderer.dispose();
    },
  };
}
