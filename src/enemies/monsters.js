import * as THREE from "three";
import { $, clamp, rand, mat, box, cyl, sph } from "../core/utils.js";
import {
  scene,
  state as S,
  player,
  enemies,
  refillSpots,
} from "../core/state.js";
import { beep, noiseHit } from "../core/audio.js";
import { spawnP } from "../vfx/particles.js";
import { feed } from "../ui/hud.js";
import { hurtPlayer } from "../player/controller.js";
import { inSea, bedY } from "../world/ocean.js";
import { resolveCollision } from "../core/collision.js";
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _en = { x: 0, z: 0 };
const _flameMats = [
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
const _flameConeGeo = new THREE.ConeGeometry(0.13, 0.5, 7),
  _flameTopGeo = new THREE.ConeGeometry(0.17, 0.66, 7);
// 0 imp · 1 brute(slam) · 2 spitter · 3 dasher · 4 exploder · 5 splitter · 6 shielded · 7 healer
const MON = [
  {
    name: "DROPLET",
    s: 1.0,
    body: 0x2196f3,
    belly: 0xbae6fd,
    hp: 36,
    speed: 3.8,
    score: 100,
    dmg: 10,
  },
  {
    name: "TIDE BRUTE",
    s: 1.7,
    body: 0x0369a1,
    belly: 0x7dd3fc,
    hp: 175,
    speed: 2.3,
    score: 300,
    dmg: 18,
  },
  {
    name: "JETTER",
    s: 1.15,
    body: 0x06b6d4,
    belly: 0xcffafe,
    hp: 62,
    speed: 2.8,
    score: 175,
    dmg: 9,
  },
  {
    name: "SURFER",
    s: 0.92,
    body: 0x22d3ee,
    belly: 0xecfeff,
    hp: 34,
    speed: 4.7,
    score: 150,
    dmg: 11,
  },
  {
    name: "GUSHER",
    s: 1.12,
    body: 0x2563eb,
    belly: 0x93c5fd,
    hp: 34,
    speed: 4.3,
    score: 175,
    dmg: 8,
  },
  {
    name: "PUDDLER",
    s: 1.3,
    body: 0x7c3aed,
    belly: 0xddd6fe,
    hp: 95,
    speed: 2.9,
    score: 225,
    dmg: 12,
  },
  {
    name: "CORAL WARDEN",
    s: 1.25,
    body: 0x0e7490,
    belly: 0xa5f3fc,
    hp: 95,
    speed: 2.1,
    score: 275,
    dmg: 14,
    shield: 55,
  },
  {
    name: "RAIN SHAMAN",
    s: 1.05,
    body: 0x4f46e5,
    belly: 0xe0e7ff,
    hp: 58,
    speed: 2.8,
    score: 300,
    dmg: 8,
  },
];
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
  const flames = [];
  const fMats = _flameMats; // shared across all monsters
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * 6.28;
    const f = new THREE.Mesh(_flameConeGeo, fMats[i % 2]);
    f.position.set(Math.cos(a) * 0.22, 1.18, Math.sin(a) * 0.22);
    f.rotation.set(Math.sin(a) * 0.35, 0, Math.cos(a) * 0.35);
    g.add(f);
    flames.push(f);
  }
  const fTop = new THREE.Mesh(_flameTopGeo, fMats[1]);
  fTop.position.y = 1.32;
  g.add(fTop);
  flames.push(fTop);
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
  // little feet coals
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
    // DASHER: swept mohawk + speed stripes
    for (let i = 0; i < 4; i++) {
      const f = new THREE.Mesh(_flameTopGeo, _flameMats[1]);
      f.position.set(0, 1.22 - i * 0.05, 0.28 - i * 0.2);
      f.rotation.x = -0.8;
      f.scale.setScalar(0.8);
      g.add(f);
      flames.push(f);
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
    const fuse = cyl(0.05, 0.07, 0.3, mat(0x94a3b8, 0.5, 0.5), 0, 1.45, 0, 8);
    g.add(fuse);
  }
  if (kind === 5) {
    // SPLITTER: two baby heads riding on top
    [-0.27, 0.27].forEach((x) => {
      const h = sph(0.24, bodyMat, x, 1.18, 0.05, 14, 12);
      g.add(h);
      [-0.08, 0.08].forEach((ex) =>
        g.add(sph(0.04, mat(0x1a0a00, 0.3), x + ex, 1.22, 0.27, 8, 8)),
      );
      const f = new THREE.Mesh(_flameConeGeo, _flameMats[1]);
      f.position.set(x, 1.48, 0.05);
      f.scale.setScalar(0.7);
      g.add(f);
      flames.push(f);
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
    // SHAMAN: halo + heal staff
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
  return { g, flames, arms, bodyMat, hpBar, s, shieldMesh, spinPart, glow };
}
// Pooled monsters keep their materials and geometry for good: disposing them would
// release compiled programs and bring back mid-play compiles. A monster's own state
// (transforms, visibility, body glow) is recorded once at creation and restored on
// every reuse; the pool never holds more than the most that were alive at once.
const monsterPools = MON.map(() => []);
// Most of each kind that one wave can hold at once (waves.js pickKind), counting the
// two droplets a splitter leaves behind. Warm-up builds this many up front.
const MONSTER_POOL_SIZE = [8, 3, 3, 3, 2, 2, 3, 2];
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
// iterated: a splitter's children are acquired during that loop and must not get a
// group that is still being visited.
function releaseMonster(e) {
  const slot = monsterSlots.get(e.g);
  if (!slot || slot.pooled) return;
  slot.pooled = true;
  scene.remove(e.g);
  monsterPools[slot.kind].push(slot.m);
}
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
    fuse: -1,
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
function explodeBoomer(e) {
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
  if (e.kind === 4) explodeBoomer(e);
  if (scored) {
    S.kills++;
    S.combo++;
    S.comboT = 2.2;
    const pts = e.def.score * Math.max(1, S.combo);
    S.score += pts;
    feed(`💨 Evaporated ${e.def.name} +${pts}`);
  } else feed("💦 GUSHER burst itself!");
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
    // SPLITTER pops into two imps
    feed("🫧 PUDDLER split into two droplets!");
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
      feed("🐚 CORAL shield shattered — the WARDEN is mad now!");
      e.shieldMesh.visible = false;
      e.speed *= 1.4;
      _v3.copy(e.pos);
      _v3.y += 0.8;
      spawnP(_v3, 18, 0x9ca3af, 3, 0.6, -3, 2.5);
    }
    if (dmg <= 0) {
      $("hitmark").style.opacity = 1;
      setTimeout(() => ($("hitmark").style.opacity = 0), 60);
      return;
    }
  }
  e.hp -= dmg;
  e.wet = 1;
  spawnP(hitPos, 7, 0x7dd3fc, 2.2, 0.45, -5, 2);
  spawnP(hitPos, 5, 0xffffff, 1.2, 0.7, 1.5, 2); // splash + steam
  $("hitmark").style.opacity = 1;
  $("hitmark").style.transform = "translate(-50%,-50%) scale(1.25)";
  setTimeout(() => {
    $("hitmark").style.opacity = 0;
    $("hitmark").style.transform = "translate(-50%,-50%) scale(1)";
  }, 70);
  noiseHit(0.09, 0.05, 3000);
  if (e.hp <= 0) killEnemy(e, true);
}

