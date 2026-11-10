// @ts-check
// Player tuning: size, speeds, jumping, gravity, the ocean rip current, and
// charge and HP regeneration. Units: m, m/s, m/s², s, HP, % charge.
// Charge is stored as `state.water`.

// Yaw zero faces the ocean (+Z). Position is the capsule's feet.
/** Capsule radius (m). */
export const PLAYER_R = 0.45;
/** Height of the capsule, used for the head bump under the pier (m). */
export const PLAYER_HEIGHT = 1.85;

/** Free swimming time before the rip current starts draining HP (s). */
export const OCEAN_GRACE = 4;
/** Time in the ocean before the rip current warning appears (s). */
export const OCEAN_WARNING_TIME = 2.4;
/** How much faster ocean time falls back to zero on shore than it builds (unitless multiplier). */
export const OCEAN_RECOVERY_RATE = 2;
/** HP drained per second when the grace window has just ended (HP/s). */
export const OCEAN_DRAIN_BASE = 3;
/** Extra drain for each second spent past the grace window (HP/s per s). */
export const OCEAN_DRAIN_RAMP = 1.4;
/** Ceiling of the rip current drain (HP/s). */
export const OCEAN_DRAIN_MAX = 14;
/** Camera shake floor while the rip current drains HP (shake units). */
export const OCEAN_SHAKE = 0.09;

/** West walking limit (m). */
export const BOUNDS_MIN_X = -52;
/** East walking limit (m). */
export const BOUNDS_MAX_X = 52;
/** South walking limit (m). */
export const BOUNDS_MIN_Z = -40;
/** North walking limit, toward the ocean (m). */
export const BOUNDS_MAX_Z = 26;

/** Walking speed (m/s). */
export const WALK_SPEED = 5.6;
/** Sprint speed while holding Shift and moving forward (m/s). */
export const SPRINT_SPEED = 10;
/** Speed while aiming down the sights (m/s). */
export const AIM_SPEED = 3.4;
/** Speed while crouching (m/s). */
export const CROUCH_SPEED = 2.6;
/** Speed multiplier while Speed Soda is active (unitless). */
export const SPEED_POWERUP_MULT = 1.4;

/** Time to reach full speed from the ground when input is held (s). */
export const GROUND_ACCEL_TIME = 0.12;
/** Speed that the stopping deceleration is scaled to when input is released (m/s). */
export const GROUND_STOP_SPEED = 5.6;
/** Time to stop from that speed when input is released (s). */
export const GROUND_STOP_TIME = 0.1;
/** Air control rate (1/s). */
export const AIR_CONTROL_RATE = 8;
/** Smallest max speed used to scale air control (m/s). */
export const AIR_CONTROL_MIN_SPEED = 1;
/** Air control gain (unitless multiplier). */
export const AIR_CONTROL_GAIN = 3;

/** Minimum ground speed to start a slide (m/s). */
export const SLIDE_MIN_SPEED = 6;
/** Slide length (s). */
export const SLIDE_DURATION = 0.65;
/** Exponential speed decay rate during a slide (1/s). */
export const SLIDE_DECAY_RATE = 0.65;

/** Upward speed of the first jump (m/s). */
export const JUMP_VELOCITY = 8.2;
/** Upward speed of the double jump (m/s). */
export const DOUBLE_JUMP_VELOCITY = 7.4;
/** Downward acceleration (m/s²). */
export const GRAVITY = 22;
/** Time after leaving the ground that a jump still works (s). */
export const COYOTE_TIME = 0.1;
/** Time a jump press is remembered before landing (s). */
export const JUMP_BUFFER_TIME = 0.1;
/** Downward landing speed that kicks up sand (m/s, negative is falling). */
export const HARD_LANDING_VY = -6;

/** Invulnerability window after the player is hurt (s). */
export const HURT_COOLDOWN = 0.45;
/** Camera shake set when the player is hurt (shake units). */
export const HURT_SHAKE = 0.45;

/** Charge gained per second inside a sun pool (% charge/s). */
export const CHARGE_RATE_SUN_POOL = 58;
/** Extra charge per second inside a sun pool while holding R (% charge/s). */
export const CHARGE_RATE_SUN_POOL_BOOST = 22;
/** Charge gained per second on plain beach (% charge/s). */
export const CHARGE_RATE_BEACH = 2.2;
/** Charge change per second in saltwater (% charge/s, negative drains). */
export const CHARGE_RATE_OCEAN = -9;
/** Charge below which the low charge hint shows (% charge). */
export const LOW_CHARGE_HINT = 28;

/** Time without damage past the hurt cooldown before HP regenerates (s). */
export const HP_REGEN_DELAY = 4;
/** HP regenerated per second (HP/s). */
export const HP_REGEN_RATE = 4;
