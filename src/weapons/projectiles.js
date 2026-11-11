import { $, rand } from "../core/utils.js";
import * as THREE from "three";
import {
  scene,
  camera,
  state as S,
  player,
  input,
  enemies,
  bullets,
  waterJets,
} from "../core/state.js";
import { projectileHitsSolid, _hitP } from "../core/collision.js";
import { beep, noiseHit } from "../core/audio.js";
import { spawnP } from "../vfx/particles.js";
import { damageEnemy } from "../enemies/monsters.js";
import { hurtPlayer } from "../player/controller.js";
import { getMuzzleWorldPosition } from "./viewmodel.js";
import { emit } from "../core/events.js";
import { setHeatBeamTarget } from "../vfx/beam.js";
import { spawnImpact } from "../vfx/impacts.js";
import {
  WEAPON_HEAT_RAY,
  EMPTY_CHARGE_COOLDOWN,
  HEAT_RAY_RANGE,
  HEAT_RAY_THICKNESS,
  HEAT_RAY_SPREAD_AIMED,
  HEAT_RAY_SPREAD_HIP,
  HEAT_RAY_COOLDOWN,
  HEAT_RAY_COOLDOWN_RAPID,
  HEAT_RAY_COST,
  HEAT_RAY_COST_RAPID,
  HEAT_RAY_DAMAGE,
  HEAT_RAY_DAMAGE_MEGA,
  SPONGE_AIM_DISTANCE,
  SPONGE_COOLDOWN,
  SPONGE_COOLDOWN_RAPID,
  SPONGE_COST,
  SPONGE_COST_RAPID,
  SPONGE_SHAKE,
  SPONGE_COUNT,
  SPONGE_SCALE,
  SPONGE_SCALE_MEGA,
  SPONGE_SPREAD_SIDE,
  SPONGE_SPREAD_DOWN,
  SPONGE_SPREAD_UP,
  SPONGE_SPEED,
  SPONGE_LIFE,
  SPONGE_DAMAGE,
  SPONGE_DAMAGE_MEGA,
  SPONGE_RADIUS,
  SPONGE_RADIUS_MEGA,
  SPONGE_GRAVITY,
  WATER_JET_SPEED,
  WATER_JET_LEAD,
  WATER_JET_LIFE,
  WATER_JET_DAMAGE,
  WATER_JET_TARGET_HEIGHT,
  WATER_JET_HIT_RADIUS_SQ,
} from "../config/weapons.js";
const _tip = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _target = new THREE.Vector3();
const _v1 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _spread = new THREE.Vector3();
const _impact = new THREE.Vector3();
let wasFiring = false;

// Resolve the camera ray before drawing from the muzzle, so the crosshair owns the hit.
function traceHeatRay() {
  const origin = camera.position;
  let distance = HEAT_RAY_RANGE, enemy = null, type = null;
  if (_dir.y < -1e-6) {
    const ground = -origin.y / _dir.y;
    if (ground >= 0 && ground <= distance) { distance = ground; type = "sand"; }
  }
  for (const e of enemies) {
    if (e.dead) continue;
    const x = origin.x - e.pos.x,
      y = origin.y - (e.pos.y + 0.7 * e.s),
      z = origin.z - e.pos.z,
      projection = x * _dir.x + y * _dir.y + z * _dir.z,
      c = x * x + y * y + z * z - (0.8 * e.s) ** 2,
      discriminant = projection * projection - c;
    if (discriminant < 0) continue;
    const t = c <= 0 ? 0 : -projection - Math.sqrt(discriminant);
    if (t >= 0 && t < distance) { distance = t; enemy = e; type = "monster"; }
  }
  _impact.copy(origin).addScaledVector(_dir, distance);
  if (
    projectileHitsSolid(
      origin.x,
      origin.y,
      origin.z,
      _impact.x,
      _impact.y,
      _impact.z,
      HEAT_RAY_THICKNESS,
    )
  ) {
    _impact.copy(_hitP);
    enemy = null;
    type = "prop";
  }
  return { enemy, type };
}
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
const _jetPool = [],
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
  if (firing && !wasFiring) player.fireCd = 0;
  wasFiring = firing;
  if (!firing) return;
  const rapid = S.pu.rapid > 0,
    mega = S.pu.power > 0;
  const cost =
    S.weapon === WEAPON_HEAT_RAY
      ? rapid
        ? HEAT_RAY_COST_RAPID
        : HEAT_RAY_COST
      : rapid
        ? SPONGE_COST_RAPID
        : SPONGE_COST;
  // Keep the ribbon attached to the current aim between damage ticks.
  if (S.weapon === WEAPON_HEAT_RAY && player.fireCd > 0 && S.water >= cost) {
    camera.getWorldDirection(_dir).add(_spread).normalize();
    traceHeatRay();
    setHeatBeamTarget(_impact);
  }
  if (player.fireCd > 0) return;
  if (S.water < cost) {
    player.fireCd = EMPTY_CHARGE_COOLDOWN;
    beep(900, 0.06, "square", 0.04);
    $("hint").classList.add("show");
    return;
  }
  camera.getWorldDirection(_dir);
  getMuzzleWorldPosition(_tip);
  if (S.weapon === WEAPON_HEAT_RAY) {
    const spread = player.aiming ? HEAT_RAY_SPREAD_AIMED : HEAT_RAY_SPREAD_HIP;
    _spread.set(rand(-spread, spread), rand(-spread, spread), rand(-spread, spread));
    _dir.add(_spread).normalize();
  } else {
    _target.copy(camera.position).addScaledVector(_dir, SPONGE_AIM_DISTANCE);
    _dir.copy(_target).sub(_tip).normalize();
  }
  emit("shot", { weapon: S.weapon, aiming: player.aiming, mega, origin: _tip, dir: _dir });
  if (S.weapon === WEAPON_HEAT_RAY) {
    player.fireCd = rapid ? HEAT_RAY_COOLDOWN_RAPID : HEAT_RAY_COOLDOWN;
    S.water = Math.max(0, S.water - cost);
    const { enemy, type } = traceHeatRay();
    setHeatBeamTarget(_impact);
    if (type) spawnImpact(type, _impact);
    if (enemy) {
      const dmg = mega ? HEAT_RAY_DAMAGE_MEGA : HEAT_RAY_DAMAGE;
      damageEnemy(enemy, dmg, _impact);
      emit("hit", { pos: _impact, enemy, dmg, killed: enemy.dead });
      if (enemy.dead) emit("kill", { pos: _impact, enemy });
    }
    noiseHit(0.035, 0.025, 1500);
  } else {
    // SPONGE BURST: dry sponge cubes that drink monsters dry
    player.fireCd = rapid ? SPONGE_COOLDOWN_RAPID : SPONGE_COOLDOWN;
    S.water = Math.max(0, S.water - cost);
    S.shake = Math.max(S.shake, SPONGE_SHAKE);
    for (let i = 0; i < SPONGE_COUNT; i++) {
      const m = _getMesh(_sPool, spongeGeo, spongeMat);
      m.scale.setScalar(mega ? SPONGE_SCALE_MEGA : SPONGE_SCALE);
      m.rotation.set(rand(0, 3), rand(0, 3), 0);
      m.position.copy(_tip);
      const v = _dir.clone();
      v.x += rand(-SPONGE_SPREAD_SIDE, SPONGE_SPREAD_SIDE);
      v.y += rand(-SPONGE_SPREAD_DOWN, SPONGE_SPREAD_UP);
      v.z += rand(-SPONGE_SPREAD_SIDE, SPONGE_SPREAD_SIDE);
      v.normalize().multiplyScalar(SPONGE_SPEED);
      bullets.push({
        m,
        v,
        life: SPONGE_LIFE,
        dmg: mega ? SPONGE_DAMAGE_MEGA : SPONGE_DAMAGE,
        r: mega ? SPONGE_RADIUS_MEGA : SPONGE_RADIUS,
        pool: _sPool,
        spin: 1,
      });
    }
    noiseHit(0.16, 0.08, 700);
    beep(220, 0.1, "sine", 0.05, -100);
  }
}

