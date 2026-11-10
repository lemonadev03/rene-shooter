import { $ } from "./core/utils.js";
import { scene } from "./core/state.js";
import { MON, buildMonster } from "./enemies/monsters.js";
import {
  takeWarmupMeshes,
  returnWarmupMeshes,
} from "./weapons/projectiles.js";
import { PU_TYPES, buildPowerup } from "./ui/powerups.js";
import { heatBeamMesh } from "./vfx/beam.js";
import { scorchMarksMesh } from "./vfx/impacts.js";

// Far below the sand: staged objects go through every render pass (world, shadow,
// GTAO) without ever being on screen.
const STAGE_Y = -100;

function stage(object, staged) {
  object.position.y = STAGE_Y;
  object.traverse((node) => {
    node.frustumCulled = false;
  });
  scene.add(object);
  staged.push(object);
}

// Adds one of everything that first appears during play and returns a function that
// takes it out again. Run it around the compile and warm-up renders in
// initializeRendering so no shader program is compiled mid-game.
export function stageWarmup() {
  const staged = [];
  for (let kind = 0; kind < MON.length; kind++) {
    stage(buildMonster(kind).g, staged);
  }
  for (const type of PU_TYPES) {
    stage(buildPowerup(type).g, staged);
  }
  const projectiles = takeWarmupMeshes();
  for (const mesh of projectiles) {
    stage(mesh, staged);
  }
  const effects = [heatBeamMesh, scorchMarksMesh];
  const hidden = effects.map((mesh) => mesh.visible);
  for (const mesh of effects) {
    mesh.visible = true;
    stage(mesh, staged);
  }
  return () => {
    for (const object of staged) scene.remove(object);
    returnWarmupMeshes(projectiles);
    for (const mesh of projectiles) {
      mesh.position.y = 0;
      mesh.frustumCulled = true;
    }
    effects.forEach((mesh, i) => {
      mesh.visible = hidden[i];
      mesh.position.y = 0;
      mesh.frustumCulled = false;
    });
    // Materials and geometries are deliberately not disposed: disposing a material
    // releases its compiled program, and the next real monster would recompile it
    // mid-wave. The staged monster and powerup groups are left to the garbage
    // collector (a later pooling change could reuse them).
  };
}

const nextFrame = () => new Promise(requestAnimationFrame);

// Every emoji and symbol the HUD, banner, kill feed and end screen can show. A glyph
// that has never been drawn costs the browser over 100 ms the first time on a cold
// cache, which would land in the middle of wave 1.
const UI_GLYPHS = "⚡ ☀️ ❤️ 👟 🧂 🏄 💦 🐚 🌧️ 🏖️ 💨 🛡️ 🫧 🌊 🏆 🔥 ➜ ◉ ✓ ⚠";

// The first paint of the HUD, banner and end screen makes the browser compile its own
// blur and text shaders. On a cold shader cache that blocks the GPU process for over
// half a second, so paint each of them once at near-zero opacity while loading.
export async function warmDom() {
  const restores = [];
  const reveal = (id, apply) => {
    const el = $(id);
    const className = el.className;
    const cssText = el.style.cssText;
    const text = el.children.length ? null : el.textContent;
    const inert = el.inert;
    el.classList.remove("hidden");
    apply?.(el);
    restores.push(() => {
      el.className = className;
      el.style.cssText = cssText;
      el.inert = inert;
      if (text !== null) el.textContent = text;
    });
  };
  // Inert, so the faint end screen's button can't take a click over the title.
  const faint = (el) => {
    el.style.opacity = "0.01";
    el.inert = true;
  };
  reveal("hud", faint);
  reveal("end", faint);
  reveal("banner");
  reveal("bannerSub", (el) => {
    el.textContent = UI_GLYPHS;
  });
  reveal("powerPill", (el) => {
    el.textContent = UI_GLYPHS;
  });
  reveal("oceanWarn", (el) => {
    el.textContent = "⚠ In the ocean";
  });
  reveal("combo", (el) => {
    el.textContent = UI_GLYPHS;
  });
  reveal("endTitle", (el) => {
    el.textContent = UI_GLYPHS;
  });
  reveal("hitmark", (el) => {
    el.style.opacity = "1";
    el.style.textShadow = "0 0 9px #ff7a24";
  });
  reveal("hint", (el) => el.classList.add("show"));
  reveal("dmgVig", (el) => {
    el.style.boxShadow = "inset 0 0 120px 45px rgba(255,40,0,.55)";
  });
  reveal("coldVig", (el) => {
    el.style.boxShadow = "inset 0 0 130px 45px rgba(14,116,233,.55)";
  });
  const feedItem = document.createElement("div");
  feedItem.textContent = UI_GLYPHS;
  $("killFeed").prepend(feedItem);
  await nextFrame();
  await nextFrame();
  await nextFrame();
  feedItem.remove();
  for (const restore of restores) restore();
}
