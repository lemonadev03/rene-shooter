import { $ } from "./utils.js";
import * as THREE from "three";
import { camera } from "./state.js";
import { vmCamera } from "../weapons/viewmodel.js";
import { configureShadows } from "../world/sky.js";
import { createPost } from "./post.js";
import { quality, qualityCap, measureDisplayInterval, pickQuality } from "./quality.js";

export const renderer = new THREE.WebGLRenderer({ canvas: $("c"), antialias: false, powerPreference: "high-performance" });
renderer.setPixelRatio(1);
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
// r187 PCF uses hardware filtering and a radius-controlled Vogel disk; PCFSoft is removed.
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.NoToneMapping;
renderer.toneMappingExposure = 0.65;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.autoClear = false;
renderer.info.autoReset = false;
const post = createPost(renderer);
const displayReady = measureDisplayInterval(() => renderer.clear());
let scale = 1;
let samples = [];
let sampleTime = 0;
let comfortableTime = 0;
let debugTime = 0;
let debugFrames = 0;
let lastFrameTime;
let renderCostMs = 0;
const overlay = new URLSearchParams(location.search).get("debug") === "1" ? document.createElement("div") : null;
if (overlay) {
  overlay.id = "debug";
  overlay.style.cssText = "position:fixed;top:6px;left:6px;z-index:30;white-space:pre;pointer-events:none;font:11px monospace;color:#fff;background:#000a;padding:5px";
  document.body.append(overlay);
}

function setScale(value) {
  scale = Math.max(0.5, Math.min(qualityCap(), value));
  quality.renderScale = scale;
  renderer.setPixelRatio(scale);
  renderer.setSize(innerWidth, innerHeight);
  post.resize(innerWidth, innerHeight, scale);
}
export function resize() {
  const aspect = innerWidth / innerHeight;
  camera.aspect = aspect;
  camera.updateProjectionMatrix();
  vmCamera.aspect = aspect;
  vmCamera.updateProjectionMatrix();
  setScale(scale);
}
addEventListener("resize", resize);

export async function initializeRendering() {
  await displayReady;
  setScale(qualityCap());
  const costs = [];
  let previousFrame;
  const gl = renderer.getContext();
  async function completeGPUFrame() {
    const fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const deadline = performance.now() + 200;
    while (gl.clientWaitSync(fence, 0, 0) === gl.TIMEOUT_EXPIRED && performance.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    gl.deleteSync(fence);
  }
  // Fence only during startup: command submission/finish alone can under-report
  // completed GPU work through Chromium's asynchronous command buffer.
  for (let i = 0; i < 28; i++) {
    const frameNow = await new Promise(requestAnimationFrame);
    const start = performance.now();
    renderer.info.reset();
    post.render(1 / 120);
    await completeGPUFrame();
    if (i >= 8) costs.push(Math.max(performance.now() - start,
      quality.measuredIntervalMs < 4 ? frameNow - previousFrame : 0));
    previousFrame = frameNow;
  }
  pickQuality(costs);
  configureShadows();
  setScale(qualityCap());
  // Compile the selected AA/effect variant before allowing play.
  post.render(0);
  await completeGPUFrame();
}

function adaptResolution(frameMs) {
  samples.push(frameMs);
  sampleTime += frameMs;
  while (samples.length > 1 && sampleTime - samples[0] >= 500) sampleTime -= samples.shift();
  if (sampleTime < 500) return;
  const average = sampleTime / samples.length;
  if (average > quality.targetFrameMs * 1.15 && scale > 0.5) {
    setScale(scale * 0.9);
    samples = [];
    sampleTime = comfortableTime = 0;
  } else if (average < quality.targetFrameMs * 0.95 ||
    // At vsync, frame intervals cannot fall below the display interval. Submission
    // headroom plus stable pacing lets resolution recover on those displays too.
    (average <= quality.targetFrameMs * 1.03 && renderCostMs < quality.targetFrameMs * 0.5)) {
    comfortableTime += frameMs;
    if (comfortableTime >= 3000 && scale < qualityCap()) {
      setScale(scale * 1.05);
      samples = [];
      sampleTime = comfortableTime = 0;
    }
  } else comfortableTime = 0;
}

export function renderFrame(dt) {
  const now = performance.now();
  const frameMs = lastFrameTime === undefined ? dt * 1000 : now - lastFrameTime;
  lastFrameTime = now;
  if (!document.hidden && frameMs < 250) adaptResolution(frameMs);
  renderer.info.reset();
  const renderStart = performance.now();
  post.render(dt);
  renderCostMs += (performance.now() - renderStart - renderCostMs) * 0.1;
  debugTime += frameMs;
  debugFrames++;
  if (overlay && debugTime >= 250) {
    const average = debugTime / debugFrames;
    overlay.textContent = `tier ${quality.tier}  render scale ${scale.toFixed(2)}×\n` +
      `fps ${(1000 / average).toFixed(0)}  frame ${average.toFixed(2)} ms\n` +
      `draw calls ${renderer.info.render.calls}  triangles ${renderer.info.render.triangles}`;
    debugTime = debugFrames = 0;
  }
}
