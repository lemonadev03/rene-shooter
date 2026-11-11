# Rene Shooter

Native browser ES modules; there is no production build. GitHub Pages serves `main` as-is. `index.html` pins Three.js 0.187.0 through an import map. Keep that map identical in both lab pages. npm dependencies are development tools only.

## Structure

- `src/main.js`: composition, startup, frame order, start/end transitions, debug harness.
- `src/core/`: shared state, renderer, input, audio, assets, collisions, events, springs, helpers, quality tiers.
- `src/world/`: beach, ocean, sun pools, sky, scenery.
- `src/player/`, `src/weapons/`, `src/enemies/`: gameplay.
- `src/vfx/`, `src/ui/`: feedback and interface.
- `tools/monster-lab.html`, `tools/weapon-lab.html`: developer pages for viewing monsters and weapons.
- `scripts/`: the tooling below.

## Commands

Use Node 22.13+ or 24+. Run `npm ci`, then `npx playwright install chromium`. On Linux, use `npx playwright install --with-deps chromium`.

- `npm run serve`: static server for the repo on `http://127.0.0.1:8765/index.html`. Tools start their own server on a free port.
- `npm run lint`: ESLint over `src/`, `scripts/` and the inline scripts in the HTML pages. Existing warnings have a per-rule ceiling; new ones fail.
- `npm run check`: Node syntax checks, matching import maps, local import paths and named exports.
- `npm run smoke`: loads the game, plays waves 1 and 2, fails on page or console errors and on `#err` text. Defaults to software WebGL (CI); `SMOKE_GPU=metal npm run smoke` uses the Mac GPU.
- `npm test`: Node's built-in runner over `test/*.test.mjs`. Tests import only `src/config/*` and `src/enemies/waveComposition.js`, which must stay loadable in plain Node (no DOM, no `three`). CI runs it.
- `npm run typecheck`: `tsc --noEmit` over the files listed in `tsconfig.json` `include`. To opt a file in, add `// @ts-check` and JSDoc types to it, then add it to `include`; CI runs it. `three` and `three/addons/*` types come from `@types/three`, pinned to the same version as the import map in `index.html` and mapped in `tsconfig.json` `paths`. When bumping three, bump the import map in both lab pages and `@types/three` together.
- `npm run perf [-- --runs 3 --q high --json out.json --url <deployed base URL>]`: plays waves 1 to 5 with a seeded `Math.random` on the Mac GPU and prints frame times and shader program counts per wave. Local only; not part of CI.

Run one browser at a time; every script closes its own. CI runs lint, check, typecheck and smoke (`.github/workflows/checks.yml`).

## Startup preloads

`index.html` lists a `<link rel="modulepreload">` for every local module reachable from `src/main.js`, plus the pinned `three.core.js`, and a preload for every startup asset (HDRs, GLBs, beach and weapon textures). The browser then fetches all of it at once instead of discovering modules one import level at a time. `npm run check` fails when a preload is missing, points at a missing or unreachable file, or has no loader that requests it. When you add a module or a startup asset, add its preload.

- Assets loaded with `fetch` (`loadHDR`, `loadGLTF`, and `loadTexture` through `ImageBitmapLoader`) are listed in the `fetch-preloads` JSON block in `index.html`; an inline script turns each into `as="fetch" crossorigin` outside WebKit, which downloads a fetch preload a second time instead of reusing it. Assets loaded with `THREE.TextureLoader` (the weapon textures) are static `<link rel="preload" as="image" crossorigin>` links. A mismatched destination or mode makes the browser download the file twice.
- `loadTexture` decodes off the main thread with `ImageBitmapLoader` (`imageOrientation: "flipY"`, `premultiplyAlpha: "none"`, `colorSpaceConversion: "none"`) and keeps `TextureLoader` on engines without those options (Safari before 17, Firefox before 98).

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
- `monsters.js`: `MON`, one stats entry per kind, plus the `glow` flag (the kind carries a `makeGlow` anchor; a check in `createMonster` throws if it disagrees with the builder) and `splitsInto` (kinds spawned on death).

Elsewhere: abilities in `src/enemies/monsters.js`, `pickKind` in `src/enemies/waveComposition.js` (which monsters spawn; pure, with `waveCount`, `waveKinds`, `maxAliveByKind` and `maxGlowing`), and `src/core/quality.js`. Shader, material and art constants stay beside the code that uses them.

## Timers

Wave spawn and next-wave timers go through `scheduleTimer` in `src/enemies/waves.js`, so `pauseWaveTimers` and `resumeWaveTimers` (called from `visibilitychange` in `src/main.js`) can freeze them while the tab is hidden. New wall-clock timers that drive gameplay should do the same. Reset functions (`resetWaves`, `resetInput`, `resetController`, `hideBanner`) are all called from `startGame`; add new per-run state to them.

## Rendering rules

- Never add or remove lights during play. Three.js puts the scene's light counts into every lit shader's program key, so a change recompiles the whole scene (a 0.1–2 s freeze). Glowing monsters use `makeGlow` anchors in `src/enemies/monsters.js`, which `src/enemies/monsterLights.js` copies into `MAX_MONSTER_LIGHTS` fixed slots each frame. `MAX_MONSTER_LIGHTS` and `MONSTER_POOL_SIZE` are derived from the wave data (`maxGlowing()` and `maxAliveByKind()` in `src/enemies/waveComposition.js`), so changing the waves or the `glow` flags in `src/config/monsters.js` adjusts them automatically; `npm test` pins today's values.
- Static parts of new monsters and props (eyes, feet, horns, trim) go through `mergeStaticChildren` in `src/world/staticBatch.js` at the end of their builder, with every animated or later-referenced child passed in `exclude`. Each separate mesh costs a draw call in both the main and shadow passes.
