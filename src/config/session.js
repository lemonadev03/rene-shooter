// @ts-check
// Session defaults: the HP and charge caps, plus the starting values for the
// title screen and for a new run. The two sets differ on purpose (player Z and
// the first powerup timer), so keep both.
// Units: m, s, HP, % charge. Charge is stored as `state.water`.
import { WEAPON_HEAT_RAY } from "./weapons.js";

/** Maximum and starting HP (HP). */
export const MAX_HP = 100;
/** Maximum and starting solar charge (% charge). */
export const MAX_CHARGE = 100;
/** Weapon ID selected at the title screen and at the start of a run. */
export const START_WEAPON = WEAPON_HEAT_RAY;
/** Camera vertical field of view at rest (degrees). */
export const DEFAULT_FOV = 72;
/** Starting camera pitch (radians, negative looks down). */
export const START_PITCH = -0.16;

/** Player Z on the title screen (m). */
export const TITLE_PLAYER_Z = -10;
/** Seconds until the first powerup spawns on the title screen (s). */
export const TITLE_POWERUP_TIMER = 6;

/** Player Z at the start of a new run (m). */
export const NEW_RUN_PLAYER_Z = -12;
/** Seconds until the first powerup spawns in a new run (s). */
export const NEW_RUN_POWERUP_TIMER = 5;
