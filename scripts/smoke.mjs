import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import { startServer } from "./serve.mjs";

const backend = process.env.SMOKE_GPU || "swiftshader";
assert.ok(
  ["metal", "swiftshader"].includes(backend),
  "SMOKE_GPU must be metal or swiftshader",
);
const args =
  backend === "metal"
    ? ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"]
    : ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"];
const server = process.env.SMOKE_URL ? null : await startServer();
const url = process.env.SMOKE_URL || `${server.url}/index.html`;
const started = performance.now();
const report = {
  backend,
  args,
  url,
  stages: {},
  pageErrors: [],
  consoleErrors: [],
  failedResponses: [],
  failedRequests: [],
};
let browser;
let page;
let deadline;
await mkdir("test-results", { recursive: true });
try {
  browser = await chromium.launch({
    channel: "chromium",
    headless: true,
    args,
  });
  page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  page.on("pageerror", (error) => report.pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") report.consoleErrors.push(message.text());
  });
  page.on("requestfailed", (request) => {
    report.failedRequests.push(
      `${request.failure()?.errorText} ${request.url()}`,
    );
  });
  page.on("response", (response) => {
    if (response.status() >= 400)
      report.failedResponses.push(`${response.status()} ${response.url()}`);
  });
  // Hard stop includes slow GPU startup; finally still closes the sole browser.
  const run = async () => {
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
    assert.ok(await page.locator("#playBtn").isVisible());
    report.stages.readyMs = Math.round(performance.now() - started);
    console.log(`Ready after ${report.stages.readyMs} ms (${backend})`);
    report.webgl = await page.evaluate(() => {
      const gl = window.__game.renderer.getContext();
      const debug = gl.getExtension("WEBGL_debug_renderer_info");
      return debug
        ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)
        : gl.getParameter(gl.RENDERER);
    });
    if (backend === "swiftshader") assert.match(report.webgl, /swiftshader/i);
    // Persistent effects must survive the loading warm-up, which stages and unstages objects.
    const missingEffects = await page.evaluate(() => {
      const scene = window.__game.scene;
      return ["Heat Ray beam", "Heat Ray sand scorches"].filter(
        (name) => scene.getObjectByName(name)?.parent !== scene,
      );
    });
    assert.deepEqual(missingEffects, [], "effects missing from the scene");
    await page.locator("#playBtn").click({ timeout: 30000 });
    await page.evaluate(async () => {
      window.__smokeWaveState = (await import("/src/core/state.js")).waveState;
      // Survival is not this test's assertion. Avoid a death before clearing waves.
      window.__game.state.hp = 1000000;
    });
    for (const wave of [1, 2]) {
      await page.waitForFunction(
        (expected) => {
          const game = window.__game;
          return (
            game.state.mode === "play" &&
            game.state.wave === expected &&
            window.__smokeWaveState.pending === 0 &&
            game.enemies.some((enemy) => !enemy.dead)
          );
        },
        wave,
        { timeout: 60000 },
      );
      report.stages[`wave${wave}SpawnMs`] = Math.round(
        performance.now() - started,
      );
      const kills = await page.evaluate(() => {
        const game = window.__game;
        game.state.hp = 1000000;
        const before = game.state.kills;
        game.killAll();
        return before;
      });
      await page.waitForFunction(
        (before) => {
          const game = window.__game;
          return (
            game.enemies.length === 0 &&
            window.__smokeWaveState.pending === 0 &&
            game.state.kills > before
          );
        },
        kills,
        { timeout: 30000 },
      );
      report.stages[`wave${wave}ClearMs`] = Math.round(
        performance.now() - started,
      );
    }
    assert.equal((await page.locator("#err").textContent()).trim(), "");
    assert.deepEqual(report.pageErrors, []);
    assert.deepEqual(report.consoleErrors, []);
    assert.deepEqual(report.failedResponses, []);
    assert.deepEqual(report.failedRequests, []);
    report.result = "pass";
  };
  await Promise.race([
    run(),
    new Promise((_, reject) => {
      deadline = setTimeout(
        () => reject(new Error("Smoke exceeded 300 seconds")),
        300000,
      );
    }),
  ]);
} catch (error) {
  report.result = "fail";
  report.error = error.stack;
  if (page) {
    report.loading = await page
      .evaluate(() => ({
        progress: document.getElementById("loadingProgress")?.textContent,
        button: document.getElementById("playBtn")?.textContent,
        quality: window.__game?.quality,
      }))
      .catch(() => null);
    report.errorText = await page
      .locator("#err")
      .textContent({ timeout: 1000 })
      .catch(() => "unavailable");
    await page
      .screenshot({
        path: `test-results/smoke-${backend}-failure.png`,
        timeout: 5000,
      })
      .catch(() => {});
  }
  process.exitCode = 1;
} finally {
  clearTimeout(deadline);
  if (browser) await browser.close();
  await server?.close();
  report.totalMs = Math.round(performance.now() - started);
  await writeFile(
    `test-results/smoke-${backend}.json`,
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report, null, 2));
}
