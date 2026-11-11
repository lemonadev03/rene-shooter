import { state as S, enemies, waveState } from "../core/state.js";
import { rand } from "../core/utils.js";
import { beep } from "../core/audio.js";
import { addEnemy, killEnemy, releaseMonster } from "./monsters.js";
import { showBanner } from "../ui/hud.js";
import { MAX_HP, MAX_CHARGE } from "../config/session.js";
import {
  FINAL_WAVE,
  WAVE_COUNT_BASE,
  WAVE_COUNT_PER_WAVE,
  STAGGER_FLOOR_MS,
  STAGGER_BASE_MS,
  STAGGER_SLOPE_MS,
  CLEAR_DELAY_S,
  NEXT_WAVE_DELAY_MS,
  WAVE_CLEAR_HP,
  WAVE_CLEAR_CHARGE,
  WAVE_SUBS,
} from "../config/waves.js";

function pickKind(n, i) {
  if (n === 1) return i % 4 === 3 ? 3 : 0; // imps + dashers
  if (n === 2) return [0, 3, 0, 4, 0, 1][i % 6]; // + boomers, first brute
  if (n === 3) return [0, 2, 3, 5, 0, 4, 1, 2][i % 8]; // + spitters, splitters
  if (n === 4) return [6, 0, 7, 3, 2, 5, 1, 4, 0, 6][i % 10]; // + wardens, shamans
  return [1, 3, 6, 2, 7, 4, 5, 0, 3, 6, 1, 2][i % 12]; // everything, often
}

// Wave timers run on the wall clock, so they are pausable: while the tab is
// hidden the frame loop stops, and they must stop with it.
const activeTimers = new Set();
let timersPaused = false;

function startTimer(timer) {
  timer.handle = setTimeout(() => {
    activeTimers.delete(timer);
    timer.fn();
  }, timer.remaining);
  timer.due = performance.now() + timer.remaining;
}
function scheduleTimer(fn, delay) {
  const timer = { fn, remaining: delay, due: 0, handle: null };
  activeTimers.add(timer);
  if (!timersPaused) startTimer(timer);
  return timer;
}
function cancelTimer(timer) {
  clearTimeout(timer.handle);
  activeTimers.delete(timer);
}
export function pauseWaveTimers() {
  if (timersPaused) return;
  timersPaused = true;
  const now = performance.now();
  for (const timer of activeTimers) {
    clearTimeout(timer.handle);
    timer.handle = null;
    timer.remaining = Math.max(0, timer.due - now);
  }
}
export function resumeWaveTimers() {
  if (!timersPaused) return;
  timersPaused = false;
  for (const timer of activeTimers) startTimer(timer);
}

export function cancelWaveSpawns() {
  for (const timer of waveState.spawnTimers) cancelTimer(timer);
  waveState.spawnTimers.clear();
  waveState.pending = 0;
}
export function resetWaves() {
  cancelWaveSpawns();
  if (waveState.nextTimer) cancelTimer(waveState.nextTimer);
  waveState.nextTimer = null;
  waveState.clearT = 0;
}
export function spawnWave(n) {
  S.wave = n;
  document.getElementById("wavePill").textContent = "WAVE " + n;
  const count = WAVE_COUNT_BASE + n * WAVE_COUNT_PER_WAVE;
  waveState.pending = count;
  showBanner("WAVE " + n, WAVE_SUBS[n] || "They are getting hotter…");
  beep(180, 0.25, "sawtooth", 0.07, -80);
  setTimeout(() => beep(240, 0.2, "sawtooth", 0.06, -60), 200);
  for (let i = 0; i < count; i++) {
    const timer = scheduleTimer(
      () => {
        waveState.spawnTimers.delete(timer);
        waveState.pending--;
        if (S.mode !== "play") return;
        const side = Math.random();
        let x, z;
        if (side < 0.55) {
          x = rand(-44, 44);
          z = rand(9, 15);
        } else if (side < 0.78) {
          x = -46;
          z = rand(-24, 12);
        } else {
          x = 46;
          z = rand(-24, 12);
        }
        addEnemy(pickKind(n, i), x, z);
      },
      i * Math.max(STAGGER_FLOOR_MS, STAGGER_BASE_MS - n * STAGGER_SLOPE_MS),
    );
    waveState.spawnTimers.add(timer);
  }
}
export function killAll() {
  cancelWaveSpawns();
  // Iteration also visits any droplets spawned by a splitter's death.
  for (const e of enemies) killEnemy(e);
}
export function updateWaves(dt, gameOver) {
  for (let i = enemies.length - 1; i >= 0; i--) {
    if (enemies[i].dead) {
      releaseMonster(enemies[i]);
      enemies.splice(i, 1);
    }
  }
  const alive = enemies.length;
  if (alive || waveState.pending || waveState.nextTimer || S.mode !== "play") {
    waveState.clearT = 0;
    return alive;
  }
  waveState.clearT += dt;
  if (waveState.clearT > CLEAR_DELAY_S) {
    waveState.clearT = 0;
    if (S.wave >= FINAL_WAVE) gameOver(true);
    else {
      S.hp = Math.min(MAX_HP, S.hp + WAVE_CLEAR_HP);
      S.water = Math.min(MAX_CHARGE, S.water + WAVE_CLEAR_CHARGE);
      showBanner("WAVE CLEAR! +❤", "Next wave incoming…");
      waveState.nextTimer = scheduleTimer(() => {
        waveState.nextTimer = null;
        if (S.mode === "play") spawnWave(S.wave + 1);
      }, NEXT_WAVE_DELAY_MS);
    }
  }
  return alive;
}