function fireWaterJet(e) {
  const m = _getMesh(_jetPool, fireGeo, fireMat);
  _v3.copy(e.pos);
  _v3.y += 1.0 * e.s;
  m.position.copy(_v3);
  const v = player.pos.clone();
  v.y += WATER_JET_TARGET_HEIGHT;
  v.sub(_v3).normalize().multiplyScalar(WATER_JET_SPEED);
  // slight lead so strafing matters but shots threaten
  v.x += player.vel.x * WATER_JET_LEAD;
  v.z += player.vel.z * WATER_JET_LEAD;
  v.normalize().multiplyScalar(WATER_JET_SPEED);
  waterJets.push({ m, v, life: WATER_JET_LIFE });
  beep(320, 0.14, "sawtooth", 0.035, -160);
}

export function updateProjectiles(dt, _frame) {
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.life -= dt;
    b.v.y -= SPONGE_GRAVITY * dt;
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
      spawnP(b.m.position, 1, 0xffe23a, 0.25, 0.22, 1, 0.4); // sponge trail at 1/3 rate
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
      _freeMesh(b.pool, b.m);
      bullets.splice(i, 1);
    }
  }
  // --- water jets ---
  for (let i = waterJets.length - 1; i >= 0; i--) {
    const b = waterJets[i];
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
    _v1.y += WATER_JET_TARGET_HEIGHT;
    if (b.m.position.distanceToSquared(_v1) < WATER_JET_HIT_RADIUS_SQ) {
      hurtPlayer(WATER_JET_DAMAGE);
      spawnP(b.m.position, 10, 0x38bdf8, 2, 0.4, -3, 2);
      dead = true;
    }
    if (dead) {
      _freeMesh(_jetPool, b.m);
      waterJets.splice(i, 1);
    }
  }
}
export function resetProjectiles() {
  wasFiring = false;
  bullets.forEach((b) => _freeMesh(b.pool, b.m));
  bullets.length = 0;
  waterJets.forEach((b) => _freeMesh(_jetPool, b.m));
  waterJets.length = 0;
}
// Hands the loading step one pooled mesh of each kind so their materials compile
// before the first shot; returnWarmupMeshes puts them back in the pools.
function takeWarmupMeshes() {
  return [
    _getMesh(_jetPool, fireGeo, fireMat),
    _getMesh(_sPool, spongeGeo, spongeMat),
  ];
}
function returnWarmupMeshes([fire, sponge]) {
  _freeMesh(_jetPool, fire);
  _freeMesh(_sPool, sponge);
}
export { shoot, fireWaterJet, takeWarmupMeshes, returnWarmupMeshes };
