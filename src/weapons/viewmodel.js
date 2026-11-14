import * as THREE from "three";
import {
  scene,
  camera,
  player,
  look,
  input,
  state as S,
} from "../core/state.js";
import { ScalarSpring, VectorSpring } from "../core/spring.js";
import { on } from "../core/events.js";
import { sun } from "../world/sky.js";
import { buildSolarSoakerHD } from "./solarSoakerHD.js";

export const vmScene = new THREE.Scene();
export const vmCamera = new THREE.PerspectiveCamera(
  55,
  innerWidth / innerHeight,
  0.01,
  10,
);
export const mount = new THREE.Group();
vmScene.add(mount);
export let model, sight;
let muzzle;
const hipPosition = new THREE.Vector3(0.32, -0.3, -0.5);
// At the hip the barrel converges on the crosshair ray this far ahead (m),
// with a slight cant around the bore so the gun still reads as held.
const HIP_CONVERGE = 18;
const HIP_CANT = -0.09;
const hipRotation = new THREE.Quaternion();
const hipAim = new THREE.Quaternion();
const hipCant = new THREE.Quaternion();
const hipDir = new THREE.Vector3();
const FORWARD = new THREE.Vector3(0, 0, -1);
const adsPosition = new THREE.Vector3();
const adsRotation = new THREE.Quaternion();
const sightMatrix = new THREE.Matrix4();
const sightScale = new THREE.Vector3();
// The HUD crosshair fades out as the sight comes up, so the red dot is the only aim point.
const crosshair = document.getElementById("cross");
let crosshairOpacity = 1;

export function mountGun(nextModel, { flip = false } = {}) {
  mount.clear();
  model = nextModel;
  sight = model.sight;
  muzzle = model.muzzle;
  model.group.rotation.y = flip ? Math.PI : 0;
  mount.add(model.group);
  sight.updateWorldMatrix(true, false);
  sightMatrix.copy(mount.matrixWorld).invert().multiply(sight.matrixWorld);
  sightMatrix.decompose(adsPosition, adsRotation, sightScale);
  adsRotation.invert();
  adsPosition.applyQuaternion(adsRotation).negate();
  // A 58 mm clear window at 157 mm eye relief fills ~20% of a 16:9 view.
  adsPosition.z -= 0.157;
  // Hip pose: the ADS orientation (sight along the view axis), turned so the
  // bore points at the crosshair from the hip position, then canted.
  hipDir.set(0, 0, -HIP_CONVERGE).sub(hipPosition).normalize();
  hipAim.setFromUnitVectors(FORWARD, hipDir);
  hipCant.setFromAxisAngle(hipDir, HIP_CANT);
  hipRotation.copy(hipCant).multiply(hipAim).multiply(adsRotation);
  vmScene.userData.viewmodel ??= {};
  Object.assign(vmScene.userData.viewmodel, { mount, sight, model });
  return model;
}
mountGun(buildSolarSoakerHD(), { flip: false });
mount.position.copy(hipPosition);
mount.quaternion.copy(hipRotation);
const vmSun = new THREE.DirectionalLight();
vmScene.add(vmSun, vmSun.target);
vmScene.add(new THREE.HemisphereLight(0xbfeaff, 0xf2d38a, 1.0));
const worldSun = new THREE.Vector3();
const aim = new ScalarSpring(0, { stiffness: 729, damping: 54 });
const sprintPose = new ScalarSpring(0, { stiffness: 1024, damping: 64 });
const slidePose = new ScalarSpring();
const sway = new VectorSpring(new THREE.Vector3(), {
  stiffness: 625,
  damping: 42,
});
const bob = new VectorSpring(new THREE.Vector3(), {
  stiffness: 1600,
  damping: 60,
});
const recoilPosition = new VectorSpring(new THREE.Vector3(), {
  stiffness: 2500,
  damping: 100,
});
const recoilRotation = new VectorSpring(new THREE.Vector3(), {
  stiffness: 2500,
  damping: 100,
});
const jumpLand = new ScalarSpring(0, { stiffness: 900, damping: 48 });
const heat = new ScalarSpring(0, { stiffness: 25, damping: 10 });
const motionTarget = new THREE.Vector3();
const motionEuler = new THREE.Euler();
const motionRotation = new THREE.Quaternion();
const previousPosition = player.pos.clone();
let previousYaw = look.yaw,
  previousPitch = look.pitch,
  bobPhase = 0;
const radians = THREE.MathUtils.degToRad;

on("shot", ({ weapon, aiming }) => {
  const scale = aiming ? 0.4 : 1;
  const burst = weapon === 2;
  recoilPosition.value.z = Math.min(
    0.075,
    recoilPosition.value.z + (burst ? 0.065 : 0.015) * scale,
  );
  // Keep the muzzle near the crosshair: sustained hip fire tops out at 2.5°.
  recoilRotation.value.x = Math.min(
    radians(2.5),
    recoilRotation.value.x + radians(burst ? 2.2 : 0.3) * scale,
  );
  recoilRotation.value.y +=
    radians((Math.random() * 2 - 1) * (burst ? 1.1 : 0.3)) * scale;
});
on("jump", ({ double }) => {
  jumpLand.velocity += double ? 1.6 : 1.15;
});
on("land", ({ speed }) => {
  jumpLand.velocity -= Math.min(4, speed * 0.28);
});

