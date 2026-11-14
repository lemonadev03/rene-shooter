import * as THREE from "three";
import { scene } from "../core/state.js";
import { MON } from "../config/monsters.js";
import { maxAliveByKind } from "./waveComposition.js";
import { createWaterCreature } from "./waterCreature.js";
import { quality } from "../core/quality.js";

// Marks where a monster glows; updateMonsterLights copies it into a shared light slot.
function makeGlow(color, intensity, distance) {
  const anchor = new THREE.Object3D();
  anchor.userData.glow = { color, intensity, distance, decay: 2 };
  return anchor;
}

// Each gameplay kind maps 1:1 to the sculpted creature of the same index in
// waterCreature.js (CREATURES uses the same names and body scales as MON).
// The creature owns its look and animation (pose, morphs, spray, Coral armor,
// rain cloud); this module adds the game-facing parts: glow anchor, HP bar,
// shadows and pooling. Hitboxes stay analytic in the weapons code (0.8 * s),
// so the swap changes nothing the AI or aiming depends on.
function createMonster(kind) {
  const def = MON[kind];
  const s = def.s;
  const creature = createWaterCreature(kind);
  const g = creature.group;
  // The water body (physical), reef armor and rain cloud (standard) cast
  // shadows like the old primitive parts did; the wet disc and spray do not.
  const casters = [];
  const fx = [];
  g.traverse((node) => {
    if (!node.isMesh) return;
    if (
      node.material.isMeshPhysicalMaterial ||
      node.material.isMeshStandardMaterial
    ) {
      node.castShadow = true;
      casters.push(node);
    } else if (node.material.isShaderMaterial) {
      fx.push(node);
    }
  });
  let glow = null;
  if (kind === 1) {
    glow = makeGlow(0x38bdf8, 5, 7);
    glow.position.y = 1;
    g.add(glow);
  }
  if (kind === 7) {
    glow = makeGlow(0x4ade80, 3, 5);
    glow.position.set(0, 1.6, 0.2);
    g.add(glow);
  }
  // HP bar floats just above the sculpture (group is scaled by s, so divide
  // the measured top back into local units).
  const topY = new THREE.Box3().setFromObject(g).max.y / s + 0.18;
  const hpBarBg = new THREE.Mesh(
    new THREE.PlaneGeometry(0.9, 0.11),
    new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
    }),
  );
  hpBarBg.position.y = topY;
  g.add(hpBarBg);
  const hpBar = new THREE.Mesh(
    new THREE.PlaneGeometry(0.86, 0.07),
    new THREE.MeshBasicMaterial({ color: 0xff5533, side: THREE.DoubleSide }),
  );
  hpBar.position.set(0, topY, 0.01);
  g.add(hpBar);
  // The light-slot count is derived from MON[].glow, so the flag must match the anchor.
  if (Boolean(glow) !== Boolean(def.glow)) {
    throw new Error(
      `MON[${kind}].glow is ${Boolean(def.glow)} but the builder ${glow ? "calls" : "never calls"} makeGlow`,
    );
  }
  return { g, creature, hpBar, s, glow, fx, casters };
}
// On the low tier the spray/wet shader meshes and the shadow pass over the
// sculpted bodies are the difference between playable and not on weak GPUs
// (and on software WebGL in CI), so creatures there keep body, armor and HP
// bar only. Applied on every acquire, since the tier can change mid-run.
function applyTier(m) {
  const low = quality.tier === "low";
  for (const node of m.fx) node.visible = !low;
  for (const node of m.casters) node.castShadow = !low;
}
// Pooled monsters keep their materials and geometry for good: disposing them would
// release compiled programs and bring back mid-play compiles. A monster's own state
// (transforms, visibility, culling) is recorded once at creation and restored on
// every reuse, and the creature's animation state is reset with it; the pool never
// holds more than the most that were alive at once.
const monsterPools = MON.map(() => []);
// Most of each kind that one wave can hold at once, counting the droplets a Puddler
// leaves behind. Derived from the wave data in waveComposition.js. Warm-up builds this
// many up front.
const MONSTER_POOL_SIZE = maxAliveByKind();
const monsterSlots = new WeakMap();
function acquireMonster(kind) {
  const pooled = monsterPools[kind].pop();
  if (!pooled) {
    const m = createMonster(kind);
    const nodes = [];
    m.g.traverse((node) => {
      nodes.push({
        node,
        position: node.position.clone(),
        quaternion: node.quaternion.clone(),
        scale: node.scale.clone(),
        visible: node.visible,
        frustumCulled: node.frustumCulled,
      });
    });
    monsterSlots.set(m.g, { kind, m, nodes, pooled: false });
    applyTier(m);
    return m;
  }
  const slot = monsterSlots.get(pooled.g);
  slot.pooled = false;
  for (const saved of slot.nodes) {
    saved.node.position.copy(saved.position);
    saved.node.quaternion.copy(saved.quaternion);
    saved.node.scale.copy(saved.scale);
    saved.node.visible = saved.visible;
    saved.node.frustumCulled = saved.frustumCulled;
  }
  pooled.creature.reset();
  applyTier(pooled);
  return pooled;
}
// Safe to call twice for one monster. Never call it while `enemies` is being
// iterated: a Puddler's children are acquired during that loop and must not get a
// group that is still being visited.
function releaseMonster(e) {
  const slot = monsterSlots.get(e.g);
  if (!slot || slot.pooled) return;
  slot.pooled = true;
  scene.remove(e.g);
  monsterPools[slot.kind].push(slot.m);
}
export { MONSTER_POOL_SIZE, acquireMonster, releaseMonster };
