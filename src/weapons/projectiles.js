import { $ } from "../core/utils.js";
import * as THREE from "three";
import { rand } from "../core/utils.js";
import {
  scene,
  camera,
  state as S,
  player,
  input,
  enemies,
  bullets,
  fireballs,
} from "../core/state.js";
import { projectileHitsSolid, _hitP } from "../core/collision.js";
import { beep, noiseHit } from "../core/audio.js";
import { spawnP } from "../vfx/particles.js";
import { damageEnemy } from "../enemies/monsters.js";
import { hurtPlayer } from "../player/controller.js";
import { getMuzzleWorldPosition } from "./viewmodel.js";
import { emit } from "../core/events.js";
const _tip = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _target = new THREE.Vector3();
const _v1 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const bulletGeo = new THREE.SphereGeometry(0.09, 8, 8),
  bulletMat = new THREE.MeshStandardMaterial({
    color: 0xffd23a,
    emissive: 0xff9500,
    emissiveIntensity: 2,
    roughness: 0.2,
  });
const spongeGeo = new THREE.BoxGeometry(0.3, 0.22, 0.3),
  spongeMat = new THREE.MeshStandardMaterial({
    color: 0xffe23a,
    roughness: 0.95,
    emissive: 0xffd23a,
    emissiveIntensity: 0.25,
  });
const fireGeo = new THREE.SphereGeometry(0.18, 10, 10),
  fireMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    emissive: 0x0284c7,
    emissiveIntensity: 1.4,
    roughness: 0.15,
    transparent: true,
    opacity: 0.92,
  });
// mesh pools: avoid alloc/GC churn at ~18 shots/sec
const _bPool = [],
  _fPool = [],
  _sPool = [];
function _getMesh(pool, geo, mat) {
  const m = pool.pop() || new THREE.Mesh(geo, mat);
  scene.add(m);
  return m;
}
function _freeMesh(pool, m) {
  scene.remove(m);
  pool.push(m);
}
function shoot(dt) {
  player.fireCd -= dt;
  const firing = (input.mouseDown || input.touchFire) && S.mode === "play";
  player.firing = firing;
  if (!firing || player.fireCd > 0) return;
  if (S.water <= 0) {
    player.fireCd = 0.25;
    beep(900, 0.06, "square", 0.04);
    $("hint").classList.add("show");
    return;
  }
  // aim: converge bullets to a point far along the camera (crosshair) ray
  camera.getWorldDirection(_dir);
  getMuzzleWorldPosition(_tip);
  _target.copy(camera.position).addScaledVector(_dir, 42);
  _dir.copy(_target).sub(_tip).normalize();
  const rapid = S.pu.rapid > 0,
    mega = S.pu.power > 0;
  emit("shot", { weapon: S.weapon, aiming: player.aiming, mega, origin: _tip, dir: _dir });
  if (S.weapon === 1) {
    player.fireCd = rapid ? 0.028 : 0.055;
    S.water = Math.max(0, S.water - (rapid ? 0.55 : 1.1));
    const m = _getMesh(_bPool, bulletGeo, bulletMat);
    m.scale.setScalar(mega ? 1.5 : 1);
    m.position.copy(_tip);
    const spread = player.aiming ? 0.012 : 0.035;
    const v = _dir.clone();
    v.x += rand(-spread, spread);
    v.y += rand(-spread, spread);
    v.z += rand(-spread, spread);
    v.normalize().multiplyScalar(46);
    bullets.push({
      m,
      v,
      life: 1.35,
      dmg: mega ? 14 : 7,
      r: mega ? 0.24 : 0.16,
      pool: _bPool,
    });
    spawnP(_tip, 2, 0xffb020, 1, 0.25, 1, 0.8);
    if (Math.random() < 0.35) noiseHit(0.07, 0.035, 1200);
  } else {
    // SPONGE BURST: dry sponge cubes that drink monsters dry
    player.fireCd = rapid ? 0.22 : 0.42;
    S.water = Math.max(0, S.water - (rapid ? 3.5 : 7));
    S.shake = Math.max(S.shake, 0.12);
    for (let i = 0; i < 5; i++) {
      const m = _getMesh(_sPool, spongeGeo, spongeMat);
      m.scale.setScalar(mega ? 1.7 : 1.15);
      m.rotation.set(rand(0, 3), rand(0, 3), 0);
      m.position.copy(_tip);
      const v = _dir.clone();
      v.x += rand(-0.07, 0.07);
      v.y += rand(-0.05, 0.07);
      v.z += rand(-0.07, 0.07);
      v.normalize().multiplyScalar(30);
      bullets.push({
        m,
        v,
        life: 1.1,
        dmg: mega ? 32 : 16,
        r: mega ? 0.42 : 0.3,
        pool: _sPool,
        spin: 1,
      });
    }
    noiseHit(0.16, 0.08, 700);
    beep(220, 0.1, "sine", 0.05, -100);
  }
}

