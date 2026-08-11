import * as THREE from 'three';

export interface SceneSettings {
  treeCount: number;
  unitCount: number;
  snowCount: number;
  shadows: boolean;
}

export interface SnowVillage {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  sun: THREE.DirectionalLight;
  update: (dt: number, elapsed: number) => void;
  reset: () => void;
  applySettings: (settings: SceneSettings) => void;
}

const SEED = 0x51f15e;

function randomFactory(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function material(color: THREE.ColorRepresentation, roughness = 0.85, emissive?: THREE.ColorRepresentation): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness: 0.02,
    emissive: emissive ?? 0x000000,
    emissiveIntensity: emissive ? 1.2 : 0,
  });
}

function shadow(object: THREE.Object3D, cast = true, receive = true): void {
  object.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.castShadow = cast;
      child.receiveShadow = receive;
    }
  });
}

function createCabin(x: number, z: number, rotation: number, scale = 1): THREE.Group {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.rotation.y = rotation;
  group.scale.setScalar(scale);
  const walls = new THREE.Mesh(new THREE.BoxGeometry(5.5, 3.3, 4.4), material(0x694633));
  walls.position.y = 1.7;
  const roof = new THREE.Mesh(new THREE.ConeGeometry(4.25, 2.2, 4), material(0x273743));
  roof.position.y = 4.15;
  roof.rotation.y = Math.PI / 4;
  roof.scale.z = 0.82;
  const snowCap = new THREE.Mesh(new THREE.ConeGeometry(4.34, 0.38, 4), material(0xeaf5fa));
  snowCap.position.y = 5.12;
  snowCap.rotation.y = Math.PI / 4;
  snowCap.scale.z = 0.82;
  const door = new THREE.Mesh(new THREE.BoxGeometry(1.25, 2.25, 0.18), material(0x30231d));
  door.position.set(0, 1.16, 2.28);
  const windowMat = material(0xffa646, 0.45, 0xff7b21);
  const windowLeft = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.8, 0.2), windowMat);
  windowLeft.position.set(-1.65, 2.05, 2.3);
  const windowRight = windowLeft.clone();
  windowRight.position.x = 1.65;
  const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.75, 2.4, 0.75), material(0x443b39));
  chimney.position.set(1.8, 4.5, -0.8);
  group.add(walls, roof, snowCap, door, windowLeft, windowRight, chimney);
  shadow(group);
  return group;
}

function createTent(x: number, z: number, rotation: number): THREE.Group {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.rotation.y = rotation;
  const canvas = new THREE.Mesh(new THREE.ConeGeometry(3.2, 4.8, 5), material(0x9a7250));
  canvas.position.y = 2.35;
  const cap = new THREE.Mesh(new THREE.ConeGeometry(3.26, 0.28, 5), material(0xf2f7f7));
  cap.position.y = 4.62;
  const door = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 2.1), material(0x322923));
  door.position.set(0, 1.1, 2.62);
  group.add(canvas, cap, door);
  shadow(group);
  return group;
}

function createWarehouse(): THREE.Group {
  const group = createCabin(11, -8, -0.3, 1.25);
  const sign = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.75, 0.2), material(0x3d2d25));
  sign.position.set(0, 3.1, 2.85);
  group.add(sign);
  return group;
}

