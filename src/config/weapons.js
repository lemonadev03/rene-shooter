// @ts-check
// Weapon tuning: IDs, fire cadence, charge costs, damage, spread and projectile
// numbers for both player weapons and the monsters' water jets.
// Units: m, m/s, s, HP, % charge. Charge is stored as `state.water`.

/** Weapon ID of the heat ray, the hitscan weapon bound to key 1. */
export const WEAPON_HEAT_RAY = 1;
/** Weapon ID of the sponge burst, the projectile weapon bound to key 2. */
export const WEAPON_SPONGE_BURST = 2;

/** Cooldown after a trigger pull with no charge left (s). */
export const EMPTY_CHARGE_COOLDOWN = 0.25;

/** How far the heat ray reaches (m). */
export const HEAT_RAY_RANGE = 70;
/** Radius of the ray when it tests for solid props (m). */
export const HEAT_RAY_THICKNESS = 0.025;
/** Random aim spread per axis while aiming down the sights (unit direction offset). */
export const HEAT_RAY_SPREAD_AIMED = 0.012;
/** Random aim spread per axis from the hip (unit direction offset). */
export const HEAT_RAY_SPREAD_HIP = 0.035;
/** Time between heat ray damage ticks (s). */
export const HEAT_RAY_COOLDOWN = 0.055;
/** Time between heat ray damage ticks with Rapid Ray active (s). */
export const HEAT_RAY_COOLDOWN_RAPID = 0.028;
/** Charge spent per heat ray tick (% charge). */
export const HEAT_RAY_COST = 1.1;
/** Charge spent per heat ray tick with Rapid Ray active (% charge). */
export const HEAT_RAY_COST_RAPID = 0.55;
/** Damage per heat ray tick (HP). */
export const HEAT_RAY_DAMAGE = 7;
/** Damage per heat ray tick with Mega Heat active (HP). */
export const HEAT_RAY_DAMAGE_MEGA = 14;

/** Distance ahead of the camera where the sponge burst converges (m). */
export const SPONGE_AIM_DISTANCE = 42;
/** Time between sponge bursts (s). */
export const SPONGE_COOLDOWN = 0.42;
/** Time between sponge bursts with Rapid Ray active (s). */
export const SPONGE_COOLDOWN_RAPID = 0.22;
/** Charge spent per sponge burst (% charge). */
export const SPONGE_COST = 7;
/** Charge spent per sponge burst with Rapid Ray active (% charge). */
export const SPONGE_COST_RAPID = 3.5;
/** Camera shake added by a sponge burst (shake units). */
export const SPONGE_SHAKE = 0.12;
/** Sponge cubes per burst. */
export const SPONGE_COUNT = 5;
/** Sponge cube scale (unitless multiplier of the base mesh). */
export const SPONGE_SCALE = 1.15;
/** Sponge cube scale with Mega Heat active (unitless multiplier). */
export const SPONGE_SCALE_MEGA = 1.7;
/** Random sideways spread per cube, on both x and z (unit direction offset). */
export const SPONGE_SPREAD_SIDE = 0.07;
/** Random downward spread per cube (unit direction offset). */
export const SPONGE_SPREAD_DOWN = 0.05;
/** Random upward spread per cube (unit direction offset). */
export const SPONGE_SPREAD_UP = 0.07;
/** Sponge cube launch speed (m/s). */
export const SPONGE_SPEED = 30;
/** Sponge cube lifetime (s). */
export const SPONGE_LIFE = 1.1;
/** Sponge cube damage on contact (HP). */
export const SPONGE_DAMAGE = 16;
/** Sponge cube damage on contact with Mega Heat active (HP). */
export const SPONGE_DAMAGE_MEGA = 32;
/** Sponge cube hit radius (m). */
export const SPONGE_RADIUS = 0.3;
/** Sponge cube hit radius with Mega Heat active (m). */
export const SPONGE_RADIUS_MEGA = 0.42;
/** Downward acceleration on sponge cubes (m/s²). */
export const SPONGE_GRAVITY = 3.5;

/** Speed of a monster's water jet (m/s). */
export const WATER_JET_SPEED = 13.5;
/** How far ahead of the player's velocity the jet aims (s of travel). */
export const WATER_JET_LEAD = 0.12;
/** Water jet lifetime (s). */
export const WATER_JET_LIFE = 3;
/** Damage to the player when a water jet hits (HP). */
export const WATER_JET_DAMAGE = 11;
/** Height above the player's feet that a water jet aims at and hits (m). */
export const WATER_JET_TARGET_HEIGHT = 1.1;
/** Squared distance from the target point that counts as a hit (m²). */
export const WATER_JET_HIT_RADIUS_SQ = 0.56;
