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
import { ac, initAudio } from "./core/audio.js";
import { initSky, updateSky } from "./world/sky.js";
import { initBeach, updateBeach } from "./world/beach.js";
import { initOcean, updateOcean } from "./world/ocean.js";
import { initPools, updatePoolsAndBeacons } from "./world/pools.js";
import {
  updatePlayer,
  updateSurvival,
  tryJump,
  resetController,
} from "./player/controller.js";
import { updateCamera, updateTitleCamera, aimAt } from "./player/fpcamera.js";
import { vmScene, vmCamera, updateViewmodel } from "./weapons/viewmodel.js";
import {
  shoot,
  spitFire,
  updateProjectiles,
  resetProjectiles,
} from "./weapons/projectiles.js";
import { updateMonsters, releaseMonster } from "./enemies/monsters.js";
import {
  initMonsterLights,
  updateMonsterLights,
} from "./enemies/monsterLights.js";
import {
  spawnWave,
  resetWaves,
  updateWaves,
  killAll,
  pauseWaveTimers,
  resumeWaveTimers,
} from "./enemies/waves.js";
import { initParticles, updateParts } from "./vfx/particles.js";
import { initBeam, updateBeam } from "./vfx/beam.js";
import { initImpacts, updateImpacts } from "./vfx/impacts.js";
import { initHitmarker, updateHitmarker } from "./vfx/hitmarker.js";
import { PU_TYPES, updatePowerups, releasePowerup } from "./ui/powerups.js";
import {
  updateHud,
  setWeapon,
  initShares,
  initWeaponSlots,
  hideBanner,
} from "./ui/hud.js";
import { stageWarmup, warmDom } from "./warmup.js";
import {
  MAX_HP,
  MAX_CHARGE,
  START_WEAPON,
  DEFAULT_FOV,
  START_PITCH,
  NEW_RUN_PLAYER_Z,
  NEW_RUN_POWERUP_TIMER,
} from "./config/session.js";

// Also called at the end of the frame that ended the run, so kills scored
// after the death (a Gusher blast, other monsters in the same update) count.
function renderEndStats() {
  $("stScore").textContent = state.score;
  $("stWave").textContent = state.wave;
  $("stKills").textContent = state.kills;
}

function gameOver(won) {
  state.mode = "end";
  resetWaves();
  resetInput();
  document.exitPointerLock?.();
  $("endTitle").textContent = won ? "BEACH SAVED! 🏆" : "WIPED OUT! 🌊";
  $("endSub").textContent = won
    ? "Every water monster evaporated. Ateneo #2 does it again."
    : "The water monsters got you. Towel off and run it back.";
  renderEndStats();
  $("end").classList.remove("hidden");
  $("hud").classList.add("hidden");
}

function startGame() {
  resetWaves();
  resetInput();
  resetController();
  hideBanner();
  enemies.forEach((e) => releaseMonster(e));
  enemies.length = 0;
  resetProjectiles();
  powerups.forEach((p) => releasePowerup(p));
  powerups.length = 0;
  Object.assign(state, {
    mode: "play",
    hp: MAX_HP,
    water: MAX_CHARGE,
    score: 0,
    kills: 0,
    wave: 0,
    combo: 0,
    comboT: 0,
    weapon: START_WEAPON,
    shake: 0,
    pu: { rapid: 0, power: 0, speed: 0, freeze: 0 },
    puSpawnT: NEW_RUN_POWERUP_TIMER,
  });
  player.pos.set(0, 0, NEW_RUN_PLAYER_Z);
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
  look.pitch = START_PITCH;
  camera.fov = DEFAULT_FOV;
  camera.updateProjectionMatrix();
  updateCamera(0);
  updateViewmodel(1);
  setWeapon(START_WEAPON);
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
initBeam();
initMonsterLights();
initImpacts();
initHitmarker();
lifecycle.gameOver = gameOver;
initInput({ tryJump, setWeapon });
initShares();
initWeaponSlots(setWeapon);
$("playBtn").addEventListener("click", startGame);
$("againBtn").addEventListener("click", startGame);
// The frame loop stops while the tab is hidden, so wave timers stop with it.
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    if (state.mode === "play") pauseWaveTimers();
  } else {
    resumeWaveTimers();
  }
});
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
window.__game.viewmodel = vmScene.userData.viewmodel;
window.__renderer = renderer;

finishAssetRegistration();
await Promise.all([skyReady, assetsReady]);
updateTitleCamera(0);
updateViewmodel(0);
initAudio();
await initializeRendering({ stage: stageWarmup });
await warmDom();
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
    updateBeam(dt);
    updateImpacts(dt);
    updateHitmarker(dt);
    if (state.mode !== "play") {
      updateTitleCamera(t);
      updateMonsterLights();
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
    if (state.mode === "end") renderEndStats();
    updateHud(frame, alive, PU_TYPES);
    updateMonsterLights();
    renderFrame(dt);
  } catch (error) {
    $("err").textContent = "⚠ " + error.message;
    console.error(error);
  }
}
requestAnimationFrame(animate);
