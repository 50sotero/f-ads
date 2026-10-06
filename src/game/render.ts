import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { CANNON_Y, DEFENSE_Y, MAX_UNITS, W, type Game, type Unit } from "./engine";

// Map the unchanged simulation onto a board. Decoration has its own RNG.
const SX = 0.04, SZ = 0.06;
const wx = (x: number) => (x - W / 2) * SX;
const wz = (y: number) => (y - 320) * SZ;
const BLUE = 0x1389ff, RED = 0xff4960;
type Particle = { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; max: number; size: number; color: number; spin: number };
type Fortress = { group: THREE.Group; bar: THREE.Mesh; label: THREE.Sprite; hp: number; dead: boolean };
type GateView = { group: THREE.Group; panel: THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>; label: THREE.Sprite; flash: number };
export type CrowdRenderer = {
  render: (g: Game, dt: number) => void;
  resize: (width: number, height: number) => void;
  aimX: (normalizedX: number) => number;
  dispose: () => void;
};

export function createRenderer(canvas: HTMLCanvasElement): CrowdRenderer {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 9 / 16, 0.1, 160);
  const cameraHome = new THREE.Vector3(0, 32, 35);
  camera.position.copy(cameraHome); camera.lookAt(0, 0, 3); camera.updateMatrixWorld();
  scene.fog = new THREE.Fog(0xc0eee9, 62, 105);
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  const ownGeo = <T extends THREE.BufferGeometry>(g: T) => { geometries.add(g); return g; };
  const ownMat = <T extends THREE.Material>(m: T) => { materials.add(m); return m; };
  const boxGeo = ownGeo(new THREE.BoxGeometry(1, 1, 1));
  const cylinderGeo = ownGeo(new THREE.CylinderGeometry(1, 1, 1, 12));
  const sphereGeo = ownGeo(new THREE.SphereGeometry(1, 10, 6));
  const coneGeo = ownGeo(new THREE.ConeGeometry(1, 1, 7));
  const stoneGeo = ownGeo(new THREE.IcosahedronGeometry(1, 0));
  const mat = (hex: number, extra: THREE.MeshStandardMaterialParameters = {}) => ownMat(new THREE.MeshStandardMaterial({ color: hex, roughness: 0.72, ...extra }));
  const ivory = mat(0xf6f7e8), edge = mat(0xc8dfdb), white = mat(0xffffff);
  const blue = mat(BLUE, { roughness: 0.4 }), navy = mat(0x194b84);
  const red = mat(RED), redDark = mat(0xb72e58);
  const gold = mat(0xffd24b, { metalness: 0.15, roughness: 0.45 });
  const purple = mat(0xa553fb, { emissive: 0x6b20c0, emissiveIntensity: 0.35 }), teal = mat(0x2ad7cd), grass = mat(0x68cd9a);
  const foliage = [mat(0x28ab80), mat(0x43c18b), mat(0x82dca1)];
  const bark = mat(0x8b9c83), rock = mat(0xb0ccc2, { flatShading: true });
  const skyCanvas = document.createElement("canvas"); skyCanvas.width = 4; skyCanvas.height = 256;
  const skyCtx = skyCanvas.getContext("2d")!;
  const gradient = skyCtx.createLinearGradient(0, 0, 0, 256);
  gradient.addColorStop(0, "#73cee7"); gradient.addColorStop(0.55, "#b7eee9"); gradient.addColorStop(1, "#def5d6");
  skyCtx.fillStyle = gradient; skyCtx.fillRect(0, 0, 4, 256);
  const sky = new THREE.CanvasTexture(skyCanvas); sky.colorSpace = THREE.SRGBColorSpace;
  textures.add(sky); scene.background = sky;
  scene.add(new THREE.HemisphereLight(0xe6fbff, 0x8ba998, 1.8));
  const sun = new THREE.DirectionalLight(0xfff6dd, 2.3);
  sun.position.set(-12, 26, 13); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -22, right: 22, top: 23, bottom: -23, near: 1, far: 70 });
  sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.08; sun.shadow.radius = 3; scene.add(sun);

  function mesh(parent: THREE.Object3D, geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number) {
    const m = new THREE.Mesh(geometry, material);
    m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
  }
  const box = (p: THREE.Object3D, m: THREE.Material, x: number, y: number, z: number, a: number, b: number, c: number) => mesh(p, boxGeo, m, x, y, z, a, b, c);
  // Bake stationary props per material. A forest costs only a few draw calls.
  function bake(group: THREE.Group) {
    group.updateMatrixWorld(true);
    const buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
    for (const child of [...group.children]) {
      if (!(child instanceof THREE.Mesh) || Array.isArray(child.material)) continue;
      const g = child.geometry.clone().applyMatrix4(child.matrix);
      const list = buckets.get(child.material) ?? []; list.push(g); buckets.set(child.material, list); group.remove(child);
    }
    for (const [m, list] of buckets) {
      const combined = ownGeo(mergeGeometries(list)); list.forEach((g) => g.dispose());
      const result = new THREE.Mesh(combined, m); result.castShadow = true; result.receiveShadow = true; group.add(result);
    }
  }
  function label(text: string, fill: string, width: number, height: number, fontSize = 112) {
    const c = document.createElement("canvas"); c.width = 512; c.height = 192;
    const context = c.getContext("2d")!;
    const texture = new THREE.CanvasTexture(c); texture.colorSpace = THREE.SRGBColorSpace; textures.add(texture);
    const material = ownMat(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false }));
    const sprite = new THREE.Sprite(material); sprite.scale.set(width, height, 1);
    const write = (value: string) => {
      context.clearRect(0, 0, 512, 192); context.textAlign = "center"; context.textBaseline = "middle";
      context.font = `900 ${fontSize}px "Fredoka", "Arial Rounded MT Bold", Arial, sans-serif`;
      context.lineJoin = "round"; context.strokeStyle = "rgba(12,53,93,.30)"; context.lineWidth = 9;
      context.strokeText(value, 256, 103); context.fillStyle = fill; context.fillText(value, 256, 98); texture.needsUpdate = true;
    };
    write(text); sprite.userData.write = write; return sprite;
  }

  const world = new THREE.Group(); scene.add(world);
  box(world, grass, 0, -1.05, 0, 65, 0.7, 80);
  box(world, edge, 0, -0.48, 0, 15.1, 0.9, 42.2);
  box(world, ivory, 0, -0.05, 0, 14.4, 0.2, 42);
  for (let z = -20; z <= 20; z += 2) {
    for (const side of [-1, 1]) box(world, z % 4 === 0 ? white : teal, side * 7.38, 0.09, z, 0.25, 0.26, 1.92);
    box(world, white, 0, 0.057, z, 0.075, 0.012, 0.65);
  }
  for (let x = -7; x < 7; x += 0.72) box(world, navy, x, 0.066, wz(DEFENSE_Y), 0.4, 0.014, 0.085);
  box(world, teal, 0, 0.064, wz(622), 14.1, 0.015, 0.12);
  // Original geometric scenery, deterministic across restarts.
  for (let i = 0; i < 34; i++) {
    const side = i % 2 ? 1 : -1;
    const x = side * (9.5 + Math.sin(i * 7.7) * 1.2 + (i % 3) * 1.7), z = -32 + Math.floor(i / 2) * 3.2;
    const h = 1.5 + (i % 4) * 0.27;
    mesh(world, cylinderGeo, bark, x, h * 0.23 - 0.6, z, 0.16, h * 0.65, 0.16);
    mesh(world, coneGeo, foliage[i % 3], x, h * 0.76 - 0.3, z, 0.85, h * 1.2, 0.85);
    mesh(world, coneGeo, foliage[(i + 1) % 3], x, h * 1.03 - 0.25, z, 0.61, h * 0.94, 0.61);
    if (i % 2 === 0) mesh(world, stoneGeo, rock, x + side * 1.4, -0.4, z + 0.8, 0.7, 0.6, 0.8);
    if (i % 3 === 0) mesh(world, sphereGeo, foliage[2], x - side, -0.42, z + 1, 0.75, 0.35, 0.6);
  }
  bake(world);

  const cannon = new THREE.Group(); scene.add(cannon);
  mesh(cannon, cylinderGeo, navy, 0, 0.22, 0, 0.87, 0.36, 0.87);
  mesh(cannon, cylinderGeo, white, 0, 0.44, 0, 0.72, 0.2, 0.72);
  mesh(cannon, sphereGeo, blue, 0, 0.76, 0, 0.72, 0.58, 0.66);
  for (const side of [-1, 1]) {
    const wheel = mesh(cannon, cylinderGeo, navy, side * 0.78, 0.38, 0.1, 0.39, 0.27, 0.39); wheel.rotation.z = Math.PI / 2;
    const hub = mesh(cannon, cylinderGeo, gold, side * 0.94, 0.38, 0.1, 0.19, 0.04, 0.19); hub.rotation.z = Math.PI / 2;
  }
  const barrel = new THREE.Group(); cannon.add(barrel);
  const tube = mesh(barrel, cylinderGeo, blue, 0, 0.88, -0.59, 0.44, 1.28, 0.44); tube.rotation.x = Math.PI / 2;
  const rim = mesh(barrel, cylinderGeo, white, 0, 0.88, -1.22, 0.49, 0.19, 0.49); rim.rotation.x = Math.PI / 2;
  const bore = mesh(barrel, cylinderGeo, navy, 0, 0.88, -1.324, 0.35, 0.012, 0.35); bore.rotation.x = Math.PI / 2;
  const emblem = label("★", "#ffdb4b", 0.68, 0.42); emblem.position.set(0, 1.15, 0.37); cannon.add(emblem);
  const muzzle = mesh(barrel, sphereGeo, ownMat(new THREE.MeshBasicMaterial({ color: 0xffef95 })), 0, 0.88, -1.48, 0.3, 0.3, 0.38); muzzle.visible = false;

  // One merged person, one instanced draw per team. The vertex shader animates
  // limbs and run bob without hundreds of scene nodes or skeletal rigs.
  const parts: THREE.BufferGeometry[] = [];
  function part(g: THREE.BufferGeometry, x: number, y: number, z: number) { g.translate(x, y, z); parts.push(g); }
  part(new THREE.CapsuleGeometry(0.135, 0.18, 2, 7), 0, 0.43, 0);
  part(new THREE.SphereGeometry(0.153, 8, 6), 0, 0.765, 0);
  for (const side of [-1, 1]) {
    part(new THREE.CapsuleGeometry(0.069, 0.18, 2, 5), side * 0.2, 0.43, 0);
    part(new THREE.CapsuleGeometry(0.078, 0.19, 2, 5), side * 0.092, 0.16, 0);
  }
  const personGeo = ownGeo(mergeGeometries(parts)); parts.forEach((g) => g.dispose());
  const runTime = { value: 0 };
  function runnerMaterial() {
    const m = mat(0xffffff, { roughness: 0.48 });
    m.onBeforeCompile = (shader) => {
      shader.uniforms.runTime = runTime;
      shader.vertexShader = `uniform float runTime;\n${shader.vertexShader}`.replace("#include <begin_vertex>", `
        #include <begin_vertex>
        float phase = runTime * 17.0 + instanceMatrix[3].x * 8.0 + instanceMatrix[3].z * 3.0;
        float stride = sin(phase);
        if (position.y < 0.3) transformed.z += stride * sign(position.x) * (0.3-position.y) * 0.6;
        if (abs(position.x) > 0.16 && position.y < 0.64) transformed.z -= stride * sign(position.x) * 0.10;
        transformed.y += abs(cos(phase)) * 0.047;
      `);
    };
    m.customProgramCacheKey = () => "crowd-run-v1"; return m;
  }
  const peopleMaterial = runnerMaterial();
  function batch(geometry: THREE.BufferGeometry, material: THREE.Material, capacity: number) {
    const result = new THREE.InstancedMesh(geometry, material, capacity);
    result.instanceMatrix.setUsage(THREE.DynamicDrawUsage); result.frustumCulled = false; result.count = 0; scene.add(result); return result;
  }
  const crew = batch(personGeo, peopleMaterial, MAX_UNITS + 32);
  let foes = batch(personGeo, peopleMaterial, 1024);
  const shadowCanvas = document.createElement("canvas"); shadowCanvas.width = shadowCanvas.height = 64;
  const shadowCtx = shadowCanvas.getContext("2d")!;
  const shade = shadowCtx.createRadialGradient(32, 32, 2, 32, 32, 30); shade.addColorStop(0, "rgba(18,64,92,.35)"); shade.addColorStop(1, "rgba(18,64,92,0)");
  shadowCtx.fillStyle = shade; shadowCtx.fillRect(0, 0, 64, 64);
  const shadowTexture = new THREE.CanvasTexture(shadowCanvas); textures.add(shadowTexture);
  const shadowMaterial = ownMat(new THREE.MeshBasicMaterial({ map: shadowTexture, transparent: true, depthWrite: false, toneMapped: false }));
  const shadowGeo = ownGeo(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2));
  let shadows = batch(shadowGeo, shadowMaterial, MAX_UNITS + 1056);
  const particles = batch(boxGeo, ownMat(new THREE.MeshBasicMaterial({ color: 0xffffff })), 520);
  const particleList: Particle[] = [];
  const dummy = new THREE.Object3D(), color = new THREE.Color();
  const transform = (m: THREE.InstancedMesh, index: number, x: number, y: number, z: number, sx: number, sy = sx, sz = sx, ry = 0, rz = 0) => {
    dummy.position.set(x, y, z); dummy.rotation.set(0, ry, rz); dummy.scale.set(sx, sy, sz); dummy.updateMatrix(); m.setMatrixAt(index, dummy.matrix);
  };
  function crowd(units: Unit[], inst: THREE.InstancedMesh, shadowOffset: number, enemy: boolean) {
    inst.count = Math.min(units.length, inst.instanceMatrix.count);
    for (let i = 0; i < inst.count; i++) {
      const u = units[i], scale = u.big ? 2.15 : 1;
      transform(inst, i, wx(u.x), 0.09, wz(u.y), scale, scale, scale, (enemy ? Math.PI : 0) - Math.atan(u.vx / 150));
      color.setHex(u.big ? (enemy ? 0xff953b : 0xffd35c) : (enemy ? RED : BLUE)); inst.setColorAt(i, color);
      transform(shadows, shadowOffset + i, wx(u.x) + 0.06, 0.075, wz(u.y) + 0.07, 0.68 * scale, 1, 0.65 * scale);
    }
    inst.instanceMatrix.needsUpdate = true; if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
  }
  let levelGroup = new THREE.Group(); scene.add(levelGroup);
  let gates: GateView[] = [], fortresses: Fortress[] = [], spinners: THREE.Group[] = [];
  let current: Game | null = null;
  let fired = 0, championCount = 0, recoil = 0, shake = 0, time = 0, won = false;
  let seenPops = new WeakSet<object>(), randomState = 917;
  function random() { randomState = (randomState * 1664525 + 1013904223) >>> 0; return randomState / 4294967296; }
  function burst(x: number, y: number, z: number, hex: number, count: number, power = 1, debris = false) {
    for (let i = 0; i < count && particleList.length < 520; i++) {
      const life = debris ? 1.6 : 0.35 + random() * 0.35;
      particleList.push({ x, y, z, vx: (random() - 0.5) * 5 * power, vy: (1.5 + random() * 3) * power, vz: (random() - 0.5) * 5 * power, life, max: life, size: debris ? 0.17 + random() * 0.35 : 0.065 + random() * 0.07, color: hex, spin: random() * 8 });
    }
  }
  function reset(g: Game) {
    // Dispose only level-owned resources; primitives and scenery are reused.
    levelGroup.traverse((obj) => {
      if (obj instanceof THREE.Sprite) {
        const m = obj.material as THREE.SpriteMaterial;
        if (m.map) { m.map.dispose(); textures.delete(m.map); } m.dispose(); materials.delete(m);
      }
      if (obj instanceof THREE.Mesh && ![boxGeo, cylinderGeo, coneGeo, sphereGeo].includes(obj.geometry)) {
        obj.geometry.dispose(); geometries.delete(obj.geometry);
      }
    });
    for (const view of gates) { view.panel.material.dispose(); materials.delete(view.panel.material); }
    scene.remove(levelGroup); levelGroup = new THREE.Group(); scene.add(levelGroup);
    particleList.length = 0; seenPops = new WeakSet(); fired = g.stats.fired; championCount = g.stats.champions; won = false; recoil = shake = 0;
    gates = g.gates.map((gt) => {
      const group = new THREE.Group(), frame = new THREE.Group();
      const trap = gt.kind === "trap", tint = trap ? red : purple, width = gt.w * SX;
      box(frame, trap ? redDark : navy, 0, 0.14, 0, width + 0.15, 0.26, 0.52);
      for (const s of [-1, 1]) {
        box(frame, white, s * width / 2, 1.2, 0, 0.13, 2.45, 0.17);
        box(frame, tint, s * width / 2, 1.2, 0.02, 0.19, 2.25, 0.2);
        mesh(frame, sphereGeo, white, s * width / 2, 2.43, 0, 0.15, 0.15, 0.15);
      }
      box(frame, tint, 0, 2.38, 0, width, 0.13, 0.17);
      if (trap) for (let x = -width / 2 + 0.2; x < width / 2; x += 0.45) {
        const stripe = box(frame, gold, x, 0.3, 0.19, 0.18, 0.31, 0.02); stripe.rotation.z = -0.5;
      }
      bake(frame); group.add(frame);
      const panel = new THREE.Mesh(ownGeo(new THREE.BoxGeometry(width - 0.12, 2.17, 0.045)), ownMat(new THREE.MeshBasicMaterial({ color: trap ? 0xff3b60 : 0xa63bff, transparent: true, opacity: 0.3, depthWrite: false })));
      panel.position.y = 1.24; group.add(panel);
      const text = label(trap ? "✕" : `×${gt.n ?? 2}`, "#ffffff", Math.min(width * 0.95, 4.3), Math.min(width * 0.4, 1.6), 144);
      text.position.set(0, 1.7, 0.13); group.add(text);
      group.position.set(wx(gt.cx), 0, wz(gt.y)); levelGroup.add(group); return { group, panel, label: text, flash: 0 };
    });
    fortresses = g.bases.map((base) => {
      const group = new THREE.Group(), castle = new THREE.Group();
      box(castle, redDark, 0, 0.15, 0, 3.95, 0.28, 2.65);
      box(castle, red, 0, 0.9, 0, 3.6, 1.5, 2.2);
      box(castle, redDark, 0, 1.62, 0, 3.65, 0.14, 2.26);
      for (const x of [-1.5, 1.5]) {
        box(castle, red, x, 1.27, 0.55, 0.83, 2.15, 0.95);
        box(castle, white, x, 2.34, 0.55, 0.88, 0.13, 1);
        for (const offset of [-0.29, 0.29]) box(castle, red, x + offset, 2.58, 0.55, 0.28, 0.42, 0.95);
        box(castle, navy, x, 1.39, 1.035, 0.22, 0.46, 0.02);
      }
      for (let x = -0.9; x < 1.1; x += 0.6) box(castle, red, x, 1.89, -0.7, 0.35, 0.5, 0.6);
      box(castle, navy, 0, 0.62, 1.11, 0.92, 1.09, 0.04);
      for (const x of [-0.31, 0, 0.31]) box(castle, gold, x, 0.64, 1.14, 0.055, 1.03, 0.045);
      mesh(castle, cylinderGeo, navy, 0.9, 2.48, -0.45, 0.05, 1.9, 0.05);
      box(castle, gold, 1.29, 3.07, -0.45, 0.75, 0.45, 0.04);
      bake(castle); castle.scale.z = SZ / 0.045; group.add(castle);
      box(group, navy, 0, 3.16, 0.2, 3.4, 0.31, 0.19).castShadow = false;
      const bar = box(group, gold, 0, 3.18, 0.31, 3.2, 0.19, 0.09); bar.castShadow = false;
      const text = label(`${base.hp}`, "#ffffff", 2.2, 0.82, 112); text.position.set(0, 3.75, 0.25); group.add(text);
      group.position.set(wx(base.x), 0, wz(base.y)); levelGroup.add(group); return { group, bar, label: text, hp: base.hp, dead: false };
    });
    const obstacles = new THREE.Group(); levelGroup.add(obstacles);
    for (const wall of g.walls) {
      box(obstacles, navy, wx(wall.x + wall.w / 2), 0.4, wz(wall.y + wall.h / 2), wall.w * SX, 0.8, wall.h * SZ);
      box(obstacles, white, wx(wall.x + wall.w / 2), 0.85, wz(wall.y + wall.h / 2), wall.w * SX + 0.04, 0.14, wall.h * SZ + 0.04);
    }
    bake(obstacles);
    spinners = g.spinners.map((s) => {
      const group = new THREE.Group();
      mesh(group, cylinderGeo, navy, 0, 0.28, 0, 0.37, 0.55, 0.37);
      box(group, gold, 0, 0.42, 0, s.r * SX * 2, 0.27, 0.3);
      for (let x = -s.r * SX + 0.1; x < s.r * SX; x += 0.5) box(group, redDark, x, 0.57, 0, 0.2, 0.02, 0.31);
      mesh(group, cylinderGeo, red, 0, 0.59, 0, 0.24, 0.15, 0.24);
      bake(group);
      const mount = new THREE.Group(); mount.add(group);
      mount.position.set(wx(s.x), 0, wz(s.y)); mount.scale.z = SZ / SX;
      levelGroup.add(mount); return group;
    });
  }

  function render(g: Game, delta: number) {
    const dt = Math.min(delta, 0.05); time += dt; runTime.value = time;
    if (g !== current) { reset(g); current = g; }
    if (g.stats.fired > fired) { recoil = 1; fired = g.stats.fired; }
    if (g.stats.champions > championCount) { shake = 0.13; championCount = g.stats.champions; burst(wx(g.cannonX), 0.5, wz(CANNON_Y) - 1, 0xffdc51, 20, 1.1); }
    recoil = Math.max(0, recoil - dt * 8); cannon.position.set(wx(g.cannonX), 0.08, wz(CANNON_Y)); barrel.position.z = recoil * 0.23;
    cannon.scale.set(1 + recoil * 0.04, 1 - recoil * 0.04, 1); muzzle.visible = recoil > 0.68; muzzle.scale.setScalar(0.16 + recoil * 0.16);
    gates.forEach((view, i) => {
      const gt = g.gates[i]; view.group.position.x = wx(gt.cx);
      if (gt.flash > view.flash + 0.12) burst(wx(gt.cx), 0.65, wz(gt.y), gt.kind === "trap" ? RED : 0xd591ff, 9);
      view.flash = gt.flash; view.panel.material.opacity = 0.28 + gt.flash * 0.27;
      view.label.scale.multiplyScalar((1 + gt.flash * 0.07) / (view.label.userData.pulse ?? 1)); view.label.userData.pulse = 1 + gt.flash * 0.07;
    });
    fortresses.forEach((view, i) => {
      const b = g.bases[i];
      if (b.hp !== view.hp) {
        if (b.hp > 0) { view.label.userData.write(String(b.hp)); burst(wx(b.x), 0.9, wz(b.y) + 1.25, 0xffd664, 4); }
        if (view.hp - b.hp >= 10) shake = Math.max(shake, 0.09); view.hp = b.hp;
      }
      if (b.hp <= 0 && !view.dead) {
        view.dead = true; view.group.visible = false; burst(wx(b.x), 1.2, wz(b.y), RED, 48, 1.9, true); burst(wx(b.x), 1.4, wz(b.y), 0xffd24b, 20, 1.6, true); shake = 0.25;
      }
      const ratio = Math.max(0.001, b.hp / b.maxHp); view.bar.scale.x = 3.2 * ratio; view.bar.position.x = -1.6 * (1 - ratio);
      view.group.position.x = wx(b.x) + Math.sin(time * 65) * b.hitFlash * 0.065; view.group.rotation.z = Math.sin(time * 51) * b.hitFlash * 0.026;
    });
    spinners.forEach((view, i) => { view.rotation.y = -g.spinners[i].angle; });
    if (g.red.length > foes.instanceMatrix.count) {
      const capacity = Math.ceil(g.red.length / 512) * 512;
      scene.remove(foes); foes.dispose(); foes = batch(personGeo, peopleMaterial, capacity);
      scene.remove(shadows); shadows.dispose(); shadows = batch(shadowGeo, shadowMaterial, MAX_UNITS + 32 + capacity);
    }
    crowd(g.blue, crew, 0, false); crowd(g.red, foes, crew.count, true); shadows.count = crew.count + foes.count; shadows.instanceMatrix.needsUpdate = true;
    for (const p of g.pops) {
      if (seenPops.has(p)) continue; seenPops.add(p);
      burst(wx(p.x), 0.45, wz(p.y), p.color === 0 ? 0x65cfff : p.color === 1 ? 0xff6976 : 0xffc75e, p.text ? 12 : 3, p.text ? 1.5 : 0.7);
      if (p.text === "BOOM" || p.text === "KO") shake = Math.max(shake, 0.13);
    }
    if (g.status === "won" && !won) {
      won = true;
      for (let i = 0; i < 12; i++) burst((random() - 0.5) * 14, 6 + random() * 4, (random() - 0.5) * 20, [BLUE, RED, 0xffd24b, 0x43e6bc][i % 4], 18, 0.65, true);
    }
    let live = 0;
    for (let i = particleList.length - 1; i >= 0; i--) {
      const p = particleList[i]; p.life -= dt;
      if (p.life <= 0 || p.y < -0.3) { particleList.splice(i, 1); continue; }
      p.vy -= dt * 9; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      const size = p.size * Math.min(1, p.life / p.max * 3);
      transform(particles, live, p.x, p.y, p.z, size, size * 0.7, size, time * p.spin, time * p.spin); particles.setColorAt(live, color.setHex(p.color)); live++;
    }
    particles.count = live; particles.instanceMatrix.needsUpdate = true; if (particles.instanceColor) particles.instanceColor.needsUpdate = true;
    shake = Math.max(0, shake - dt * 1.5); camera.position.copy(cameraHome); camera.position.x += Math.sin(time * 69) * shake; camera.position.y += Math.cos(time * 53) * shake * 0.6;
    renderer.render(scene, camera);
  }
  return {
    render,
    resize(width, height) {
      renderer.setSize(Math.max(1, width), Math.max(1, height), false); camera.aspect = width / height;
      camera.fov = Math.max(40, THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(20)) * (9 / 16) / camera.aspect)));
      camera.updateProjectionMatrix();
    },
    aimX(normalizedX) {
      camera.updateMatrixWorld();
      const left = new THREE.Vector3(wx(0), 0, wz(CANNON_Y)).project(camera).x;
      const right = new THREE.Vector3(wx(W), 0, wz(CANNON_Y)).project(camera).x;
      return ((normalizedX * 2 - 1 - left) / (right - left)) * W;
    },
    dispose() {
      crew.dispose(); foes.dispose(); shadows.dispose(); particles.dispose();
      geometries.forEach((g) => g.dispose()); materials.forEach((m) => m.dispose()); textures.forEach((t) => t.dispose()); renderer.dispose();
    },
  };
}
