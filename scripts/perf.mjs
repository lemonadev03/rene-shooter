import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { chromium } from "playwright";
import { startServer } from "./serve.mjs";

const { values: options } = parseArgs({
  options: {
    runs: { type: "string", default: "3" },
    q: { type: "string", default: "high" },
    json: { type: "string" },
    // Base URL of a deployed copy (e.g. the GitHub Pages site); default serves this checkout.
    url: { type: "string" },
  },
});
const runs = Number(options.runs);
const WAVES = 5;
const MIN_WAVE_MS = 9000;
// How long the play and end rows keep counting after the Play click and the end screen.
const PLAY_TAIL_MS = 3000;
const END_TAIL_MS = 2000;
const args = ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"];

// Seeded Math.random keeps world generation and the play start comparable.
// The seed resets on Play so load-time work cannot shift the play sequence.
function installSeed() {
  let seed = 0x12345678;
  Math.random = () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  document.addEventListener(
    "click",
    (event) => {
      if (event.target.id === "playBtn") {
        seed = 0x76543210;
        window.__perf.clickMs = performance.now();
      }
    },
    true,
  );
  window.__perf = { frames: [], last: 0, readyMs: 0, clickMs: 0, clearMs: 0, endMs: 0 };
  new MutationObserver(() => {
    const button = document.getElementById("playBtn");
    if (button && !button.disabled && !window.__perf.readyMs)
      window.__perf.readyMs = performance.now();
  }).observe(document, {
    subtree: true,
    attributes: true,
    attributeFilter: ["disabled"],
  });
  function tick(now) {
    const game = window.__game;
    const perf = window.__perf;
    if (game) {
      if (game.state.mode === "play") game.state.hp = 1000000;
      if (game.state.mode === "end" && !perf.endMs) perf.endMs = now;
      if (perf.last && perf.readyMs)
        perf.frames.push({
          t: now,
          dt: now - perf.last,
          mode: game.state.mode,
          wave: game.state.wave,
          programs: game.renderer.info.programs.length,
        });
      perf.last = now;
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

const median = (list) => {
  const sorted = [...list].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) / 2)];
};
const quantile = (sorted, p) => sorted[Math.floor((sorted.length - 1) * p)];

function describe(frames) {
  const dts = frames.map((frame) => frame.dt).sort((a, b) => a - b);
  return {
    frames: dts.length,
    median: quantile(dts, 0.5),
    p99: quantile(dts, 0.99),
    max: quantile(dts, 1),
    over33: dts.filter((dt) => dt > 33).length,
    // 50.1 avoids counting a float-rounded 50 ms interval as a hitch.
    over50: dts.filter((dt) => dt > 50.1).length,
    programsStart: frames[0]?.programs,
    programsEnd: frames.at(-1)?.programs,
    // Frames over 50 ms, for the --json output only.
    slow: frames
      .filter((frame) => frame.dt > 50.1)
      .map(({ t, dt, mode, wave }) => ({ t, dt, mode, wave })),
  };
}

