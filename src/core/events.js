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
const handlers = new Map();

export function on(type, fn) {
  let list = handlers.get(type);
  if (!list) handlers.set(type, (list = []));
  list.push(fn);
  return () => {
    const i = list.indexOf(fn);
    if (i >= 0) list.splice(i, 1);
  };
}

export function emit(type, payload) {
  const list = handlers.get(type);
  if (!list) return;
  for (let i = 0; i < list.length; i++) list[i](payload);
}
