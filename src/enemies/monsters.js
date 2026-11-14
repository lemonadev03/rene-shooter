import * as THREE from "three";
import { clamp, rand, titleCase } from "../core/utils.js";
import {
  scene,
  state as S,
  player,
  enemies,
  sunPoolSpots,
} from "../core/state.js";
import { beep, noiseHit } from "../core/audio.js";
import { spawnP } from "../vfx/particles.js";
import { feed } from "../ui/hud.js";
import { hurtPlayer } from "../player/controller.js";
import { inSea, bedY } from "../world/ocean.js";
import { resolveCollision } from "../core/collision.js";
import { MON } from "../config/monsters.js";
import {
  MONSTER_POOL_SIZE,
  acquireMonster,
  releaseMonster,
} from "./monsterModel.js";
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _en = { x: 0, z: 0 };
function addEnemy(kind, x, z) {
  const def = MON[kind];
  const m = acquireMonster(kind);
  m.g.position.set(x, 0, z);
  scene.add(m.g);
  const wv = Math.max(1, S.wave || 1);
  const hp = def.hp * (1 + (wv - 1) * 0.18);
  const e = {
    ...m,
    kind,
    def,
    pos: m.g.position,
    hp,
    maxHp: hp,
    speed: def.speed * (1 + (wv - 1) * 0.05),
    side: Math.random() < 0.5 ? 1 : -1,
    atkCd: 0,
    shootCd: rand(1, 2.4),
    phase: rand(0, 6),
    wet: 0,
    state: "chase",
    stateT: 0,
    abCd:
      kind === 3 ? rand(0.4, 1) : kind === 1 ? rand(0.8, 1.6) : rand(1.4, 2.8),
    burstLeft: 0,
    burstT: 0,
    healCd: rand(2, 3.5),
    burstTimer: -1,
    boost: 1,
    dashX: 0,
    dashZ: 0,
    shieldHp: (def.shield || 0) * (1 + (wv - 1) * 0.15),
    maxShield: (def.shield || 0) * (1 + (wv - 1) * 0.15),
  };
  enemies.push(e);
  _v3.set(x, 0.6, z);
  spawnP(_v3, 14, 0x38bdf8, 2, 0.6, 1, 2.5);
  return e;
}
function burstGusher(e) {
  _v3.copy(e.pos);
  _v3.y += 0.8;
  spawnP(_v3, 36, 0x38bdf8, 4.2, 0.7, -4, 3.6);
  spawnP(_v3, 20, 0xe0f2fe, 3, 0.5, -3, 3);
  spawnP(_v3, 14, 0xffffff, 2, 0.9, 1, 2);
  noiseHit(0.35, 0.2, 900);
  beep(500, 0.25, "sine", 0.08, -350);
  S.shake = Math.max(S.shake, 0.4);
  if (player.pos.distanceTo(e.pos) < 3.4) hurtPlayer(20);
}
function killEnemy(e, scored = true) {
  if (e.dead) return;
  e.dead = true;
  if (e.kind === 4) burstGusher(e);
  if (scored) {
    S.kills++;
    S.combo++;
    S.comboT = 2.2;
    const pts = e.def.score * Math.max(1, S.combo);
    S.score += pts;
    feed(`${titleCase(e.def.name)} evaporated +${pts}`);
  } else feed("Gusher burst");
  _v3.copy(e.pos);
  _v3.y += 0.8;
  spawnP(_v3, 30, 0xffffff, 3.2, 0.9, 1, 3.5);
  spawnP(_v3, 16, 0x38bdf8, 3, 0.7, -4, 3);
  beep(600, 0.18, "sine", 0.07, 500);
  noiseHit(0.3, 0.14, 1200);
  const sx = e.pos.x,
    sz = e.pos.z;
  scene.remove(e.g);
  if (e.kind === 5) {
    // PUDDLER pops into two Droplets
    feed("Puddler split into two droplets");
    addEnemy(0, sx - 0.8, sz);
    addEnemy(0, sx + 0.8, sz);
  }
}
function damageEnemy(e, dmg, hitPos) {
  if (e.dead) return;
  // 🛡️ WARDEN shield soaks damage first; break it and he enrages
  if (e.shieldHp > 0) {
    const absorbed = Math.min(e.shieldHp, dmg);
    e.shieldHp -= absorbed;
    dmg -= absorbed;
    e.wet = Math.max(e.wet, 0.4);
    spawnP(hitPos, 6, 0x9ca3af, 2.4, 0.35, -5, 2);
    noiseHit(0.07, 0.07, 900);
    if (e.shieldMesh)
      e.shieldMesh.scale.setScalar(Math.max(0.55, e.shieldHp / e.maxShield));
    if (e.shieldHp <= 0 && e.shieldMesh) {
      feed("Coral Warden's shell broke");
      e.shieldMesh.visible = false;
      e.speed *= 1.4;
      _v3.copy(e.pos);
      _v3.y += 0.8;
      spawnP(_v3, 18, 0x9ca3af, 3, 0.6, -3, 2.5);
    }
    if (dmg <= 0) return;
  }
  e.hp -= dmg;
  e.wet = 1;
  spawnP(hitPos, 7, 0x7dd3fc, 2.2, 0.45, -5, 2);
  spawnP(hitPos, 5, 0xffffff, 1.2, 0.7, 1.5, 2); // splash + steam
  noiseHit(0.09, 0.05, 3000);
  if (e.hp <= 0) killEnemy(e, true);
}

