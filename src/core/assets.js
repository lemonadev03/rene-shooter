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
export const assetsReady = new Promise((resolve) => {
  resolveReady = resolve;
});

function updateLoading() {
  const button = document.getElementById("playBtn");
  button.disabled = !idle || !renderingReady || failures.size > 0;
  button.textContent = !button.disabled
    ? readyLabel
    : !idle
      ? `Loading ${loaded} of ${total}`
      : !renderingReady
        ? "Preparing graphics"
        : "Loading…";
  document.getElementById("loadingProgress").textContent = failures.size
    ? "A game file couldn't load. Reload the page to try again."
    : "";
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
// Loaders call itemError on every failed attempt, including ones the retry wrapper below
// recovers from, so a single failed request must not latch the error UI. Only a terminal
// failure does: withRetry's last attempt and trackAssetTask's catch add to `failures`.
loadingManager.onError = () => {};
loadingManager.onLoad = () => {
  idle = true;
  if (!failures.size) resolveReady();
  updateLoading();
};

// Hold the initial batch open while modules register their startup assets.
loadingManager.itemStart("startup");
export function finishAssetRegistration() {
  loadingManager.itemEnd("startup");
}
export function markRenderingReady() {
  renderingReady = true;
  updateLoading();
}
// Every startup load runs inside one of these groups. The group's open item keeps the manager
// from going idle (and onLoad from resolving assetsReady) while a retry waits to start.
export function trackAssetTask(name, task) {
  loadingManager.itemStart(name);
  return Promise.resolve(task)
    .catch((error) => {
      failures.add(name);
      updateLoading();
      throw error;
    })
    .finally(() => loadingManager.itemEnd(name));
}

// Decode textures off the main thread where createImageBitmap honors the options that
// keep pixels identical to TextureLoader's (flipped on decode, straight alpha, no
// color conversion). Older Safari and Firefox keep TextureLoader, as GLTFLoader does.
function supportsBitmapTextures() {
  if (typeof createImageBitmap === "undefined") return false;
  const userAgent = navigator.userAgent;
  const safari = /^((?!chrome|android).)*safari/i.test(userAgent);
  const safariVersion = Number(userAgent.match(/Version\/(\d+)/)?.[1] ?? 0);
  const firefoxVersion = Number(
    userAgent.match(/Firefox\/(\d+)/)?.[1] ?? Infinity,
  );
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
const gltfLoader = new GLTFLoader(loadingManager).setMeshoptDecoder(
  MeshoptDecoder,
);
// A transient network error (a response body that fails mid-read, a reset connection) should
// not end the session: try each load up to three times, waiting 300 ms and then 1 s. The last
// failure is terminal and is recorded here as well as by the enclosing trackAssetTask.
const RETRY_DELAYS = [300, 1000];
async function withRetry(url, load) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await load();
    } catch (error) {
      if (attempt >= RETRY_DELAYS.length) {
        failures.add(url);
        updateLoading();
        throw error;
      }
      await new Promise((resolve) =>
        setTimeout(resolve, RETRY_DELAYS[attempt]),
      );
    }
  }
}
export function loadTexture(url, { colorSpace = THREE.SRGBColorSpace } = {}) {
  return withRetry(url, async () => {
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
  });
}
export function loadHDR(url) {
  return withRetry(url, () => hdrLoader.loadAsync(url));
}
export function loadGLTF(url) {
  return withRetry(url, () => gltfLoader.loadAsync(url));
}
