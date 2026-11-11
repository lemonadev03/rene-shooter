// @ts-check
import * as THREE from "three";
import { clamp } from "./utils.js";
import { colliders } from "./state.js";
// ===== collision primitives =====
// colliders (all in world XZ; y0/y1 = vertical extent, used by bullets):
//   circle {t:0,x,z,r} · capsule/segment {t:1,x,z,x2,z2,r} · oriented box {t:2,x,z,hx,hz,cs,sn}
// bo:true = bullets/water jets only (upper trunk etc.), never blocks walkers
/**
 * @typedef {object} SegmentCollider circle (t 0, x2/z2 = x/z) or capsule (t 1)
 * @property {0 | 1} t
 * @property {number} x
 * @property {number} z
 * @property {number} x2
 * @property {number} z2
 * @property {number} r
 * @property {number} y0
 * @property {number} y1
 * @property {boolean} [bo]
 */
/**
 * @typedef {object} BoxCollider oriented box (t 2); cs/sn are the cosine and sine of its rotation
 * @property {2} t
 * @property {number} x
 * @property {number} z
 * @property {number} hx
 * @property {number} hz
 * @property {number} cs
 * @property {number} sn
 * @property {number} r
 * @property {number} y0
 * @property {number} y1
 * @property {boolean} [bo]
 */
/** @typedef {SegmentCollider | BoxCollider} Collider */
/** @param {number} x @param {number} z @param {number} r @param {number} [y1] @param {number} [y0] */
const addCircle = (x, z, r, y1 = 2, y0 = 0) =>
  colliders.push({ t: 0, x, z, x2: x, z2: z, r, y0, y1 });
/** @param {number} x @param {number} z @param {number} x2 @param {number} z2 @param {number} r @param {number} [y1] @param {number} [y0] @param {boolean} [bo] */
const addSeg = (x, z, x2, z2, r, y1 = 2, y0 = 0, bo = false) =>
  colliders.push({ t: 1, x, z, x2, z2, r, y0, y1, bo });
/** @param {number} x @param {number} z @param {number} hx @param {number} hz @param {number} rot @param {number} [y1] @param {number} [y0] */
const addBox = (x, z, hx, hz, rot, y1 = 2, y0 = 0) =>
  colliders.push({
    t: 2,
    x,
    z,
    hx,
    hz,
    cs: Math.cos(rot),
    sn: Math.sin(rot),
    r: 0,
    y0,
    y1,
  });
// does a disc (px,pz,rad) overlap collider c? if so _cx/_cz = the disc centre pushed just clear
let _cx = 0,
  _cz = 0;
/** @param {Collider} c @param {number} px @param {number} pz @param {number} rad */
function _push(c, px, pz, rad) {
  if (c.t === 2) {
    const dx = px - c.x,
      dz = pz - c.z,
      lx = dx * c.cs - dz * c.sn,
      lz = dx * c.sn + dz * c.cs;
    const vx = lx - clamp(lx, -c.hx, c.hx),
      vz = lz - clamp(lz, -c.hz, c.hz),
      d2 = vx * vx + vz * vz;
    let nx = lx,
      nz = lz;
    if (d2 > 0) {
      if (d2 >= rad * rad) return false;
      const d = Math.sqrt(d2),
        k = (rad - d) / d;
      nx += vx * k;
      nz += vz * k;
    } else {
      const penX = c.hx + rad - Math.abs(lx),
        penZ = c.hz + rad - Math.abs(lz);
      if (penX < penZ) nx = Math.sign(lx || 1) * (c.hx + rad);
      else nz = Math.sign(lz || 1) * (c.hz + rad);
    }
    _cx = c.x + nx * c.cs + nz * c.sn;
    _cz = c.z - nx * c.sn + nz * c.cs;
    return true;
  }
  const abx = c.x2 - c.x,
    abz = c.z2 - c.z,
    l2 = abx * abx + abz * abz;
  const t =
    l2 > 1e-9 ? clamp(((px - c.x) * abx + (pz - c.z) * abz) / l2, 0, 1) : 0;
  const qx = c.x + abx * t,
    qz = c.z + abz * t;
  let dx = px - qx,
    dz = pz - qz;
  const R = c.r + rad,
    d2 = dx * dx + dz * dz;
  if (d2 >= R * R) return false;
  let d = Math.sqrt(d2);
  if (d < 1e-5) {
    dx = l2 > 1e-9 ? -abz : 1;
    dz = l2 > 1e-9 ? abx : 0;
    d = Math.hypot(dx, dz);
  }
  _cx = qx + (dx / d) * R;
  _cz = qz + (dz / d) * R;
  return true;
}
// one shared push-out for the player, enemies and balls. nrm (optional {x,z}) receives the summed push direction.
/**
 * @param {{ x: number, z: number }} pos
 * @param {number} rad
 * @param {{ x: number, z: number }} [nrm]
 */
function resolveCollision(pos, rad, nrm) {
  let hit = false;
  if (nrm) {
    nrm.x = 0;
    nrm.z = 0;
  }
  for (let it = 0; it < 3; it++) {
    let any = false;
    for (const c of colliders) {
      if (c.bo) continue;
      if (_push(c, pos.x, pos.z, rad)) {
        if (nrm) {
          nrm.x += _cx - pos.x;
          nrm.z += _cz - pos.z;
        }
        pos.x = _cx;
        pos.z = _cz;
        any = hit = true;
      }
    }
    if (!any) break;
  }
  if (nrm) {
    const l = Math.hypot(nrm.x, nrm.z);
    if (l > 1e-6) {
      nrm.x /= l;
      nrm.z /= l;
    }
  }
  return hit;
}
// does a projectile of radius rad hit a solid prop anywhere along (x0,y0,z0)->(x1,y1,z1)? hit point -> _hitP
const _hitP = new THREE.Vector3();
/** @param {number} x0 @param {number} y0 @param {number} z0 @param {number} x1 @param {number} y1 @param {number} z1 @param {number} rad */
function projectileHitsSolid(x0, y0, z0, x1, y1, z1, rad) {
  const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0, z1 - z0) / 0.3));
  for (let s = 1; s <= n; s++) {
    const f = s / n,
      x = x0 + (x1 - x0) * f,
      y = y0 + (y1 - y0) * f,
      z = z0 + (z1 - z0) * f;
    for (const c of colliders) {
      if (y < c.y0 - rad || y > c.y1 + rad) continue;
      if (_push(c, x, z, rad)) {
        _hitP.set(x, y, z);
        return true;
      }
    }
  }
  return false;
}
export {
  addCircle,
  addSeg,
  addBox,
  resolveCollision,
  projectileHitsSolid,
  _hitP,
};
