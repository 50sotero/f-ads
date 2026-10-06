import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { CANNON_Y, MAX_UNITS, W, surgeActive, type Game, type Unit } from "./engine";
import { createHordeGeometry, createMobGeometry, createSiegeCannon, createWarden } from "./assaultArt";

// The simulation uses a moving local battlefield. The road and scenery stay in
// world space while the camera follows the battery into each new encounter.
const SX = 0.048, SZ = 0.07;
const wx = (x: number) => (x - W / 2) * SX;
const wz = (y: number) => (y - CANNON_Y) * SZ;
const BLUE = 0x009bff, RED = 0xf7273f;
type Particle = { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; max: number; size: number; color: number; spin: number };
type Label = { sprite: THREE.Sprite; write: (text: string, fill?: string) => void };
type GateView = { group: THREE.Group; panel: THREE.Mesh; material: THREE.MeshStandardMaterial; label: Label; value: string; nextBurst: number };

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
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(41, 390 / 844, 0.2, 380);
  const cameraHome = new THREE.Vector3(1.8, 54, 35);
  const cameraTarget = new THREE.Vector3(0, 0, -29);
  const stage = new THREE.Group(); scene.add(stage);
  let theme = "fork", travel = 0;
  const worldCurve = (z: number) => theme === "bend" ? Math.sin(z * 0.024) * 4.5 : 0;
  const curve = (z: number) => worldCurve(z - travel);
  scene.fog = new THREE.Fog(0xe6c39e, 130, 310);
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  const geo = <T extends THREE.BufferGeometry>(value: T) => { geometries.add(value); return value; };
  const mat = <T extends THREE.Material>(value: T) => { materials.add(value); return value; };
  const texture = <T extends THREE.Texture>(value: T) => { textures.add(value); return value; };
  const standard = (color: number, options: THREE.MeshStandardMaterialParameters = {}) => mat(new THREE.MeshStandardMaterial({ color, roughness: 0.75, ...options }));
  const basic = (color: number, options: THREE.MeshBasicMaterialParameters = {}) => mat(new THREE.MeshBasicMaterial({ color, ...options }));
  const cube = geo(new THREE.BoxGeometry(1, 1, 1));
  const sphere = geo(new THREE.IcosahedronGeometry(1, 1));
  const cylinder = geo(new THREE.CylinderGeometry(1, 1, 1, 8));
  const sand = standard(0xeac59e);
  const ivory = standard(0xe9d6be), metal = standard(0x66605d), dark = standard(0x3d343d);
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
      if (!(child instanceof THREE.Mesh) || Array.isArray(child.material) || child.children.length || child.name === "muzzle-opening") continue;
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
  skyGradient.addColorStop(0, "#bce2ef"); skyGradient.addColorStop(0.55, "#efddc2"); skyGradient.addColorStop(1, "#e2bb94");
  skyContext.fillStyle = skyGradient; skyContext.fillRect(0, 0, 4, 256);
  const sky = texture(new THREE.CanvasTexture(skyCanvas)); sky.colorSpace = THREE.SRGBColorSpace; scene.background = sky;
  scene.add(new THREE.HemisphereLight(0xf4f5ff, 0xae8068, 1.7));
  const sun = new THREE.DirectionalLight(0xfff3e4, 2.7);
  sun.position.set(-20, 40, 16); sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024); sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.08;
  Object.assign(sun.shadow.camera, { left: -24, right: 24, top: 42, bottom: -42, near: 1, far: 130 });
  scene.add(sun, sun.target);

  // A restrained, fine-grained road texture keeps the enormous crowd readable.
  const roadCanvas = document.createElement("canvas"); roadCanvas.width = 256; roadCanvas.height = 256;
  const roadContext = roadCanvas.getContext("2d")!;
  roadContext.fillStyle = "#9d8580"; roadContext.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2600; i++) {
    roadContext.fillStyle = random() > 0.5 ? "rgba(66,39,44,.10)" : "rgba(255,239,209,.09)";
    roadContext.fillRect(random() * 256, random() * 256, 1 + random() * 2, 1 + random() * 2);
  }
  const roadTexture = texture(new THREE.CanvasTexture(roadCanvas)); roadTexture.colorSpace = THREE.SRGBColorSpace;
  roadTexture.wrapS = roadTexture.wrapT = THREE.RepeatWrapping; roadTexture.repeat.set(3, 53);
  const roadMaterial = standard(0xffffff, { map: roadTexture });
  box(scene, sand, 0, -0.42, -110, 520, 0.6, 520).castShadow = false;
  const road = mesh(scene, geo(new THREE.BoxGeometry(18.7, 0.22, 320, 1, 1, 100)), roadMaterial, 0, -0.12, -112, 1, 1, 1); road.castShadow = false;
  const scenery = new THREE.Group(); scene.add(scenery);
  for (const side of [-1, 1]) {
    box(scenery, ivory, side * 9.45, 0.01, -112, 0.24, 0.25, 320);
    box(scenery, metal, side * 9.7, 0.7, -112, 0.08, 0.09, 320);
    for (let z = 30; z > -270; z -= 4) box(scenery, metal, side * 9.7, 0.39, z, 0.1, 0.8, 0.1);
  }
  const rockMaterial = standard(0xb69478, { flatShading: true });
  const leafMaterial = standard(0x688969, { flatShading: true });
  const bark = standard(0x9e785d);
  for (let i = 0; i < 330; i++) {
    const side = random() < 0.5 ? -1 : 1;
    const x = side * (11 + random() * 33);
    let z = 25 - random() * 310;
    for (const river of [-24, -61, -98]) if (Math.abs(z - river) < 10) z = river + 10.5 + random() * 2;
    const size = 0.1 + random() * 0.42;
    mesh(scenery, sphere, rockMaterial, x, size * 0.25, z, size, size * 0.5, size * 0.8);
    if (i % 17 === 0) {
      mesh(scenery, cylinder, bark, x, 0.75, z, 0.14, 1.5, 0.14);
      mesh(scenery, sphere, leafMaterial, x, 2.1, z, 1, 1.25, 0.9);
      mesh(scenery, sphere, leafMaterial, x + 0.6, 1.65, z, 0.75, 0.75, 0.7);
    }
  }
  for (let z = 16; z > -270; z -= 8) box(scenery, ivory, 0, 0.015, z, 0.1, 0.015, 2.8);
  bake(scenery);
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
    for (const side of [-1, 1]) {
      box(bridges, ivory, side * 9.25, 0.3, z, 0.45, 0.65, 19);
      box(bridges, dark, side * 9.25, 1.3, z, 0.12, 0.16, 19);
      for (let k = -8; k <= 8; k += 2) box(bridges, ivory, side * 9.25, 0.8, z + k, 0.22, 1.5, 0.3);
    }
    for (let k = -7; k <= 7; k += 3.5) box(bridges, dark, 0, 0.014, z + k, 18.5, 0.01, 0.065);
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
  const worldBends = [...bendables(road, -112), ...bendables(scenery)];
  function bendGeometry(parts: Bendable[], offset = 0) {
    for (const part of parts) {
      const attribute = part.geometry.attributes.position;
      for (let i = 0; i < attribute.count; i++) attribute.setX(i, part.original[i * 3] + worldCurve(part.original[i * 3 + 2] + part.offset + offset));
      attribute.needsUpdate = true; part.geometry.computeBoundingSphere();
    }
  }

  // The waiting gate bank and enemy lane meet in a wide foreground throat.
  const fork = new THREE.Group(); stage.add(fork);
  const median = new THREE.Shape();
  median.moveTo(1.65, 16); median.lineTo(2.85, 12.5); median.lineTo(4.2, 16); median.lineTo(4.2, 225); median.lineTo(1.65, 225); median.closePath();
  const medianGeometry = geo(new THREE.ShapeGeometry(median)); medianGeometry.rotateX(-Math.PI / 2);
  const medianMesh = new THREE.Mesh(medianGeometry, sand); medianMesh.position.y = 0.035; medianMesh.receiveShadow = true; fork.add(medianMesh);
  const fencePoints: number[] = [];
  for (const x of [1.55, 4.3]) {
    box(fork, metal, x, 0.85, -102, 0.07, 0.08, 172);
    box(fork, metal, x, 0.18, -102, 0.07, 0.06, 172);
    for (let z = -16; z > -190; z -= 2.3) box(fork, metal, x, 0.48, z, 0.09, 1, 0.09);
    for (let z = -16; z > -190; z -= 0.45) {
      fencePoints.push(x, 0.18, z, x, 0.86, z - 0.68, x, 0.86, z, x, 0.18, z - 0.68);
    }
  }
  bake(fork);
  const fence = new THREE.LineSegments(geo(new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(fencePoints, 3))), mat(new THREE.LineBasicMaterial({ color: 0x695f5c, transparent: true, opacity: 0.55 })));
  fork.add(fence);
  const forkBends = bendables(fork);

  function makeLabel(text: string, width: number, height: number, fill = "#ffffff", fontSize = 135): Label {
    const source = document.createElement("canvas"); source.width = 512; source.height = 192;
    const context = source.getContext("2d")!;
    const map = texture(new THREE.CanvasTexture(source)); map.colorSpace = THREE.SRGBColorSpace;
    const material = mat(new THREE.SpriteMaterial({ map, transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
    const sprite = new THREE.Sprite(material); sprite.scale.set(width, height, 1); sprite.renderOrder = 5;
    const write = (value: string, color = fill) => {
      context.clearRect(0, 0, 512, 192); context.textAlign = "center"; context.textBaseline = "middle";
      context.font = `700 ${fontSize}px Fredoka, Arial, sans-serif`; context.lineJoin = "round";
      const textWidth = context.measureText(value).width;
      if (textWidth > 472) context.font = `700 ${Math.floor(fontSize * 472 / textWidth)}px Fredoka, Arial, sans-serif`;
      context.strokeStyle = "#31263e"; context.lineWidth = 14; context.strokeText(value, 256, 104);
      context.fillStyle = color; context.fillText(value, 256, 104); map.needsUpdate = true;
    };
    write(text); return { sprite, write };
  }
  function gate(color: number, text: string, castShadow = true): GateView {
    const group = new THREE.Group(); stage.add(group);
    const material = standard(color, { emissive: color, emissiveIntensity: 0.3, transparent: true, opacity: 0.8, roughness: 0.35, depthWrite: false });
    const panel = box(group, material, 0, 1.02, 0, 1, 1.85, 0.25); panel.castShadow = false;
    box(group, white, 0, 0.14, 0, 1, 0.15, 0.45);
    box(group, material, 0, 1.98, 0, 1, 0.22, 0.42);
    for (const x of [-0.5, 0.5]) box(group, material, x, 1.03, 0, 0.045, 2.15, 0.5);
    const label = makeLabel(text, 0.92, 2.6, "#ffffff", 151); label.sprite.position.set(0, 1.2, 0.2); group.add(label.sprite);
    if (!castShadow) group.traverse((object) => { object.castShadow = false; });
    bake(group);
    return { group, panel, material, label, value: text, nextBurst: 0 };
  }
  const gates: GateView[] = [];
  const bank = Array.from({ length: 24 }, () => gate(0xa329f3, "×2", false));
  const pickups = Array.from({ length: 10 }, () => gate(0x019bff, "+1"));
  bank.forEach((value) => value.group.traverse((object) => { object.castShadow = false; }));
  function bakeArt(group: THREE.Group) {
    for (const child of group.children) if (child instanceof THREE.Group) bakeArt(child);
    bake(group);
  }
  const paintedMaterial = standard(0xffffff, { vertexColors: true, roughness: 0.6 });
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
  const cannon = Array.from({ length: 5 }, () => {
    const value = createSiegeCannon();
    for (const group of [value.barrel, value.group]) {
      const combined = paintedMesh(group, false);
      for (const child of [...group.children]) if (child instanceof THREE.Mesh && child.name !== "muzzle-opening") group.remove(child);
      group.add(combined);
    }
    value.group.traverse((object) => { object.castShadow = false; }); stage.add(value.group); return value;
  });
  const batteryShadowMaterial = basic(0x513e48, { transparent: true, opacity: 0.2, depthWrite: false });
  const circle = geo(new THREE.CircleGeometry(1, 16)); circle.rotateX(-Math.PI / 2);
  const batteryShadow = mesh(stage, circle, batteryShadowMaterial, 0, 0.03, 0, 1.15, 1, 0.85); batteryShadow.castShadow = false;
  const aimRingMaterial = basic(0xd1f7ff, { transparent: true, opacity: 0.55, depthWrite: false });
  const aimRingGeometry = geo(new THREE.RingGeometry(0.94, 1, 32)); aimRingGeometry.rotateX(-Math.PI / 2);
  const aimRing = mesh(stage, aimRingGeometry, aimRingMaterial, 0, 0.025, 0, 1, 1, 0.65); aimRing.castShadow = false;
  const warningMaterial = basic(0xff543b, { transparent: true, opacity: 0, depthWrite: false });
  const warningRing = mesh(stage, aimRingGeometry, warningMaterial, 0, 0.045, -18, 4, 1, 2.5); warningRing.castShadow = false;
  const rushMaterial = basic(0xff374b, { transparent: true, opacity: 0, depthWrite: false });
  const rushEdges = [-1, 1].map((side) => { const edge = box(stage, rushMaterial, side * 9.05, 0.02, -8, 0.18, 0.02, 23); edge.castShadow = false; return edge; });

  const animationTime = { value: 0 };
  function crowdMaterial(color: number) {
    const material = standard(color, { roughness: 0.44, vertexColors: true });
    material.onBeforeCompile = (shader) => {
      shader.uniforms.runTime = animationTime;
      shader.vertexShader = `uniform float runTime; attribute float faceMask; varying float vFaceMask;\n${shader.vertexShader}`.replace("#include <begin_vertex>", `
        #include <begin_vertex>
        vFaceMask = faceMask;
        float phase = runTime * 13.0 + instanceMatrix[3].x * 3.2 + instanceMatrix[3].z * 1.7;
        float stride = sin(phase);
        transformed.y += abs(stride) * 0.075;
        transformed.z += stride * 0.095 * (1.0 - smoothstep(0.15, 0.45, position.y)) * sign(position.x);
        transformed.x += sin(phase * 0.5) * 0.025 * position.y;
      `);
      shader.fragmentShader = `varying float vFaceMask;\n${shader.fragmentShader}`.replace("#include <color_fragment>", `
        #include <color_fragment>
        diffuseColor.rgb = mix(diffuseColor.rgb, vColor.rgb, vFaceMask);
      `);
    };
    material.customProgramCacheKey = () => "assault-run-v1"; return material;
  }
  const mobGeometry = geo(createMobGeometry()), reserveGeometry = geo(createHordeGeometry());
  const friendMaterial = crowdMaterial(BLUE), enemyMaterial = crowdMaterial(RED);
  const friends = new THREE.InstancedMesh(mobGeometry, friendMaterial, MAX_UNITS + 32);
  const enemies = new THREE.InstancedMesh(mobGeometry, enemyMaterial, 1600);
  const reserves = new THREE.InstancedMesh(reserveGeometry, enemyMaterial, 12000);
  for (const object of [friends, enemies, reserves]) { object.frustumCulled = false; object.instanceMatrix.setUsage(THREE.DynamicDrawUsage); stage.add(object); }
  const shadowSource = document.createElement("canvas"); shadowSource.width = shadowSource.height = 32;
  const shadowContext = shadowSource.getContext("2d")!;
  const shadowGradient = shadowContext.createRadialGradient(16, 16, 2, 16, 16, 16);
  shadowGradient.addColorStop(0, "rgba(35,18,38,.40)"); shadowGradient.addColorStop(1, "rgba(35,18,38,0)");
  shadowContext.fillStyle = shadowGradient; shadowContext.fillRect(0, 0, 32, 32);
  const shadowMaterial = basic(0xffffff, { map: texture(new THREE.CanvasTexture(shadowSource)), transparent: true, depthWrite: false });
  const shadowGeometry = geo(new THREE.PlaneGeometry(1, 1)); shadowGeometry.rotateX(-Math.PI / 2);
  const shadows = new THREE.InstancedMesh(shadowGeometry, shadowMaterial, MAX_UNITS + 1632); shadows.frustumCulled = false; stage.add(shadows);
  const dummy = new THREE.Object3D(), color = new THREE.Color();
  let shadowCount = 0;
  function drawUnits(units: Unit[], object: THREE.InstancedMesh, enemy: boolean, entry: number) {
    const count = Math.min(units.length, object.instanceMatrix.count); object.count = count;
    for (let i = 0; i < count; i++) {
      const unit = units[i];
      const size = unit.big ? (enemy ? 1.8 : 2.0) : enemy ? 0.93 : 1.22;
      const shotFlight = !enemy && unit.y > 552 ? Math.sin(Math.max(0, Math.min(1, (583 - unit.y) / 31)) * Math.PI) * 0.85 : 0;
      const z = wz(unit.y) - (enemy ? entry : 0);
      dummy.position.set(wx(unit.x) + curve(z), 0.025 + shotFlight, z);
      dummy.rotation.set(0, enemy ? Math.PI : Math.max(-0.45, Math.min(0.45, -unit.vx * 0.014)), 0);
      dummy.scale.setScalar(size); dummy.updateMatrix(); object.setMatrixAt(i, dummy.matrix);
      object.setColorAt(i, color.setHex(unit.big ? (enemy ? 0xffbaa1 : 0xa8f4ff) : 0xffffff));
      dummy.position.y = 0.025; dummy.rotation.set(0, 0, 0); dummy.scale.set(size * 0.9, 1, size * 0.7); dummy.updateMatrix(); shadows.setMatrixAt(shadowCount++, dummy.matrix);
    }
    object.instanceMatrix.needsUpdate = true;
    if (object.instanceColor) object.instanceColor.needsUpdate = true;
  }

  type BossView = { art: ReturnType<typeof createWarden>; distant: THREE.Mesh; label: Label; bar: THREE.Group; fill: THREE.Mesh; hp: number; deadAt: number; damageAt: number; deathX: number; deathZ: number; deathTravel: number };
  const bosses: BossView[] = [];
  function ensureBosses(count: number) {
    while (bosses.length < count) {
      const art = createWarden(bosses.length); const distant = paintedMesh(art.group, true); bakeArt(art.group); stage.add(art.group, distant);
      const label = makeLabel("500", 5.8, 1.9, "#ffffff", 144); stage.add(label.sprite);
      const bar = new THREE.Group(); stage.add(bar);
      box(bar, dark, 0, 0, 0, 5.4, 0.65, 0.18);
      const fill = box(bar, standard(0xff294e, { emissive: 0xff1734, emissiveIntensity: 0.3 }), 0, 0, 0.11, 5.15, 0.46, 0.1);
      bosses.push({ art, distant, label, bar, fill, hp: -1, deadAt: -99, damageAt: -99, deathX: 0, deathZ: 0, deathTravel: 0 });
    }
  }
  const particleList: Particle[] = [];
  const particleMaterial = basic(0xffffff);
  const particles = new THREE.InstancedMesh(cube, particleMaterial, 720); particles.frustumCulled = false; stage.add(particles);
  function burst(x: number, y: number, z: number, hex: number, count: number, force = 1, confetti = false) {
    for (let i = 0; i < count; i++) {
      if (particleList.length >= 720) particleList.shift();
      const angle = random() * Math.PI * 2, speed = (1.2 + random() * 3.3) * force;
      const life = (0.3 + random() * 0.55) * (confetti ? 3 : 1);
      particleList.push({ x, y, z, vx: Math.cos(angle) * speed, vy: (2 + random() * 4) * force, vz: Math.sin(angle) * speed, life, max: life, size: (0.08 + random() * 0.14) * force, color: confetti ? [BLUE, 0xffd43b, 0xf13686, 0x9e44ff, 0x78edc9][i % 5] : hex, spin: random() * 6 });
    }
  }
  const rings = Array.from({ length: 20 }, () => {
    const material = basic(0xb6f5ff, { transparent: true, opacity: 0, depthWrite: false });
    const object = new THREE.Mesh(aimRingGeometry, material); object.position.y = 0.04; stage.add(object); return { object, material, age: 2, max: 1 };
  });
  let ringCursor = 0;
  function ring(x: number, z: number, hex: number, max = 2) {
    const value = rings[ringCursor++ % rings.length]; value.age = 0; value.max = max; value.object.position.set(x, 0.045, z); value.material.color.setHex(hex);
  }
  const tags = Array.from({ length: 10 }, () => { const value = makeLabel("", 3.1, 1.1, "#ffffff", 96); stage.add(value.sprite); return { ...value, age: 2, y: 0 }; });
  let tagCursor = 0;
  function tag(text: string, x: number, z: number, fill: string) {
    const value = tags[tagCursor++ % tags.length]; value.write(text, fill); value.age = 0; value.y = 2.8; value.sprite.position.set(x, value.y, z);
  }
  const seenPops = new WeakSet<object>();
  let currentGame: Game | null = null, shot = 0, recoil = 0, shake = 0, previousTier = 1, winAt = -1, reserveCount = -1, reserveEncounter = -1, previousTravel = -1;
  let previousStatus = "playing", frameTime = 0, shadowAt = 0, previousPulse = 0, wasRushing = false;
  const projected = new THREE.Vector3();
  function updateCamera() {
    camera.position.copy(cameraHome); camera.position.z -= travel;
    camera.position.x += curve(0);
    camera.position.x += Math.sin(frameTime * 57) * shake * 0.09;
    camera.position.y += Math.cos(frameTime * 43) * shake * 0.06;
    camera.lookAt(cameraTarget.x + curve(cameraTarget.z), cameraTarget.y, cameraTarget.z - travel); camera.updateMatrixWorld();
    sun.position.set(-20, 40, 16 - travel); sun.target.position.set(0, 0, -20 - travel);
  }
  function render(game: Game, dt: number) {
    dt = Math.min(dt, 0.05); frameTime += dt;
    if (currentGame !== game) {
      currentGame = game; shot = game.stats.fired; previousTier = game.assault?.tier ?? 1;
      shadowAt = 0;
      theme = game.level.assault?.theme ?? "fork"; travel = (game.assault?.travel ?? 0) * SZ;
      bridges.visible = theme === "bridge"; bendGeometry(worldBends); bendGeometry(forkBends, -travel); previousTravel = travel;
      previousStatus = "playing"; winAt = -1; reserveCount = -1; reserveEncounter = -1;
      previousPulse = 0; wasRushing = false;
      particleList.length = 0; bosses.forEach((boss) => { boss.hp = -1; boss.deadAt = -99; boss.damageAt = -99; });
      gates.forEach((value) => { value.group.visible = false; value.nextBurst = 0; });
      tags.forEach((value) => { value.age = 2; }); rings.forEach((value) => { value.age = 2; });
    }
    const assault = game.assault;
    const encounter = assault?.encounter ?? 0, tier = assault?.tier ?? 1;
    travel = (assault?.travel ?? 0) * SZ; stage.position.z = -travel;
    if (travel !== previousTravel) { bendGeometry(forkBends, -travel); reserveCount = -1; previousTravel = travel; }
    const entry = (assault?.advance ?? 0) * 15;
    const warning = assault?.bossWarning ?? 0, pulse = assault?.bossPulse ?? 0;
    const activeBoss = game.bases[encounter];
    const rushing = !!assault && surgeActive(game.level, game.t) && game.status === "playing";
    rushMaterial.opacity = rushing ? 0.35 + Math.sin(game.t * 14) * 0.2 : 0;
    rushEdges.forEach((edge, i) => { edge.position.x = (i ? 1 : -1) * 9.05 + curve(-8); });
    if (rushing && !wasRushing) tag("ENEMY RUSH", wx(activeBoss.x) + curve(wz(activeBoss.y)), wz(activeBoss.y) + 4, "#ffb49a");
    wasRushing = rushing;
    warningRing.visible = warning > 0 && game.status === "playing";
    if (activeBoss) {
      const z = wz(activeBoss.y + 33), x = wx(activeBoss.x) + curve(z);
      warningRing.position.set(x, 0.045, z); warningRing.scale.set(3.3 + warning * 0.7, 1, 2.3 + warning * 0.5);
      warningMaterial.opacity = 0.2 + warning * 0.55;
      if (pulse > previousPulse + 0.1) { ring(x, z, 0xffc658, 5); burst(x, 0.3, z, 0xffc36a, 35, 1.3); shake = 1; }
    }
    previousPulse = pulse;
    animationTime.value = game.t;
    shake = Math.max(0, shake - dt * 7);
    recoil = Math.max(0, recoil - dt * 9);
    if (game.stats.fired > shot) { recoil = 1; shot = game.stats.fired; }
    if (tier > previousTier) {
      const x = wx(game.cannonX) + curve(0);
      burst(x, 0.6, 0, 0xffd33c, 45, 1.5); ring(x, 0, 0xffdb39, 3); previousTier = tier;
    }
    cannon.forEach((value, i) => {
      value.group.visible = i < tier;
      const row = Math.floor(i / 3), columns = Math.min(3, tier - row * 3);
      value.group.position.set(wx(game.cannonX) + curve(row * 1.05) + (i % 3 - (columns - 1) / 2) * 1.1, 0.02, row * 1.05);
      const pop = assault?.upgradeFlash ? Math.sin(Math.min(1, assault.upgradeFlash) * Math.PI) * 0.1 : 0;
      value.group.scale.setScalar(1.1 + pop); value.barrel.position.z = recoil * 0.22;
      value.muzzle.scale.setScalar(1 + recoil * 0.12);
    });
    batteryShadow.position.x = aimRing.position.x = wx(game.cannonX) + curve(0);
    batteryShadow.scale.x = 1.1 + Math.min(3, tier) * 0.3;
    aimRing.scale.set(1.05 + Math.min(3, tier) * 0.3, 1, 0.65);
    aimRingMaterial.opacity = game.firing ? 0.3 : 0.5;

    while (gates.length < game.gates.length) gates.push(gate(0x9e20ef, "×2"));
    gates.forEach((view, i) => {
      const value = game.gates[i]; view.group.visible = !!value; if (!value) return;
      const text = value.kind === "trap" ? "!" : `×${value.n ?? 2}`;
      if (view.value !== text) { view.label.write(text); view.value = text; }
      const slide = Math.max(assault?.advance ?? 0, Math.max(0, 1 - game.t * 2.4));
      const z = wz(value.y) - slide * 14;
      view.group.position.set(wx(value.cx) + curve(z) + slide * 6.5, 0.025, z);
      const flash = Math.min(1, value.flash * 4);
      view.group.scale.set(value.w * SX * (1 + flash * 0.015), 1 + flash * 0.08, 1);
      view.material.color.setHex(value.kind === "trap" ? 0xff274f : 0xa521ee);
      view.material.emissive.setHex(value.kind === "trap" ? 0xff274f : 0xa521ee);
      view.material.emissiveIntensity = 0.2 + flash * 0.7;
      if (flash > 0.05 && game.t > view.nextBurst) {
        burst(view.group.position.x + (random() - 0.5) * value.w * SX * 0.65, 0.9, z - 0.4, 0xb3f8ff, 7, 0.55);
        ring(view.group.position.x, z - 0.45, 0x9aefff, value.w * SX * 0.36); view.nextBurst = game.t + 0.24;
      }
    });
    bank.forEach((view, i) => {
      view.group.visible = !!assault && !game.level.assault?.practice;
      const z = -18 - i * 3.1 - entry * 0.5;
      view.group.position.set(6.72 + curve(z), 0.025, z);
      view.group.scale.set(4.8, 0.9, 1);
      const value = `×${Math.min(9, (game.gates[i % Math.max(1, game.gates.length)]?.n ?? 2) + 1 + Math.floor(i / 3))}`;
      if (view.value !== value) { view.value = value; view.label.write(value); }
    });
    pickups.forEach((view, i) => {
      const pickup = assault?.pickups[i]; view.group.visible = !!pickup;
      if (!pickup) return;
      view.group.position.set(wx(pickup.x) + curve(wz(pickup.y)), 0.03, wz(pickup.y)); view.group.scale.set(pickup.w * SX, 0.84, 1);
      view.material.emissiveIntensity = 0.4 + Math.sin(game.t * 4 + i) * 0.12;
    });

    shadowCount = 0; drawUnits(game.blue, friends, false, 0); drawUnits(game.red, enemies, true, entry);
    shadows.count = shadowCount; shadows.instanceMatrix.needsUpdate = true;
    const waiting = Math.min(12000, assault?.reserve ?? 0);
    let rear = 180;
    for (const unit of game.red) rear = Math.min(rear, unit.y);
    const reserveZ = wz(rear - 9) - entry;
    if (waiting !== reserveCount || encounter !== reserveEncounter) {
      reserveCount = waiting; reserveEncounter = encounter; reserves.count = waiting;
      for (let i = 0; i < waiting; i++) {
        const column = i % 25, row = Math.floor(i / 25);
        const z = -row * 0.39 + Math.cos(i * 9.7) * 0.09;
        dummy.position.set(-8.15 + column * 0.366 + Math.sin(i * 13.1) * 0.12 + curve(z + reserveZ), 0.02, z);
        dummy.rotation.set(0, Math.PI, 0); dummy.scale.setScalar(0.72); dummy.updateMatrix(); reserves.setMatrixAt(i, dummy.matrix);
      }
      reserves.instanceMatrix.needsUpdate = true;
    }
    reserves.position.z = reserveZ;
    ensureBosses(game.bases.length);
    bosses.forEach((view, i) => {
      const base = game.bases[i];
      if (!base) { view.art.group.visible = view.distant.visible = view.label.sprite.visible = view.bar.visible = false; return; }
      const active = i === encounter;
      let z = active ? wz(base.y) - entry : -49 - Math.max(0, i - encounter - 1) * 27 - entry;
      let x = wx(base.x) + curve(z);
      if (base.hp <= 0 && view.hp > 0) { view.deathX = view.art.group.position.x; view.deathZ = view.art.group.position.z; view.deathTravel = travel; }
      if (base.hp <= 0) { x = view.deathX; z = view.deathZ + travel - view.deathTravel; }
      if (view.hp >= 0 && base.hp < view.hp && base.hp > 0 && game.t > view.damageAt + 0.12) {
        burst(x, 2.4, z + 1.3, 0xffe074, 8, 1.1); view.damageAt = game.t; shake = Math.max(shake, 0.25);
      }
      if (base.hp <= 0 && view.hp > 0) { view.deadAt = frameTime; burst(x, 2, z, 0xffbf4d, 85, 2.3); ring(x, z, 0xffd34c, 6); tag("BOSS DOWN", x, z, "#ffe570"); shake = 1.7; }
      if (view.hp !== base.hp) { view.label.write(game.level.assault?.practice ? "PRACTICE" : `${Math.max(0, Math.ceil(base.hp))}`); view.hp = base.hp; }
      const death = base.hp <= 0 ? Math.min(1, (frameTime - view.deadAt) / 0.65) : 0;
      view.art.group.visible = (active && base.hp > 0) || death < 1 && base.hp <= 0;
      view.distant.visible = !active && base.hp > 0;
      view.distant.position.set(x, 0, z); view.distant.scale.setScalar(1.25);
      view.label.sprite.visible = view.bar.visible = base.hp > 0;
      view.art.group.position.set(x, -death * 2, z);
      view.art.group.scale.setScalar((active ? 1.16 : 1.25) * (1 - death * 0.65));
      view.art.group.rotation.z = death * -1.3;
      if (view.art.group.visible) view.art.animate(game.t + i * 2.3, base.hitFlash, active ? Math.max(warning, pulse) : 0);
      view.label.sprite.position.set(x, 10.05, z); view.bar.position.set(x, 8.9, z);
      const fraction = Math.max(0, base.hp / base.maxHp); view.fill.scale.x = 5.15 * fraction; view.fill.position.x = -2.575 * (1 - fraction);
    });

    for (const pop of game.pops) {
      if (seenPops.has(pop)) continue; seenPops.add(pop);
      const z = wz(pop.y), x = wx(pop.x) + curve(z);
      if (pop.text?.includes("UPGRADE")) continue;
      burst(x, 0.5, z, [0xb5efff, 0xffb65e, 0xff426a][pop.color] ?? 0xffffff, pop.text ? 9 : 4, 0.65);
      if (pop.text && !pop.text.startsWith("×")) tag(pop.text, x, z, "#fff3b4");
    }
    if (game.status === "won" && previousStatus !== "won") { winAt = frameTime; shake = 0.75; }
    if (winAt > 0 && frameTime - winAt < 2.8 && random() > 0.55) burst((random() - 0.5) * 16, 11, -8 - random() * 18, BLUE, 14, 0.7, true);
    previousStatus = game.status;
    let particleCount = 0;
    for (let i = particleList.length - 1; i >= 0; i--) {
      const value = particleList[i]; value.life -= dt;
      if (value.life <= 0) { particleList.splice(i, 1); continue; }
      value.x += value.vx * dt; value.y += value.vy * dt; value.z += value.vz * dt; value.vy -= 12 * dt;
      if (value.y < 0.07) { value.y = 0.07; value.vy *= -0.35; }
      dummy.position.set(value.x, value.y, value.z); dummy.rotation.set(value.spin + frameTime * 4, value.spin, frameTime * 5);
      dummy.scale.setScalar(value.size * Math.min(1, value.life / 0.18)); dummy.updateMatrix(); particles.setMatrixAt(particleCount, dummy.matrix); particles.setColorAt(particleCount++, color.setHex(value.color));
    }
    particles.count = particleCount; particles.instanceMatrix.needsUpdate = true; if (particles.instanceColor) particles.instanceColor.needsUpdate = true;
    rings.forEach((value) => { value.age += dt * 2.8; value.object.visible = value.age < 1; value.material.opacity = Math.max(0, 0.55 * (1 - value.age)); value.object.scale.setScalar(0.3 + value.age * value.max); });
    tags.forEach((value) => { value.age += dt; value.sprite.visible = value.age < 0.85; value.sprite.position.y = value.y + value.age * 2; value.sprite.material.opacity = Math.max(0, 1 - value.age / 0.85); });
    // Crowds use inexpensive soft contact shadows. The slower-moving scenery
    // shadow map can be refreshed at 15 Hz without repeating its draw calls
    // for every animation frame on a phone.
    if (frameTime >= shadowAt) { renderer.shadowMap.needsUpdate = true; shadowAt = frameTime + 1 / 15; }
    updateCamera(); renderer.render(scene, camera);
  }
  function resize(width: number, height: number) {
    camera.aspect = width / height;
    // Preserve the full aiming lane on a phone without shrinking the fighters.
    const depth = cameraHome.length();
    camera.fov = Math.max(40, THREE.MathUtils.radToDeg(2 * Math.atan(10.6 / (depth * camera.aspect))));
    camera.updateProjectionMatrix(); renderer.setSize(width, height, false); updateCamera();
  }
  resize(canvas.clientWidth || 390, canvas.clientHeight || 844);
  return {
    render, resize,
    aimX(normalizedX: number) {
      const target = normalizedX * 2 - 1;
      let low = 0, high = W;
      for (let i = 0; i < 12; i++) {
        const middle = (low + high) / 2;
        projected.set(wx(middle) + curve(0), 0, -travel).project(camera);
        if (projected.x < target) low = middle; else high = middle;
      }
      return (low + high) / 2;
    },
    dispose() {
      cannon.forEach((value) => value.dispose()); bosses.forEach((value) => value.art.dispose());
      geometries.forEach((value) => value.dispose()); materials.forEach((value) => value.dispose()); textures.forEach((value) => value.dispose()); renderer.dispose();
    },
  };
}
