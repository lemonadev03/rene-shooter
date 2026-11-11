import * as THREE from "three";
import { clamp, rand, mat, box, sph } from "../core/utils.js";
import { scene, sunPoolSpots } from "../core/state.js";
import { mergeStaticChildren } from "./staticBatch.js";
import { makeLabel } from "../vfx/labels.js";
const beaconAnims = []; // {mat,sprite,baseY,ring,phase}
function addBeacon(
  parent,
  x,
  z,
  { label, sub = "", color = 0x38bdf8, h = 7, scale = 1 } = {},
) {
  const bm = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.12,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.55, 0.55, h, 18, 1, true),
    bm,
  );
  beam.position.set(x, h / 2, z);
  parent.add(beam);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(1.7, 2.05, 36),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(x, 0.05, z);
  parent.add(ring);
  const sp = makeLabel(label, sub, scale);
  sp.position.set(x, 2.7, z);
  parent.add(sp);
  const a = { mat: bm, sprite: sp, baseY: 2.7, ring, phase: rand(0, 6) };
  beaconAnims.push(a);
  return a;
}
// ---- sun pools: drifting patches of concentrated sunlight with a solar mat at the center ----
const pools = [];
function buildPool(x, z, accent) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  scene.add(g);
  const glow = new THREE.Mesh(
    new THREE.CircleGeometry(2.35, 32),
    new THREE.MeshBasicMaterial({
      color: 0xffd23a,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.04;
  g.add(glow);
  const core = new THREE.Mesh(
    new THREE.CircleGeometry(1.45, 28),
    new THREE.MeshBasicMaterial({
      color: 0xfff2a8,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  core.rotation.x = -Math.PI / 2;
  core.position.y = 0.055;
  g.add(core);
  // rotating sun rays on the sand
  const rays = new THREE.Group();
  rays.position.y = 0.07;
  g.add(rays);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const ray = box(
      0.16,
      0.02,
      0.85,
      mat(0xffc933, 0.4),
      Math.cos(a) * 1.85,
      0,
      Math.sin(a) * 1.85,
    );
    ray.rotation.y = -a + Math.PI / 2;
    ray.castShadow = false;
    rays.add(ray);
  }
  // little solar-panel beach mat at the center
  const panel = new THREE.Group();
  panel.position.y = 0.38;
  panel.rotation.x = -0.22;
  g.add(panel);
  panel.add(box(1.65, 0.07, 1.08, mat(accent, 0.4), 0, -0.04, 0));
  panel.add(
    box(
      1.48,
      0.09,
      0.92,
      new THREE.MeshStandardMaterial({
        color: 0x123a7a,
        roughness: 0.25,
        metalness: 0.35,
        emissive: 0x1d4ed8,
        emissiveIntensity: 0.35,
      }),
      0,
      0.02,
      0,
    ),
  );
  [-0.45, 0, 0.45].forEach((px) =>
    panel.add(box(0.03, 0.11, 0.9, mat(0xbfd9ff, 0.35), px, 0.03, 0)),
  );
  [-0.58, 0.58].forEach((px) => {
    const leg = box(0.07, 0.42, 0.07, mat(0x6b4a26, 0.8), px, 0.18, 0.28);
    g.add(leg);
  });
  const orb = sph(
    0.27,
    new THREE.MeshStandardMaterial({
      color: 0xfff2a8,
      emissive: 0xffb020,
      emissiveIntensity: 2.2,
      roughness: 0.2,
    }),
    0,
    1.2,
    0,
    14,
    12,
  );
  g.add(orb);
  mergeStaticChildren(rays);
  mergeStaticChildren(panel);
  mergeStaticChildren(g, [glow, core, orb]);
  addBeacon(g, 0, 0, {
    label: "☀️ SUN POOL",
    sub: "stand here to charge · it drifts",
    color: 0xffd23a,
    h: 6.5,
    scale: 0.95,
  });
  const spot = { x, z, r: 3.2, kind: "sun" };
  sunPoolSpots.push(spot);
  pools.push({
    g,
    spot,
    water: core,
    ball: orb,
    rays,
    panel,
    tx: x,
    tz: z,
    wait: rand(1, 4),
    phase: rand(0, 6),
  });
}
export function initPools() {
  buildPool(-16, -4, 0xff4d8d);
  buildPool(19, -12, 0xff7b1c);
  buildPool(-2, -27, 0x00b4d8);
}
function updatePoolsAndBeacons(dt, t) {
  for (const a of beaconAnims) {
    a.mat.opacity = 0.09 + Math.sin(t * 2.6 + a.phase) * 0.04;
    a.sprite.position.y = a.baseY + Math.sin(t * 2 + a.phase) * 0.16;
    const s = 1 + Math.sin(t * 2.2 + a.phase) * 0.13;
    a.ring.scale.set(s, s, 1);
    a.ring.material.opacity = 0.55 + Math.sin(t * 2.2 + a.phase) * 0.3;
  }
  for (const p of pools) {
    p.phase += dt;
    const dx = p.tx - p.g.position.x,
      dz = p.tz - p.g.position.z,
      d = Math.hypot(dx, dz);
    if (p.wait > 0) {
      p.wait -= dt;
    } else if (d < 1) {
      p.wait = rand(2.5, 6);
      p.tx = clamp(p.g.position.x + rand(-22, 22), -42, 42);
      p.tz = clamp(p.g.position.z + rand(-16, 16), -34, 12);
    } else {
      const sp = 1.35 * dt;
      p.g.position.x += (dx / d) * sp;
      p.g.position.z += (dz / d) * sp;
      p.g.rotation.y += dt * 0.35;
    }
    p.g.position.y = 0.015 + Math.abs(Math.sin(p.phase * 2.4)) * 0.025;
    p.water.material.opacity = 0.42 + Math.sin(p.phase * 3.1) * 0.12;
    p.ball.position.y = 1.2 + Math.sin(p.phase * 2.2) * 0.1;
    p.ball.rotation.y += dt * 1.5;
    if (p.rays) p.rays.rotation.y += dt * 0.45;
    if (p.panel) p.panel.position.y = 0.38 + Math.sin(p.phase * 2.2) * 0.04;
    p.spot.x = p.g.position.x;
    p.spot.z = p.g.position.z;
  }
}

export { updatePoolsAndBeacons };