export function updateViewmodel(dt) {
  vmScene.environment = scene.environment;
  vmScene.environmentIntensity = scene.environmentIntensity;
  // Convert the world light into view space as the player's view turns.
  worldSun.copy(sun.position).sub(sun.target.position).normalize();
  worldSun.transformDirection(camera.matrixWorldInverse);
  vmSun.position.copy(worldSun);
  vmSun.color.copy(sun.color);
  vmSun.intensity = sun.intensity;
  if (dt >= 0.5) {
    // startGame supplies a one-second warmup; discard motion from the last life.
    aim.reset(player.aiming ? 1 : 0);
    sprintPose.reset();
    slidePose.reset();
    sway.reset();
    bob.reset();
    recoilPosition.reset();
    recoilRotation.reset();
    jumpLand.reset();
    heat.reset();
    previousPosition.copy(player.pos);
    previousYaw = look.yaw;
    previousPitch = look.pitch;
    bobPhase = 0;
    dt = 0;
  }
  const aiming = aim.update(dt, player.aiming ? 1 : 0);
  const free = 1 - aiming;
  const nextCrosshairOpacity =
    Math.round(Math.max(0, 1 - aiming * 2.5) * 50) / 50;
  if (crosshair && nextCrosshairOpacity !== crosshairOpacity) {
    crosshairOpacity = nextCrosshairOpacity;
    crosshair.style.opacity = crosshairOpacity;
  }
  const sprinting =
    !player.aiming &&
    player.sliding <= 0 &&
    player.speedNow > 6 &&
    (input.keys.ShiftLeft || input.keys.ShiftRight);
  const sprint = sprintPose.update(dt, sprinting ? 1 : 0) * free;
  const slide = slidePose.update(dt, player.sliding > 0 ? 1 : 0) * free;
  const yawDelta = Math.atan2(
    Math.sin(look.yaw - previousYaw),
    Math.cos(look.yaw - previousYaw),
  );
  const pitchDelta = look.pitch - previousPitch;
  previousYaw = look.yaw;
  previousPitch = look.pitch;
  const limit = radians(2.5);
  motionTarget.set(
    THREE.MathUtils.clamp(
      (-pitchDelta / Math.max(dt, 0.001)) * 0.018,
      -limit,
      limit,
    ),
    THREE.MathUtils.clamp(
      (yawDelta / Math.max(dt, 0.001)) * 0.018,
      -limit,
      limit,
    ),
    0,
  );
  sway.update(dt, motionTarget);
  const distance = Math.min(
    Math.hypot(
      player.pos.x - previousPosition.x,
      player.pos.z - previousPosition.z,
    ),
    player.speedNow * dt * 1.2,
  );
  previousPosition.copy(player.pos);
  if (player.onGround)
    bobPhase =
      (bobPhase + (distance * Math.PI * 2) / (1.6 + sprint * 0.6)) %
      (Math.PI * 2);
  const amplitude =
    player.onGround && player.sliding <= 0
      ? Math.min(1.5, player.speedNow / 5.6) * 0.011
      : 0;
  motionTarget.set(
    Math.sin(bobPhase) * amplitude,
    Math.sin(bobPhase * 2) * amplitude * 0.6,
    0,
  );
  bob.update(dt, motionTarget);
  recoilPosition.update(dt);
  recoilRotation.update(dt);
  jumpLand.update(dt);
  mount.position.copy(hipPosition).lerp(adsPosition, aiming);
  mount.position.x += (bob.value.x + sprint * 0.025) * free;
  mount.position.y +=
    (bob.value.y + jumpLand.value - sprint * 0.13 - slide * 0.035) * free;
  mount.position.z += sprint * 0.045 + recoilPosition.value.z;
  mount.quaternion.copy(hipRotation).slerp(adsRotation, aiming);
  motionEuler.set(
    sway.value.x * free - sprint * 0.28 + recoilRotation.value.x,
    sway.value.y * free + sprint * 0.18 + recoilRotation.value.y,
    sprint * 0.25 + slide * radians(10) - bob.value.x * 0.7 * free,
  );
  motionRotation.setFromEuler(motionEuler);
  mount.quaternion.multiply(motionRotation);
  const firing = (input.mouseDown || input.touchFire) && S.water > 0;
  heat.stiffness = firing ? 25 : 9;
  heat.damping = firing ? 10 : 6;
  model.setHeat?.(heat.update(dt, firing ? 1 : 0));
  model.setCharge?.(S.water / 100);
  model.update(dt);
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
