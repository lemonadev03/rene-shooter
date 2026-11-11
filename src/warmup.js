import { $ } from "./core/utils.js";
import { scene } from "./core/state.js";
import { quality } from "./core/quality.js";
import {
  MONSTER_POOL_SIZE,
  acquireMonster,
  releaseMonster,
} from "./enemies/monsters.js";
import { takeWarmupMeshes, returnWarmupMeshes } from "./weapons/projectiles.js";
import {
  PU_TYPES,
  POWERUP_POOL_SIZE,
  acquirePowerup,
  releasePowerup,
} from "./ui/powerups.js";
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

// Adds everything that first appears during play (a full pool of each monster and
// powerup) and returns a function that takes it out again. Run it around the
// compile and warm-up renders in initializeRendering so no shader program is
// compiled mid-game.
export function stageWarmup() {
  const staged = [];
  const monsters = [];
  const powerups = [];
  // The pools start full, so nothing is built or uploaded during play.
  for (let kind = 0; kind < MONSTER_POOL_SIZE.length; kind++) {
    for (let i = 0; i < MONSTER_POOL_SIZE[kind]; i++) {
      const monster = acquireMonster(kind);
      monsters.push(monster);
      stage(monster.g, staged);
    }
  }
  for (const type of PU_TYPES) {
    for (let i = 0; i < POWERUP_POOL_SIZE; i++) {
      const powerup = acquirePowerup(type);
      powerups.push(powerup);
      stage(powerup.g, staged);
    }
  }
  const projectiles = takeWarmupMeshes();
  for (const mesh of projectiles) {
    stage(mesh, staged);
  }
  // The beam and scorch marks live in the scene for the whole game (never culled, hidden
  // until first use), so they are only shown here, not staged: unstaging removes objects.
  // r187 does not invalidate a shared material on vertex-normal presence alone.
  // Make the real G-buffer draw select the beam's no-normal program explicitly.
  const beamBeforeRender = heatBeamMesh.onBeforeRender;
  heatBeamMesh.onBeforeRender = function (...args) {
    beamBeforeRender.apply(this, args);
    const material = args[4];
    if (material.isMeshNormalMaterial) material.needsUpdate = true;
  };
  const effects = [heatBeamMesh, scorchMarksMesh];
  const hidden = effects.map((mesh) => mesh.visible);
  for (const mesh of effects) mesh.visible = true;
  return () => {
    for (const object of staged) scene.remove(object);
    // The staged monsters and powerups become the pooled ones. Their position is
    // restored on reuse; culling is not, so turn it back on here.
    for (const pooled of [...monsters, ...powerups]) {
      pooled.g.traverse((node) => {
        node.frustumCulled = true;
      });
    }
    monsters.forEach(releaseMonster);
    powerups.forEach(releasePowerup);
    returnWarmupMeshes(projectiles);
    for (const mesh of projectiles) {
      mesh.position.y = 0;
      mesh.frustumCulled = true;
    }
    heatBeamMesh.onBeforeRender = beamBeforeRender;
    effects.forEach((mesh, i) => {
      mesh.visible = hidden[i];
    });
    // Materials and geometries are deliberately not disposed: disposing a material
    // releases its compiled program, and the next real monster would recompile it
    // mid-wave.
  };
}

const nextFrame = () => new Promise(requestAnimationFrame);

// Consecutive on-time frames that count as a settled compositor.
const SETTLE_FRAMES = 12;
// Loading never waits longer than this for the compositor, so a slow machine still
// reaches Play.
const SETTLE_LIMIT_MS = 4000;

// rAF callbacks alone can run ahead of queued compositor raster/Metal pipeline
// creation. Keep loading until the compositor has delivered a stable tail, or until
// the deadline passes. A frame is on time when it is within 1.5 display intervals,
// so a 30 Hz display settles too.
async function settleDom(deadline) {
  const onTime = Math.max(25, 1.5 * quality.measuredIntervalMs);
  let stable = 0;
  let previous = performance.now();
  do {
    await nextFrame();
    const now = performance.now();
    stable = now - previous < onTime ? stable + 1 : 0;
    previous = now;
  } while (stable < SETTLE_FRAMES && previous < deadline);
}

// Every emoji and symbol the HUD, banner, kill feed and end screen can show. A glyph
// that has never been drawn costs the browser over 100 ms the first time on a cold
// cache, which would land in the middle of wave 1.
const UI_GLYPHS = "⚡ ☀️ ❤️ 👟 🧂 🏄 💦 🐚 🌧️ 🏖️ 💨 🛡️ 🫧 🌊 🏆 🔥 ➜ ◉ ✓ ⚠";

// The first paint of the HUD, banner and end screen makes the browser compile its own
// blur and text shaders. On a cold shader cache that blocks the GPU process for over
// half a second, so paint each of them once at near-zero opacity while loading.
export async function warmDom() {
  const deadline = performance.now() + SETTLE_LIMIT_MS;
  // updateHud's first score formatting lazily initializes ICU/Intl (~13-30 ms).
  // Prime the identical default-locale path without changing the score or HUD.
  (0).toLocaleString();
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
    el.textContent = "WIPED OUT! 🌊";
  });
  reveal("endSub", (el) => {
    el.textContent = "The water monsters got you. Towel off and run it back.";
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
  // Paint exact end-screen content, including its final-size emoji/text runs.
  await settleDom(deadline);
  $("endTitle").textContent = "BEACH SAVED! 🏆";
  $("endSub").textContent =
    "Every water monster evaporated. Ateneo #2 does it again.";
  await settleDom(deadline);
  feedItem.remove();
  for (const restore of restores) restore();
  await settleDom(deadline);
}
