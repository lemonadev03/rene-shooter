// @ts-check
import * as THREE from "three";
// ===== helpers =====
/** @param {string} id */
const $ = (id) => document.getElementById(id);
/** @param {number} v @param {number} a @param {number} b */
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
/** @param {number} a @param {number} b */
const rand = (a, b) => a + Math.random() * (b - a);
/** @param {number} [x] @param {number} [y] @param {number} [z] */
const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
/**
 * @param {number} w
 * @param {number} h
 * @param {(ctx: CanvasRenderingContext2D, w: number, h: number) => void} fn
 */
function canvasTex(w, h, fn) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  fn(/** @type {CanvasRenderingContext2D} */ (c.getContext("2d")), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
/**
 * @param {THREE.ColorRepresentation} color
 * @param {number} [rough]
 * @param {number} [metal]
 * @param {THREE.MeshStandardMaterialParameters} [extra]
 */
function mat(color, rough = 0.7, metal = 0, extra = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: rough,
    metalness: metal,
    ...extra,
  });
}
// shared-geometry cache: mesh scale/rotation differ, geometry never mutated per-mesh
/** @type {Map<string, THREE.BufferGeometry>} */
const _geoCache = new Map();
/**
 * @template {THREE.BufferGeometry} G
 * @param {string} key
 * @param {() => G} make
 * @returns {G}
 */
function _geo(key, make) {
  let g = _geoCache.get(key);
  if (!g) {
    g = make();
    _geoCache.set(key, g);
  }
  return /** @type {G} */ (g);
}
/**
 * @param {number} w @param {number} h @param {number} d
 * @param {THREE.Material | THREE.Material[]} m
 * @param {number} [x] @param {number} [y] @param {number} [z]
 */
function box(w, h, d, m, x = 0, y = 0, z = 0) {
  const ms = new THREE.Mesh(
    _geo(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d)),
    m,
  );
  ms.position.set(x, y, z);
  ms.castShadow = true;
  ms.receiveShadow = true;
  return ms;
}
/**
 * @param {number} rt @param {number} rb @param {number} h
 * @param {THREE.Material | THREE.Material[]} m
 * @param {number} [x] @param {number} [y] @param {number} [z] @param {number} [seg]
 */
function cyl(rt, rb, h, m, x = 0, y = 0, z = 0, seg = 14) {
  const ms = new THREE.Mesh(
    _geo(
      `c${rt},${rb},${h},${seg}`,
      () => new THREE.CylinderGeometry(rt, rb, h, seg),
    ),
    m,
  );
  ms.position.set(x, y, z);
  ms.castShadow = true;
  return ms;
}
/**
 * @param {number} r
 * @param {THREE.Material | THREE.Material[]} m
 * @param {number} [x] @param {number} [y] @param {number} [z] @param {number} [w] @param {number} [h]
 */
function sph(r, m, x = 0, y = 0, z = 0, w = 18, h = 14) {
  const ms = new THREE.Mesh(
    _geo(`s${r},${w},${h}`, () => new THREE.SphereGeometry(r, w, h)),
    m,
  );
  ms.position.set(x, y, z);
  ms.castShadow = true;
  return ms;
}

export { $, clamp, rand, V3, canvasTex, mat, box, cyl, sph };
