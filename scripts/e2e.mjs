import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import { startServer } from "./serve.mjs";
import { HEAT_RAY_COOLDOWN, SPONGE_COOLDOWN } from "../src/config/weapons.js";

// Regression suite for fixed gameplay bugs. Each case reproduces the original
// bug and asserts the fixed behavior. The RS-nn ids come from the bug report.
const backend = process.env.E2E_GPU || "swiftshader";
assert.ok(
  ["metal", "swiftshader"].includes(backend),
  "E2E_GPU must be metal or swiftshader",
);
const quality = process.env.E2E_QUALITY || "low";
const args =
  backend === "metal"
    ? ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"]
    : ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"];
const server = process.env.E2E_URL ? null : await startServer();
const baseUrl = process.env.E2E_URL || `${server.url}/index.html`;
const url = `${baseUrl}${baseUrl.includes("?") ? "&" : "?"}q=${quality}`;
const started = performance.now();
const report = {
  backend,
  quality,
  url,
  cases: [],
  pageErrors: [],
  consoleErrors: [],
  failedResponses: [],
  failedRequests: [],
};

// Seeded Math.random keeps spread and spawn positions repeatable.
const seedScript = () => {
  let seed = 20260611;
  Math.random = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

// Builds the in-page test kit from the game's own exported modules.
const installKit = async (page) => {
  await page.evaluate(async () => {
    const load = async (path) => import(new URL(path, location.href).href);
    const [core, events, monsters, waves, controller, hud, projectiles] =
      await Promise.all([
        load("src/core/state.js"),
        load("src/core/events.js"),
        load("src/enemies/monsters.js"),
        load("src/enemies/waves.js"),
        load("src/player/controller.js"),
        load("src/ui/hud.js"),
        load("src/weapons/projectiles.js"),
      ]);
    const kit = {
      core,
      monsters,
      waves,
      controller,
      hud,
      hurts: [],
      shots: [],
      banner: [],
    };
    events.on("hurt", (event) =>
      kit.hurts.push({ dmg: event.dmg, t: core.state.time }),
    );
    events.on("shot", (event) =>
      kit.shots.push({ weapon: event.weapon, t: core.state.time }),
    );
    const banner = document.getElementById("banner");
    new MutationObserver(() =>
      kit.banner.push({
        t: performance.now(),
        title: document.getElementById("bannerTitle").textContent,
        hidden: banner.classList.contains("hidden"),
      }),
    ).observe(banner, { attributes: true });
    // A clean mid-run state: no monsters, no pending spawns, full health and charge.
    kit.fixture = () => {
      const { state, player, enemies, waveState } = core;
      waves.resetWaves();
      core.input.mouseDown = false;
      for (const enemy of enemies) monsters.releaseMonster(enemy);
      enemies.length = 0;
      projectiles.resetProjectiles();
      // Keeps the wave logic from clearing or advancing during a case.
      waveState.pending = 1;
      Object.assign(state, {
        hp: 100,
        water: 100,
        wave: 1,
        mode: "play",
        score: 0,
        kills: 0,
        combo: 0,
      });
      Object.assign(player, {
        vy: 0,
        onGround: true,
        jumps: 0,
        hurtCd: 0,
        oceanTime: 0,
      });
      player.pos.set(0, 0, -10);
      player.vel.set(0, 0, 0);
      state.pu = { rapid: 0, power: 0, speed: 0, freeze: 0 };
      hud.setWeapon(1);
      kit.hurts.length = 0;
      kit.shots.length = 0;
    };
    window.__e2e = kit;
  });
};

const bootPage = async (page, hasTouch) => {
  const response = await page.goto(url, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  assert.equal(response.status(), 200);
  await page.waitForFunction(
    () => {
      const button = document.getElementById("playBtn");
      return button && !button.disabled && window.__game;
    },
    null,
    { timeout: 120000 },
  );
  await installKit(page);
  if (hasTouch) {
    const coarse = await page.evaluate(
      () => matchMedia("(pointer: coarse)").matches,
    );
    assert.ok(coarse, "mobile context should report a coarse pointer");
  }
};

const watch = (page, group) => {
  page.on("pageerror", (error) =>
    report.pageErrors.push(`${group}: ${error.message}`),
  );
  page.on("console", (message) => {
    if (message.type() === "error")
      report.consoleErrors.push(`${group}: ${message.text()}`);
  });
  page.on("requestfailed", (request) => {
    report.failedRequests.push(
      `${group}: ${request.failure()?.errorText} ${request.url()}`,
    );
  });
  page.on("response", (response) => {
    if (response.status() >= 400)
      report.failedResponses.push(
        `${group}: ${response.status()} ${response.url()}`,
      );
  });
};

// Runs one named case. A failure is recorded and the suite carries on, so one
// run shows every broken behavior at once.
const runCase = async (group, name, body) => {
  const caseStarted = performance.now();
  const entry = { group, name };
  try {
    entry.detail = (await body()) || "";
    entry.result = "pass";
  } catch (error) {
    entry.result = "fail";
    entry.detail = error.message.split("\n")[0];
    entry.error = error.stack;
  }
  entry.ms = Math.round(performance.now() - caseStarted);
  report.cases.push(entry);
  console.log(
    `${entry.result.toUpperCase().padEnd(4)} ${group}: ${name} (${entry.ms} ms) ${entry.detail}`,
  );
};

// Game time advances per rendered frame, so waits use it rather than the wall
// clock: slow software rendering then changes nothing about what is asserted.
const waitGameTime = async (page, seconds, timeout = 60000) => {
  const end = await page.evaluate((s) => window.__game.state.time + s, seconds);
  await page.waitForFunction((t) => window.__game.state.time >= t, end, {
    timeout,
  });
};

const releasePointerLock = (page) =>
  page.evaluate(() => document.exitPointerLock?.());

const startRun = async (page, button) => {
  await page.locator(button).click({ timeout: 30000 });
  await page.waitForFunction(() => window.__game.state.mode === "play");
  await releasePointerLock(page);
};

const dieAndRestart = async (page) => {
  await page.evaluate(() => {
    window.__e2e.core.state.hp = 100;
    window.__e2e.controller.hurtPlayer(1000);
  });
  await page.waitForFunction(() => window.__game.state.mode === "end");
  await startRun(page, "#againBtn");
};

const mouseHold = async (page, down) => {
  if (down) {
    await page.mouse.move(500, 350);
    await page.mouse.down();
  } else {
    await page.mouse.up();
  }
};

// Records the lower-right quarter of the canvas, where the weapon sits, after every
// frame drawn to the canvas while the title loads. With hideWeapon the viewmodel scene
// is invisible, which gives the same frames without the weapon to compare against.
const recordLoadingFrames = async (browser, hideWeapon) => {
  const context = await browser.newContext({
    viewport: { width: 1000, height: 700 },
  });
  try {
    const page = await context.newPage();
    watch(page, "loading");
    await page.addInitScript(seedScript);
    await page.addInitScript((hideWeapon) => {
      const frames = [];
      window.__loadingFrames = frames;
      let game;
      Object.defineProperty(window, "__game", {
        configurable: true,
        get: () => game,
        set(value) {
          game = value;
          const { renderer, vmScene } = value;
          if (hideWeapon) vmScene.visible = false;
          const gl = renderer.getContext();
          const render = renderer.render.bind(renderer);
          renderer.render = (...args) => {
            render(...args);
            const button = document.getElementById("playBtn");
            if (renderer.getRenderTarget() !== null) return;
            if (!button || !button.disabled || frames.length >= 300) return;
            const width = gl.drawingBufferWidth;
            const height = gl.drawingBufferHeight;
            const x = width >> 1;
            const w = width - x;
            const h = height >> 1;
            const pixels = new Uint8Array(w * h * 4);
            gl.readPixels(x, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
            // Every 8th pixel in both directions is enough to see a weapon.
            const sample = [];
            for (let row = 0; row < h; row += 8)
              for (let column = 0; column < w; column += 8) {
                const i = (row * w + column) * 4;
                sample.push(pixels[i], pixels[i + 1], pixels[i + 2]);
              }
            frames.push(sample);
          };
        },
      });
    }, hideWeapon);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForFunction(
      () => {
        const button = document.getElementById("playBtn");
        return button && !button.disabled && window.__game;
      },
      null,
      { timeout: 120000 },
    );
    return await page.evaluate(() => window.__loadingFrames);
  } finally {
    await context.close();
  }
};

const desktopGroup = async (browser) => {
  const group = "desktop";
  // RS-10: the calibration frames draw the weapon so its programs compile, but it
  // must not reach the canvas before Play. Every frame drawn while loading must
  // match one drawn with the weapon scene hidden.
  await runCase(
    group,
    "RS-10 weapon stays off the canvas before Play",
    async () => {
      const withWeapon = await recordLoadingFrames(browser, false);
      const withoutWeapon = await recordLoadingFrames(browser, true);
      assert.ok(
        withWeapon.length >= 8 && withoutWeapon.length >= 8,
        `too few loading frames: ${withWeapon.length} and ${withoutWeapon.length}`,
      );
      const differing = (a, b) => {
        let count = 0;
        for (let i = 0; i < a.length; i += 3)
          if (
            Math.max(
              Math.abs(a[i] - b[i]),
              Math.abs(a[i + 1] - b[i + 1]),
              Math.abs(a[i + 2] - b[i + 2]),
            ) > 24
          )
            count++;
        return count / (a.length / 3);
      };
      // The best match among the weapon-free frames, so frame counts need not line up.
      const worst = Math.max(
        ...withWeapon.map((frame) =>
          Math.min(...withoutWeapon.map((clean) => differing(frame, clean))),
        ),
      );
      assert.ok(
        worst < 0.02,
        `weapon pixels reached the canvas: ${(worst * 100).toFixed(1)}% of the sampled pixels differ`,
      );
      return `${withWeapon.length} frames, worst ${(worst * 100).toFixed(2)}% differ`;
    },
  );

  const context = await browser.newContext({
    viewport: { width: 1000, height: 700 },
  });
  const page = await context.newPage();
  watch(page, group);
  await page.addInitScript(seedScript);
  await bootPage(page, false);

  await runCase(group, "effects stay in the scene after warm-up", async () => {
    const missing = await page.evaluate(() => {
      const scene = window.__game.scene;
      return ["Heat Ray beam", "Heat Ray sand scorches"].filter(
        (name) => scene.getObjectByName(name)?.parent !== scene,
      );
    });
    assert.deepEqual(missing, [], "effects missing from the scene");
  });

  await startRun(page, "#playBtn");
  await page.evaluate(() => window.__e2e.fixture());

  // RS-01: a close Tide Brute slam. Jumping dodges it; grounded takes the slam.
  const bruteSlam = async (jump) => {
    await page.evaluate((jump) => {
      const kit = window.__e2e;
      kit.fixture();
      const brute = kit.monsters.addEnemy(1, 0, -7.6);
      brute.state = "windup";
      brute.stateT = 0.12;
      brute.speed = 0;
      kit.t0 = kit.core.state.time;
      kit.hurts.length = 0;
      if (jump) {
        for (const type of ["keydown", "keyup"])
          window.dispatchEvent(new KeyboardEvent(type, { code: "Space" }));
      }
    }, jump);
    await waitGameTime(page, 2.4);
    return page.evaluate(() =>
      window.__e2e.hurts.map((hurt) => ({
        dmg: hurt.dmg,
        t: +(hurt.t - window.__e2e.t0).toFixed(2),
      })),
    );
  };
  await runCase(group, "RS-01 grounded player takes the slam", async () => {
    const hurts = await bruteSlam(false);
    assert.equal(hurts[0]?.dmg, 16, JSON.stringify(hurts));
    assert.ok(hurts[0].t < 0.6, `slam landed late: ${JSON.stringify(hurts)}`);
    return JSON.stringify(hurts.slice(0, 2));
  });
  await runCase(
    group,
    "RS-01 jumping dodges the slam, melee resumes",
    async () => {
      const hurts = await bruteSlam(true);
      const early = hurts.filter((hurt) => hurt.t < 0.8);
      assert.deepEqual(
        early,
        [],
        `damage during the slam: ${JSON.stringify(hurts)}`,
      );
      const resumed = hurts.find((hurt) => hurt.t >= 0.8);
      assert.equal(
        resumed?.dmg,
        18,
        `no melee after recovery: ${JSON.stringify(hurts)}`,
      );
      assert.ok(
        resumed.t <= 1.8,
        `melee resumed late: ${JSON.stringify(hurts)}`,
      );
      return JSON.stringify(hurts.slice(0, 2));
    },
  );

  // RS-03 and the beam: hold the trigger for 2 s of game time.
  const holdFire = async (weapon, water) => {
    await page.evaluate(
      ([weapon, water]) => {
        const kit = window.__e2e;
        kit.fixture();
        kit.core.state.water = water;
        kit.hud.setWeapon(weapon);
        const beam = window.__game.scene.getObjectByName("Heat Ray beam");
        kit.beamSeen = false;
        kit.beamTimer = setInterval(() => {
          if (beam.visible) kit.beamSeen = true;
        }, 10);
      },
      [weapon, water],
    );
    await mouseHold(page, true);
    await waitGameTime(page, 2);
    await mouseHold(page, false);
    return page.evaluate(() => {
      const kit = window.__e2e;
      clearInterval(kit.beamTimer);
      return { shots: kit.shots.length, beamSeen: kit.beamSeen };
    });
  };
  const heatNominal = 2 / HEAT_RAY_COOLDOWN;
  const spongeNominal = 2 / SPONGE_COOLDOWN;
  await runCase(group, "RS-03 empty heat ray trickles on sand", async () => {
    const { shots } = await holdFire(1, 0);
    assert.ok(shots >= 1 && shots <= 8, `${shots} shots in 2 s`);
    return `${shots} shots`;
  });
  await runCase(group, "RS-03 empty sponge fires nothing", async () => {
    const { shots } = await holdFire(2, 0);
    assert.equal(shots, 0, `${shots} bursts in 2 s`);
    return `${shots} bursts`;
  });
  await runCase(group, "RS-03 full-charge cadence unchanged", async () => {
    const heat = await holdFire(1, 100);
    assert.ok(
      heat.shots >= heatNominal * 0.5 && heat.shots <= heatNominal + 1,
      `heat ray fired ${heat.shots} (nominal ${Math.round(heatNominal)})`,
    );
    const sponge = await holdFire(2, 100);
    assert.ok(
      sponge.shots >= 3 && sponge.shots <= spongeNominal + 1,
      `sponge fired ${sponge.shots} (nominal ${Math.round(spongeNominal)})`,
    );
    return `heat ray ${heat.shots}, sponge ${sponge.shots}`;
  });
  await runCase(group, "heat ray beam shows while firing", async () => {
    const { beamSeen } = await holdFire(1, 100);
    assert.ok(beamSeen, "beam never became visible");
    const inScene = await page.evaluate(
      () =>
        window.__game.scene.getObjectByName("Heat Ray beam")?.parent ===
        window.__game.scene,
    );
    assert.ok(inScene, "beam left the scene");
  });

  // RS-04: a shot that kills a Gusher inside its blast radius also kills the player.
  await runCase(
    group,
    "RS-04 lethal Gusher kill reaches the end screen",
    async () => {
      await page.evaluate(() => {
        const kit = window.__e2e;
        kit.fixture();
        Object.assign(kit.core.state, { hp: 10, score: 0, kills: 0, combo: 0 });
        const gusher = kit.monsters.addEnemy(4, 0, -8);
        gusher.hp = 0.1;
        gusher.speed = 0;
        gusher.abCd = 99;
        gusher.state = "chase";
        window.__game.aimAt(
          gusher.pos.clone().add({ x: 0, y: 0.7 * gusher.s, z: 0 }),
        );
      });
      await mouseHold(page, true);
      await page.waitForFunction(
        () => window.__game.state.mode === "end",
        null,
        {
          timeout: 15000,
        },
      );
      await mouseHold(page, false);
      const result = await page.evaluate(() => ({
        score: window.__game.state.score,
        kills: window.__game.state.kills,
        shownScore: document.getElementById("stScore").textContent,
        shownKills: document.getElementById("stKills").textContent,
      }));
      assert.ok(
        result.kills >= 1,
        `kill not scored: ${JSON.stringify(result)}`,
      );
      assert.equal(
        result.shownScore,
        String(result.score),
        JSON.stringify(result),
      );
      assert.equal(
        result.shownKills,
        String(result.kills),
        JSON.stringify(result),
      );
      return JSON.stringify(result);
    },
  );
  await startRun(page, "#againBtn");

  // RS-07: a jump buffered just before death must not fire on the next run.
  await runCase(
    group,
    "RS-07 buffered jump does not survive a restart",
    async () => {
      await page.evaluate(() => {
        const kit = window.__e2e;
        for (let i = 0; i < 3; i++) {
          window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space" }));
          window.dispatchEvent(new KeyboardEvent("keyup", { code: "Space" }));
        }
        kit.controller.hurtPlayer(1000);
        kit.maxY = 0;
        kit.maxJumps = 0;
        kit.jumpTimer = setInterval(() => {
          if (window.__game.state.mode !== "play") return;
          kit.maxY = Math.max(kit.maxY, window.__game.player.pos.y);
          kit.maxJumps = Math.max(kit.maxJumps, window.__game.player.jumps);
        }, 5);
      });
      await page.waitForFunction(() => window.__game.state.mode === "end");
      await startRun(page, "#againBtn");
      await waitGameTime(page, 0.6);
      const result = await page.evaluate(() => {
        clearInterval(window.__e2e.jumpTimer);
        return { maxY: window.__e2e.maxY, maxJumps: window.__e2e.maxJumps };
      });
      assert.equal(result.maxJumps, 0, JSON.stringify(result));
      assert.equal(result.maxY, 0, JSON.stringify(result));
      return JSON.stringify(result);
    },
  );

  // RS-05: the wave banner outlives an older banner's hide timer.
  const bannerVisibleMs = (title) =>
    page.evaluate((title) => {
      const log = window.__e2e.banner;
      const shown = log.findIndex(
        (entry) => entry.title.startsWith(title) && !entry.hidden,
      );
      if (shown < 0) throw new Error(`banner ${title} never shown`);
      const hidden = log.findIndex((entry, i) => i > shown && entry.hidden);
      if (hidden < 0) throw new Error(`banner ${title} never hidden`);
      return Math.round(log[hidden].t - log[shown].t);
    }, title);
  await runCase(
    group,
    "RS-05 WAVE 2 banner stays 2.2 s after a clear",
    async () => {
      await page.evaluate(() => {
        const kit = window.__e2e;
        kit.core.state.hp = 1000000;
        kit.banner.length = 0;
        kit.waves.spawnWave(1);
        window.__game.killAll();
      });
      await page.waitForFunction(() => window.__game.state.wave === 2, null, {
        timeout: 30000,
      });
      await page.waitForTimeout(3200);
      const ms = await bannerVisibleMs("WAVE 2");
      assert.ok(ms >= 2150 && ms <= 3500, `WAVE 2 visible for ${ms} ms`);
      return `${ms} ms`;
    },
  );
  await runCase(
    group,
    "RS-05 restart mid-banner keeps the new WAVE 1",
    async () => {
      await page.evaluate(() => window.__e2e.fixture());
      await dieAndRestart(page);
      await page.waitForTimeout(700);
      await page.evaluate(() => {
        window.__e2e.banner.length = 0;
      });
      await dieAndRestart(page);
      await page.waitForTimeout(3200);
      const ms = await bannerVisibleMs("WAVE 1");
      assert.ok(ms >= 2150 && ms <= 3500, `WAVE 1 visible for ${ms} ms`);
      return `${ms} ms`;
    },
  );

  await context.close();
};

const mobileGroup = async (browser) => {
  const group = "mobile";
  const context = await browser.newContext({
    viewport: { width: 844, height: 390 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  watch(page, group);
  await page.addInitScript(seedScript);
  await bootPage(page, true);
  await page.locator("#playBtn").tap({ timeout: 30000 });
  await page.waitForFunction(() => window.__game.state.mode === "play");

  // RS-02: tapping a weapon slot selects it, without looking around or firing.
  await runCase(group, "RS-02 tapping the Sponge slot selects it", async () => {
    await page.evaluate(() => window.__e2e.fixture());
    const slot = (index) =>
      page.evaluate((index) => {
        const slots = document.querySelectorAll(".slot");
        const box = slots[index].getBoundingClientRect();
        const x = box.x + box.width / 2;
        const y = box.y + box.height / 2;
        const top = document.elementFromPoint(x, y)?.closest(".slot");
        return { x, y, onTop: top === slots[index] };
      }, index);
    const snapshot = () =>
      page.evaluate(() => {
        const { state, look } = window.__e2e.core;
        return {
          weapon: state.weapon,
          yaw: look.yaw,
          pitch: look.pitch,
          shots: window.__e2e.shots.length,
          on: [...document.querySelectorAll(".slot")].map((el) =>
            el.classList.contains("on"),
          ),
          ammo: document.getElementById("ammo").textContent,
        };
      });
    const heat = await slot(0);
    const sponge = await slot(1);
    assert.ok(sponge.onTop, "Sponge slot is covered by another element");
    const before = await snapshot();
    await page.touchscreen.tap(sponge.x, sponge.y);
    await waitGameTime(page, 0.3);
    const afterSponge = await snapshot();
    assert.equal(afterSponge.weapon, 2, "Sponge not selected");
    assert.deepEqual(afterSponge.on, [false, true, false, false]);
    assert.match(afterSponge.ammo, /SPONGE/);
    await page.touchscreen.tap(heat.x, heat.y);
    await waitGameTime(page, 0.3);
    const afterHeat = await snapshot();
    assert.equal(afterHeat.weapon, 1, "Heat Ray not selected again");
    for (const after of [afterSponge, afterHeat]) {
      assert.equal(after.yaw, before.yaw, "tap moved the camera");
      assert.equal(after.pitch, before.pitch, "tap moved the camera");
      assert.equal(after.shots, before.shots, "tap fired the weapon");
    }
  });

  // RS-06: a look finger still down across a restart must not block new gestures.
  await runCase(
    group,
    "RS-06 new look gesture works after a restart",
    async () => {
      await page.evaluate(() => window.__e2e.fixture());
      const cdp = await context.newCDPSession(page);
      const touch = (type, points) =>
        cdp.send("Input.dispatchTouchEvent", {
          type,
          touchPoints: points.map(([id, x, y]) => ({ id, x, y })),
        });
      await touch("touchStart", [[31, 700, 300]]);
      await touch("touchMove", [[31, 740, 310]]);
      await page.evaluate(() => window.__e2e.controller.hurtPlayer(1000));
      await page.waitForFunction(() => window.__game.state.mode === "end");
      // The old finger stays down while the player restarts with a click.
      await page.locator("#againBtn").click();
      await page.waitForFunction(() => window.__game.state.mode === "play");
      const look = () => page.evaluate(() => ({ ...window.__e2e.core.look }));
      const before = await look();
      await touch("touchStart", [
        [31, 740, 310],
        [32, 700, 300],
      ]);
      await touch("touchMove", [
        [31, 740, 310],
        [32, 780, 340],
      ]);
      await waitGameTime(page, 0.3);
      const after = await look();
      await touch("touchEnd", []);
      assert.ok(
        after.yaw !== before.yaw || after.pitch !== before.pitch,
        `camera did not move: ${JSON.stringify({ before, after })}`,
      );
      return JSON.stringify({ before, after });
    },
  );

  await context.close();
};

// Startup asset failures. Each case boots a fresh page and aborts requests for the sand
// diffuse texture. The aborts are deliberate, so these pages report their own errors instead
// of through `watch`, which would count them as suite failures.
const startupGroup = async (browser) => {
  const group = "startup";
  const sand = "/assets/beach/coast_sand_01_diff.webp";
  const bootWithAborts = async (shouldAbort) => {
    const context = await browser.newContext({
      viewport: { width: 1000, height: 700 },
    });
    const page = await context.newPage();
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    let requests = 0;
    await page.route(`**${sand}`, (route) => {
      requests++;
      return shouldAbort(requests) ? route.abort("failed") : route.continue();
    });
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    return { context, page, pageErrors, requests: () => requests };
  };
  const status = (page) =>
    page.evaluate(() => ({
      disabled: document.getElementById("playBtn").disabled,
      progress: document.getElementById("loadingProgress").textContent,
      err: document.getElementById("err").textContent,
    }));

  await runCase(
    group,
    "RS-11 one failed texture request is retried and Play enables",
    async () => {
      const boot = await bootWithAborts((n) => n === 1);
      try {
        await boot.page.waitForFunction(
          () => {
            const button = document.getElementById("playBtn");
            return button && !button.disabled && window.__game;
          },
          null,
          { timeout: 120000 },
        );
        const after = await status(boot.page);
        assert.equal(after.err, "", "#err shows text");
        assert.ok(!/could not load/.test(after.progress), after.progress);
        assert.deepEqual(boot.pageErrors, [], "page errors");
        assert.ok(
          boot.requests() >= 2,
          "the texture was never requested again",
        );
        return `${boot.requests()} requests`;
      } finally {
        await boot.context.close();
      }
    },
  );

  await runCase(
    group,
    "RS-11 a texture that never loads shows the error and keeps Play disabled",
    async () => {
      const boot = await bootWithAborts(() => true);
      try {
        await boot.page.waitForFunction(
          () =>
            /could not load/.test(
              document.getElementById("loadingProgress").textContent,
            ),
          null,
          { timeout: 60000 },
        );
        // Let any late load settle; the failure must not clear itself.
        await boot.page.waitForTimeout(2000);
        const after = await status(boot.page);
        assert.ok(after.disabled, "Play is enabled");
        assert.match(
          after.progress,
          /An asset could not load\. Reload to retry\./,
        );
        assert.equal(boot.requests() >= 3, true, `${boot.requests()} requests`);
        return `${boot.requests()} requests`;
      } finally {
        await boot.context.close();
      }
    },
  );
};

const printTable = () => {
  const width = Math.max(...report.cases.map((c) => c.name.length));
  console.log("\nResult  Case");
  for (const entry of report.cases) {
    console.log(
      `${entry.result.padEnd(6)}  ${entry.group.padEnd(7)} ${entry.name.padEnd(width)}  ${String(entry.ms).padStart(6)} ms  ${entry.detail}`,
    );
  }
};

let browser;
let deadline;
await mkdir("test-results", { recursive: true });
try {
  browser = await chromium.launch({
    channel: "chromium",
    headless: true,
    args,
  });
  // Hard stop includes slow GPU startup; finally still closes the sole browser.
  await Promise.race([
    (async () => {
      await desktopGroup(browser);
      await mobileGroup(browser);
      await startupGroup(browser);
    })(),
    new Promise((_, reject) => {
      deadline = setTimeout(
        () => reject(new Error("E2E exceeded 600 seconds")),
        600000,
      );
    }),
  ]);
} catch (error) {
  report.error = error.stack;
  process.exitCode = 1;
} finally {
  clearTimeout(deadline);
  if (browser) await browser.close();
  await server?.close();
  const clean =
    report.pageErrors.length +
      report.consoleErrors.length +
      report.failedResponses.length +
      report.failedRequests.length ===
    0;
  const failed = report.cases.filter((entry) => entry.result === "fail");
  report.result =
    !report.error && clean && failed.length === 0 ? "pass" : "fail";
  if (report.result === "fail") process.exitCode = 1;
  report.totalMs = Math.round(performance.now() - started);
  printTable();
  if (!clean) {
    console.log(
      `\nPage errors: ${JSON.stringify(report.pageErrors)}\nConsole errors: ${JSON.stringify(report.consoleErrors)}\nFailed responses: ${JSON.stringify(report.failedResponses)}\nFailed requests: ${JSON.stringify(report.failedRequests)}`,
    );
  }
  if (report.error) console.log(`\n${report.error}`);
  console.log(
    `\n${report.result.toUpperCase()}: ${report.cases.length - failed.length}/${report.cases.length} cases in ${report.totalMs} ms (${backend}, q=${quality})`,
  );
  await writeFile(
    "test-results/e2e.json",
    JSON.stringify(report, null, 2) + "\n",
  );
}
