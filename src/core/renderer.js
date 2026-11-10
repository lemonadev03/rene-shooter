import { $ } from "./utils.js";
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

import { scene, camera, state } from "./state.js";
import { vmScene, vmCamera } from "../weapons/viewmodel.js";
const canvas = $("c");
export const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: "high-performance",
});
let _pxRatio = Math.min(devicePixelRatio, 1.5); // cap fill cost on retina; adaptive step-down in loop if frame time sags
renderer.setPixelRatio(_pxRatio);
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;

scene.background = new THREE.Color(0x79d4f2);
scene.fog = new THREE.Fog(0xaee7f7, 55, 150);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.35;

renderer.autoClear = false;
renderer.info.autoReset = false;
let frameTime = 0;
let frameCount = 0;
let debugTime = 0;
const debug = new URLSearchParams(location.search).get("debug") === "1";
const overlay = debug ? document.createElement("div") : null;
if (overlay) {
  overlay.id = "debug";
  overlay.style.cssText =
    "position:fixed;top:6px;left:6px;z-index:30;white-space:pre;pointer-events:none;font:11px monospace;color:#fff;background:#000a;padding:5px";
  document.body.append(overlay);
}

export function resize() {
  const aspect = innerWidth / innerHeight;
  camera.aspect = aspect;
  camera.updateProjectionMatrix();
  vmCamera.aspect = aspect;
  vmCamera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
}
addEventListener("resize", resize);

export function renderFrame(dt) {
  // Keep the existing two-second adaptive-resolution budget in one owner.
  frameTime += dt;
  frameCount++;
  if (frameTime >= 2) {
    const fps = frameCount / frameTime;
    frameTime = 0;
    frameCount = 0;
    const maxRatio = Math.min(devicePixelRatio, 1.5);
    if (fps < 45 && _pxRatio > 1) {
      _pxRatio = Math.max(1, _pxRatio - 0.25);
      renderer.setPixelRatio(_pxRatio);
    } else if (fps > 57 && _pxRatio < maxRatio) {
      _pxRatio = Math.min(maxRatio, _pxRatio + 0.25);
      renderer.setPixelRatio(_pxRatio);
    }
  }
  renderer.info.reset();
  renderer.clear();
  renderer.render(scene, camera);
  if (state.mode === "play") {
    renderer.clearDepth();
    renderer.render(vmScene, vmCamera);
  }
  debugTime += dt;
  if (overlay && debugTime >= 0.25) {
    const frameMs = (debugTime * 1000) / debugFrames;
    overlay.textContent =
      `fps ${(1000 / frameMs).toFixed(0)}  frame ${frameMs.toFixed(2)} ms
` +
      `calls ${renderer.info.render.calls}  triangles ${renderer.info.render.triangles}
` +
      `pixel ratio ${renderer.getPixelRatio().toFixed(2)}`;
    debugTime = 0;
    debugFrames = 0;
  }
  debugFrames++;
}
let debugFrames = 1;
