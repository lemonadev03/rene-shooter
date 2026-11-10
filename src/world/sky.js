import * as THREE from "three";
import { scene, player } from "../core/state.js";
import { loadHDR, trackAssetTask } from "../core/assets.js";
import { quality } from "../core/quality.js";

export const sun = new THREE.DirectionalLight(0xfff4e4, 3.4);
export const sunDirection = new THREE.Vector3();
const up = new THREE.Vector3(0, 1, 0);
const right = new THREE.Vector3();
const lightUp = new THREE.Vector3();
const center = new THREE.Vector3();
const shadowSpan = 70;

function analyzeSky(texture) {
  const { data, width, height } = texture.image;
  const read = texture.type === THREE.HalfFloatType ? THREE.DataUtils.fromHalfFloat : (v) => v;
  const luminance = (i) => 0.2126 * read(data[i]) + 0.7152 * read(data[i + 1]) + 0.0722 * read(data[i + 2]);
  let peak = 0;
  for (let i = 0; i < width * Math.floor(height / 2) * 4; i += 4) peak = Math.max(peak, luminance(i));
  const direction = new THREE.Vector3();
  let weight = 0;
  const horizon = new THREE.Color(0, 0, 0);
  let horizonSamples = 0;
  for (let y = 0; y < height / 2; y++) {
    const elevation = (0.5 - (y + 0.5) / height) * Math.PI;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const l = luminance(i);
      if (l > peak * 0.35) {
        const azimuth = ((x + 0.5) / width - 0.5) * Math.PI * 2;
        direction.x += Math.cos(elevation) * Math.cos(azimuth) * l;
        direction.y += Math.sin(elevation) * l;
        direction.z += Math.cos(elevation) * Math.sin(azimuth) * l;
        weight += l;
      }
      if (y >= height * 0.48 && l < 2) {
        horizon.r += read(data[i]);
        horizon.g += read(data[i + 1]);
        horizon.b += read(data[i + 2]);
        horizonSamples++;
      }
    }
  }
  direction.divideScalar(weight).normalize();
  horizon.multiplyScalar(1 / horizonSamples);
  return { direction, horizon, peak };
}

export function configureShadows() {
  const size = quality.shadowSize;
  if (sun.shadow.mapSize.x !== size) {
    sun.shadow.map?.dispose();
    sun.shadow.map = null;
    sun.shadow.mapSize.set(size, size);
    sun.shadow.needsUpdate = true;
  }
  // Maintain a ~6 cm soft penumbra across shadow resolutions.
  sun.shadow.radius = size * 0.06 / shadowSpan;
}

export function initSky(renderer) {
  sun.castShadow = true;
  Object.assign(sun.shadow.camera, { left: -35, right: 35, top: 35, bottom: -35, near: 0.5, far: 180 });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias = -0.000035;
  sun.shadow.normalBias = 0.018;
  scene.add(sun, sun.target);
  configureShadows();
  return trackAssetTask("sky-lighting", (async () => {
    const [background, environment] = await Promise.all([
      loadHDR(new URL("../../assets/hdri/kloofendal_48d_partly_cloudy_puresky_2k.hdr", import.meta.url).href),
      loadHDR(new URL("../../assets/hdri/kloofendal_48d_partly_cloudy_puresky_1k.hdr", import.meta.url).href),
    ]);
    const { direction, horizon, peak } = analyzeSky(environment);
    // Facing +Z, screen-right is -X. Preserve the photograph's level horizon and 47.91° sun.
    const rotation = -Math.PI / 4 - Math.atan2(direction.x, direction.z);
    scene.backgroundRotation.set(0, rotation, 0);
    scene.environmentRotation.copy(scene.backgroundRotation);
    sunDirection.copy(direction).applyEuler(scene.backgroundRotation);
    right.crossVectors(up, sunDirection).normalize();
    lightUp.crossVectors(sunDirection, right).normalize();
    background.mapping = environment.mapping = THREE.EquirectangularReflectionMapping;
    scene.background = background;
    scene.backgroundIntensity = 0.9;
    const pmrem = new THREE.PMREMGenerator(renderer);
    const lighting = pmrem.fromEquirectangular(environment);
    scene.environment = lighting.texture;
    // The HDR contains the solar disc too; keep indirect light below the shadow-casting key.
    scene.environmentIntensity = 0.3;
    environment.dispose();
    pmrem.dispose();
    scene.fog = new THREE.FogExp2(horizon.multiplyScalar(scene.backgroundIntensity), 0.0018);
    scene.userData.lighting = {
      sunDirection: sunDirection.toArray(),
      sunElevation: THREE.MathUtils.radToDeg(Math.asin(sunDirection.y)),
      sunAzimuth: THREE.MathUtils.radToDeg(Math.atan2(sunDirection.x, sunDirection.z)),
      hdriPeak: peak,
    };
    updateSky();
  })());
}

export function updateSky() {
  if (!sunDirection.lengthSq()) return;
  center.set(player.pos.x, 0, player.pos.z);
  const texel = shadowSpan / sun.shadow.mapSize.x;
  const x = center.dot(right), y = center.dot(lightUp);
  center.addScaledVector(right, Math.round(x / texel) * texel - x);
  center.addScaledVector(lightUp, Math.round(y / texel) * texel - y);
  sun.target.position.copy(center);
  sun.position.copy(center).addScaledVector(sunDirection, 90);
  sun.target.updateMatrixWorld();
}