export function updateMonsters(dt, t, fireWaterJet) {
  let alive = 0;
  for (const e of enemies) {
    if (e.dead) continue;
    alive++;
    // home turf: water monsters rehydrate (regen + haste) in the OCEAN only; sun pools dry them out — lure them onto dry sand and into the light
    const inWater = inSea(e.pos.x, e.pos.z);
    const inSun = sunPoolSpots.some(
      (s) => Math.hypot(e.pos.x - s.x, e.pos.z - s.z) < s.r,
    );
    if (inWater && e.hp < e.maxHp) e.hp = Math.min(e.maxHp, e.hp + 5 * dt);
    if (inSun) {
      e.hp -= 3.5 * dt;
      e.wet = 1;
      if (Math.random() < 0.16) {
        _v3.copy(e.pos);
        _v3.y += 1;
        spawnP(_v3, 2, 0xffffff, 1, 0.6, 1.5, 1.8);
      }
      if (e.hp <= 0) {
        killEnemy(e, true);
        continue;
      }
    }
    e.phase += dt * 6;
    e.wet = Math.max(0, e.wet - dt * (inWater ? 4 : 1.2));
    e.atkCd -= dt;
    e.shootCd -= dt;
    e.abCd -= dt;
    e.healCd -= dt;
    e.boost = 1;
    e.lift = 0;
    _v1.copy(player.pos).sub(e.pos);
    _v1.y = 0;
    const dist = _v1.length();
    const dir = _v1.normalize();
    const dx = dir.x,
      dz = dir.z;
    const stopAt = e.kind === 2 || e.kind === 7 ? 11.5 : 1.35 * e.s;
    let mx = dx,
      mz = dz,
      mv =
        e.speed *
        (dist > 25 ? 1.7 : 1) *
        (1 - e.wet * 0.35) *
        (S.pu.freeze > 0 ? 0.42 : 1) *
        (inWater ? 1.18 : 1);
    // ---- per-type abilities ----
    if (e.kind === 0) {
      // DROPLET: zigzag weave
      const w = Math.sin(e.phase * 1.6) * 0.55;
      mx = dx - dz * w;
      mz = dz + dx * w;
      const l = Math.hypot(mx, mz) || 1;
      mx /= l;
      mz /= l;
    }
    if (e.kind === 3) {
      // SURFER: windup → lunge → tired (backsteps first if already in your face)
      if (e.state === "chase" && e.abCd <= 0 && dist < 13 && dist > 2.1) {
        e.state = "windup";
        e.stateT = 0.45;
        beep(880, 0.08, "square", 0.03);
      } else if (e.state === "chase" && e.abCd <= 0 && dist <= 2.1) {
        e.state = "retreat";
        e.stateT = 0.42;
      } else if (e.state === "retreat") {
        mx = -dx;
        mz = -dz;
        mv = e.speed * 1.15;
        e.stateT -= dt;
        if (e.stateT <= 0) {
          e.state = "windup";
          e.stateT = 0.45;
          beep(880, 0.08, "square", 0.03);
        }
      } else if (e.state === "windup") {
        mv = 0;
        e.boost = 0.8;
        e.stateT -= dt;
        if (e.stateT <= 0) {
          e.state = "dash";
          e.stateT = 0.34;
          e.dashX = dx;
          e.dashZ = dz;
          beep(240, 0.12, "sawtooth", 0.05, 300);
        }
      } else if (e.state === "dash") {
        mx = e.dashX;
        mz = e.dashZ;
        mv = 13.5;
        e.boost = 1.08;
        _v3.copy(e.pos);
        _v3.y += 0.5;
        spawnP(_v3, 1, 0x7dd3fc, 0.5, 0.3, 0, 0.5);
        e.stateT -= dt;
        if (e.stateT <= 0) {
          e.state = "tired";
          e.stateT = 0.75;
        }
      } else if (e.state === "tired") {
        mv *= 0.35;
        e.stateT -= dt;
        if (e.stateT <= 0) {
          e.state = "chase";
          e.abCd = rand(1.6, 2.7);
        }
      }
    }
    if (e.kind === 4) {
      // GUSHER: swells at close range, then bursts
      if (e.burstTimer < 0 && dist < 2.5) {
        e.burstTimer = 0.85;
        feed("Gusher about to burst. Get clear.");
      }
      if (e.burstTimer >= 0) {
        e.burstTimer -= dt;
        mv = 0;
        e.boost = 1 + (0.85 - e.burstTimer) * 0.45 + Math.sin(t * 30) * 0.06;
        if (Math.random() < 0.25) beep(rand(950, 1250), 0.05, "square", 0.04);
        if (e.burstTimer <= 0) {
          killEnemy(e, false);
          continue;
        }
      }
    }
    if (e.kind === 1) {
      // TIDE BRUTE: ground slam (jump to dodge)
      if (e.state === "chase" && e.abCd <= 0 && dist < 6) {
        e.state = "windup";
        e.stateT = 0.55;
        beep(140, 0.2, "sawtooth", 0.06, 60);
      } else if (e.state === "windup") {
        mv = 0;
        e.lift = 0.55 * (1 - e.stateT / 0.55);
        e.boost = 1.1;
        e.stateT -= dt;
        if (e.stateT <= 0) {
          e.state = "tired";
          e.stateT = 0.85;
          // No melee while the slam recovers; the generic attack below resumes after.
          e.atkCd = Math.max(e.atkCd, e.stateT);
          e.abCd = rand(3, 4.2);
          S.shake = Math.max(S.shake, 0.5);
          noiseHit(0.3, 0.18, 300);
          for (let a = 0; a < 14; a++) {
            _v3.set(
              e.pos.x + Math.cos((a / 14) * 6.28) * 2.4,
              0.25,
              e.pos.z + Math.sin((a / 14) * 6.28) * 2.4,
            );
            spawnP(_v3, 2, 0xf0d488, 1.6, 0.5, -3, 2);
          }
          if (dist < 3.8 && player.pos.y < 0.55) hurtPlayer(16);
        }
      } else if (e.state === "tired") {
        mv *= 0.3;
        e.stateT -= dt;
        if (e.stateT <= 0) e.state = "chase";
      }
    }
    if (e.kind === 7 && e.healCd <= 0) {
      // RAIN SHAMAN: heal the most-wounded ally nearby
      let best = null,
        bf = 1;
      for (const o of enemies) {
        if (o === e || o.dead) continue;
        const f = o.hp / o.maxHp;
        if (f < bf && o.pos.distanceTo(e.pos) < 11) {
          bf = f;
          best = o;
        }
      }
      if (best) {
        best.hp = Math.min(best.maxHp, best.hp + 14 + S.wave * 2);
        e.healCd = 3.4;
        _v3.copy(best.pos);
        _v3.y += 1;
        spawnP(_v3, 14, 0x4ade80, 1.6, 0.7, 1.5, 2.2);
        _v3.copy(e.pos);
        _v3.y += 1.4;
        spawnP(_v3, 8, 0x4ade80, 1.2, 0.5, 1, 1.8);
        beep(980, 0.12, "sine", 0.04, 220);
      } else e.healCd = 0.8;
    }
    if ((e.kind === 2 || e.kind === 7) && dist < stopAt - 3.5) {
      mx = -dx;
      mz = -dz;
      mv *= 0.85;
    } // ranged types back off
    if (
      dist > stopAt ||
      e.state === "dash" ||
      e.state === "retreat" ||
      ((e.kind === 2 || e.kind === 7) && dist < stopAt - 3.5)
    ) {
      e.pos.x += mx * mv * dt;
      e.pos.z += mz * mv * dt;
    }
    // separation (alloc-free)
    for (const o of enemies) {
      if (o === e || o.dead) continue;
      _v2.copy(e.pos).sub(o.pos);
      _v2.y = 0;
      const d2 = _v2.lengthSq();
      if (d2 < 1.44 && d2 > 0.0001) {
        const d = Math.sqrt(d2);
        e.pos.addScaledVector(_v2.normalize(), (1.2 - d) * dt * 2);
      }
    }
    e.pos.x = clamp(e.pos.x, -53, 53);
    e.pos.z = clamp(e.pos.z, -41, 20);
    // props are solid for monsters too; if one blocks the way, slide along it toward whichever side heads for the player
    if (resolveCollision(e.pos, 0.55 * e.s, _en) && mv > 0) {
      const sd = -_en.z * mx + _en.x * mz;
      if (Math.abs(sd) > 0.25) e.side = sd > 0 ? 1 : -1;
      e.pos.x += -_en.z * e.side * mv * dt * 0.9;
      e.pos.z += _en.x * e.side * mv * dt * 0.9;
      resolveCollision(e.pos, 0.55 * e.s);
    }
    e.g.rotation.y = Math.atan2(
      e.state === "dash" ? e.dashX : dx,
      e.state === "dash" ? e.dashZ : dz,
    );
    e.g.position.y =
      Math.abs(Math.sin(e.phase)) * 0.14 +
      e.lift +
      Math.max(-0.45, bedY(e.pos.x, e.pos.z) * 0.8);
    e.g.scale.setScalar(
      e.s *
        (1 + Math.sin(e.phase * 2) * 0.03) *
        (0.78 + 0.22 * (e.hp / e.maxHp)) *
        e.boost,
    );
    for (let fi = 0; fi < e.crown.length; fi++) {
      const sc =
        (1 + Math.sin(t * 11 + fi * 1.7) * 0.28) *
        (0.35 + 0.65 * (e.hp / e.maxHp)) *
        (1 - e.wet * 0.4);
      e.crown[fi].scale.set(sc, sc * (1 + Math.sin(t * 13 + fi) * 0.2), sc);
    }
    for (let ai = 0; ai < e.arms.length; ai++) {
      e.arms[ai].rotation.x = Math.sin(e.phase + ai * Math.PI) * 0.6 - 0.4;
    }
    if (e.spinPart) e.spinPart.rotation.z += dt * 2.4;
    e.bodyMat.emissiveIntensity =
      e.state === "windup" ? 1.6 : 0.45 + 0.75 * (e.hp / e.maxHp);
    e.hpBar.scale.x = Math.max(0, e.hp / e.maxHp);
    e.hpBar.position.x = -(1 - Math.max(0, e.hp / e.maxHp)) * 0.43; // bars face +Z local; monster faces player, so bars face camera
    if (Math.random() < 0.18) {
      _v3.set(
        e.pos.x + rand(-0.3, 0.3),
        e.pos.y + 1.3 * e.s,
        e.pos.z + rand(-0.3, 0.3),
      );
      spawnP(_v3, 1, e.kind === 7 ? 0x4ade80 : e.def.body, 0.5, 0.5, 2.5, 1.5);
    }
    // attacks
    if (
      e.kind !== 4 &&
      e.state !== "windup" &&
      dist < 1.7 * e.s &&
      e.atkCd <= 0
    ) {
      e.atkCd = 0.85;
      hurtPlayer(e.def.dmg);
      _v3.copy(player.pos);
      _v3.y += 1.1;
      spawnP(_v3, 12, 0x38bdf8, 2, 0.45, -3, 2);
    }
    if (e.kind === 2) {
      // JETTER: single shots, burst of 3 on wave 5
      if (e.burstLeft > 0) {
        e.burstT -= dt;
        if (e.burstT <= 0) {
          e.burstLeft--;
          e.burstT = 0.22;
          fireWaterJet(e);
        }
      } else if (dist < 27 && dist > 4 && e.shootCd <= 0) {
        e.shootCd = rand(1.7, 2.6);
        e.burstLeft = S.wave >= 5 ? 2 : S.wave >= 4 ? 1 : 0;
        fireWaterJet(e);
      }
    }
  }

  return alive;
}
export {
  MON,
  MONSTER_POOL_SIZE,
  acquireMonster,
  releaseMonster,
  addEnemy,
  killEnemy,
  damageEnemy,
};
