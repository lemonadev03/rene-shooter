import * as THREE from "three";
import { HDRLoader } from "three/addons/loaders/HDRLoader.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";

export const loadingManager = new THREE.LoadingManager();
let loaded = 0;
let total = 1;
let idle = false;
let renderingReady = false;
const failures = new Set();
const readyLabel = document.getElementById("playBtn").dataset.readyLabel;
let resolveReady;
export const assetsReady = new Promise((resolve) => { resolveReady = resolve; });

function updateLoading() {
  const button = document.getElementById("playBtn");
  button.disabled = !idle || !renderingReady || failures.size > 0;
  button.textContent = button.disabled ? "Loading…" : readyLabel;
  document.getElementById("loadingProgress").textContent = failures.size
    ? "An asset could not load. Reload to retry."
    : !idle ? `Loading assets… ${loaded}/${total}`
      : !renderingReady ? "Optimizing rendering…" : "Ready";
}
loadingManager.onStart = (_url, count, size) => {
  idle = false;
  loaded = count;
  total = size;
  updateLoading();
};
loadingManager.onProgress = (_url, count, size) => {
  loaded = count;
  total = size;
  updateLoading();
};
loadingManager.onError = (url) => { failures.add(url); updateLoading(); };
loadingManager.onLoad = () => {
  idle = true;
  if (!failures.size) resolveReady();
  updateLoading();
};

// Hold the initial batch open while modules register their startup assets.
loadingManager.itemStart("startup");
export function finishAssetRegistration() { loadingManager.itemEnd("startup"); }
export function markRenderingReady() { renderingReady = true; updateLoading(); }
export function trackAssetTask(name, task) {
  loadingManager.itemStart(name);
  return Promise.resolve(task).catch((error) => {
    loadingManager.itemError(name);
    throw error;
  }).finally(() => loadingManager.itemEnd(name));
}

// Decode textures off the main thread where createImageBitmap honors the options that
// keep pixels identical to TextureLoader's (flipped on decode, straight alpha, no
// color conversion). Older Safari and Firefox keep TextureLoader, as GLTFLoader does.
function supportsBitmapTextures() {
  if (typeof createImageBitmap === "undefined") return false;
  const userAgent = navigator.userAgent;
  const safari = /^((?!chrome|android).)*safari/i.test(userAgent);
  const safariVersion = Number(userAgent.match(/Version\/(\d+)/)?.[1] ?? 0);
  const firefoxVersion = Number(userAgent.match(/Firefox\/(\d+)/)?.[1] ?? Infinity);
  return !(safari && safariVersion < 17) && firefoxVersion >= 98;
}
const bitmapTextures = supportsBitmapTextures();
const textureLoader = bitmapTextures
  ? new THREE.ImageBitmapLoader(loadingManager).setOptions({
    imageOrientation: "flipY",
    premultiplyAlpha: "none",
    colorSpaceConversion: "none",
  })
  : new THREE.TextureLoader(loadingManager);
const hdrLoader = new HDRLoader(loadingManager);
const gltfLoader = new GLTFLoader(loadingManager).setMeshoptDecoder(MeshoptDecoder);
export async function loadTexture(url, { colorSpace = THREE.SRGBColorSpace } = {}) {
  let texture;
  if (bitmapTextures) {
    texture = new THREE.Texture(await textureLoader.loadAsync(url));
    // The bitmap is already flipped, so the GPU upload must not flip it again.
    texture.flipY = false;
    texture.needsUpdate = true;
  } else {
    texture = await textureLoader.loadAsync(url);
  }
  texture.colorSpace = colorSpace;
  return texture;
}
export function loadHDR(url) { return hdrLoader.loadAsync(url); }
export function loadGLTF(url) { return gltfLoader.loadAsync(url); }
