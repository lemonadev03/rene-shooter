// @ts-check
// Wave tuning: how many monsters spawn, how fast, and the clear rewards.
// Spawn stagger and the next-wave delay run on wall-clock setTimeout (ms);
// the clear delay runs on accumulated game time (s). Keep those domains apart.
// Which monsters spawn lives in src/enemies/waves.js (pickKind).

/** The last wave. Clearing it wins the run. */
export const FINAL_WAVE = 5;
/** Monsters in a wave before the per-wave increment (count). */
export const WAVE_COUNT_BASE = 5;
/** Extra monsters for each wave number (count per wave). */
export const WAVE_COUNT_PER_WAVE = 3;
/** Shortest gap between spawns inside a wave (ms). */
export const STAGGER_FLOOR_MS = 300;
/** Gap between spawns in wave 0, before the per-wave slope (ms). */
export const STAGGER_BASE_MS = 560;
/** Gap removed from the spawn stagger for each wave number (ms per wave). */
export const STAGGER_SLOPE_MS = 45;
/** Game time the field must stay empty before the wave counts as cleared (s). */
export const CLEAR_DELAY_S = 1.6;
/** Wall-clock pause between the clear banner and the next wave (ms). */
export const NEXT_WAVE_DELAY_MS = 1400;
/** HP restored when a wave is cleared (HP). */
export const WAVE_CLEAR_HP = 18;
/** Charge restored when a wave is cleared (% charge). */
export const WAVE_CLEAR_CHARGE = 35;

/** Banner copy under "WAVE n", indexed by wave number. Index 0 is unused. */
export const WAVE_SUBS = [
  "",
  "Droplets + 🏄 SURFERS inbound — dry them out!",
  "💦 GUSHERS burst up close. Tide Brutes slam — jump it!",
  "JETTERS shoot water, PUDDLERS split in two!",
  "🐚 CORAL WARDENS hide behind shells. Kill the 🌧️ RAIN SHAMANS first!",
  "FINAL WAVE — the whole ocean, angrier. Hold the beach! 🏖️",
];
