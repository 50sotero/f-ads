import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { CANNON_Y, MAX_UNITS, W, cannonBarrelPositions, surgeActive, weaponForLevel, type Game, type Unit } from "./engine";
import { createHordeGeometry, createMobGeometry, createSiegeCannon, createWarden } from "./assaultArt";

// The simulation uses a moving local battlefield. The long road and bridges
// stay in world space while the camera follows each new encounter's arena.
const SX = 0.052, SZ = 0.115;
const wx = (x: number) => (x - W / 2) * SX;
// Keep an open firing apron, then compress the gate corridor in perspective.
const wz = (y: number) => y >= 510 ? (y - CANNON_Y) * SZ : (510 - CANNON_Y) * SZ + (y - 510) * 0.07;
const BLUE = 0x008fff, RED = 0xf00c2d;
type Particle = { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; size: number; color: number };
type Label = { sprite: THREE.Sprite; write: (text: string, fill?: string) => void };
type GateView = { group: THREE.Group; panel: THREE.Mesh; material: THREE.MeshStandardMaterial; label: Label; value: string; nextBurst: number; brokenAt: number };

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
  const cameraHome = new THREE.Vector3(8, 40, 26);
  const cameraTarget = new THREE.Vector3(-1.8, 0, -15);
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
  const sand = standard(0xbbbdc5);
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
  skyGradient.addColorStop(0, "#dce6f5"); skyGradient.addColorStop(0.55, "#eef0f6"); skyGradient.addColorStop(1, "#bec4d1");
  skyContext.fillStyle = skyGradient; skyContext.fillRect(0, 0, 4, 256);
  const sky = texture(new THREE.CanvasTexture(skyCanvas)); sky.colorSpace = THREE.SRGBColorSpace; scene.background = sky;
  scene.add(new THREE.HemisphereLight(0xe6f3ff, 0x858497, 1.75));
  const sun = new THREE.DirectionalLight(0xffffff, 3.3);
  sun.position.set(-25, 45, -12); sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024); sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.08;
  Object.assign(sun.shadow.camera, { left: -24, right: 24, top: 42, bottom: -42, near: 1, far: 130 });
  scene.add(sun, sun.target);

  // A restrained, fine-grained road texture keeps the enormous crowd readable.
  const roadCanvas = document.createElement("canvas"); roadCanvas.width = 256; roadCanvas.height = 256;
  const roadContext = roadCanvas.getContext("2d")!;
  roadContext.fillStyle = "#b6afb6"; roadContext.fillRect(0, 0, 256, 256);
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
    box(scenery, dark, side * 9.65, 0.45, -4, 0.62, 1.1, 32);
    box(scenery, metal, side * 9.65, 1.03, -4, 0.74, 0.14, 32);
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
  box(arena, roadMaterial, 0, -0.09, -91.2, 140, 0.2, 143).castShadow = false;
  for (const side of [-1, 1]) {
    box(arena, dark, side * 39.5, 0.5, -19.7, 58, 1.2, 0.6);
    box(arena, metal, side * 39.5, 1.12, -19.7, 58, 0.14, 0.76);
  }
  // Divider walls give the +1 lane and the weapon lane a physical boundary.
  const dividers = new THREE.Group(); stage.add(dividers);
  for (const side of [-1, 1]) {
    box(dividers, dark, side * 4.5, 0.65, -15.1, 0.42, 1.36, 9.2);
    box(dividers, metal, side * 4.5, 1.34, -15.1, 0.51, 0.13, 9.2);
    const shoulder = box(dividers, dark, side * 7.1, 0.65, -19.5, 5.5, 1.36, 0.5);
    shoulder.rotation.y = side * -0.16;
  }
  bake(arena); bake(dividers);
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
  const worldBends = bendables(road, -112);
  const stageBends = [...bendables(scenery), ...bendables(arena), ...bendables(dividers)];
  function bendGeometry(parts: Bendable[], offset = 0) {
    for (const part of parts) {
      const attribute = part.geometry.attributes.position;
      for (let i = 0; i < attribute.count; i++) attribute.setX(i, part.original[i * 3] + worldCurve(part.original[i * 3 + 2] + part.offset + offset));
      attribute.needsUpdate = true; part.geometry.computeBoundingSphere();
    }
  }

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
    const material = standard(color, { emissive: color, emissiveIntensity: 0.12, transparent: true, opacity: 0.7, roughness: 0.3, depthWrite: false });
    const frameMaterial = standard(color, { roughness: 0.32 });
    const panel = box(group, material, 0, 1.18, 0, 1, 2.25, 0.18); panel.castShadow = false;
    box(group, frameMaterial, 0, 0.13, 0, 1.04, 0.24, 0.48);
    for (const x of [-0.51, 0.51]) box(group, frameMaterial, x, 1.25, 0, 0.038, 2.75, 0.4);
    const label = makeLabel(text, 0.74, 2.08, "#ffffff", 151);
    const lettering = new THREE.Mesh(geo(new THREE.PlaneGeometry(0.8, 2.15)), mat(new THREE.MeshBasicMaterial({ map: label.sprite.material.map, transparent: true, depthWrite: false, toneMapped: false })));
    lettering.position.set(0, 1.28, 0.13); group.add(lettering);
    if (!castShadow) group.traverse((object) => { object.castShadow = false; });
    bake(group);
    return { group, panel, material, label, value: text, nextBurst: 0, brokenAt: -1 };
  }
  const gates: GateView[] = [];
  const pickups = Array.from({ length: 10 }, () => gate(0x019bff, "+1"));
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
    value.group.traverse((object) => { object.castShadow = false; }); stage.add(value.group);
    return { ...value, shots: 0, recoil: 0 };
  });

  function targetChest() {
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
    bake(group);
    return { group, count, lacquer };
  }
  const weaponChest = targetChest(), cannonChest = targetChest();
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
  const warningMaterial = basic(0xff543b, { transparent: true, opacity: 0, depthWrite: false });
  const warningRing = mesh(stage, aimRingGeometry, warningMaterial, 0, 0.045, -18, 4, 1, 2.5); warningRing.castShadow = false;
  const rushMaterial = basic(0xff374b, { transparent: true, opacity: 0, depthWrite: false });
  const rushEdges = [-1, 1].map((side) => { const edge = box(stage, rushMaterial, side * 9.05, 0.02, -8, 0.18, 0.02, 23); edge.castShadow = false; return edge; });

  const animationTime = { value: 0 };
  function crowdMaterial(color: number) {
    const material = standard(color, { roughness: 0.44, vertexColors: true });
    material.onBeforeCompile = (shader) => {
      shader.uniforms.runTime = animationTime;
      shader.vertexShader = `uniform float runTime; attribute float faceMask; attribute float stridePart; attribute vec4 runMotion; varying float vFaceMask; varying float vGateGlow;\n${shader.vertexShader}`.replace("#include <beginnormal_vertex>", `
        #include <beginnormal_vertex>
        float cadence = 17.0 + sin(runMotion.x * 3.7) * 1.4;
        float stride = sin(runTime * cadence + runMotion.x) * runMotion.y;
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
          float flowingZ = -mod(-rowZ - runTime * 0.55, 60.48);
          float scaleSquared = dot(instanceMatrix[2].xyz, instanceMatrix[2].xyz);
          transformed.xz += vec2(instanceMatrix[0].z, instanceMatrix[2].z) * (flowingZ - rowZ) / scaleSquared;
        }
      `);
      shader.fragmentShader = `varying float vFaceMask; varying float vGateGlow;\n${shader.fragmentShader}`.replace("#include <color_fragment>", `
        #include <color_fragment>
        diffuseColor.rgb = mix(diffuseColor.rgb, vColor.rgb, vFaceMask);
      `).replace("#include <opaque_fragment>", `
        float rim = pow(1.0 - max(0.0, dot(normal, normalize(vViewPosition))), 1.6);
        outgoingLight += vec3(0.18, 0.9, 1.5) * vGateGlow * (0.3 + rim * 1.8);
        #include <opaque_fragment>
      `);
    };
    material.customProgramCacheKey = () => "arena-run-reserve-flow-v7"; return material;
  }
  const mobGeometry = geo(createMobGeometry()), reserveGeometry = geo(createHordeGeometry());
  const friendMaterial = crowdMaterial(BLUE), enemyMaterial = crowdMaterial(RED);
  const friends = new THREE.InstancedMesh(geo(mobGeometry.clone()), friendMaterial, MAX_UNITS + 32);
  const enemies = new THREE.InstancedMesh(geo(mobGeometry.clone()), enemyMaterial, 1600);
  // Twelve thousand silhouettes already cover the visible reserve field;
  // deeper rows sit above the viewport and would only add vertex work.
  const reserves = new THREE.InstancedMesh(reserveGeometry, enemyMaterial, 12000);
  for (const object of [friends, enemies, reserves]) {
    object.frustumCulled = false; object.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    object.geometry.setAttribute("runMotion", new THREE.InstancedBufferAttribute(new Float32Array(object.instanceMatrix.count * 4), 4).setUsage(THREE.DynamicDrawUsage));
    stage.add(object);
  }
  const shadowSource = document.createElement("canvas"); shadowSource.width = shadowSource.height = 32;
  const shadowContext = shadowSource.getContext("2d")!;
  const shadowGradient = shadowContext.createRadialGradient(16, 16, 2, 16, 16, 16);
  shadowGradient.addColorStop(0, "rgba(35,18,38,.40)"); shadowGradient.addColorStop(1, "rgba(35,18,38,0)");
  shadowContext.fillStyle = shadowGradient; shadowContext.fillRect(0, 0, 32, 32);
  const shadowMaterial = basic(0xffffff, { map: texture(new THREE.CanvasTexture(shadowSource)), transparent: true, depthWrite: false });
  const shadowGeometry = geo(new THREE.PlaneGeometry(1, 1)); shadowGeometry.rotateX(-Math.PI / 2);
  const shadows = new THREE.InstancedMesh(shadowGeometry, shadowMaterial, MAX_UNITS + 1632); shadows.frustumCulled = false; stage.add(shadows);
  const dummy = new THREE.Object3D();
  const unitWhite = new THREE.Color(0xffffff), blueChampion = new THREE.Color(0xa8f4ff), redBrute = new THREE.Color(0xffbaa1);
  const motion = new WeakMap<Unit, { x: number; y: number; time: number; angle: number; run: number; phase: number; launchedAt: number; used: number; glow: number }>();
  let unitSequence = 0;
  let shadowCount = 0;
  let hasRenderedUnits = false;
  function drawUnits(units: Unit[], object: THREE.InstancedMesh, enemy: boolean, entry: number) {
    const count = Math.min(units.length, object.instanceMatrix.count); object.count = count;
    const runMotion = object.geometry.getAttribute("runMotion") as THREE.InstancedBufferAttribute;
    const matrices = object.instanceMatrix.array, shadowMatrices = shadows.instanceMatrix.array;
    for (let i = 0; i < count; i++) {
      const unit = units[i];
      const size = unit.big ? (enemy ? 1.8 : 2.0) : enemy ? 0.9 : 1.13;
      const z = wz(unit.y) - (enemy ? entry : 0);
      const time = currentGame?.t ?? 0;
      const state = motion.get(unit) ?? {
        x: unit.x, y: unit.y, time, angle: enemy ? Math.PI : 0, run: 1,
        phase: (unitSequence++ * 2.39996) % (Math.PI * 2),
        launchedAt: !enemy && unit.used === 0 && unit.y >= CANNON_Y - 40 ? time : -Infinity,
        used: unit.used, glow: !enemy && unit.used !== 0 && hasRenderedUnits ? 1 : 0,
      };
      // Flight ends on a clock, even if a crowd ahead blocks ground movement.
      // Position-based arcs left queued runners hovering above the muzzle.
      const flight = Math.max(0, Math.min(1, (time - state.launchedAt) / 0.34));
      const shotFlight = flight < 1 ? (1 - flight) * 0.7 + Math.sin(flight * Math.PI) * 0.65 : 0;
      const elapsed = time - state.time;
      state.glow = Math.max(0, state.glow - elapsed * 4);
      if (!enemy && unit.used !== state.used) { state.glow = 1; state.used = unit.used; }
      if (elapsed > 0) {
        const dx = (unit.x - state.x) * SX + curve(z) - curve(wz(state.y));
        const dz = wz(unit.y) - wz(state.y);
        const speed = Math.hypot(dx, dz) / elapsed;
        if (speed > 0.8) {
          const target = Math.atan2(-dx, -dz);
          const delta = Math.atan2(Math.sin(target - state.angle), Math.cos(target - state.angle));
          state.angle += delta * Math.min(1, elapsed * 14);
        }
        state.run += (Math.min(1, speed / (enemy ? 1.8 : 7)) - state.run) * Math.min(1, elapsed * 12);
      }
      state.x = unit.x; state.y = unit.y; state.time = time; motion.set(unit, state);
      const boss = currentGame?.bases[currentGame.assault?.encounter ?? 0];
      const front = currentGame?.assault?.frontline ?? boss?.y ?? 300;
      const fighting = shotFlight === 0 && state.run < 0.55 && (Math.abs(unit.y - front) < 32 || !!boss && Math.abs(unit.y - boss.y - boss.h / 2) < 25) ? (0.55 - state.run) / 0.55 : 0;
      runMotion.setXYZW(i, state.phase, shotFlight > 0 ? 0.15 : state.run, fighting, state.glow);
      const landing = flight >= 1 ? Math.max(0, 1 - (time - state.launchedAt - 0.34) / 0.12) : 0;
      const pitch = shotFlight > 0 ? -0.42 * Math.sin(flight * Math.PI) : -0.14 * state.run;
      const cy = Math.cos(state.angle), sy = Math.sin(state.angle), cp = Math.cos(pitch), sp = Math.sin(pitch);
      const popScale = 1 + Math.sin(state.glow * Math.PI) * 0.18;
      const sx = size * (1 + landing * 0.1) * popScale, syScale = size * (1 - landing * 0.16) * popScale;
      const x = wx(unit.x) + curve(z), offset = i * 16;
      // Compose yaw × forward lean directly into the instance buffer. Avoid
      // thousands of Object3D Euler/quaternion callbacks per crowded frame.
      matrices[offset] = cy * sx; matrices[offset + 1] = 0; matrices[offset + 2] = -sy * sx; matrices[offset + 3] = 0;
      matrices[offset + 4] = sy * sp * syScale; matrices[offset + 5] = cp * syScale; matrices[offset + 6] = cy * sp * syScale; matrices[offset + 7] = 0;
      matrices[offset + 8] = sy * cp * sx; matrices[offset + 9] = -sp * sx; matrices[offset + 10] = cy * cp * sx; matrices[offset + 11] = 0;
      matrices[offset + 12] = x; matrices[offset + 13] = 0.025 + shotFlight; matrices[offset + 14] = z; matrices[offset + 15] = 1;
      object.setColorAt(i, unit.big ? (enemy ? redBrute : blueChampion) : unitWhite);
      const shadowOffset = shadowCount++ * 16;
      // Contact shadows remain axis aligned; all other entries retain the
      // identity values initialized by InstancedMesh.
      shadowMatrices[shadowOffset] = size * 1.2; shadowMatrices[shadowOffset + 10] = size * 0.9;
      shadowMatrices[shadowOffset + 12] = x + 0.23 * size; shadowMatrices[shadowOffset + 13] = 0.025; shadowMatrices[shadowOffset + 14] = z + 0.12 * size;
    }
    object.instanceMatrix.needsUpdate = true;
    runMotion.needsUpdate = true;
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
  let currentGame: Game | null = null, shot = 0, shake = 0, previousTier = 1, previousWeapon = 1, winAt = -1, reserveInitialized = 0, previousTravel = -1;
  let previousStatus = "playing", frameTime = 0, shadowAt = 0, previousPulse = 0, wasRushing = false;
  const projected = new THREE.Vector3();
  function updateCamera() {
    const followX = Math.min(0, wx(currentGame?.cannonX ?? W / 2)) * 0.28;
    camera.position.copy(cameraHome); camera.position.z -= travel;
    camera.position.x += curve(0) + followX;
    camera.position.x += Math.sin(frameTime * 57) * shake * 0.09;
    camera.position.y += Math.cos(frameTime * 43) * shake * 0.06;
    camera.lookAt(cameraTarget.x + curve(cameraTarget.z) + followX, cameraTarget.y, cameraTarget.z - travel); camera.updateMatrixWorld();
    sun.position.set(-25, 45, -12 - travel); sun.target.position.set(0, 0, -20 - travel);
  }
  function render(game: Game, dt: number) {
    dt = Math.min(dt, 0.05); frameTime += dt;
    if (currentGame !== game) {
      currentGame = game; shot = game.stats.fired; previousTier = game.assault?.tier ?? 1;
      hasRenderedUnits = false;
      previousWeapon = game.assault?.weaponLevel ?? 1; crateHp = crateMax = cannonLockHp = -1;
      cannon.forEach((value, i) => { value.shots = game.assault?.barrelShots[i] ?? 0; value.recoil = 0; });
      shadowAt = 0;
      theme = game.level.assault?.theme ?? "fork"; travel = (game.assault?.travel ?? 0) * SZ;
      bridges.visible = theme === "bridge"; bendGeometry(worldBends); bendGeometry(stageBends, -travel); previousTravel = travel;
      previousStatus = "playing"; winAt = -1;
      previousPulse = 0; wasRushing = false;
      particleList.length = 0; bosses.forEach((boss) => { boss.hp = -1; boss.deadAt = -99; boss.damageAt = -99; });
      gates.forEach((value) => { value.group.visible = false; value.nextBurst = 0; value.brokenAt = -1; });
      tags.forEach((value) => { value.age = 2; }); rings.forEach((value) => { value.age = 2; });
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
      value.group.position.set(wx(game.cannonX + offset) + curve(barrelZ), 0.02, barrelZ);
      const pop = assault?.upgradeFlash ? Math.sin(Math.min(1, assault.upgradeFlash) * Math.PI) * 0.1 : 0;
      value.group.scale.set(1.18 + pop, 1.3 + pop, 1.85 + pop); value.barrel.position.z = -0.08 + value.recoil * 0.18;
      value.barrel.rotation.y = Math.asin(THREE.MathUtils.clamp((curve(0) - curve(wz(CANNON_Y - 22))) / 1.3585, -0.4, 0.4));
      value.rotor.rotation.z += dt * (game.firing ? 22 : 2);
      value.muzzle.scale.setScalar(1 + value.recoil * 0.12);
      if (barrelFired && i < tier) burst(wx(game.cannonX + offset) + curve(barrelZ - 2.1), 0.96, barrelZ - 2.1, weaponLevel === 2 ? 0xffe09d : 0xd9ffff, 3, 0.25);
    });
    batteryShadow.position.x = aimRing.position.x = wx(game.cannonX) + curve(0);
    batteryShadow.scale.x = 0.9 + tier * 0.6;
    aimRing.scale.set(0.75 + tier * 0.6, 1, 1);
    aimRingMaterial.opacity = game.firing ? 0.3 : 0.5;

    while (gates.length < game.gates.length) gates.push(gate(0x9e20ef, "×2"));
    gates.forEach((view, i) => {
      const value = game.gates[i]; view.group.visible = !!value; if (!value) return;
      const text = value.kind === "trap" ? "!" : `×${value.n ?? 2}`;
      if (view.value !== text) { view.label.write(text); view.value = text; }
      const z = wz(value.y);
      view.group.position.set(wx(value.cx) + curve(z), 0.025, z);
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
      view.material.color.setHex(value.kind === "trap" ? 0xff274f : 0xa521ee);
      view.material.emissive.setHex(value.kind === "trap" ? 0xff274f : 0xa521ee);
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
      view.group.position.set(wx(pickup.x) + curve(wz(pickup.y)), 0.03, wz(pickup.y)); view.group.scale.set(pickup.w * SX, 0.84, 1);
      view.material.emissiveIntensity = 0.4 + Math.sin(game.t * 4 + i) * 0.12;
    });

    shadowCount = 0; drawUnits(game.blue, friends, false, 0); drawUnits(game.red, enemies, true, entry);
    hasRenderedUnits = true;
    shadows.count = shadowCount; shadows.instanceMatrix.needsUpdate = true;
    const waiting = Math.min(reserves.instanceMatrix.count, (assault?.reserve ?? 0) * 2);
    const reserveZ = -21.2 - entry;
    reserves.count = waiting;
    // Reserve formations are immutable local instances. Reuse their buffers
    // when the count shrinks or the camera travels to the next giant.
    if (waiting > reserveInitialized) {
      const columns = 150;
      const reserveMotion = reserves.geometry.getAttribute("runMotion") as THREE.InstancedBufferAttribute;
      for (let i = reserveInitialized; i < waiting; i++) {
        const column = i % columns, row = Math.floor(i / columns);
        const x = (column - (columns - 1) / 2) * 0.43 + Math.sin(i * 13.1) * 0.055;
        const z = -row * 0.72 - Math.cos(i * 9.7) * 0.06;
        // A shallow curve makes the waiting horde feed into the central throat.
        const front = -Math.max(0, 1 - Math.abs(x) / 5) * 1.7;
        dummy.position.set(x, 0.02, z + front);
        dummy.rotation.set(0, Math.PI + Math.sin(i * 2.3) * 0.07, 0); dummy.scale.setScalar(0.79); dummy.updateMatrix(); reserves.setMatrixAt(i, dummy.matrix);
        reserveMotion.setXYZW(i, i * 2.39996, 0.6, 0, -1);
      }
      reserveInitialized = waiting;
      reserves.instanceMatrix.needsUpdate = true; reserveMotion.needsUpdate = true;
    }
    reserves.position.z = reserveZ;
    ensureBosses(game.bases.length);
    bosses.forEach((view, i) => {
      const base = game.bases[i];
      if (!base) { view.art.group.visible = view.distant.visible = view.label.sprite.visible = view.bar.visible = false; return; }
      const active = i === encounter;
      let z = active ? wz(base.y) - entry : -49 - Math.max(0, i - encounter - 1) * 27 - entry;
      let x = wx(base.x) + curve(z);
      const waitingSide = i % 2 ? 9 : -8;
      if (!active && base.hp > 0) x += waitingSide + Math.sin(game.t * 0.35 + i) * 0.6;
      else if (active && (assault?.advance ?? 0) > 0) x += waitingSide * (assault?.advance ?? 0);
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
      view.distant.position.set(x, Math.abs(Math.sin(game.t * 2.1 + i)) * 0.12, z); view.distant.scale.setScalar(1.5);
      view.distant.rotation.z = Math.sin(game.t * 2.1 + i) * 0.018;
      view.label.sprite.visible = view.bar.visible = base.hp > 0;
      view.art.group.position.set(x, -death * 2, z);
      view.art.group.scale.setScalar((active ? 1.65 : 1.5) * (1 - death * 0.65));
      view.art.group.rotation.z = death * -1.3;
      if (view.art.group.visible) view.art.animate(game.t + i * 2.3, base.hitFlash, active ? Math.max(warning, pulse) : 0);
      view.label.sprite.position.set(x, 8.15, z); view.bar.position.set(x, 7.7, z);
      const fraction = Math.max(0, base.hp / base.maxHp); view.fill.scale.x = 5.15 * fraction; view.fill.position.x = -2.575 * (1 - fraction);
    });

    for (const pop of game.pops) {
      if (seenPops.has(pop)) continue; seenPops.add(pop);
      const z = wz(pop.y), x = wx(pop.x) + curve(z);
      if (pop.text?.includes("UPGRADE")) continue;
      burst(x, 0.5, z, [0xf4fbff, 0xe9edee, 0xff426a][pop.color] ?? 0xffffff, pop.text ? 9 : 4, pop.text ? 0.65 : 0.9);
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
    camera.fov = Math.max(40, THREE.MathUtils.radToDeg(2 * Math.atan(8.3 / (depth * camera.aspect))));
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
        const followDelta = (Math.min(0, wx(middle)) - Math.min(0, wx(currentGame?.cannonX ?? W / 2))) * 0.28;
        projected.set(wx(middle) + curve(0) - followDelta, 0, -travel).project(camera);
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
