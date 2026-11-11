import * as THREE from "three";
import { mat, box, cyl, sph } from "../core/utils.js";
import { scene } from "../core/state.js";
import { mergeStaticChildren } from "../world/staticBatch.js";
import { MON } from "../config/monsters.js";
import { maxAliveByKind } from "./waveComposition.js";
const _crownMats = [
  new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    emissive: 0x0284c7,
    emissiveIntensity: 1,
    roughness: 0.2,
    transparent: true,
    opacity: 0.85,
  }),
  new THREE.MeshStandardMaterial({
    color: 0xe0f2fe,
    emissive: 0x7dd3fc,
    emissiveIntensity: 0.9,
    roughness: 0.2,
    transparent: true,
    opacity: 0.8,
  }),
]; // splash-droplet crowns
const _crownConeGeo = new THREE.ConeGeometry(0.13, 0.5, 7),
  _crownTopGeo = new THREE.ConeGeometry(0.17, 0.66, 7);
// Marks where a monster glows; updateMonsterLights copies it into a shared light slot.
function makeGlow(color, intensity, distance) {
  const anchor = new THREE.Object3D();
  anchor.userData.glow = { color, intensity, distance, decay: 2 };
  return anchor;
}
function createMonster(kind) {
  const def = MON[kind];
  const s = def.s;
  const g = new THREE.Group();
  let glow = null;
  const bodyMat = new THREE.MeshStandardMaterial({
    color: def.body,
    roughness: 0.15,
    emissive: def.body,
    emissiveIntensity: 0.35,
    transparent: true,
    opacity: 0.92,
  }); // glossy wet look
  const body = sph(0.55, bodyMat, 0, 0.62, 0, 20, 16);
  body.scale.set(
    kind === 3 ? 0.78 : kind === 4 ? 1.12 : 1,
    kind === 3 ? 0.86 : kind === 4 ? 1.02 : 0.92,
    kind === 3 ? 1.28 : 1,
  );
  g.add(body);
  const belly = sph(
    kind === 4 ? 0.46 : 0.36,
    new THREE.MeshStandardMaterial({
      color: def.belly,
      emissive: def.belly,
      emissiveIntensity: 0.75,
      roughness: 0.4,
    }),
    0,
    0.5,
    kind === 3 ? 0.36 : 0.3,
    16,
    12,
  );
  belly.scale.set(1, 1, 0.6);
  g.add(belly);
  // splash-droplet crown: cones
  const crown = [];
  const fMats = _crownMats; // shared across all monsters
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * 6.28;
    const f = new THREE.Mesh(_crownConeGeo, fMats[i % 2]);
    f.position.set(Math.cos(a) * 0.22, 1.18, Math.sin(a) * 0.22);
    f.rotation.set(Math.sin(a) * 0.35, 0, Math.cos(a) * 0.35);
    g.add(f);
    crown.push(f);
  }
  const fTop = new THREE.Mesh(_crownTopGeo, fMats[1]);
  fTop.position.y = 1.32;
  g.add(fTop);
  crown.push(fTop);
  // eyes angry + mouth
  [-0.19, 0.19].forEach((x) => {
    const e = sph(0.085, mat(0xffffff, 0.25), x, 0.78, 0.46, 10, 10);
    g.add(e);
    g.add(sph(0.043, mat(0x1a0a00, 0.3), x, 0.77, 0.53, 8, 8));
    const brow = box(0.16, 0.04, 0.02, mat(0x3a1500, 0.8), x, 0.92, 0.5);
    brow.rotation.z = x > 0 ? 0.5 : -0.5;
    g.add(brow);
  });
  const mouth = box(0.24, 0.07, 0.02, mat(0x3a0d00, 0.8), 0, 0.5, 0.52);
  mouth.rotation.z = 0.08;
  g.add(mouth);
  // stub arms with splash hands
  const arms = [];
  [-1, 1].forEach((sd) => {
    const a = new THREE.Group();
    a.position.set(0.52 * sd, 0.7, 0);
    a.add(cyl(0.09, 0.07, 0.38, bodyMat, 0, -0.16, 0));
    const fh = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.3, 7), fMats[0]);
    fh.position.y = -0.4;
    fh.rotation.x = Math.PI;
    a.add(fh);
    a.rotation.z = sd * 0.5;
    g.add(a);
    arms.push(a);
  });
  // little dark feet
  [-0.25, 0.25].forEach((x) =>
    g.add(sph(0.14, mat(0x2b1508, 0.9), x, 0.09, 0.1, 10, 8)),
  );
  if (kind === 1) {
    glow = makeGlow(0x38bdf8, 5, 7);
    glow.position.y = 1;
    g.add(glow);
    [-1, 1].forEach((sd) => {
      const horn = new THREE.Mesh(
        new THREE.ConeGeometry(0.12, 0.5, 6),
        mat(0x3a1500, 0.8),
      );
      horn.position.set(0.42 * sd, 1.12, -0.05);
      horn.rotation.z = -sd * 0.55;
      g.add(horn);
    });
  }
  let shieldMesh = null,
    spinPart = null;
  if (kind === 3) {
    // SURFER: swept crest + speed stripes
    for (let i = 0; i < 4; i++) {
      const f = new THREE.Mesh(_crownTopGeo, _crownMats[1]);
      f.position.set(0, 1.22 - i * 0.05, 0.28 - i * 0.2);
      f.rotation.x = -0.8;
      f.scale.setScalar(0.8);
      g.add(f);
      crown.push(f);
    }
    [-1, 1].forEach((sd) =>
      g.add(box(0.02, 0.08, 0.5, mat(0xffffff, 0.4), 0.43 * sd, 0.66, 0)),
    );
  }
  if (kind === 4) {
    // GUSHER: pressure bubbles + spray nozzle on top
    [
      [-0.25, 0.75, 0.45],
      [0.28, 0.5, 0.44],
      [0, 0.88, 0.4],
    ].forEach(([x, y, z]) => {
      const c = sph(
        0.07,
        new THREE.MeshBasicMaterial({ color: 0xe0f2fe }),
        x,
        y,
        z,
        8,
        8,
      );
      g.add(c);
    });
    const nozzle = cyl(0.05, 0.07, 0.3, mat(0x94a3b8, 0.5, 0.5), 0, 1.45, 0, 8);
    g.add(nozzle);
  }
  if (kind === 5) {
    // PUDDLER: two baby heads riding on top
    [-0.27, 0.27].forEach((x) => {
      const h = sph(0.24, bodyMat, x, 1.18, 0.05, 14, 12);
      g.add(h);
      [-0.08, 0.08].forEach((ex) =>
        g.add(sph(0.04, mat(0x1a0a00, 0.3), x + ex, 1.22, 0.27, 8, 8)),
      );
      const f = new THREE.Mesh(_crownConeGeo, _crownMats[1]);
      f.position.set(x, 1.48, 0.05);
      f.scale.setScalar(0.7);
      g.add(f);
      crown.push(f);
    });
  }
  if (kind === 6) {
    // CORAL WARDEN: shell-and-coral shield carried up front
    shieldMesh = new THREE.Group();
    shieldMesh.position.set(0, 0.62, 0.58);
    const plate = box(1.0, 1.05, 0.16, mat(0xfb7185, 0.55), 0, 0, 0);
    shieldMesh.add(plate);
    shieldMesh.add(box(1.08, 0.14, 0.2, mat(0xfff1e6, 0.5), 0, 0.42, 0));
    shieldMesh.add(box(1.08, 0.14, 0.2, mat(0xfff1e6, 0.5), 0, -0.42, 0));
    const gem = sph(
      0.14,
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0xbae6fd,
        emissiveIntensity: 1,
        roughness: 0.2,
      }),
      0,
      0,
      0.12,
      10,
      8,
    );
    shieldMesh.add(gem); // pearl
    [
      [-0.34, 0.28],
      [0.34, 0.28],
      [0, -0.3],
    ].forEach(([x, y]) => {
      const spike = new THREE.Mesh(
        new THREE.ConeGeometry(0.09, 0.3, 6),
        mat(0x111827, 0.4, 0.3),
      );
      spike.position.set(x, y, 0.16);
      spike.rotation.x = Math.PI / 2;
      shieldMesh.add(spike);
    });
    g.add(shieldMesh);
  }
  if (kind === 7) {
    // RAIN SHAMAN: halo + heal staff
    const halo = new THREE.Mesh(
      new THREE.TorusGeometry(0.3, 0.045, 8, 24),
      new THREE.MeshBasicMaterial({ color: 0x4ade80 }),
    );
    halo.position.y = 1.5;
    halo.rotation.x = Math.PI / 2.5;
    g.add(halo);
    spinPart = halo;
    const staff = cyl(
      0.035,
      0.035,
      1.15,
      mat(0x5b3a22, 0.85),
      0.62,
      0.85,
      0.15,
      7,
    );
    staff.rotation.z = -0.25;
    g.add(staff);
    const orb = sph(
      0.13,
      new THREE.MeshStandardMaterial({
        color: 0x4ade80,
        emissive: 0x22c55e,
        emissiveIntensity: 1.6,
        roughness: 0.3,
      }),
      0.76,
      1.45,
      0.15,
      12,
      10,
    );
    g.add(orb);
    glow = makeGlow(0x4ade80, 3, 5);
    glow.position.set(0.7, 1.4, 0.2);
    g.add(glow);
  }
  g.scale.setScalar(s);
  const hpBarBg = new THREE.Mesh(
    new THREE.PlaneGeometry(0.9, 0.11),
    new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
    }),
  );
  hpBarBg.position.y = 1.85;
  g.add(hpBarBg);
  const hpBar = new THREE.Mesh(
    new THREE.PlaneGeometry(0.86, 0.07),
    new THREE.MeshBasicMaterial({ color: 0xff5533, side: THREE.DoubleSide }),
  );
  hpBar.position.set(0, 1.85, 0.01);
  g.add(hpBar);
  // Eyes, brows, mouth, feet, horns and the like never move on their own, so each
  // material's worth becomes one mesh. Everything the record or update loop touches stays out.
  mergeStaticChildren(g, [hpBarBg, hpBar, spinPart, glow]);
  if (shieldMesh) {
    mergeStaticChildren(shieldMesh);
  }
  // The light-slot count is derived from MON[].glow, so the flag must match the anchor.
  if (Boolean(glow) !== Boolean(def.glow)) {
    throw new Error(
      `MON[${kind}].glow is ${Boolean(def.glow)} but the builder ${glow ? "calls" : "never calls"} makeGlow`,
    );
  }
  return { g, crown, arms, bodyMat, hpBar, s, shieldMesh, spinPart, glow };
}
// Pooled monsters keep their materials and geometry for good: disposing them would
// release compiled programs and bring back mid-play compiles. A monster's own state
// (transforms, visibility, body glow) is recorded once at creation and restored on
// every reuse; the pool never holds more than the most that were alive at once.
const monsterPools = MON.map(() => []);
// Most of each kind that one wave can hold at once, counting the droplets a Puddler
// leaves behind. Derived from the wave data in waveComposition.js. Warm-up builds this
// many up front.
const MONSTER_POOL_SIZE = maxAliveByKind();
const monsterSlots = new WeakMap();
function acquireMonster(kind) {
  const pooled = monsterPools[kind].pop();
  if (!pooled) {
    const m = createMonster(kind);
    const nodes = [];
    m.g.traverse((node) => {
      nodes.push({
        node,
        position: node.position.clone(),
        quaternion: node.quaternion.clone(),
        scale: node.scale.clone(),
        visible: node.visible,
      });
    });
    monsterSlots.set(m.g, {
      kind,
      m,
      nodes,
      emissive: m.bodyMat.emissiveIntensity,
      pooled: false,
    });
    return m;
  }
  const slot = monsterSlots.get(pooled.g);
  slot.pooled = false;
  for (const saved of slot.nodes) {
    saved.node.position.copy(saved.position);
    saved.node.quaternion.copy(saved.quaternion);
    saved.node.scale.copy(saved.scale);
    saved.node.visible = saved.visible;
  }
  pooled.bodyMat.emissiveIntensity = slot.emissive;
  return pooled;
}
// Safe to call twice for one monster. Never call it while `enemies` is being
// iterated: a Puddler's children are acquired during that loop and must not get a
// group that is still being visited.
function releaseMonster(e) {
  const slot = monsterSlots.get(e.g);
  if (!slot || slot.pooled) return;
  slot.pooled = true;
  scene.remove(e.g);
  monsterPools[slot.kind].push(slot.m);
}
export { MONSTER_POOL_SIZE, acquireMonster, releaseMonster };
