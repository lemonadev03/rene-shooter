// @ts-check
import * as THREE from "three";
import { scene, state } from "../core/state.js";
import { spawnP } from "./particles.js";

const MAX = 48;
const ages = new Float32Array(MAX).fill(6);
const centers = Array.from({ length: MAX }, () => new THREE.Vector3());
const geometry = new THREE.PlaneGeometry(1, 1);
geometry.rotateX(-Math.PI / 2);
const ageAttribute = new THREE.InstancedBufferAttribute(ages, 1).setUsage(
  THREE.DynamicDrawUsage,
);
geometry.setAttribute("age", ageAttribute);
const material = new THREE.ShaderMaterial({
  vertexShader: `attribute float age; varying vec2 vUv; varying float vAge;
    void main(){vUv=uv; vAge=age; gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.0);}`,
  fragmentShader: `varying vec2 vUv; varying float vAge;
    void main(){
      vec2 p=vUv*2.0-1.0;
      float r=length(p);
      float grain=0.92+0.08*sin(p.x*31.0+sin(p.y*23.0)*2.0);
      float mask=(1.0-smoothstep(0.35,0.96,r*grain));
      float hot=pow(max(0.0,1.0-vAge/2.0),2.0);
      vec3 color=mix(vec3(0.075,0.042,0.019),vec3(4.8,1.55,0.09),hot);
      gl_FragColor=vec4(color,mask*0.88*(1.0-smoothstep(4.0,6.0,vAge)));
    }`,
  transparent: true,
  depthWrite: false,
  polygonOffset: true,
  polygonOffsetFactor: -1,
  polygonOffsetUnits: -1,
  toneMapped: false,
});
const marks = new THREE.InstancedMesh(geometry, material, MAX);
marks.name = "Heat Ray sand scorches";
marks.frustumCulled = false;
marks.visible = false;
marks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
const matrix = new THREE.Matrix4();
const lastPuff = { sand: -Infinity, monster: -Infinity, prop: -Infinity };
let next = 0,
  lastMark = -Infinity;

export { marks as scorchMarksMesh };

export function initImpacts() {
  matrix.makeScale(0, 0, 0);
  for (let i = 0; i < MAX; i++) marks.setMatrixAt(i, matrix);
  scene.add(marks);
}

/** @param {"sand" | "monster" | "prop"} type @param {THREE.Vector3} pos */
export function spawnImpact(type, pos) {
  if (state.time - lastPuff[type] >= 0.075) {
    lastPuff[type] = state.time;
    if (type === "sand") spawnP(pos, 5, 0xe4c28c, 0.65, 0.48, -2, 1.1);
    else if (type === "monster")
      spawnP(pos, 5, 0xfff9ed, 0.28, 0.65, 0.45, 1.1);
    else spawnP(pos, 4, 0xffc34d, 2.7, 0.24, -5, 2.0);
  }
  if (type !== "sand") return;
  // Reheat nearby marks, and cap new decals at ~8/s so the 48 slots can live for 6s.
  for (let i = 0; i < MAX; i++) {
    if (ages[i] < 6 && centers[i].distanceToSquared(pos) < 0.055) {
      ages[i] = 0;
      ageAttribute.needsUpdate = true;
      return;
    }
  }
  if (state.time - lastMark < 0.13) return;
  lastMark = state.time;
  const i = next;
  next = (next + 1) % MAX;
  centers[i].copy(pos);
  ages[i] = 0;
  const size = 0.32 + Math.random() * 0.16;
  matrix.makeScale(size, 1, size);
  matrix.setPosition(pos.x, 0.016 + (i % 4) * 0.0005, pos.z);
  marks.setMatrixAt(i, matrix);
  marks.instanceMatrix.needsUpdate = true;
  ageAttribute.needsUpdate = true;
  marks.visible = true;
}

/** @param {number} dt */
export function updateImpacts(dt) {
  let active = false;
  for (let i = 0; i < MAX; i++) {
    if (state.mode !== "play") ages[i] = 6;
    if (ages[i] < 6) {
      ages[i] = Math.min(6, ages[i] + dt);
      active = true;
    }
  }
  marks.visible = active;
  if (active) ageAttribute.needsUpdate = true;
}
