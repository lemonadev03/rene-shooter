// @ts-check
// Powerup tuning: the catalog, pickup, lifetime, spawn cadence and healing.
// Units: m, s, HP, score points.

/**
 * @typedef {object} PowerupType
 * @property {string} k Key. Timed buffs use it as their `state.pu` key.
 * @property {string} emoji Label icon.
 * @property {string} name Label and feed text.
 * @property {number} col Orb and ring color (0xRRGGBB).
 * @property {number} dur Buff duration (s). 0 means an instant effect.
 */

/**
 * Powerup catalog. Heal is instant; the rest are timed buffs.
 * The heal name repeats HEAL_AMOUNT as text.
 * @type {PowerupType[]}
 */
export const PU_TYPES = [
  { k: "rapid", emoji: "⚡", name: "RAPID RAY", col: 0xffd23a, dur: 10 },
  { k: "power", emoji: "☀️", name: "MEGA HEAT", col: 0xff7b1c, dur: 12 },
  { k: "speed", emoji: "👟", name: "SPEED SODA", col: 0x2dd4bf, dur: 10 },
  { k: "heal", emoji: "❤️", name: "+40 HP", col: 0xef4444, dur: 0 },
  { k: "freeze", emoji: "🧂", name: "SALT STORM", col: 0xf5f5f0, dur: 6 },
];

/** Distance from a powerup at which the player picks it up (m). */
export const POWERUP_PICKUP_RADIUS = 1.5;
/** Time a powerup stays on the beach before it despawns (s). */
export const POWERUP_LIFETIME = 26;
/** Shortest wait between powerup spawns (s). */
export const POWERUP_SPAWN_MIN = 10;
/** Longest wait between powerup spawns (s). */
export const POWERUP_SPAWN_MAX = 15;
/** Most powerups on the beach at once. */
export const POWERUP_MAX_ALIVE = 2;
/** HP restored by the heal powerup (HP). */
export const HEAL_AMOUNT = 40;
/** Score for picking up any powerup (points). */
export const POWERUP_SCORE = 25;
