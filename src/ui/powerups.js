import * as THREE from "three";
import { rand } from "../core/utils.js";
import { scene, state as S, player, powerups } from "../core/state.js";
import { beep } from "../core/audio.js";
import { spawnP } from "../vfx/particles.js";
import { makeLabel } from "../vfx/labels.js";
import { feed } from "./hud.js";
const PU_TYPES = [
  { k: "rapid", emoji: "⚡", name: "RAPID RAY", col: 0xffd23a, dur: 10 },
  { k: "power", emoji: "☀️", name: "MEGA HEAT", col: 0xff7b1c, dur: 12 },
  { k: "speed", emoji: "👟", name: "SPEED SODA", col: 0x2dd4bf, dur: 10 },
  { k: "heal", emoji: "❤️", name: "+40 HP", col: 0xef4444, dur: 0 },
  { k: "freeze", emoji: "🧂", name: "SALT STORM", col: 0xf5f5f0, dur: 6 },
];

function spawnPowerup() {
  const t = PU_TYPES[Math.floor(Math.random() * PU_TYPES.length)];
  let x,
    z,
    tries = 0;
  do {
    x = rand(-38, 38);
    z = rand(-32, 10);
    tries++;
  } while (Math.hypot(x - player.pos.x, z - player.pos.z) < 7 && tries < 8);
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  scene.add(g);
  const orb = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.42, 0),
    new THREE.MeshStandardMaterial({
      color: t.col,
      emissive: t.col,
      emissiveIntensity: 1.1,
      roughness: 0.25,
    }),
  );
  orb.position.y = 1.05;
  orb.castShadow = true;
  g.add(orb);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.62, 0.06, 8, 24),
    new THREE.MeshBasicMaterial({
      color: t.col,
      transparent: true,
      opacity: 0.85,
    }),
  );
  ring.position.y = 1.05;
  ring.rotation.x = Math.PI / 2.4;
  g.add(ring);
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.35, 0.35, 4.5, 12, 1, true),
    new THREE.MeshBasicMaterial({
      color: t.col,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    }),
  );
  beam.position.y = 2.25;
  g.add(beam);
  const label = makeLabel(`${t.emoji} ${t.name}`, "", 0.62);
  label.position.y = 2.05;
  g.add(label);
  const blob2 = new THREE.Mesh(
    new THREE.CircleGeometry(0.8, 20),
    new THREE.MeshBasicMaterial({
      color: t.col,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
    }),
  );
  blob2.rotation.x = -Math.PI / 2;
  blob2.position.y = 0.04;
  g.add(blob2);
  powerups.push({ g, orb, ring, t, life: 26, phase: rand(0, 6) });
  spawnP(g.position.clone().setY(1), 16, t.col, 2, 0.6, 0, 2.2);
}
function applyPowerup(p) {
  const t = p.t;
  if (t.k === "heal") {
    S.hp = Math.min(100, S.hp + 40);
    feed("❤️ +40 HP");
  } else {
    S.pu[t.k] = t.dur;
    feed(`${t.emoji} ${t.name}! ${t.dur}s`);
  }
  S.score += 25;
  spawnP(p.g.position.clone().setY(1.1), 26, t.col, 3, 0.7, -1, 3);
  beep(660, 0.09, "square", 0.06);
  setTimeout(() => beep(880, 0.09, "square", 0.06), 80);
  setTimeout(() => beep(1180, 0.12, "square", 0.06), 160);
}
function updatePowerups(dt) {
  for (const k in S.pu) if (S.pu[k] > 0) S.pu[k] = Math.max(0, S.pu[k] - dt);
  if (S.mode === "play") {
    S.puSpawnT -= dt;
    if (S.puSpawnT <= 0) {
      S.puSpawnT = rand(10, 15);
      if (powerups.length < 2) spawnPowerup();
    }
  }
  for (let i = powerups.length - 1; i >= 0; i--) {
    const p = powerups[i];
    p.life -= dt;
    p.phase += dt;
    p.orb.rotation.y += dt * 2.2;
    p.orb.rotation.x += dt * 0.7;
    p.orb.position.y = 1.05 + Math.sin(p.phase * 2.6) * 0.16;
    p.ring.rotation.z += dt * 1.6;
    p.g.visible = !(p.life < 5 && Math.sin(p.phase * 10) > 0); // blink before despawn
    if (p.life <= 0) {
      scene.remove(p.g);
      powerups.splice(i, 1);
      continue;
    }
    if (S.mode === "play") {
      const d = Math.hypot(
        player.pos.x - p.g.position.x,
        player.pos.z - p.g.position.z,
      );
      if (d < 1.5) {
        applyPowerup(p);
        scene.remove(p.g);
        powerups.splice(i, 1);
      }
    }
  }
}

export { PU_TYPES, updatePowerups };
