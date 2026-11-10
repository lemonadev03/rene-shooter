// @ts-check
// Small synchronous event bus. Gameplay emits; feel, VFX, audio and HUD listen,
// so those systems can change without editing each other's modules.
//
// Events (payload vectors are reused: copy them if you keep them):
//   "shot"   { weapon, aiming, mega, origin: Vector3 muzzle, dir: Vector3 }
//   "hit"    { pos: Vector3, enemy, dmg, killed }
//   "kill"   { pos: Vector3, enemy }
//   "hurt"   { dmg }
//   "jump"   { double }
//   "land"   { speed }  // downward speed at touchdown, m/s

/**
 * Structural vector, so this module does not import Three types. A THREE.Vector3
 * satisfies it. Payload vectors are borrowed: subscribers must clone them
 * (`{ x, y, z }` copy or `Vector3.clone()`) before keeping a reference.
 * @typedef {{ x: number, y: number, z: number }} Vec3
 */

/**
 * Payload of each event, from the emit sites in projectiles.js and controller.js.
 * `enemy` is the live enemy object; only `dead` is part of the contract here.
 * @typedef {object} GameEvents
 * @property {{ weapon: number, aiming: boolean, mega: boolean, origin: Vec3, dir: Vec3 }} shot
 * @property {{ pos: Vec3, enemy: { dead: boolean }, dmg: number, killed: boolean }} hit
 * @property {{ pos: Vec3, enemy: { dead: boolean } }} kill
 * @property {{ dmg: number }} hurt
 * @property {{ double: boolean }} jump
 * @property {{ speed: number }} land
 */

/** Handlers are stored untyped; `on` and `emit` enforce the payload per event. */
/** @type {Map<string, Array<(payload: any) => void>>} */
const handlers = new Map();

/**
 * Subscribes to an event and returns the unsubscribe function.
 * @template {keyof GameEvents} K
 * @param {K} type
 * @param {(payload: GameEvents[K]) => void} fn
 * @returns {() => void}
 */
export function on(type, fn) {
  let list = handlers.get(type);
  if (!list) handlers.set(type, (list = []));
  list.push(fn);
  return () => {
    const i = list.indexOf(fn);
    if (i >= 0) list.splice(i, 1);
  };
}

/**
 * @template {keyof GameEvents} K
 * @param {K} type
 * @param {GameEvents[K]} payload
 */
export function emit(type, payload) {
  const list = handlers.get(type);
  if (!list) return;
  for (let i = 0; i < list.length; i++) list[i](payload);
}
