# Rene Shooter

Native browser ES modules; there is no production build. GitHub Pages serves `main` as-is. `index.html` pins Three.js 0.187.0 through an import map. Keep that map identical in both lab pages. npm dependencies are development tools only.

## Structure

- `src/main.js`: composition, startup, frame order, start/end transitions, debug harness.
- `src/core/`: shared state, renderer, input, audio, assets, collisions, events, springs, helpers, quality tiers.
- `src/world/`: beach, ocean, sun pools, sky, scenery.
- `src/player/`, `src/weapons/`, `src/enemies/`: gameplay.
- `src/enemies/monsterModel.js`: how a monster looks and is pooled (wraps the sculpted creature from `src/enemies/waterCreature.js` for the same kind index, adds glow anchors and the HP bar, `acquireMonster`, `releaseMonster`). `src/enemies/monsters.js`: how monsters spawn, take damage, die and behave (abilities, `updateMonsters`).
- `src/vfx/`, `src/ui/`: feedback and interface.
- `tools/monster-lab.html`, `tools/weapon-lab.html`: developer pages for viewing monsters and weapons.
- `scripts/`: the tooling below.

## Commands

Use Node 22.13+ or 24+. Run `npm ci`, then `npx playwright install chromium`. On Linux, use `npx playwright install --with-deps chromium`.

