// @ts-check
import * as THREE from "three";
import { rand, canvasTex } from "../core/utils.js";
import { scene } from "../core/state.js";
const PMAX = 900;
const pGeo = new THREE.BufferGeometry();
const pPos = new Float32Array(PMAX * 3),
  pCol = new Float32Array(PMAX * 3);
pGeo.setAttribute(
  "position",
  new THREE.BufferAttribute(pPos, 3).setUsage(THREE.DynamicDrawUsage),
);
pGeo.setAttribute(
  "color",
  new THREE.BufferAttribute(pCol, 3).setUsage(THREE.DynamicDrawUsage),
);
const pTex = canvasTex(64, 64, (g) => {
  const gr = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  gr.addColorStop(0, "rgba(255,255,255,1)");
  gr.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
});
const points = new THREE.Points(
  pGeo,
  new THREE.PointsMaterial({
    size: 0.32,
    map: pTex,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    sizeAttenuation: true,
  }),
);
points.frustumCulled = false;
/**
 * @typedef {object} Particle
 * @property {number} life
 * @property {number} max
 * @property {number} vx
 * @property {number} vy
 * @property {number} vz
 * @property {number} g gravity
 * @property {number} r
 * @property {number} gg
 * @property {number} b
 * @property {number} [i] slot in the position and color buffers, set on first spawn
 */
/** @type {Particle[]} */
const parts = [];
for (let i = 0; i < PMAX; i++) {
  parts.push({ life: 0, max: 1, vx: 0, vy: 0, vz: 0, g: 0, r: 1, gg: 1, b: 1 });
  pPos[i * 3 + 1] = -50;
}
let pIdx = 0;
let colorDirty = false;
const _pCol = new THREE.Color();
/**
 * @param {THREE.Vector3} pos
 * @param {number} n
 * @param {THREE.ColorRepresentation} color
 * @param {number} [spd]
 * @param {number} [life]
 * @param {number} [grav]
 * @param {number} [up]
 */
function spawnP(pos, n, color, spd = 2.5, life = 0.6, grav = -4, up = 1.8) {
  const c = _pCol.set(color);
  for (let k = 0; k < n; k++) {
    const idx = pIdx;
    const p = parts[idx];
    pIdx = (pIdx + 1) % PMAX;
    p.life = p.max = life * rand(0.6, 1.2);
    p.g = grav;
    p.i = idx;
    pPos[idx * 3] = pos.x;
    pPos[idx * 3 + 1] = pos.y;
    pPos[idx * 3 + 2] = pos.z;
    p.vx = rand(-spd, spd);
    p.vy = rand(0, up);
    p.vz = rand(-spd, spd);
    p.r = c.r;
    p.gg = c.g;
    p.b = c.b;
    pCol[idx * 3] = c.r;
    pCol[idx * 3 + 1] = c.g;
    pCol[idx * 3 + 2] = c.b;
  }
  colorDirty = true;
}
/** @param {number} dt */
function updateParts(dt) {
  let any = false;
  for (const p of parts) {
    if (p.life <= 0) continue;
    any = true;
    p.life -= dt;
    const i = p.i;
    if (i == null) continue;
    if (p.life <= 0) {
      pPos[i * 3 + 1] = -50;
      continue;
    }
    p.vy += p.g * dt;
    pPos[i * 3] += p.vx * dt;
    pPos[i * 3 + 1] += p.vy * dt;
    pPos[i * 3 + 2] += p.vz * dt;
    if (pPos[i * 3 + 1] < 0.03) {
      pPos[i * 3 + 1] = 0.03;
      p.vy *= -0.3;
    }
  }
  if (any) {
    pGeo.attributes.position.needsUpdate = true;
    if (colorDirty) {
      pGeo.attributes.color.needsUpdate = true;
      colorDirty = false;
    }
  }
}

export function initParticles() {
  scene.add(points);
}
export { spawnP, updateParts };
