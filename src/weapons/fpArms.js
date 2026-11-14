import { loadGLTF, trackAssetTask } from "../core/assets.js";

// Rene's bare forearms and hands, posed on the Solar Soaker's rear grip and
// front vertical grip in gun space (grip datum at the origin, muzzle -Z) and
// baked into one static mesh. Parenting it to the viewmodel mount makes the
// arms follow every hip/ADS/sprint/slide/recoil spring with no extra work.
// The source rig is "FPS Arms (rigged only)" (CC0, see assets/CREDITS.md);
// its light diffuse is tinted here toward Rene's tan from the key art.
const SKIN_TINT = 0xe3b088;

export function loadFPArms() {
  return trackAssetTask(
    "fp-arms",
    (async () => {
      const gltf = await loadGLTF(
        new URL("../../assets/weapons/fp-arms/fp-arms.glb", import.meta.url)
          .href,
      );
      const arms = gltf.scene;
      arms.name = "Rene forearms";
      arms.traverse((child) => {
        if (!child.isMesh) return;
        // Match the gun's shadow flags (the viewmodel sun casts none today).
        child.castShadow = child.receiveShadow = true;
        child.material.color.set(SKIN_TINT);
        child.material.envMapIntensity = 0.55;
      });
      return arms;
    })(),
  );
}
