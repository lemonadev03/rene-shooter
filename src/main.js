import { $ } from "./core/utils.js";

import {
  state,
  player,
  look,
  scene,
  camera,
  enemies,
  powerups,
  lifecycle,
} from "./core/state.js";
import { renderer, renderFrame, initializeRendering } from "./core/renderer.js";
import { assetsReady, finishAssetRegistration, markRenderingReady } from "./core/assets.js";
import { quality } from "./core/quality.js";
import {
  initInput,
  applyLookInput,
  resetInput,
  requestPointerLock,
} from "./core/input.js";
import { ac } from "./core/audio.js";
import { initSky, updateSky } from "./world/sky.js";
import { initBeach, updateBeach } from "./world/beach.js";
import { initOcean, updateOcean } from "./world/ocean.js";
import { initPools, updatePoolsAndBeacons } from "./world/pools.js";
import { updatePlayer, updateSurvival, tryJump } from "./player/controller.js";
import { updateCamera, updateTitleCamera, aimAt } from "./player/fpcamera.js";
import { vmScene, vmCamera, updateViewmodel } from "./weapons/viewmodel.js";
import {
  shoot,
  spitFire,
  updateProjectiles,
  resetProjectiles,
} from "./weapons/projectiles.js";
import { updateMonsters } from "./enemies/monsters.js";
import {
  spawnWave,
  resetWaves,
  updateWaves,
  killAll,
} from "./enemies/waves.js";
import { initParticles, updateParts } from "./vfx/particles.js";
import { PU_TYPES, updatePowerups } from "./ui/powerups.js";
import { updateHud, setWeapon, initShares } from "./ui/hud.js";

function gameOver(won) {
  state.mode = "end";
  resetWaves();
  resetInput();
  document.exitPointerLock?.();
  $("endTitle").textContent = won ? "BEACH SAVED! 🏆" : "WIPED OUT! 🌊";
  $("endSub").textContent = won
    ? "Every water monster evaporated. Ateneo #2 does it again."
    : "The water monsters got you. Towel off and run it back.";
  $("stScore").textContent = state.score;
  $("stWave").textContent = state.wave;
  $("stKills").textContent = state.kills;
  $("end").classList.remove("hidden");
  $("hud").classList.add("hidden");
}

function startGame() {
  resetWaves();
  resetInput();
  enemies.forEach((e) => scene.remove(e.g));
  enemies.length = 0;
  resetProjectiles();
  powerups.forEach((p) => scene.remove(p.g));
  powerups.length = 0;
  Object.assign(state, {
    mode: "play",
    hp: 100,
    water: 100,
    score: 0,
    kills: 0,
    wave: 0,
    combo: 0,
    comboT: 0,
    weapon: 1,
    shake: 0,
    pu: { rapid: 0, power: 0, speed: 0, freeze: 0 },
    puSpawnT: 5,
  });
  player.pos.set(0, 0, -12);
  player.vel.set(0, 0, 0);
  Object.assign(player, {
    vy: 0,
    onGround: true,
    jumps: 0,
    speedNow: 0,
    sliding: 0,
    aiming: false,
    firing: false,
    fireCd: 0,
    hurtCd: 0,
    oceanTime: 0,
  });
  look.yaw = 0;
  look.pitch = -0.16;
  camera.fov = 72;
  camera.updateProjectionMatrix();
  updateCamera(0);
  updateViewmodel(1);
  setWeapon(1);
  $("title").classList.add("hidden");
  $("end").classList.add("hidden");
  $("hud").classList.remove("hidden");
  requestPointerLock();
  ac();
  spawnWave(1);
}

const skyReady = initSky(renderer);
initBeach();
initOcean();
initPools();
initParticles();
lifecycle.gameOver = gameOver;
initInput({ tryJump, setWeapon });
initShares();
$("playBtn").addEventListener("click", startGame);
$("againBtn").addEventListener("click", startGame);
window.__game = {
  renderer,
  quality,
  scene,
  camera,
  vmScene,
  vmCamera,
  state,
  player,
  enemies,
  killAll,
  aimAt,
};
// Retain the existing harness's renderer lookup alongside the complete debug API.
window.__renderer = renderer;

finishAssetRegistration();
await Promise.all([skyReady, assetsReady]);
updateTitleCamera(0);
updateViewmodel(0);
await initializeRendering();
markRenderingReady();

let frame = 0;
let previousTime = performance.now();
function animate(now) {
  requestAnimationFrame(animate);
  try {
    const dt = Math.min((now - previousTime) / 1000, 0.05);
    previousTime = now;
    state.time += dt;
    const t = state.time;
    updateOcean(t);
    updateBeach(dt, t);
    updateSky(dt);
    updatePoolsAndBeacons(dt, t);
    updateParts(dt);
    if (state.mode !== "play") {
      updateTitleCamera(t);
      renderFrame(dt);
      return;
    }
    applyLookInput();
    const sprint = updatePlayer(dt);
    updateSurvival(dt);
    updateCamera(dt, sprint);
    updateViewmodel(dt);
    shoot(dt);
    updatePowerups(dt);
    updateProjectiles(dt, ++frame);
    updateMonsters(dt, t, spitFire);
    const alive = updateWaves(dt, gameOver);
    if (state.comboT > 0) {
      state.comboT -= dt;
      if (state.comboT <= 0) state.combo = 0;
    }
    updateHud(frame, alive, PU_TYPES);
    renderFrame(dt);
  } catch (error) {
    $("err").textContent = "⚠ " + error.message;
    console.error(error);
  }
}
requestAnimationFrame(animate);
