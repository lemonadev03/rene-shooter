import { state as S, enemies, waveState } from "../core/state.js";
import { rand } from "../core/utils.js";
import { beep } from "../core/audio.js";
import { addEnemy, killEnemy } from "./monsters.js";
import { showBanner } from "../ui/hud.js";
function pickKind(n, i) {
  if (n === 1) return i % 4 === 3 ? 3 : 0; // imps + dashers
  if (n === 2) return [0, 3, 0, 4, 0, 1][i % 6]; // + boomers, first brute
  if (n === 3) return [0, 2, 3, 5, 0, 4, 1, 2][i % 8]; // + spitters, splitters
  if (n === 4) return [6, 0, 7, 3, 2, 5, 1, 4, 0, 6][i % 10]; // + wardens, shamans
  return [1, 3, 6, 2, 7, 4, 5, 0, 3, 6, 1, 2][i % 12]; // everything, often
}
const WAVE_SUBS = [
  "",
  "Droplets + 🏄 SURFERS inbound — dry them out!",
  "💦 GUSHERS burst up close. Tide Brutes slam — jump it!",
  "JETTERS shoot water, PUDDLERS split in two!",
  "🐚 CORAL WARDENS hide behind shells. Kill the 🌧️ RAIN SHAMANS first!",
  "FINAL WAVE — the whole ocean, angrier. Hold the beach! 🏖️",
];

export function cancelWaveSpawns() {
  for (const timer of waveState.spawnTimers) clearTimeout(timer);
  waveState.spawnTimers.clear();
  waveState.pending = 0;
}
export function resetWaves() {
  cancelWaveSpawns();
  clearTimeout(waveState.nextTimer);
  waveState.nextTimer = null;
  waveState.clearT = 0;
}
export function spawnWave(n) {
  S.wave = n;
  document.getElementById("wavePill").textContent = "WAVE " + n;
  const count = 5 + n * 3;
  waveState.pending = count;
  showBanner("WAVE " + n, WAVE_SUBS[n] || "They are getting hotter…");
  beep(180, 0.25, "sawtooth", 0.07, -80);
  setTimeout(() => beep(240, 0.2, "sawtooth", 0.06, -60), 200);
  for (let i = 0; i < count; i++) {
    const timer = setTimeout(
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
      i * Math.max(300, 560 - n * 45),
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
    if (enemies[i].dead) enemies.splice(i, 1);
  }
  const alive = enemies.length;
  if (alive || waveState.pending || waveState.nextTimer || S.mode !== "play") {
    waveState.clearT = 0;
    return alive;
  }
  waveState.clearT += dt;
  if (waveState.clearT > 1.6) {
    waveState.clearT = 0;
    if (S.wave >= 5) gameOver(true);
    else {
      S.hp = Math.min(100, S.hp + 18);
      S.water = Math.min(100, S.water + 35);
      showBanner("WAVE CLEAR! +❤", "Next wave incoming…");
      waveState.nextTimer = setTimeout(() => {
        waveState.nextTimer = null;
        if (S.mode === "play") spawnWave(S.wave + 1);
      }, 1400);
    }
  }
  return alive;
}