function spitFire(e) {
  const m = _getMesh(_fPool, fireGeo, fireMat);
  _v3.copy(e.pos);
  _v3.y += 1.0 * e.s;
  m.position.copy(_v3);
  const v = player.pos.clone();
  v.y += 1.1;
  v.sub(_v3).normalize().multiplyScalar(13.5);
  // slight lead so strafing matters but shots threaten
  v.x += player.vel.x * 0.12;
  v.z += player.vel.z * 0.12;
  v.normalize().multiplyScalar(13.5);
  fireballs.push({ m, v, life: 3 });
  beep(320, 0.14, "sawtooth", 0.035, -160);
}

export function updateProjectiles(dt, _frame) {
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.life -= dt;
    b.v.y -= 3.5 * dt;
    const bx0 = b.m.position.x,
      by0 = b.m.position.y,
      bz0 = b.m.position.z;
    b.m.position.addScaledVector(b.v, dt);
    let dead = b.life <= 0 || b.m.position.y < 0;
    if (
      !dead &&
      projectileHitsSolid(
        bx0,
        by0,
        bz0,
        b.m.position.x,
        b.m.position.y,
        b.m.position.z,
        b.r * 0.5,
      )
    ) {
      b.m.position.copy(_hitP);
      spawnP(b.m.position, 4, 0x7dd3fc, 1.4, 0.35, -4, 1.4);
      dead = true;
    } // solid prop: bolt stops
    if (b.m.position.y < 0.05 && !dead) {
      spawnP(b.m.position, 4, 0x7dd3fc, 1.4, 0.35, -4, 1.4);
      dead = true;
    }
    if (b.spin) {
      b.m.rotation.x += dt * 9;
      b.m.rotation.y += dt * 7;
    }
    if ((_frame + i) % 3 === 0)
      spawnP(b.m.position, 1, b.spin ? 0xffe23a : 0xffb020, 0.25, 0.22, 1, 0.4); // heat/sponge trail at 1/3 rate
    if (!dead)
      for (const e of enemies) {
        if (e.dead) continue;
        const dx = b.m.position.x - e.pos.x,
          dy = b.m.position.y - (e.pos.y + 0.7 * e.s),
          dz = b.m.position.z - e.pos.z,
          rr = 0.8 * e.s + b.r;
        if (dx * dx + dy * dy + dz * dz < rr * rr) {
          damageEnemy(e, b.dmg, b.m.position);
          emit("hit", { pos: b.m.position, enemy: e, dmg: b.dmg, killed: e.dead });
          if (e.dead) emit("kill", { pos: b.m.position, enemy: e });
          dead = true;
          break;
        }
      }
    if (dead) {
      _freeMesh(b.pool || _bPool, b.m);
      bullets.splice(i, 1);
    }
  }
  // --- fireballs ---
  for (let i = fireballs.length - 1; i >= 0; i--) {
    const b = fireballs[i];
    b.life -= dt;
    const fx0 = b.m.position.x,
      fy0 = b.m.position.y,
      fz0 = b.m.position.z;
    b.m.position.addScaledVector(b.v, dt);
    if ((_frame + i) % 2 === 0)
      spawnP(b.m.position, 1, 0x38bdf8, 0.4, 0.3, -2, 0.6);
    let dead = b.life <= 0 || b.m.position.y < 0;
    if (
      !dead &&
      projectileHitsSolid(
        fx0,
        fy0,
        fz0,
        b.m.position.x,
        b.m.position.y,
        b.m.position.z,
        0.1,
      )
    ) {
      b.m.position.copy(_hitP);
      spawnP(b.m.position, 10, 0x38bdf8, 2, 0.4, -3, 2);
      dead = true;
    } // solid prop: spit splashes
    _v1.copy(player.pos);
    _v1.y += 1.1;
    if (b.m.position.distanceToSquared(_v1) < 0.56) {
      hurtPlayer(11);
      spawnP(b.m.position, 10, 0x38bdf8, 2, 0.4, -3, 2);
      dead = true;
    }
    if (dead) {
      _freeMesh(_fPool, b.m);
      fireballs.splice(i, 1);
    }
  }
}
export function resetProjectiles() {
  bullets.forEach((b) => _freeMesh(b.pool || _bPool, b.m));
  bullets.length = 0;
  fireballs.forEach((b) => _freeMesh(_fPool, b.m));
  fireballs.length = 0;
}
export { shoot, spitFire };
