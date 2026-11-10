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
  },
});
const runs = Number(options.runs);
const WAVES = 5;
const MIN_WAVE_MS = 9000;
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
      if (event.target.id === "playBtn") seed = 0x76543210;
    },
    true,
  );
  window.__perf = { frames: [], last: 0, readyMs: 0 };
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
      if (perf.last && game.state.mode === "play")
        perf.frames.push({
          dt: now - perf.last,
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
    await page.click("#playBtn");
    await page.evaluate(async () => {
      window.__perfWaveState = (await import("/src/core/state.js")).waveState;
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
      await page.evaluate(() => window.__game.killAll());
    }
    const frames = await page.evaluate(() => window.__perf.frames);
    run.waves = [];
    for (let wave = 1; wave <= WAVES; wave++) {
      const inWave = frames.filter((frame) => frame.wave === wave);
      const dts = inWave.map((frame) => frame.dt).sort((a, b) => a - b);
      run.waves.push({
        wave,
        frames: dts.length,
        median: quantile(dts, 0.5),
        p99: quantile(dts, 0.99),
        max: quantile(dts, 1),
        over33: dts.filter((dt) => dt > 33).length,
        // 50.1 avoids counting a float-rounded 50 ms interval as a hitch.
        over50: dts.filter((dt) => dt > 50.1).length,
        programsStart: inWave[0]?.programs,
        programsEnd: inWave.at(-1)?.programs,
      });
    }
    if (errors.length) throw new Error(`Page errors: ${errors.join("; ")}`);
    return run;
  } finally {
    await browser.close();
  }
}

const server = await startServer();
const results = [];
try {
  for (let i = 0; i < runs; i++) {
    console.log(`Run ${i + 1}/${runs}`);
    results.push(await runOnce(server.url));
  }
} finally {
  await server.close();
}

const summary = {
  quality: options.q,
  runs,
  renderer: results[0].renderer,
  readyMs: median(results.map((run) => run.readyMs)),
  waves: results[0].waves.map((_, index) => {
    const pick = (key) => median(results.map((run) => run.waves[index][key]));
    return {
      wave: index + 1,
      frames: pick("frames"),
      median: pick("median"),
      p99: pick("p99"),
      max: pick("max"),
      over33: pick("over33"),
      over50: pick("over50"),
      programsStart: pick("programsStart"),
      programsEnd: pick("programsEnd"),
    };
  }),
};
console.log(
  `\n${summary.renderer}, q=${summary.quality}, median of ${runs} run(s)`,
);
console.log(`Load until Play enabled: ${Math.round(summary.readyMs)} ms\n`);
const fixed = (value) => value.toFixed(1).padStart(8);
console.log(
  "Wave  Frames  Median ms    p99 ms    Max ms  >33 ms  >50 ms  Programs",
);
for (const w of summary.waves)
  console.log(
    `${String(w.wave).padStart(4)}${String(w.frames).padStart(8)}${fixed(w.median)}  ${fixed(w.p99)}  ${fixed(w.max)}${String(w.over33).padStart(8)}${String(w.over50).padStart(8)}  ${w.programsStart} -> ${w.programsEnd}`,
  );
if (options.json) {
  await mkdir(path.dirname(path.resolve(options.json)), { recursive: true });
  await writeFile(options.json, JSON.stringify({ summary, results }, null, 2));
}
