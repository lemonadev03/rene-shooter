import * as THREE from "three";
import { scene, camera, player } from "../core/state.js";
import { lerp } from "../core/utils.js";
import { sun } from "../world/sky.js";
import { buildSolarSoaker } from "./solarSoakerModel.js";

export const vmScene = new THREE.Scene();
export const vmCamera = new THREE.PerspectiveCamera(
  55,
  innerWidth / innerHeight,
  0.01,
  10,
);
const { group, muzzle } = buildSolarSoaker();
const mount = new THREE.Group();
// The preserved gun model points +Z; view space looks down -Z.
group.rotation.y = Math.PI;
mount.add(group);
mount.position.set(0.32, -0.32, -1.05);
vmScene.add(mount);
const vmSun = new THREE.DirectionalLight();
vmScene.add(vmSun, vmSun.target);
vmScene.add(new THREE.HemisphereLight(0xbfeaff, 0xf2d38a, 1.0));
const worldSun = new THREE.Vector3();

export function updateViewmodel(dt) {
  vmScene.environment = scene.environment;
  vmScene.environmentIntensity = scene.environmentIntensity;
  // Convert the world light into view space as the player's view turns.
  worldSun.copy(sun.position).sub(sun.target.position).normalize();
  worldSun.transformDirection(camera.matrixWorldInverse);
  vmSun.position.copy(worldSun);
  vmSun.color.copy(sun.color);
  vmSun.intensity = sun.intensity;
  const aim = player.aiming;
  const blend = Math.min(1, dt * 12);
  mount.position.x = lerp(mount.position.x, aim ? 0 : 0.32, blend);
  mount.position.y = lerp(mount.position.y, aim ? -0.25 : -0.32, blend);
  mount.position.z = lerp(mount.position.z, aim ? -1.15 : -1.05, blend);
  vmScene.updateMatrixWorld(true);
}

export function getMuzzleWorldPosition(target) {
  // Match the two cameras' different projection FOVs so the bolt begins at
  // the rendered muzzle pixel before converging on the world crosshair ray.
  muzzle.getWorldPosition(target);
  vmCamera.worldToLocal(target);
  const scale =
    Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5)) /
    Math.tan(THREE.MathUtils.degToRad(vmCamera.fov * 0.5));
  target.x *= scale;
  target.y *= scale;
  return camera.localToWorld(target);
}
