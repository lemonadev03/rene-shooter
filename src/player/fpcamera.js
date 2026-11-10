import * as THREE from "three";
import { camera, state as S, player, look } from "../core/state.js";
import { ScalarSpring } from "../core/spring.js";
import { on } from "../core/events.js";
import { shoreZ } from "../world/ocean.js";

const forward = new THREE.Vector3();
const target = new THREE.Vector3();
const fov = new ScalarSpring(72, { stiffness: 729, damping: 54 });
const eye = new ScalarSpring(1.65, { stiffness: 1024, damping: 64 });
const landing = new ScalarSpring(0, { stiffness: 900, damping: 60 });
const roll = new ScalarSpring(0, { stiffness: 900, damping: 60 });
const punch = new ScalarSpring(0, { stiffness: 3600, damping: 120 });
let trauma = 0, noiseTime = 0;
const radians = THREE.MathUtils.degToRad;
const noise = (t, phase) => (Math.sin(t * 23 + phase) + 0.5 * Math.sin(t * 37 + phase * 2.3)) / 1.5;

on("hurt", ({ dmg }) => { trauma = Math.min(1, trauma + Math.max(0.25, dmg / 40)); });
on("land", ({ speed }) => { landing.velocity -= Math.min(4.8, speed * 0.35); });
on("shot", ({ weapon, aiming }) => {
  punch.value = Math.min(radians(3), punch.value + radians(weapon === 2 ? 1.5 : 0.25) * (aiming ? 0.4 : 1));
});

export function updateCamera(dt, sprint = false) {
  const eyeHeight = player.sliding > 0 ? 0.95 : 1.65;
  if (dt === 0) {
    // Also used by startGame and aimAt: no stale offsets from the previous view.
    eye.reset(eyeHeight); landing.reset(); roll.reset(); punch.reset();
    fov.reset(camera.fov); trauma = 0; S.shake = 0;
  }
  noiseTime += dt;
  trauma = Math.max(0, Math.max(trauma, S.shake) - dt * 1.5);
  S.shake = Math.max(0, S.shake - dt);
  const shake = trauma * trauma;
  camera.position.copy(player.pos);
  camera.position.y += eye.update(dt, eyeHeight) + Math.max(-0.06, landing.update(dt));
  camera.position.x += noise(noiseTime, 1.7) * shake * 0.045;
  camera.position.y += noise(noiseTime, 4.1) * shake * 0.035;
  forward.set(
    Math.sin(look.yaw) * Math.cos(look.pitch),
    Math.sin(look.pitch),
    Math.cos(look.yaw) * Math.cos(look.pitch),
  );
  target.copy(camera.position).add(forward);
  camera.lookAt(target);
  const lateral = -Math.cos(look.yaw) * player.vel.x + Math.sin(look.yaw) * player.vel.z;
  const strafeRoll = -THREE.MathUtils.clamp(lateral / 5.6, -1, 1) * radians(1.2);
  const slideRoll = player.sliding > 0 ? radians(4) : 0;
  camera.rotateX(punch.update(dt) + noise(noiseTime, 2.4) * shake * radians(0.65));
  camera.rotateY(noise(noiseTime, 5.3) * shake * radians(0.5));
  camera.rotateZ(roll.update(dt, strafeRoll + slideRoll));
  const targetFov = player.aiming ? 55 : sprint && player.speedNow > 6 ? 78 : 72;
  const nextFov = fov.update(dt, targetFov);
  if (Math.abs(camera.fov - nextFov) > 0.0001) {
    camera.fov = nextFov;
    camera.updateProjectionMatrix();
  }
  camera.updateMatrixWorld(true);
}

export function updateTitleCamera(t) {
  const x = Math.sin(t * 0.035) * 18;
  camera.position.set(x, 1.65, shoreZ(x) - 4);
  camera.lookAt(x + 3, 1.2, 65);
  if (camera.fov !== 72) {
    camera.fov = 72;
    camera.updateProjectionMatrix();
  }
  camera.updateMatrixWorld(true);
}

export function aimAt(vec3) {
  updateCamera(0);
  target.copy(vec3).sub(camera.position);
  if (target.lengthSq() < 1e-9) return;
  look.yaw = Math.atan2(target.x, target.z);
  look.pitch = Math.atan2(target.y, Math.hypot(target.x, target.z));
  camera.lookAt(vec3);
  camera.updateMatrixWorld(true);
}