export function createSnowVillage(): SnowVillage {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9bb5c4);
  scene.fog = new THREE.FogExp2(0xaec2cd, 0.0125);

  const camera = new THREE.PerspectiveCamera(48, innerWidth / innerHeight, 0.1, 180);
  const defaultPosition = new THREE.Vector3(34, 30, 40);
  camera.position.copy(defaultPosition);
  camera.lookAt(0, 3, 0);

  const hemisphere = new THREE.HemisphereLight(0xc8e8ff, 0x32404a, 2.1);
  const sun = new THREE.DirectionalLight(0xfff1d1, 3.5);
  sun.position.set(-24, 38, 18);
  sun.castShadow = true;
  sun.shadow.camera.left = -42;
  sun.shadow.camera.right = 42;
  sun.shadow.camera.top = 42;
  sun.shadow.camera.bottom = -42;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 100;
  sun.shadow.bias = -0.0004;
  scene.add(hemisphere, sun);

  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(68, 72),
    material(0xddebef, 0.98),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const terrain = new THREE.Group();
  const moundMaterial = material(0xcbdde4, 1);
  const rand = randomFactory(SEED);
  for (let index = 0; index < 22; index += 1) {
    const mound = new THREE.Mesh(new THREE.SphereGeometry(4 + rand() * 5, 10, 6), moundMaterial);
    const angle = rand() * Math.PI * 2;
    const radius = 34 + rand() * 25;
    mound.position.set(Math.cos(angle) * radius, -3.2 - rand() * 2, Math.sin(angle) * radius);
    mound.scale.y = 0.45;
    mound.receiveShadow = true;
    terrain.add(mound);
  }
  scene.add(terrain);

  const buildings = new THREE.Group();
  buildings.add(
    createCabin(-12, -7, 0.55),
    createCabin(-14, 7, 1.1, 0.9),
    createCabin(8, 11, 3.55, 0.92),
    createWarehouse(),
    createTent(-3, 15, 2.8),
    createTent(17, 5, 4.2),
  );
  scene.add(buildings);

  const fireGroup = new THREE.Group();
  const fireLight = new THREE.PointLight(0xff8a32, 44, 24, 1.8);
  fireLight.position.y = 3.1;
  const flame = new THREE.Mesh(new THREE.ConeGeometry(1.15, 3.4, 7), material(0xff8b25, 0.3, 0xff5519));
  flame.position.y = 1.65;
  const ember = new THREE.Mesh(new THREE.ConeGeometry(0.62, 2.5, 7), material(0xffe080, 0.25, 0xffb22b));
  ember.position.y = 1.55;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(2, 0.42, 6, 14), material(0x56616a));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.25;
  fireGroup.add(fireLight, flame, ember, ring);
  shadow(fireGroup);
  scene.add(fireGroup);

  const props = new THREE.Group();
  const crateMat = material(0x795239);
  const crateGeometry = new THREE.BoxGeometry(1.7, 1.7, 1.7);
  const crates = new THREE.InstancedMesh(crateGeometry, crateMat, 28);
  const dummy = new THREE.Object3D();
  for (let index = 0; index < 28; index += 1) {
    const angle = rand() * Math.PI * 2;
    const radius = 18 + rand() * 20;
    dummy.position.set(Math.cos(angle) * radius, 0.85, Math.sin(angle) * radius);
    dummy.rotation.set(0, rand() * Math.PI, 0);
    dummy.scale.setScalar(0.75 + rand() * 0.45);
    dummy.updateMatrix();
    crates.setMatrixAt(index, dummy.matrix);
  }
  crates.castShadow = true;
  crates.receiveShadow = true;
  props.add(crates);

  const fenceGeometry = new THREE.BoxGeometry(0.28, 1.45, 3.6);
  const fences = new THREE.InstancedMesh(fenceGeometry, material(0x5c493b), 34);
  for (let index = 0; index < 34; index += 1) {
    const angle = (index / 34) * Math.PI * 2;
    const radius = 28 + Math.sin(index * 2.1) * 1.8;
    dummy.position.set(Math.cos(angle) * radius, 0.72, Math.sin(angle) * radius);
    dummy.rotation.set(0, -angle, index % 5 === 0 ? 0.12 : 0);
    dummy.scale.set(1, 1, index % 7 === 0 ? 0.35 : 1);
    dummy.updateMatrix();
    fences.setMatrixAt(index, dummy.matrix);
  }
  fences.castShadow = true;
  fences.receiveShadow = true;
  props.add(fences);

  const rocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), material(0x65727a), 36);
  for (let index = 0; index < 36; index += 1) {
    const angle = rand() * Math.PI * 2;
    const radius = 20 + rand() * 38;
    dummy.position.set(Math.cos(angle) * radius, 0.35, Math.sin(angle) * radius);
    dummy.rotation.set(rand() * 0.4, rand() * Math.PI, rand() * 0.25);
    dummy.scale.set(0.5 + rand() * 1.25, 0.45 + rand() * 0.8, 0.5 + rand() * 1.1);
    dummy.updateMatrix();
    rocks.setMatrixAt(index, dummy.matrix);
  }
  rocks.castShadow = true;
  rocks.receiveShadow = true;
  props.add(rocks);
  scene.add(props);

  const dynamic = new THREE.Group();
  scene.add(dynamic);
  let snow: THREE.Points | undefined;
  let snowVelocities = new Float32Array();
  let units: THREE.InstancedMesh | undefined;
  let currentSettings: SceneSettings = { treeCount: 160, unitCount: 18, snowCount: 2200, shadows: true };

  function rebuildDynamic(settings: SceneSettings): void {
    dynamic.traverse((object) => {
      if (!(object instanceof THREE.Mesh || object instanceof THREE.Points)) return;
      object.geometry.dispose();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach((item) => item.dispose());
    });
    dynamic.clear();
    const seeded = randomFactory(SEED);

    const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.22, 0.34, 2.2, 5), material(0x4a3529), settings.treeCount);
    const foliage = new THREE.InstancedMesh(new THREE.ConeGeometry(1.65, 5.5, 7), material(0x183f3d), settings.treeCount);
    const snowLayer = new THREE.InstancedMesh(new THREE.ConeGeometry(1.72, 0.8, 7), material(0xe6f2f5), settings.treeCount);
    for (let index = 0; index < settings.treeCount; index += 1) {
      const angle = seeded() * Math.PI * 2;
      const radius = 31 + seeded() * 30;
      const scale = 0.68 + seeded() * 0.78;
      dummy.position.set(Math.cos(angle) * radius, 1.1 * scale, Math.sin(angle) * radius);
      dummy.rotation.set(0, seeded() * Math.PI, 0);
      dummy.scale.set(scale, scale, scale);
      dummy.updateMatrix();
      trunk.setMatrixAt(index, dummy.matrix);
      dummy.position.y = 3.65 * scale;
      dummy.updateMatrix();
      foliage.setMatrixAt(index, dummy.matrix);
      dummy.position.y = 5.85 * scale;
      dummy.scale.set(scale * 0.75, scale, scale * 0.75);
      dummy.updateMatrix();
      snowLayer.setMatrixAt(index, dummy.matrix);
    }
    [trunk, foliage, snowLayer].forEach((mesh) => {
      mesh.castShadow = settings.shadows;
      mesh.receiveShadow = settings.shadows;
      dynamic.add(mesh);
    });

    const unitGeometry = new THREE.CapsuleGeometry(0.42, 1.05, 3, 6);
    units = new THREE.InstancedMesh(unitGeometry, material(0x395c73), settings.unitCount);
    for (let index = 0; index < settings.unitCount; index += 1) {
      const angle = (index / Math.max(1, settings.unitCount)) * Math.PI * 2;
      dummy.position.set(Math.cos(angle) * (6 + (index % 3) * 2.8), 1.1, Math.sin(angle) * (6 + (index % 3) * 2.8));
      dummy.rotation.set(0, -angle, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      units.setMatrixAt(index, dummy.matrix);
      units.setColorAt(index, new THREE.Color(index % 3 === 0 ? 0x944c3d : index % 3 === 1 ? 0x355d73 : 0x727d49));
    }
    units.castShadow = settings.shadows;
    dynamic.add(units);

    const snowGeometry = new THREE.BufferGeometry();
    const positions = new Float32Array(settings.snowCount * 3);
    snowVelocities = new Float32Array(settings.snowCount);
    for (let index = 0; index < settings.snowCount; index += 1) {
      positions[index * 3] = (seeded() - 0.5) * 100;
      positions[index * 3 + 1] = seeded() * 45;
      positions[index * 3 + 2] = (seeded() - 0.5) * 100;
      snowVelocities[index] = 2.6 + seeded() * 3.8;
    }
    snowGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    snow = new THREE.Points(snowGeometry, new THREE.PointsMaterial({ color: 0xffffff, size: 0.22, transparent: true, opacity: 0.82, depthWrite: false }));
    dynamic.add(snow);
  }

  function applySettings(settings: SceneSettings): void {
    currentSettings = { ...settings };
    sun.castShadow = settings.shadows;
    buildings.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.castShadow = settings.shadows;
        object.receiveShadow = settings.shadows;
      }
    });
    rebuildDynamic(settings);
  }

  function update(dt: number, elapsed: number): void {
    flame.scale.y = 0.88 + Math.sin(elapsed * 12) * 0.1;
    flame.rotation.y = elapsed * 0.7;
    ember.scale.setScalar(0.92 + Math.sin(elapsed * 16) * 0.08);
    fireLight.intensity = 43 + Math.sin(elapsed * 11) * 5;

    if (units) {
      for (let index = 0; index < currentSettings.unitCount; index += 1) {
        const angle = (index / Math.max(1, currentSettings.unitCount)) * Math.PI * 2 + elapsed * (0.09 + (index % 4) * 0.008);
        const radius = 6 + (index % 3) * 2.8;
        dummy.position.set(Math.cos(angle) * radius, 1.08 + Math.sin(elapsed * 4 + index) * 0.08, Math.sin(angle) * radius);
        dummy.rotation.set(0, -angle + Math.PI / 2, 0);
        dummy.scale.setScalar(1);
        dummy.updateMatrix();
        units.setMatrixAt(index, dummy.matrix);
      }
      units.instanceMatrix.needsUpdate = true;
    }

    if (snow) {
      const attribute = snow.geometry.getAttribute('position') as THREE.BufferAttribute;
      const array = attribute.array as Float32Array;
      for (let index = 0; index < currentSettings.snowCount; index += 1) {
        const yIndex = index * 3 + 1;
        const xIndex = index * 3;
        array[yIndex] = (array[yIndex] ?? 0) - (snowVelocities[index] ?? 3) * dt;
        array[xIndex] = (array[xIndex] ?? 0) + Math.sin(elapsed + index * 0.7) * dt * 0.35;
        if ((array[yIndex] ?? 0) < 0) array[yIndex] = 45;
      }
      attribute.needsUpdate = true;
    }
  }

  function reset(): void {
    camera.position.copy(defaultPosition);
    camera.lookAt(0, 3, 0);
  }

  applySettings(currentSettings);
  return { scene, camera, sun, update, reset, applySettings };
}
