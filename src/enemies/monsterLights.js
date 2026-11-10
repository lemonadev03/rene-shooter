import * as THREE from "three";
import { scene, camera, enemies } from "../core/state.js";

// Wave 5 spawns 3 brutes and 2 shamans, and waves never overlap, so five glowing
// monsters is the most that can be alive at once. Three.js puts the scene's
// point-light count into every lit shader's program key, so these slots are always
// in the scene (idle ones at intensity 0) and the count never changes.
export const MAX_MONSTER_LIGHTS = 5;
const slots = [];
const lit = [];
const _v3 = new THREE.Vector3();

export function initMonsterLights() {
  for (let i = 0; i < MAX_MONSTER_LIGHTS; i++) {
    const light = new THREE.PointLight(0xffffff, 0, 1, 2);
    light.castShadow = false;
    scene.add(light);
    slots.push(light);
  }
}

function glowDistance(glow) {
  glow.getWorldPosition(_v3);
  return _v3.distanceToSquared(camera.position);
}

export function updateMonsterLights() {
  lit.length = 0;
  for (const e of enemies) {
    if (e.dead || !e.glow) continue;
    lit.push(e.glow);
  }
  if (lit.length > slots.length) {
    lit.sort((a, b) => glowDistance(a) - glowDistance(b));
    lit.length = slots.length;
  }
  for (let i = 0; i < slots.length; i++) {
    const light = slots[i];
    const anchor = lit[i];
    if (!anchor) {
      light.intensity = 0;
      continue;
    }
    const glow = anchor.userData.glow;
    anchor.getWorldPosition(light.position);
    light.color.setHex(glow.color);
    light.intensity = glow.intensity;
    light.distance = glow.distance;
    light.decay = glow.decay;
  }
}