- `npm run serve`: static server for the repo on `http://127.0.0.1:8765/index.html`. Tools start their own server on a free port.
- `npm run lint`: ESLint over `src/`, `scripts/` and the inline scripts in the HTML pages. Existing warnings have a per-rule ceiling; new ones fail.
- `npm run format`: Prettier (defaults, `.prettierrc.json`) writes `src/`, `scripts/`, `test/` and `eslint.config.mjs`; HTML, CSS and Markdown are ignored. `npm run format:check` verifies it and runs in CI after lint. Don't hand-format; run `npm run format`.
- `npm run check`: Node syntax checks, matching import maps, local import paths and named exports.
- `npm run smoke`: loads the game, plays waves 1 and 2, fails on page or console errors and on `#err` text. Defaults to software WebGL (CI); `SMOKE_GPU=metal npm run smoke` uses the Mac GPU.
- `npm run e2e`: browser regression suite, one named case per fixed gameplay bug (Brute slam jump, empty-charge firing, lethal Gusher end stats, wave banner timing, restart carry-over of the touch-look finger and buffered jump, touch weapon slots, and RS-10: the weapon stays off the canvas while the title loads, so every frame drawn before Play must match one drawn with the viewmodel scene hidden) plus the effect-persistence rule (`Heat Ray beam` and `Heat Ray sand scorches` stay in the scene, the beam shows while firing) and the creature case (all 8 kinds spawn through `acquireMonster` and the Coral Warden's shield breaks). It runs desktop cases and a mobile-emulated Chromium context (RS-02, RS-06), then two startup cases in fresh pages (RS-11): one aborted request for the sand texture is retried and Play still enables with no `#err` text or page error, and a texture whose every request is aborted shows "An asset could not load" and leaves Play disabled, prints a pass/fail table, keeps going after a failing case, fails on any page or console error, and writes `test-results/e2e.json`. Defaults to software WebGL (about 80 s); `E2E_GPU=metal npm run e2e` takes about 35 s. `E2E_QUALITY` sets the tier (default `low`). Cases drive the game through `window.__game`, the exported `state`/`input`/`look` objects, the game's own module functions and real Playwright input; add a case here for every gameplay bug you fix. CI runs it after smoke.
- `npm test`: Node's built-in runner over `test/*.test.mjs`. Tests import only `src/config/*` and `src/enemies/waveComposition.js`, which must stay loadable in plain Node (no DOM, no `three`). CI runs it.
- `npm run typecheck`: `tsc --noEmit` over the files listed in `tsconfig.json` `include`. To opt a file in, add `// @ts-check` and JSDoc types to it, then add it to `include`; CI runs it. `three` and `three/addons/*` types come from `@types/three`, pinned to the same version as the import map in `index.html` and mapped in `tsconfig.json` `paths`. When bumping three, bump the import map in both lab pages and `@types/three` together.
- `npm run perf [-- --runs 3 --q high --json out.json --url <deployed base URL>]`: plays waves 1 to 5 with a seeded `Math.random` on the Mac GPU and prints max frame, frames over 33 and 50 ms, and shader program counts per row. Rows 1 to 5 are the waves; `play` runs from Play enabled (the button is hovered 1 s, then clicked) through 3 s after the click; `end` runs from the wave 5 clear through 2 s after the end screen appears. Local only; not part of CI.

Run one browser at a time; every script closes its own. CI runs lint, check, typecheck, test, smoke and e2e (`.github/workflows/checks.yml`).

Manually verified, not in e2e: the hidden-tab pause (wave spawn and next-wave timers freeze while `document.hidden`, `pauseWaveTimers` and `resumeWaveTimers` in `src/enemies/waves.js`). Playwright forces pages visible, so a test needs a patched Playwright with focus emulation off. To re-check, hide the tab for about 12 s mid-wave in a real browser and confirm the pending spawns have not fired when it returns.

## Startup preloads

`index.html` lists a `<link rel="modulepreload">` for every local module reachable from `src/main.js`, plus the pinned `three.core.js`, and a preload for every startup asset (HDRs, GLBs, beach and weapon textures). The browser then fetches all of it at once instead of discovering modules one import level at a time. `npm run check` fails when a preload is missing, points at a missing or unreachable file, or has no loader that requests it. When you add a module or a startup asset, add its preload.

- Assets loaded with `fetch` (`loadHDR`, `loadGLTF`, and `loadTexture` through `ImageBitmapLoader`) are listed in the `fetch-preloads` JSON block in `index.html`; an inline script turns each into `as="fetch" crossorigin` outside WebKit, which downloads a fetch preload a second time instead of reusing it. Assets loaded with `THREE.TextureLoader` (the weapon textures) are static `<link rel="preload" as="image" crossorigin>` links. A mismatched destination or mode makes the browser download the file twice.
- `loadTexture` decodes off the main thread with `ImageBitmapLoader` (`imageOrientation: "flipY"`, `premultiplyAlpha: "none"`, `colorSpaceConversion: "none"`) and keeps `TextureLoader` on engines without those options (Safari before 17, Firefox before 98).

## Asset loading

`loadTexture`, `loadHDR` and `loadGLTF` in `src/core/assets.js` retry a failed request up to three attempts (300 ms, then 1 s apart). A failed attempt does not touch the error UI; only the last failure, or a rejected `trackAssetTask` group, adds to `failures`. Keep every startup load inside a `trackAssetTask` group: its open item keeps the manager from going idle (and `assetsReady` from resolving) while a retry waits. The weapon textures in `src/weapons/solarSoakerHD.js` use their own manager and retry the same way.

## Debug hooks

- `window.__game`: `renderer`, `scene`, `camera`, `state`, `player`, `enemies`, `quality`, `killAll`, `aimAt`. Tests and benchmarks drive the game through it.
- `?debug=1`: frame-time overlay.
- `?q=low|medium|high|ultra`: forces a quality tier. Without it the tier is picked automatically.

## Changes and tuning

Preserve gameplay, visuals, random-call order, frame update order, and restart semantics in cleanup PRs. A runtime smoke is not a visual or gameplay equivalence proof; compare affected behavior and the lab pages directly.

Gameplay tuning numbers live in `src/config/`, one dependency-free `// @ts-check` module per area, each constant with a JSDoc comment giving its unit:

- `session.js`: HP and charge caps, plus the title and new-run defaults. They differ on purpose (player Z, first powerup timer), so keep both.
- `player.js`: radius, ocean grace and rip current, speeds, jumping, gravity, charge and HP regeneration. `OCEAN_GRACE` and `PLAYER_R` are re-exported from `src/core/state.js`.
- `weapons.js`: weapon IDs, cadence, charge costs, damage, spread and projectile numbers, including the monsters' water jets.
- `waves.js`: final wave, count and stagger formulas, clear delay, rewards and the banner copy (`WAVE_SUBS`). Spawn stagger and the next-wave delay are wall-clock `setTimeout` (ms); the clear delay is game time (s).
- `powerups.js`: `PU_TYPES` and pickup, lifetime, spawn cadence, cap and heal numbers. `PU_TYPES` is re-exported from `src/ui/powerups.js`.
- `monsters.js`: `MON`, one stats entry per kind, plus the `glow` flag (the kind carries a `makeGlow` anchor; a check in `createMonster` in `monsterModel.js` throws if it disagrees with the builder) and `splitsInto` (kinds spawned on death).

Elsewhere: monster visuals and pooling in `src/enemies/monsterModel.js`, abilities in `src/enemies/monsters.js`, `pickKind` in `src/enemies/waveComposition.js` (which monsters spawn; pure, with `waveCount`, `waveKinds`, `maxAliveByKind` and `maxGlowing`), and `src/core/quality.js`. Shader, material and art constants stay beside the code that uses them.

## Timers

Wave spawn and next-wave timers go through `scheduleTimer` in `src/enemies/waves.js`, so `pauseWaveTimers` and `resumeWaveTimers` (called from `visibilitychange` in `src/main.js`) can freeze them while the tab is hidden. New wall-clock timers that drive gameplay should do the same. Reset functions (`resetWaves`, `resetInput`, `resetController`, `hideBanner`) are all called from `startGame`; add new per-run state to them.

## Rendering rules

- Never add or remove lights during play. Three.js puts the scene's light counts into every lit shader's program key, so a change recompiles the whole scene (a 0.1–2 s freeze). Glowing monsters use `makeGlow` anchors in `src/enemies/monsterModel.js`, which `src/enemies/monsterLights.js` copies into `MAX_MONSTER_LIGHTS` fixed slots each frame. `MAX_MONSTER_LIGHTS` and `MONSTER_POOL_SIZE` are derived from the wave data (`maxGlowing()` and `maxAliveByKind()` in `src/enemies/waveComposition.js`), so changing the waves or the `glow` flags in `src/config/monsters.js` adjusts them automatically; `npm test` pins today's values.
- Static parts of new props (trim, fixed detail) go through `mergeStaticChildren` in `src/world/staticBatch.js`, with every animated or later-referenced child passed in `exclude`. Each separate mesh costs a draw call in both the main and shadow passes. Monsters are single sculpted meshes from `waterCreature.js`, so they need no batching.

## Open items

- **First-visit loading stall.** With a cold GPU shader cache, the title screen stops animating for about 6 s during "Optimizing rendering…" (one frozen frame of 5.9 s on the M2, about 8.7 s frozen in total before Play). It is the first compile of the world's lit shaders and Metal pipelines, it predates this work (6.3 s on the original `ca686e9`), and it only happens on a first visit. Fixing it means spreading or hiding that compile, a large change with an uncertain payoff.
- **Portrait HUD overlap on phones (RS-08).** At about 390 px wide, the weapon name overlaps the HP row and the touch buttons cover the weapon block. This is a layout decision: draw the portrait HUD in Paper and agree it before changing `style.css`.
- **First hover over Play on a first visit.** With a cold GPU shader cache, the first time the cursor hovers the Play button costs one 83–100 ms frame while its hover transform rasterizes. Pre-painting it on the hidden end screen's button didn't help; pre-painting the real button would flash it during loading.
- **End-screen transition.** One 33–50 ms frame when the run ends, inside the browser's pointer-unlock and compositor work, not game code.
- **Startup body-read failures (RS-11).** The cause of the intermittent `Failed to fetch` on a texture body is unconfirmed; `withRetry` in `src/core/assets.js` covers it. The fetch preloads may raise its odds.
- **`warmDom` copies the end-screen text.** `src/warmup.js` pre-paints the exact loss and win titles from `gameOver` in `src/main.js`; keep the two in sync when that copy changes.
- **Optimizations not taken:** self-hosting a pinned minified three build (about 135 KB; jsDelivr only minifies on the fly); sharing the three tree GLBs' duplicate textures (about 758 KB and 12 GPU textures, needs the GLBs re-packed); splitting static and dynamic shadow casters, or an MRT normal buffer for GTAO (large, unmeasured); KTX2 textures (would change quality).
- **Type checking.** `src/core/state.js`, `src/main.js`, `src/enemies/monsters.js`, `src/core/renderer.js` and the world builders are not yet in `tsconfig.json` `include`.