export function updateMonsters(dt, t, spitFire) {
  let alive = 0;
  for (const e of enemies) {
    if (e.dead) continue;
    alive++;
    // home turf: water monsters rehydrate (regen + haste) in the OCEAN only; sun pools dry them out — lure them onto dry sand and into the light
    const inWater = inSea(e.pos.x, e.pos.z);
    const inSun = refillSpots.some(
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
      // IMP: zigzag weave
      const w = Math.sin(e.phase * 1.6) * 0.55;
      mx = dx - dz * w;
      mz = dz + dx * w;
      const l = Math.hypot(mx, mz) || 1;
      mx /= l;
      mz /= l;
    }
    if (e.kind === 3) {
      // DASHER: windup → dash → tired (backsteps first if already in your face)
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
      // BOOMER: fuse at close range, then boom
      if (e.fuse < 0 && dist < 2.5) {
        e.fuse = 0.85;
        feed("💦 GUSHER is about to burst — MOVE!");
      }
      if (e.fuse >= 0) {
        e.fuse -= dt;
        mv = 0;
        e.boost = 1 + (0.85 - e.fuse) * 0.45 + Math.sin(t * 30) * 0.06;
        if (Math.random() < 0.25) beep(rand(950, 1250), 0.05, "square", 0.04);
        if (e.fuse <= 0) {
          killEnemy(e, false);
          continue;
        }
      }
    }
    if (e.kind === 1) {
      // BRUTE: ground slam (jump to dodge)
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
      // SHAMAN: heal the most-wounded ally nearby
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
    for (let fi = 0; fi < e.flames.length; fi++) {
      const sc =
        (1 + Math.sin(t * 11 + fi * 1.7) * 0.28) *
        (0.35 + 0.65 * (e.hp / e.maxHp)) *
        (1 - e.wet * 0.4);
      e.flames[fi].scale.set(sc, sc * (1 + Math.sin(t * 13 + fi) * 0.2), sc);
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
      // SPITTER: single shots, burst of 3 on wave 5
      if (e.burstLeft > 0) {
        e.burstT -= dt;
        if (e.burstT <= 0) {
          e.burstLeft--;
          e.burstT = 0.22;
          spitFire(e);
        }
      } else if (dist < 27 && dist > 4 && e.shootCd <= 0) {
        e.shootCd = rand(1.7, 2.6);
        e.burstLeft = S.wave >= 5 ? 2 : S.wave >= 4 ? 1 : 0;
        spitFire(e);
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