async function runOnce(origin) {
  const browser = await chromium.launch({
    channel: "chromium",
    headless: true,
    args,
  });
  const errors = [];
  try {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 720 },
    });
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await page.addInitScript(installSeed);
    await page.goto(`${origin}/index.html?q=${options.q}`, {
      waitUntil: "load",
    });
    await page.waitForFunction(() => window.__perf.readyMs, null, {
      timeout: 180000,
    });
    const run = await page.evaluate(() => ({
      readyMs: window.__perf.readyMs,
      renderer: (() => {
        const gl = window.__game.renderer.getContext();
        const debug = gl.getExtension("WEBGL_debug_renderer_info");
        return gl.getParameter(
          debug ? debug.UNMASKED_RENDERER_WEBGL : gl.RENDERER,
        );
      })(),
    }));
    // A real first visit hovers the button before clicking it.
    await page.waitForTimeout(500);
    const box = await page.locator("#playBtn").boundingBox();
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.waitForTimeout(1000);
    await page.mouse.click(x, y);
    await page.evaluate(async () => {
      window.__perfWaveState = (await import(new URL("src/core/state.js", location.href).href)).waveState;
    });
    for (let wave = 1; wave <= WAVES; wave++) {
      await page.waitForFunction(
        (expected) => window.__game.state.wave === expected,
        wave,
        { timeout: 60000 },
      );
      await page.waitForTimeout(MIN_WAVE_MS);
      await page.waitForFunction(
        () => window.__perfWaveState.pending === 0,
        null,
        { timeout: 60000 },
      );
      if (wave === WAVES) {
        await page.evaluate(() => {
          window.__perf.clearMs = performance.now();
        });
      }
      await page.evaluate(() => window.__game.killAll());
    }
    await page.waitForFunction(() => window.__perf.endMs, null, {
      timeout: 60000,
    });
    await page.waitForTimeout(END_TAIL_MS + 100);
    const { frames, readyMs, clickMs, clearMs, endMs } = await page.evaluate(
      () => window.__perf,
    );
    run.waves = [];
    for (let wave = 1; wave <= WAVES; wave++) {
      run.waves.push({
        wave,
        ...describe(
          frames.filter((frame) => frame.mode === "play" && frame.wave === wave),
        ),
      });
    }
    // Play: from Play enabled through the first seconds of wave 1.
    run.marks = { readyMs, clickMs, clearMs, endMs };
    run.play = describe(
      frames.filter(
        (frame) => frame.t >= readyMs && frame.t <= clickMs + PLAY_TAIL_MS,
      ),
    );
    // End: from the wave 5 clear through the end screen's first seconds.
    run.end = describe(
      frames.filter(
        (frame) => frame.t >= clearMs && frame.t <= endMs + END_TAIL_MS,
      ),
    );
    if (errors.length) throw new Error(`Page errors: ${errors.join("; ")}`);
    return run;
  } finally {
    await browser.close();
  }
}

const server = options.url ? null : await startServer();
const origin = options.url ? options.url.replace(/\/+$/, "") : server.url;
const results = [];
try {
  for (let i = 0; i < runs; i++) {
    console.log(`Run ${i + 1}/${runs}`);
    results.push(await runOnce(origin));
  }
} finally {
  await server?.close();
}

function summarize(select, head) {
  const pick = (key) => median(results.map((run) => select(run)[key]));
  return {
    ...head,
    frames: pick("frames"),
    median: pick("median"),
    p99: pick("p99"),
    max: pick("max"),
    over33: pick("over33"),
    over50: pick("over50"),
    programsStart: pick("programsStart"),
    programsEnd: pick("programsEnd"),
  };
}

const summary = {
  quality: options.q,
  runs,
  renderer: results[0].renderer,
  readyMs: median(results.map((run) => run.readyMs)),
  waves: results[0].waves.map((_, index) =>
    summarize((run) => run.waves[index], { wave: index + 1 }),
  ),
  play: summarize((run) => run.play, { wave: "play" }),
  end: summarize((run) => run.end, { wave: "end" }),
};
console.log(
  `\n${summary.renderer}, q=${summary.quality}, median of ${runs} run(s)`,
);
console.log(`Load until Play enabled: ${Math.round(summary.readyMs)} ms\n`);
const fixed = (value) => value.toFixed(1).padStart(8);
console.log(
  "Row   Frames  Median ms    p99 ms    Max ms  >33 ms  >50 ms  Programs",
);
for (const w of [...summary.waves, summary.play, summary.end])
  console.log(
    `${String(w.wave).padEnd(4)}${String(w.frames).padStart(8)}${fixed(w.median)}  ${fixed(w.p99)}  ${fixed(w.max)}${String(w.over33).padStart(8)}${String(w.over50).padStart(8)}  ${w.programsStart} -> ${w.programsEnd}`,
  );
if (options.json) {
  await mkdir(path.dirname(path.resolve(options.json)), { recursive: true });
  await writeFile(options.json, JSON.stringify({ summary, results }, null, 2));
}
