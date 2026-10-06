import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { CANNON_Y, DEFENSE_Y, MAX_UNITS, W, surgeActive, trapActive, type Game, type Unit } from "./engine";

// Map the simulation onto a 3D road. Decoration has its own RNG.
const SX = 0.04, SZ = 0.09;
const wx = (x: number) => (x - W / 2) * SX;
const wz = (y: number) => (y - 320) * SZ;
const BLUE = 0x008dff, RED = 0xf63349;
type Particle = { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; max: number; size: number; color: number; spin: number };
type Fortress = { group: THREE.Group; bar: THREE.Mesh; label: THREE.Sprite; signal: THREE.Mesh; hp: number; damage: number; nextTag: number; dead: boolean };
type GateView = { group: THREE.Group; panel: THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>; label: THREE.Sprite; timer: THREE.Sprite | null; tint: THREE.MeshStandardMaterial | null; statusText: string; nextBurst: number };
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
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 9 / 16, 0.1, 160);
  const cameraHome = new THREE.Vector3(0, 38, 54.84);
  const cameraTarget = new THREE.Vector3(0, 0, 4);
  camera.position.copy(cameraHome); camera.lookAt(cameraTarget); camera.updateMatrixWorld();
  scene.fog = new THREE.Fog(0xf1d5b3, 115, 220);
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
  const ivory = mat(0xc9c3bd), edge = mat(0x485979), white = mat(0xffffff);
  const blue = mat(BLUE, { roughness: 0.36 }), navy = mat(0x18365b);
  const red = mat(RED), redDark = mat(0xb72e58);
  const gold = mat(0xffd24b, { metalness: 0.15, roughness: 0.45 });
  const purple = mat(0xa22aff, { emissive: 0x8c20ef, emissiveIntensity: 0.55 }), sand = mat(0xeac69b);
  const foliage = [mat(0x508b72), mat(0x629a75), mat(0x88ac76)];
  const bark = mat(0xb18a64), rock = mat(0xc19b78, { flatShading: true });
  const surgeMaterial = ownMat(new THREE.MeshBasicMaterial({ color: 0xff4563, transparent: true, opacity: 0.65, depthWrite: false }));
  const skyCanvas = document.createElement("canvas"); skyCanvas.width = 4; skyCanvas.height = 256;
  const skyCtx = skyCanvas.getContext("2d")!;
  const gradient = skyCtx.createLinearGradient(0, 0, 0, 256);
  gradient.addColorStop(0, "#badff0"); gradient.addColorStop(0.5, "#f5dec1"); gradient.addColorStop(1, "#e7c198");
  skyCtx.fillStyle = gradient; skyCtx.fillRect(0, 0, 4, 256);
  const sky = new THREE.CanvasTexture(skyCanvas); sky.colorSpace = THREE.SRGBColorSpace;
  textures.add(sky); scene.background = sky;
  scene.add(new THREE.HemisphereLight(0xf3f8ff, 0xbb9375, 2.0));
  const sun = new THREE.DirectionalLight(0xfff6e7, 2.6);
  sun.position.set(-16, 30, 5); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -22, right: 22, top: 42, bottom: -42, near: 1, far: 110 });
  sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.08; sun.shadow.radius = 3; scene.add(sun);

  function mesh(parent: THREE.Object3D, geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number) {
    const m = new THREE.Mesh(geometry, material);
    m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
  }
  const box = (p: THREE.Object3D, m: THREE.Material, x: number, y: number, z: number, a: number, b: number, c: number) => mesh(p, boxGeo, m, x, y, z, a, b, c);
  // Bake stationary props per material to keep scenery draw calls low.
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
  function label(text: string, fill: string, width: number, height: number, fontSize = 112, backing?: string) {
    const c = document.createElement("canvas"); c.width = 512; c.height = 192;
    const context = c.getContext("2d")!;
    const texture = new THREE.CanvasTexture(c); texture.colorSpace = THREE.SRGBColorSpace; textures.add(texture);
    const material = ownMat(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false }));
    const sprite = new THREE.Sprite(material); sprite.scale.set(width, height, 1);
    const write = (value: string) => {
      context.clearRect(0, 0, 512, 192); context.textAlign = "center"; context.textBaseline = "middle";
      if (backing) {
        context.fillStyle = backing;
        context.beginPath(); context.roundRect(18, 15, 476, 162, 45); context.fill();
      }
      context.font = `900 ${fontSize}px "Fredoka", "Arial Rounded MT Bold", Arial, sans-serif`;
      context.lineJoin = "round"; context.strokeStyle = "rgba(12,53,93,.30)"; context.lineWidth = 9;
      context.strokeText(value, 256, 103); context.fillStyle = fill; context.fillText(value, 256, 98); texture.needsUpdate = true;
    };
    write(text); sprite.userData.write = write; return sprite;
  }

  const world = new THREE.Group(); scene.add(world);
  box(world, sand, 0, -1.1, -15, 500, 0.7, 500);
  box(world, edge, 0, -0.43, -2, 15.1, 0.9, 77);
  box(world, ivory, 0, 0, -2, 14.4, 0.16, 77);
  // Raised rails and a long approach give the arena depth, even before firing.
  for (let z = -39; z <= 35; z += 2) {
    for (const side of [-1, 1]) {
      box(world, edge, side * 7.35, 0.34, z, 0.2, 0.56, 2);
      box(world, white, side * 7.35, 0.65, z, 0.24, 0.1, 2);
      if (z % 4 === 1) box(world, navy, side * 7.35, 0.2, z, 0.34, 0.4, 0.2);
    }
    if (z > 23) for (const side of [-1, 1]) box(world, white, side * 3.6, 0.087, z, 0.075, 0.014, 1.2);
  }
  for (let x = -7; x < 7; x += 0.72) {
    const stripe = box(world, Math.round(x / 0.72) % 2 ? gold : navy, x, 0.089, wz(DEFENSE_Y), 0.73, 0.018, 0.32);
    stripe.rotation.y = 0.3;
  }
  // Sparse, original desert props keep the road and teams as the focal point.
  for (let i = 0; i < 20; i++) {
    const side = i % 2 ? 1 : -1;
    const x = side * (11.8 + Math.sin(i * 7.7) * 2 + (i % 3) * 2.1), z = -66 + Math.floor(i / 2) * 10.2;
    const h = 1.2 + (i % 4) * 0.35;
    if (i % 4 === 0) {
      mesh(world, cylinderGeo, foliage[0], x, h / 2 - 0.6, z, 0.2, h, 0.2);
      mesh(world, sphereGeo, foliage[1], x, h - 0.6, z, 0.2, 0.25, 0.2);
      box(world, foliage[0], x + 0.3, h * 0.5 - 0.5, z, 0.65, 0.22, 0.22);
      mesh(world, cylinderGeo, foliage[1], x + 0.6, h * 0.65 - 0.5, z, 0.14, h * 0.3, 0.14);
    } else {
      mesh(world, stoneGeo, rock, x, -0.4, z, h * 0.7, h * 0.4, h);
      mesh(world, stoneGeo, bark, x + 1.1, -0.55, z + 0.5, h * 0.4, h * 0.25, h * 0.4);
    }
    for (let j = 0; j < 3; j++) mesh(world, stoneGeo, rock, x - side * (2 + j), -0.61, z + j * 0.8, 0.15, 0.12, 0.23);
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
  part(new THREE.CapsuleGeometry(0.19, 0.23, 3, 8), 0, 0.52, 0);
  part(new THREE.SphereGeometry(0.22, 10, 7), 0, 0.98, 0);
  for (const side of [-1, 1]) {
    part(new THREE.CapsuleGeometry(0.092, 0.22, 2, 6), side * 0.26, 0.52, 0);
    part(new THREE.CapsuleGeometry(0.104, 0.24, 2, 6), side * 0.12, 0.19, 0);
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
        if (position.y < 0.35) transformed.z += stride * sign(position.x) * (0.35-position.y) * 0.8;
        if (abs(position.x) > 0.23 && position.y < 0.79) transformed.z -= stride * sign(position.x) * 0.15;
        transformed.y += abs(cos(phase)) * 0.065;
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
  const armorParts = [
    new THREE.CylinderGeometry(0.235, 0.235, 0.1, 10, 1, true).translate(0, 1.08, 0),
    new THREE.BoxGeometry(0.37, 0.085, 0.34).translate(0, 0.42, 0),
    ...[-1, 1].map((side) => new THREE.SphereGeometry(0.15, 8, 5).translate(side * 0.28, 0.67, 0)),
  ];
  const armorGeo = ownGeo(mergeGeometries(armorParts)); armorParts.forEach((part) => part.dispose());
  const armor = batch(armorGeo, mat(0xffffff, { roughness: 0.35, metalness: 0.15 }), 128);
  let armorCount = 0;
  const bruteLabels = Array.from({ length: 16 }, () => {
    const sprite = label("", "#ffffff", 2.6, 0.92, 128, "#9f2246");
    sprite.visible = false; scene.add(sprite);
    return { sprite, hp: -1 };
  });
  let bruteLabelCount = 0;
  const shadowCanvas = document.createElement("canvas"); shadowCanvas.width = shadowCanvas.height = 64;
  const shadowCtx = shadowCanvas.getContext("2d")!;
  const shade = shadowCtx.createRadialGradient(32, 32, 2, 32, 32, 30); shade.addColorStop(0, "rgba(28,35,52,.48)"); shade.addColorStop(1, "rgba(28,35,52,0)");
  shadowCtx.fillStyle = shade; shadowCtx.fillRect(0, 0, 64, 64);
  const shadowTexture = new THREE.CanvasTexture(shadowCanvas); textures.add(shadowTexture);
  const shadowMaterial = ownMat(new THREE.MeshBasicMaterial({ map: shadowTexture, transparent: true, depthWrite: false, toneMapped: false }));
  const shadowGeo = ownGeo(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2));
  let shadows = batch(shadowGeo, shadowMaterial, MAX_UNITS + 1056);
  const particles = batch(boxGeo, ownMat(new THREE.MeshBasicMaterial({ color: 0xffffff })), 520);
  const particleList: Particle[] = [];
  const ringGeo = ownGeo(new THREE.RingGeometry(0.83, 1, 24).rotateX(-Math.PI / 2));
  const ringAlpha = new THREE.InstancedBufferAttribute(new Float32Array(48), 1);
  ringAlpha.setUsage(THREE.DynamicDrawUsage); ringGeo.setAttribute("instanceAlpha", ringAlpha);
  const ringMaterial = ownMat(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, toneMapped: false }));
  ringMaterial.onBeforeCompile = (shader) => {
    shader.vertexShader = `attribute float instanceAlpha; varying float vAlpha;\n${shader.vertexShader}`.replace("#include <begin_vertex>", "#include <begin_vertex>\nvAlpha = instanceAlpha;");
    shader.fragmentShader = `varying float vAlpha;\n${shader.fragmentShader}`.replace("#include <color_fragment>", "#include <color_fragment>\ndiffuseColor.a *= vAlpha;");
  };
  ringMaterial.customProgramCacheKey = () => "crowd-shockwave-v1";
  const rings = batch(ringGeo, ringMaterial, 48);
  const waves: { x: number; z: number; age: number; duration: number; radius: number; color: number }[] = [];
  const combatTags = Array.from({ length: 12 }, () => {
    const sprite = label("", "#ffffff", 3.2, 1.4, 130);
    sprite.material.depthTest = false; sprite.visible = false; scene.add(sprite);
    return { sprite, life: 0, size: 1 };
  });
  let tagIndex = 0;
  function tag(text: string, x: number, y: number, z: number, tint: number, size = 1) {
    const item = combatTags[tagIndex++ % combatTags.length];
    item.sprite.userData.write(text); item.sprite.material.color.setHex(tint);
    item.sprite.position.set(x, y, z); item.sprite.visible = true; item.life = 0.85; item.size = size;
  }
  function wave(x: number, z: number, radius: number, tint: number, duration = 0.5) {
    if (waves.length >= 48) waves.shift();
    waves.push({ x, z, radius, color: tint, age: 0, duration });
  }
  const dummy = new THREE.Object3D(), color = new THREE.Color();
  const transform = (m: THREE.InstancedMesh, index: number, x: number, y: number, z: number, sx: number, sy = sx, sz = sx, ry = 0, rz = 0) => {
    dummy.position.set(x, y, z); dummy.rotation.set(0, ry, rz); dummy.scale.set(sx, sy, sz); dummy.updateMatrix(); m.setMatrixAt(index, dummy.matrix);
  };
  function crowd(units: Unit[], inst: THREE.InstancedMesh, shadowOffset: number, enemy: boolean) {
    inst.count = Math.min(units.length, inst.instanceMatrix.count);
    for (let i = 0; i < inst.count; i++) {
      const u = units[i], scale = u.big ? (enemy ? 3.15 : 2.8) : 1.23;
      transform(inst, i, wx(u.x), 0.09, wz(u.y), scale, scale, scale, (enemy ? Math.PI : 0) - Math.atan(u.vx / 150));
      color.setHex(u.big ? (enemy ? 0xff953b : 0xffd35c) : (enemy ? RED : BLUE)); inst.setColorAt(i, color);
      transform(shadows, shadowOffset + i, wx(u.x) + 0.06, 0.095, wz(u.y) + 0.07, 0.68 * scale, 1, 0.65 * scale);
      if (u.big && armorCount < 128) {
        const bob = Math.abs(Math.cos(time * 17 + wx(u.x) * 8 + wz(u.y) * 3)) * 0.065 * scale;
        transform(armor, armorCount, wx(u.x), 0.09 + bob, wz(u.y), scale, scale, scale, (enemy ? Math.PI : 0) - Math.atan(u.vx / 150));
        armor.setColorAt(armorCount++, color.setHex(enemy ? 0x632744 : 0xf3fbff));
      }
      if (u.big && enemy && bruteLabelCount < bruteLabels.length) {
        const item = bruteLabels[bruteLabelCount++];
        if (item.hp !== u.hp) { item.sprite.userData.write(String(u.hp)); item.hp = u.hp; }
        item.sprite.position.set(wx(u.x), 4.5, wz(u.y)); item.sprite.visible = true;
      }
    }
    inst.instanceMatrix.needsUpdate = true; if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
  }
  let levelGroup = new THREE.Group(); scene.add(levelGroup);
  let gates: GateView[] = [], fortresses: Fortress[] = [], spinners: THREE.Group[] = [];
  let current: Game | null = null;
  let fired = 0, championCount = 0, recoil = 0, shake = 0, time = 0, won = false, finishZoom = 0;
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
    for (const view of gates) {
      view.panel.material.dispose(); materials.delete(view.panel.material);
      if (view.tint) { view.tint.dispose(); materials.delete(view.tint); }
    }
    scene.remove(levelGroup); levelGroup = new THREE.Group(); scene.add(levelGroup);
    particleList.length = 0; waves.length = 0;
    for (const item of combatTags) { item.life = 0; item.sprite.visible = false; }
    seenPops = new WeakSet(); fired = g.stats.fired; championCount = g.stats.champions; won = false; recoil = shake = finishZoom = 0;
    gates = g.gates.map((gt) => {
      const group = new THREE.Group(), frame = new THREE.Group();
      const trap = gt.kind === "trap", pulseTint = trap && gt.pulse ? mat(RED, { emissive: RED, emissiveIntensity: 0.25 }) : null;
      const tint = pulseTint ?? (trap ? red : purple), width = gt.w * SX;
      box(frame, trap ? redDark : purple, 0, 0.15, 0, width + 0.3, 0.3, 0.65);
      for (const s of [-1, 1]) {
        box(frame, tint, s * width / 2, 1.55, 0, 0.29, 3.1, 0.3);
        box(frame, white, s * width / 2, 1.58, 0.18, 0.075, 2.85, 0.05);
        mesh(frame, sphereGeo, white, s * width / 2, 3.1, 0, 0.16, 0.16, 0.16);
      }
      box(frame, tint, 0, 3.06, 0, width, 0.16, 0.25);
      if (trap) for (let x = -width / 2 + 0.2; x < width / 2; x += 0.45) {
        const stripe = box(frame, gold, x, 0.3, 0.19, 0.18, 0.31, 0.02); stripe.rotation.z = -0.5;
      }
      bake(frame); group.add(frame);
      const panel = new THREE.Mesh(ownGeo(new THREE.BoxGeometry(width - 0.12, 2.77, 0.07)), ownMat(new THREE.MeshBasicMaterial({ color: trap ? 0xff3b60 : 0xa63bff, transparent: true, opacity: 0.3, depthWrite: false })));
      panel.position.y = 1.57; group.add(panel);
      const text = label(trap ? "✕" : `×${gt.n ?? 2}`, "#ffffff", Math.min(width * 1.1, 4.9), Math.min(width * 0.55, 2.2), 152);
      // Route values remain readable as a dense crowd passes through the panel.
      text.material.depthTest = false;
      text.position.set(0, 2, 0.2); group.add(text);
      const timer = gt.pulse ? label("", "#ffffff", Math.min(3.6, width), 1, 112, "#16445e") : null;
      if (timer) { timer.position.set(0, 3.7, 0); group.add(timer); }
      group.position.set(wx(gt.cx), 0, wz(gt.y)); levelGroup.add(group);
      return { group, panel, label: text, timer, tint: pulseTint, statusText: "", nextBurst: 0 };
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
      const text = label(`${base.hp}`, "#ffffff", 3.2, 1.15, 128, "#cb244b"); text.position.set(0, 3.85, 0.25); group.add(text);
      const signal = mesh(group, ownGeo(new THREE.RingGeometry(2.25, 2.4, 32).rotateX(-Math.PI / 2)), surgeMaterial, 0, 0.1, 0, 1, 1, 1);
      signal.castShadow = false; signal.visible = false;
      group.position.set(wx(base.x), 0, wz(base.y)); levelGroup.add(group); return { group, bar, label: text, signal, hp: base.hp, damage: 0, nextTag: 0, dead: false };
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
    if (g.stats.champions > championCount) {
      shake = 0.18; championCount = g.stats.champions;
      burst(wx(g.cannonX), 0.5, wz(CANNON_Y) - 1, 0xffdc51, 24, 1.1);
      wave(wx(g.cannonX), wz(CANNON_Y), 3, 0xffde59, 0.65);
    }
    recoil = Math.max(0, recoil - dt * 8); cannon.position.set(wx(g.cannonX), 0.08, wz(CANNON_Y)); barrel.position.z = recoil * 0.23;
    cannon.scale.set(1.3 + recoil * 0.06, 1.3 - recoil * 0.06, 1.3); muzzle.visible = recoil > 0.68; muzzle.scale.setScalar(0.16 + recoil * 0.16);
    gates.forEach((view, i) => {
      const gt = g.gates[i]; view.group.position.x = wx(gt.cx);
      if (gt.flash > 0.78 && time >= view.nextBurst) {
        const tint = gt.kind === "trap" ? (trapActive(gt, g.t) ? RED : 0x16d6b4) : 0xd591ff;
        burst(wx(gt.cx), 0.85, wz(gt.y), tint, 14);
        if (gt.kind === "x") wave(wx(gt.cx), wz(gt.y), gt.w * SX * 0.65, tint);
        view.nextBurst = time + 0.22;
      }
      view.panel.material.opacity = 0.28 + gt.flash * 0.27;
      if (gt.pulse && view.tint && view.timer) {
        const phase = ((g.t + (gt.pulse.phase ?? 0)) % gt.pulse.period + gt.pulse.period) % gt.pulse.period;
        const active = trapActive(gt, g.t);
        const left = Math.max(0, active ? gt.pulse.active - phase : gt.pulse.period - phase);
        const warning = !active && left < 0.8;
        const tint = active ? RED : warning ? 0xffbc34 : 0x16d6b4;
        view.tint.color.setHex(tint); view.tint.emissive.setHex(tint);
        view.tint.emissiveIntensity = warning ? 0.4 + Math.sin(time * 16) * 0.3 : 0.25;
        view.panel.material.color.setHex(tint);
        view.panel.material.opacity = active ? 0.4 : 0.12;
        const text = `${active ? "ON" : warning ? "SOON" : "SAFE"} ${Math.ceil(left)}`;
        if (text !== view.statusText) {
          view.timer.userData.write(text);
          view.label.userData.write(active ? "✕" : "✓");
          view.statusText = text;
        }
      }
      const pulse = 1 + gt.flash * (0.05 + Math.sin(time * 24) * 0.025);
      view.label.scale.multiplyScalar(pulse / (view.label.userData.pulse ?? 1)); view.label.userData.pulse = pulse;
    });
    fortresses.forEach((view, i) => {
      const b = g.bases[i];
      view.signal.visible = b.hp > 0 && surgeActive(g.level, g.t);
      view.signal.scale.setScalar(1 + Math.sin(time * 10) * 0.07);
      if (b.hp !== view.hp) {
        view.damage += Math.max(0, view.hp - b.hp);
        if (b.hp > 0) { view.label.userData.write(String(b.hp)); burst(wx(b.x), 0.9, wz(b.y) + 1.25, 0xffd664, 4); }
        if (view.hp - b.hp >= 10) shake = Math.max(shake, 0.09); view.hp = b.hp;
      }
      if (b.hp <= 0 && !view.dead) {
        view.dead = true; view.group.visible = false; burst(wx(b.x), 1.2, wz(b.y), RED, 72, 2.7, true); burst(wx(b.x), 1.4, wz(b.y), 0xffd24b, 30, 2, true); shake = 0.35;
        wave(wx(b.x), wz(b.y), 7, 0xffd24b, 0.8); tag("SMASH!", wx(b.x), 4.4, wz(b.y), 0xfff09b, 1.5);
        view.damage = 0;
      }
      if (view.damage > 0 && time >= view.nextTag) {
        tag(`−${view.damage}`, wx(b.x) + 1.7, 3.7, wz(b.y), 0xffffff);
        view.damage = 0; view.nextTag = time + 0.4;
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
    armorCount = 0; bruteLabelCount = 0;
    crowd(g.blue, crew, 0, false); crowd(g.red, foes, crew.count, true); shadows.count = crew.count + foes.count; shadows.instanceMatrix.needsUpdate = true;
    for (let i = bruteLabelCount; i < bruteLabels.length; i++) bruteLabels[i].sprite.visible = false;
    armor.count = armorCount; armor.instanceMatrix.needsUpdate = true;
    if (armor.instanceColor) armor.instanceColor.needsUpdate = true;
    for (const p of g.pops) {
      if (seenPops.has(p)) continue; seenPops.add(p);
      burst(wx(p.x), 0.45, wz(p.y), p.color === 0 ? 0x65cfff : p.color === 1 ? 0xff6976 : 0xffc75e, p.text ? 12 : 3, p.text ? 1.5 : 0.7);
      if (p.text === "BOOM" || p.text === "KO") {
        shake = Math.max(shake, 0.18); wave(wx(p.x), wz(p.y), 3, 0xffd85b, 0.65);
        if (p.text === "KO") tag("KO!", wx(p.x), 2.5, wz(p.y), 0xffe066, 1.2);
      }
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
    let waveCount = 0;
    for (let i = waves.length - 1; i >= 0; i--) {
      const item = waves[i]; item.age += dt;
      if (item.age >= item.duration) { waves.splice(i, 1); continue; }
      const progress = item.age / item.duration, radius = item.radius * (0.2 + progress * 0.8);
      transform(rings, waveCount, item.x, 0.11, item.z, radius, 1, radius);
      rings.setColorAt(waveCount, color.setHex(item.color)); ringAlpha.setX(waveCount, (1 - progress) * 0.8); waveCount++;
    }
    rings.count = waveCount; rings.instanceMatrix.needsUpdate = true; ringAlpha.needsUpdate = true;
    if (rings.instanceColor) rings.instanceColor.needsUpdate = true;
    for (const item of combatTags) {
      if (item.life <= 0) continue;
      item.life -= dt; item.sprite.visible = item.life > 0;
      item.sprite.position.y += dt * 1.8;
      item.sprite.material.opacity = Math.min(1, item.life * 3);
      const popScale = item.size * (1 + Math.sin(Math.min(1, (0.85 - item.life) * 6) * Math.PI) * 0.18);
      item.sprite.scale.set(3.2 * popScale, 1.4 * popScale, 1);
    }
    shake = Math.max(0, shake - dt * 1.5); camera.position.copy(cameraHome); camera.position.x += Math.sin(time * 69) * shake; camera.position.y += Math.cos(time * 53) * shake * 0.6;
    finishZoom += ((won ? 1 : 0) - finishZoom) * Math.min(1, dt * 3);
    camera.zoom = 1 + finishZoom * 0.1; camera.updateProjectionMatrix();
    camera.lookAt(cameraTarget.x, cameraTarget.y, cameraTarget.z - finishZoom * 4);
    renderer.render(scene, camera);
  }
  return {
    render,
    resize(width, height) {
      renderer.setSize(Math.max(1, width), Math.max(1, height), false); camera.aspect = width / height;
      const viewDirection = new THREE.Vector3().subVectors(cameraHome, cameraTarget).normalize();
      const cannonDepth = cameraHome.y * viewDirection.y + (cameraHome.z - wz(CANNON_Y)) * viewDirection.z;
      camera.fov = Math.max(38, THREE.MathUtils.radToDeg(2 * Math.atan(7.8 / (cannonDepth * camera.aspect))));
      camera.updateProjectionMatrix();
    },
    aimX(normalizedX) {
      camera.updateMatrixWorld();
      const left = new THREE.Vector3(wx(0), 0, wz(CANNON_Y)).project(camera).x;
      const right = new THREE.Vector3(wx(W), 0, wz(CANNON_Y)).project(camera).x;
      return ((normalizedX * 2 - 1 - left) / (right - left)) * W;
    },
    dispose() {
      crew.dispose(); foes.dispose(); shadows.dispose(); particles.dispose(); rings.dispose(); armor.dispose();
      geometries.forEach((g) => g.dispose()); materials.forEach((m) => m.dispose()); textures.forEach((t) => t.dispose()); renderer.dispose();
    },
  };
}
