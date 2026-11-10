import * as THREE from "three";
import { camera, state as S, player, look } from "../core/state.js";
import { clamp, lerp, rand } from "../core/utils.js";
import { shoreZ } from "../world/ocean.js";

const forward = new THREE.Vector3();
const target = new THREE.Vector3();
const pitchLimit = THREE.MathUtils.degToRad(89);

export function updateCamera(dt, sprint = false) {
  const eyeHeight = player.sliding > 0 ? 0.95 : 1.65;
  camera.position.copy(player.pos);
  camera.position.y += eyeHeight;
  if (S.shake > 0) {
    S.shake = Math.max(0, S.shake - dt);
    camera.position.x += rand(-1, 1) * S.shake * 0.18;
    camera.position.y += rand(-1, 1) * S.shake * 0.18;
  }
  forward.set(
    Math.sin(look.yaw) * Math.cos(look.pitch),
    Math.sin(look.pitch),
    Math.cos(look.yaw) * Math.cos(look.pitch),
  );
  target.copy(camera.position).add(forward);
  camera.lookAt(target);
  const targetFov = player.aiming
    ? 55
    : sprint && player.speedNow > 6
      ? 78
      : 72;
  if (Math.abs(camera.fov - targetFov) > 0.05) {
    camera.fov = lerp(camera.fov, targetFov, Math.min(1, dt * 8));
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
  target.copy(vec3).sub(camera.position);
  if (target.lengthSq() < 1e-9) return;
  look.yaw = Math.atan2(target.x, target.z);
  look.pitch = clamp(
    Math.atan2(target.y, Math.hypot(target.x, target.z)),
    -pitchLimit,
    pitchLimit,
  );
  updateCamera(0);
}
