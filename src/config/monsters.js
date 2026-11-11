// @ts-check
// Monster stats: one entry per kind, indexed by kind ID. Which monsters spawn in
// each wave lives in src/enemies/waveComposition.js (pickKind); the pool sizes and
// the light-slot count are derived from that plus the `glow` and `splitsInto` flags.
// Units: HP, m/s, score points, HP of damage to the player.

/**
 * @typedef {object} MonsterDef
 * @property {string} name Display name in the feed and HUD.
 * @property {number} s Body scale (unitless multiplier of the base mesh).
 * @property {number} body Body color (0xRRGGBB).
 * @property {number} belly Belly color (0xRRGGBB).
 * @property {number} hp Starting HP (HP).
 * @property {number} speed Walking speed (m/s).
 * @property {number} score Score for a kill (points).
 * @property {number} dmg Damage to the player on contact or jet hit (HP).
 * @property {number} [shield] Shield HP that must break before the body takes damage (HP).
 * @property {boolean} [glow] The monster carries a `makeGlow` light anchor in
 *   src/enemies/monsters.js; the light-slot count is derived from this flag.
 * @property {number[]} [splitsInto] Kind IDs spawned when it dies.
 */

// 0 Droplet · 1 Tide Brute (slam) · 2 Jetter · 3 Surfer · 4 Gusher · 5 Puddler · 6 Coral Warden · 7 Rain Shaman
/** @type {MonsterDef[]} */
export const MON = [
  {
    name: "DROPLET",
    s: 1.0,
    body: 0x2196f3,
    belly: 0xbae6fd,
    hp: 36,
    speed: 3.8,
    score: 100,
    dmg: 10,
  },
  {
    name: "TIDE BRUTE",
    s: 1.7,
    body: 0x0369a1,
    belly: 0x7dd3fc,
    hp: 175,
    speed: 2.3,
    score: 300,
    dmg: 18,
    glow: true,
  },
  {
    name: "JETTER",
    s: 1.15,
    body: 0x06b6d4,
    belly: 0xcffafe,
    hp: 62,
    speed: 2.8,
    score: 175,
    dmg: 9,
  },
  {
    name: "SURFER",
    s: 0.92,
    body: 0x22d3ee,
    belly: 0xecfeff,
    hp: 34,
    speed: 4.7,
    score: 150,
    dmg: 11,
  },
  {
    name: "GUSHER",
    s: 1.12,
    body: 0x2563eb,
    belly: 0x93c5fd,
    hp: 34,
    speed: 4.3,
    score: 175,
    dmg: 8,
  },
  {
    name: "PUDDLER",
    s: 1.3,
    body: 0x7c3aed,
    belly: 0xddd6fe,
    hp: 95,
    speed: 2.9,
    score: 225,
    dmg: 12,
    splitsInto: [0, 0],
  },
  {
    name: "CORAL WARDEN",
    s: 1.25,
    body: 0x0e7490,
    belly: 0xa5f3fc,
    hp: 95,
    speed: 2.1,
    score: 275,
    dmg: 14,
    shield: 55,
  },
  {
    name: "RAIN SHAMAN",
    s: 1.05,
    body: 0x4f46e5,
    belly: 0xe0e7ff,
    hp: 58,
    speed: 2.8,
    score: 300,
    dmg: 8,
    glow: true,
  },
];
