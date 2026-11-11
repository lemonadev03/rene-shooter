// @ts-check
import * as THREE from "three";
import { scene, camera, state, input } from "../core/state.js";
import { on } from "../core/events.js";
import { getMuzzleWorldPosition } from "../weapons/viewmodel.js";
import { HEAT_RAY_COST, HEAT_RAY_COST_RAPID } from "../config/weapons.js";

const start = new THREE.Vector3(), end = new THREE.Vector3();
const along = new THREE.Vector3(), side = new THREE.Vector3(), eye = new THREE.Vector3();
const positions = new Float32Array(12);
const geometry = new THREE.BufferGeometry();
geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
geometry.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 0, 1, 1, 0, 1, 1], 2));
geometry.setIndex([0, 2, 1, 2, 3, 1]);
const material = new THREE.ShaderMaterial({
  uniforms: { time: { value: 0 }, strength: { value: 0 }, length: { value: 1 } },
  vertexShader: `varying vec2 vUv;
    void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: `uniform float time, strength, length; varying vec2 vUv;
    void main(){
      float taper=mix(0.23,1.0,smoothstep(0.0,0.65,vUv.x*length));
      float edge=abs(vUv.y*2.0-1.0)/taper;
      float wave=0.88+0.07*sin(vUv.x*length*23.0-time*90.0)
        +0.05*sin(vUv.x*length*57.0-time*137.0+vUv.y*8.0);
      float halo=(1.0-smoothstep(0.25,1.0,edge))*wave;
      float core=1.0-smoothstep(0.09,0.34,edge);
      vec3 heat=vec3(3.8,1.25,0.08)*halo+vec3(6.0,5.4,3.8)*core;
      gl_FragColor=vec4(heat,strength*max(halo,core));
    }`,
  transparent: true,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  side: THREE.DoubleSide,
  toneMapped: false,
});
const beam = new THREE.Mesh(geometry, material);
beam.name = "Heat Ray beam";
beam.frustumCulled = false;
beam.visible = false;
const muzzleLight = new THREE.PointLight(0xffae38, 0, 5, 2);
muzzleLight.name = "Heat Ray muzzle light";
muzzleLight.castShadow = false;
let fade = 0, pulse = 0;

function drawBeam() {
  getMuzzleWorldPosition(start);
  muzzleLight.position.copy(start);
  along.copy(end).sub(start);
  const length = along.length();
  if (length < 0.001) { beam.visible = false; return; }
  along.divideScalar(length);
  eye.copy(camera.position).sub(start);
  side.crossVectors(along, eye);
  if (side.lengthSq() < 1e-8) side.set(1, 0, 0).applyQuaternion(camera.quaternion);
  side.normalize().multiplyScalar(0.052 * (1 + pulse * 0.24));
  for (let i = 0; i < 4; i++) {
    const p = i < 2 ? start : end, sign = i % 2 ? 1 : -1;
    positions[i * 3] = p.x + side.x * sign;
    positions[i * 3 + 1] = p.y + side.y * sign;
    positions[i * 3 + 2] = p.z + side.z * sign;
  }
  geometry.attributes.position.needsUpdate = true;
  material.uniforms.length.value = length;
  material.uniforms.strength.value = fade / 0.06;
  beam.visible = fade > 0;
}

export { beam as heatBeamMesh };

export function initBeam() {
  // Keep the light in the scene even when idle: light-count changes recompile materials.
  scene.add(beam, muzzleLight);
  on("shot", ({ weapon }) => { if (weapon === 1) pulse = 1; });
}

/** @param {THREE.Vector3} point */
export function setHeatBeamTarget(point) {
  end.copy(point);
  fade = 0.06;
  drawBeam();
  muzzleLight.intensity = 24 * (0.9 + 0.1 * Math.sin(state.time * 113)) + pulse * 6;
}

/** @param {number} dt */
export function updateBeam(dt) {
  material.uniforms.time.value = state.time;
  pulse = Math.max(0, pulse - dt * 22);
  // Same charge test as shoot(): below one shot's cost the gun is waiting to recharge, so the beam fades.
  const cost = state.pu.rapid > 0 ? HEAT_RAY_COST_RAPID : HEAT_RAY_COST;
  const firing = state.mode === "play" && state.weapon === 1 && state.water >= cost && (input.mouseDown || input.touchFire);
  if (!firing) {
    fade = Math.max(0, fade - dt);
    muzzleLight.intensity = 0;
  }
  if (state.mode !== "play") fade = 0;
  if (fade > 0) drawBeam();
  else beam.visible = false;
}
