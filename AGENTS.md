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
- `npm run e2e`: browser regression suite with 19 cases in isolated blocks: desktop-loading, desktop-effects-creatures-slam, desktop-weapons, desktop-restarts, desktop-audio, mobile and startup. Each block owns its contexts and pages; keep dependent cases in the same block. Defaults to software WebGL; `E2E_GPU=metal` uses the Mac GPU and `E2E_QUALITY` sets the tier (default `low`). `E2E_SHARD=i/n` selects a time-balanced shard using `scripts/e2e-timings.json`; without it, every block runs in order. `E2E_SHARD=1/3 node scripts/e2e.mjs --list` prints all shard assignments and estimates without launching a browser or server. Cases keep going after a failure, fail on page/console/request errors, and write `test-results/e2e.json` or `test-results/e2e-shard-<i>.json`, including case block names and block durations. Download CI shard reports into `test-results/`, then run `npm run e2e:timings` to refresh median block weights including boot. Cases drive the game through `window.__game`, exported state and module functions, and real Playwright input; add a case for every gameplay bug you fix.
- `npm test`: Node's built-in runner over `test/*.test.mjs`. Tests import only `src/config/*` and `src/enemies/waveComposition.js`, which must stay loadable in plain Node (no DOM, no `three`). CI runs it.
- `npm run typecheck`: `tsc --noEmit` over the files listed in `tsconfig.json` `include`. To opt a file in, add `// @ts-check` and JSDoc types to it, then add it to `include`; CI runs it. `three` and `three/addons/*` types come from `@types/three`, pinned to the same version as the import map in `index.html` and mapped in `tsconfig.json` `paths`. When bumping three, bump the import map in both lab pages and `@types/three` together.
- `npm run perf [-- --runs 3 --q high --json out.json --url <deployed base URL>]`: plays waves 1 to 5 with a seeded `Math.random` on the Mac GPU and prints max frame, frames over 33 and 50 ms, and shader program counts per row. Rows 1 to 5 are the waves; `play` runs from Play enabled (the button is hovered 1 s, then clicked) through 3 s after the click; `end` runs from the wave 5 clear through 2 s after the end screen appears. Local only; not part of CI.

Run one browser at a time locally; every script closes its own. CI starts static checks (lint, format, check, typecheck, test), smoke and three isolated e2e shards as parallel jobs (`.github/workflows/checks.yml`).

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
- Custom fragment shaders must never write NaN or Inf. The world renders into a half-float HDR target with an alpha canvas, and bloom spreads one bad pixel across the frame, which turns the whole canvas transparent and shows the sky-blue page background (the "flicker while shooting" bug, PR #44). `waterCreature.js` guards its ripple normal and caps its output at the end of the shader; keep both, and add the same cap to any new shader that divides or normalizes. A blank sky-blue capture in a harness run is this bug, not a dropped WebGL context.

## Open items

- **First-visit loading stall.** With a cold GPU shader cache, the title screen stops animating for about 6 s during "Preparing graphics" (one frozen frame of 5.9 s on the M2, about 8.7 s frozen in total before Play). It is the first compile of the world's lit shaders and Metal pipelines, it predates this work (6.3 s on the original `ca686e9`), and it only happens on a first visit. Fixing it means spreading or hiding that compile, a large change with an uncertain payoff.
- **First-person hands (parked).** The gun ships without arms. PR #36 (branch `feat/fp-arms`, closed unmerged) posed a MakeHuman-derived arm on the grips, but its hands read as smooth fists. A better hand model is needed first: rigged hands with separate fingers, knuckles and nails, a license that allows a public web game, and bare brown arms to match Rene. Candidates tried: J-Toastie FPS arms (gloves, fused fingers) and the Mixamo soldier (gloves, unclear redistribution terms). Blender Studio's Rain (CC-BY) was downloaded but never posed.
- **First hover over Play on a first visit.** With a cold GPU shader cache, the first time the cursor hovers the Play button costs one 83–100 ms frame while its hover transform rasterizes. Pre-painting it on the hidden end screen's button didn't help; pre-painting the real button would flash it during loading.
- **End-screen transition.** One 33–50 ms frame when the run ends, inside the browser's pointer-unlock and compositor work, not game code.
- **Startup body-read failures (RS-11).** The cause of the intermittent `Failed to fetch` on a texture body is unconfirmed; `withRetry` in `src/core/assets.js` covers it. The fetch preloads may raise its odds.
- **`warmDom` copies the end-screen text.** `src/warmup.js` pre-paints the exact loss and win titles from `gameOver` in `src/main.js`; keep the two in sync when that copy changes.
- **Optimizations not taken:** self-hosting a pinned minified three build (about 135 KB; jsDelivr only minifies on the fly); sharing the three tree GLBs' duplicate textures (about 758 KB and 12 GPU textures, needs the GLBs re-packed); splitting static and dynamic shadow casters, or an MRT normal buffer for GTAO (large, unmeasured); KTX2 textures (would change quality).
- **Heat Ray sound not checked by ear.** PR #45 replaced the per-shot chug with a steady looped hum (`setHeatRayLoop` in `src/core/audio.js`). A recording showed the loop starting and stopping with the trigger, but nobody has listened to it in play yet. If firing still sounds like a train, the next suspects are the growl and slam clips pitched down to 0.5–0.7 and the gurgle clip.
- **Dark blob in one monster close-up.** One close-up capture after PR #44 showed a dark patch on a water creature. It may be the NaN cap painting black; unconfirmed and not seen in play.
- **Type checking.** `src/core/state.js`, `src/main.js`, `src/enemies/monsters.js`, `src/core/renderer.js` and the world builders are not yet in `tsconfig.json` `include`.
