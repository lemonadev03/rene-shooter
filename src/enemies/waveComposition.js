// @ts-check
// Which monsters each wave spawns, and what that implies for pool and light sizes.
// Pure: it imports only src/config/*, so Node tests can load it without a DOM or three.
import { MON } from "../config/monsters.js";
import {
  FINAL_WAVE,
  WAVE_COUNT_BASE,
  WAVE_COUNT_PER_WAVE,
} from "../config/waves.js";

/**
 * Kind ID of the i-th monster of wave n.
 * @param {number} n Wave number.
 * @param {number} i Spawn index within the wave.
 * @returns {number}
 */
export function pickKind(n, i) {
  if (n === 1) return i % 4 === 3 ? 3 : 0; // imps + dashers
  if (n === 2) return [0, 3, 0, 4, 0, 1][i % 6]; // + boomers, first brute
  if (n === 3) return [0, 2, 3, 5, 0, 4, 1, 2][i % 8]; // + spitters, splitters
  if (n === 4) return [6, 0, 7, 3, 2, 5, 1, 4, 0, 6][i % 10]; // + wardens, shamans
  return [1, 3, 6, 2, 7, 4, 5, 0, 3, 6, 1, 2][i % 12]; // everything, often
}

/**
 * Monsters spawned by wave n (count).
 * @param {number} n Wave number.
 */
export function waveCount(n) {
  return WAVE_COUNT_BASE + n * WAVE_COUNT_PER_WAVE;
}

/**
 * Kind IDs of wave n in spawn order.
 * @param {number} n Wave number.
 * @returns {number[]}
 */
export function waveKinds(n) {
  const kinds = [];
  const count = waveCount(n);
  for (let i = 0; i < count; i++) kinds.push(pickKind(n, i));
  return kinds;
}

// Every monster of the wave counted alive at once, plus what its death spawns.
// Waves never overlap, so the peak of one wave is the peak of the run.
/**
 * @param {number} n Wave number.
 * @returns {number[]}
 */
function aliveByKind(n) {
  const alive = MON.map(() => 0);
  for (const kind of waveKinds(n)) {
    alive[kind]++;
    for (const child of MON[kind].splitsInto || []) alive[child]++;
  }
  return alive;
}

/**
 * Most of each kind alive at once across waves 1..FINAL_WAVE, indexed by kind ID.
 * @returns {number[]}
 */
export function maxAliveByKind() {
  const max = MON.map(() => 0);
  for (let n = 1; n <= FINAL_WAVE; n++) {
    const alive = aliveByKind(n);
    for (let kind = 0; kind < max.length; kind++) {
      max[kind] = Math.max(max[kind], alive[kind]);
    }
  }
  return max;
}

/** Most glowing monsters alive at once across waves 1..FINAL_WAVE. */
export function maxGlowing() {
  let max = 0;
  for (let n = 1; n <= FINAL_WAVE; n++) {
    const alive = aliveByKind(n);
    let glowing = 0;
    for (let kind = 0; kind < alive.length; kind++) {
      if (MON[kind].glow) glowing += alive[kind];
    }
    max = Math.max(max, glowing);
  }
  return max;
}
