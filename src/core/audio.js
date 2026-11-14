// ===== audio: recorded sounds through a small mixer, synth fallback =====
// Call sites still use beep()/noiseHit() with their original parameters; the
// classifiers at the bottom map those parameter patterns (one per gameplay
// event, see the table there) to the recorded sounds below. Until a clip has
// loaded, the original synth sound plays instead, through the same buses.
import { player, enemies } from "./state.js";
import { on } from "./events.js";

let AC = null;
let master = null;
let sfxBus = null;
let ambBus = null;

// name -> { files, vol, cap, pitch [min,max] rate multiplier, bus, lp Hz,
//           slice seconds played from a random offset, ramp rate end,
//           dist: attenuate by nearest-enemy distance, duck: dip ambience }
const SOUNDS = {
  ambSurf: { files: ["amb-surf"], vol: 0.5, cap: 1, bus: "amb", loop: true },
  ambWind: { files: ["amb-wind"], vol: 0.28, cap: 1, bus: "amb", loop: true },
  gull: {
    files: ["gull-1", "gull-2", "gull-3"],
    vol: 0.16,
    cap: 1,
    pitch: [0.92, 1.08],
    bus: "amb",
  },
  stepDry: {
    files: ["step-dry-1", "step-dry-2", "step-dry-3"],
    vol: 0.3,
    cap: 2,
    pitch: [0.94, 1.06],
  },
  stepWet: {
    files: ["step-wet-1", "step-wet-2"],
    vol: 0.32,
    cap: 2,
    pitch: [0.94, 1.06],
  },
  land: {
    files: ["jump-land", "jump-land-2"],
    vol: 0.42,
    cap: 2,
    pitch: [0.95, 1.05],
  },
  splashSmall: {
    files: ["splash-small"],
    vol: 0.4,
    cap: 4,
    pitch: [0.92, 1.1],
  },
  splashBig: {
    files: ["splash-big"],
    vol: 0.55,
    cap: 2,
    pitch: [0.9, 1.05],
    duck: true,
  },
  hitWet: { files: ["hit-wet"], vol: 0.34, cap: 4, pitch: [0.9, 1.15] },
  steam: { files: ["steam"], vol: 0.34, cap: 3, pitch: [0.92, 1.08] },
  weld: {
    files: ["weld"],
    vol: 0.5,
    cap: 3,
    pitch: [0.95, 1.1],
    slice: 0.35,
    duck: true,
  },
  sizzle: {
    files: ["sizzle"],
    vol: 0.22,
    cap: 2,
    pitch: [0.95, 1.1],
    slice: 0.3,
  },
  charge: {
    files: ["charge"],
    vol: 0.2,
    cap: 1,
    pitch: [1, 1],
    slice: 0.45,
    ramp: 1.6,
  },
  gurgle: {
    files: ["gurgle"],
    vol: 0.36,
    cap: 3,
    pitch: [0.85, 1.15],
    dist: true,
  },
  growl: {
    files: ["growl"],
    vol: 0.5,
    cap: 2,
    pitch: [0.5, 0.62],
    lp: 900,
    dist: true,
  },
  slam: {
    files: ["slam"],
    vol: 0.6,
    cap: 2,
    pitch: [0.55, 0.7],
    lp: 1200,
    dist: true,
    duck: true,
  },
  click: { files: ["click"], vol: 0.3, cap: 4, pitch: [0.95, 1.1] },
  switchClick: {
    files: ["switch"],
    vol: 0.32,
    cap: 2,
    pitch: [0.95, 1.05],
  },
};
const GLOBAL_CAP = 24;
const buffers = new Map(); // file base name -> AudioBuffer
const voices = new Map(); // sound name -> active count
let totalVoices = 0;
let loadStarted = false;
let ambienceOn = false;
let lastDuck = 0;

function createContext() {
  if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)();
  return AC;
}
function ensureGraph() {
  const a = createContext();
  if (!master) {
    master = a.createGain();
    master.gain.value = 0.9;
    const limiter = a.createDynamicsCompressor();
    limiter.threshold.value = -12;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.25;
    master.connect(limiter);
    limiter.connect(a.destination);
    sfxBus = a.createGain();
    sfxBus.connect(master);
    ambBus = a.createGain();
    ambBus.gain.value = 0;
    ambBus.connect(master);
  }
  return a;
}
function ac() {
  ensureGraph();
  if (AC.state === "suspended") AC.resume();
  ensureLoaded();
  startAmbience();
  return AC;
}

// Creating the context takes about 600 ms on first use. Do it while loading; it stays
// suspended under autoplay rules until ac() resumes it on the Play click. Recorded
// clips load on idle (or on the Play click, whichever comes first) so startup and
// the Play-enabled time do not wait for them; synth sounds cover the gap.
let initialized = false;
function initAudio() {
  try {
    const a = ensureGraph();
    const g = a.createGain();
    for (const type of ["square", "sawtooth"]) {
      const o = a.createOscillator();
      o.type = type;
      o.connect(g);
      o.start(0);
      o.stop(0);
      o.disconnect();
    }
    g.disconnect();
    if (!initialized) {
      initialized = true;
      // Decode work must not compete with the rendering warm-up that gates
      // the Play button, so idle loading waits until Play is enabled (the
      // Play click itself loads immediately through ac()).
      const loadWhenPlayEnabled = (triesLeft) => {
        const button = document.getElementById("playBtn");
        if ((button && !button.disabled) || triesLeft <= 0) {
          if ("requestIdleCallback" in window)
            requestIdleCallback(() => ensureLoaded(), { timeout: 5000 });
          else ensureLoaded();
        } else setTimeout(() => loadWhenPlayEnabled(triesLeft - 1), 250);
      };
      loadWhenPlayEnabled(240);
      document.addEventListener("visibilitychange", () => {
        if (!ambBus || !ambienceOn) return;
        ambBus.gain.linearRampToValueAtTime(
          document.hidden ? 0 : AMB_LEVEL,
          AC.currentTime + 0.4,
        );
      });
      on("land", ({ speed }) => {
        if (speed > 2)
          playSound("land", { vol: Math.min(1, 0.35 + speed / 14) });
      });
    }
  } catch (e) {}
}

const EXT = (() => {
  try {
    const probe = document.createElement("audio");
    return probe.canPlayType('audio/ogg; codecs="opus"') ? "ogg" : "m4a";
  } catch (e) {
    return "m4a";
  }
})();
async function fetchBuffer(file) {
  const url = new URL(`../../assets/audio/${file}.${EXT}`, import.meta.url);
  // Same retry shape as the asset loaders: three attempts, 300 ms then 1 s.
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`${response.status} ${file}`);
      return await AC.decodeAudioData(await response.arrayBuffer());
    } catch (error) {
      if (attempt >= 2) throw error;
      await new Promise((resolve) => setTimeout(resolve, attempt ? 1000 : 300));
    }
  }
}
function ensureLoaded() {
  if (loadStarted || !AC) return;
  loadStarted = true;
  const files = [...new Set(Object.values(SOUNDS).flatMap((s) => s.files))];
  for (const file of files) {
    fetchBuffer(file)
      .then((buffer) => {
        buffers.set(file, buffer);
        startAmbience();
      })
      .catch(() => {}); // synth fallback stays in place for this clip
  }
}

const AMB_LEVEL = 0.55;
function startAmbience() {
  if (ambienceOn || !AC || AC.state !== "running") return;
  if (!buffers.has("amb-surf") || !buffers.has("amb-wind")) return;
  ambienceOn = true;
  for (const name of ["ambSurf", "ambWind"]) {
    const def = SOUNDS[name];
    const src = AC.createBufferSource();
    src.buffer = buffers.get(def.files[0]);
    src.loop = true;
    const g = AC.createGain();
    g.gain.value = def.vol;
    src.connect(g);
    g.connect(ambBus);
    src.start(0, Math.random() * 4);
  }
  ambBus.gain.linearRampToValueAtTime(AMB_LEVEL, AC.currentTime + 2);
  const gull = () => {
    setTimeout(
      () => {
        if (!document.hidden) playSound("gull");
        gull();
      },
      7000 + Math.random() * 14000,
    );
  };
  gull();
}
function duckAmbience() {
  if (!ambienceOn || !ambBus) return;
  const now = performance.now();
  if (now - lastDuck < 250) return;
  lastDuck = now;
  const t = AC.currentTime;
  ambBus.gain.cancelScheduledValues(t);
  ambBus.gain.setValueAtTime(ambBus.gain.value, t);
  ambBus.gain.linearRampToValueAtTime(AMB_LEVEL * 0.55, t + 0.08);
  ambBus.gain.linearRampToValueAtTime(AMB_LEVEL, t + 0.7);
}

function distGain() {
  let best = Infinity;
  for (const e of enemies) {
    if (e.dead || !e.pos) continue;
    const d = Math.hypot(e.pos.x - player.pos.x, e.pos.z - player.pos.z);
    if (d < best) best = d;
  }
  return best === Infinity ? 0.6 : Math.min(1, Math.max(0.12, 7 / (7 + best)));
}

// Plays one recorded sound; returns false when nothing played (not loaded
// yet, or the voice cap is hit) so callers can fall back to the synth.
function playSound(name, opts = {}) {
  try {
    const def = SOUNDS[name];
    if (!def || !AC || AC.state !== "running") return false;
    const ready = def.files.filter((f) => buffers.has(f));
    if (!ready.length) return false;
    if ((voices.get(name) || 0) >= def.cap || totalVoices >= GLOBAL_CAP)
      return false;
    const buffer = buffers.get(ready[Math.floor(Math.random() * ready.length)]);
    const src = AC.createBufferSource();
    src.buffer = buffer;
    const [lo, hi] = def.pitch || [1, 1];
    const rate = (lo + Math.random() * (hi - lo)) * (opts.pitch || 1);
    src.playbackRate.setValueAtTime(rate, AC.currentTime);
    if (def.ramp)
      src.playbackRate.exponentialRampToValueAtTime(
        rate * def.ramp,
        AC.currentTime + (def.slice || buffer.duration),
      );
    const g = AC.createGain();
    let vol = def.vol * (0.9 + Math.random() * 0.2) * (opts.vol ?? 1);
    if (def.dist && !opts.noDist) vol *= distGain();
    g.gain.value = Math.min(1, vol);
    let head = src;
    if (def.lp) {
      const f = AC.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = def.lp;
      src.connect(f);
      head = f;
    }
    head.connect(g);
    g.connect(def.bus === "amb" ? ambBus : sfxBus);
    voices.set(name, (voices.get(name) || 0) + 1);
    totalVoices++;
    src.onended = () => {
      voices.set(name, Math.max(0, (voices.get(name) || 1) - 1));
      totalVoices = Math.max(0, totalVoices - 1);
    };
    if (def.slice && buffer.duration > def.slice + 0.05)
      src.start(
        0,
        Math.random() * (buffer.duration - def.slice),
        def.slice + 0.05,
      );
    else src.start();
    if (def.duck) duckAmbience();
    return true;
  } catch (e) {
    return false;
  }
}

function stepSound(wet) {
  playSound(wet ? "stepWet" : "stepDry");
}

// ---- original synth, now through the sfx bus (fallback + musical UI) ----
function synthBeep(f, d, type = "square", vol = 0.06, slide = 0) {
  try {
    const a = ac(),
      o = a.createOscillator(),
      g = a.createGain();
    o.type = type;
    o.frequency.value = f;
    if (slide)
      o.frequency.exponentialRampToValueAtTime(
        Math.max(30, f + slide),
        a.currentTime + d,
      );
    g.gain.setValueAtTime(vol, a.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + d);
    o.connect(g);
    g.connect(sfxBus);
    o.start();
    o.stop(a.currentTime + d);
  } catch (e) {}
}
function synthNoise(d = 0.18, vol = 0.12, fc = 2500) {
  try {
    const a = ac(),
      len = a.sampleRate * d,
      buf = a.createBuffer(1, len, a.sampleRate),
      ch = buf.getChannelData(0);
    for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
    const s = a.createBufferSource();
    s.buffer = buf;
    const f = a.createBiquadFilter();
    f.type = "highpass";
    f.frequency.value = fc;
    const g = a.createGain();
    g.gain.setValueAtTime(vol, a.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + d);
    s.connect(f);
    f.connect(g);
    g.connect(sfxBus);
    s.start();
  } catch (e) {}
}

// ---- classifiers: map the call sites' synth parameters to recordings ----
// Each gameplay event has a distinct (freq, type, slide) / (dur, filter)
// signature. The scale keeps quiet cues quiet relative to loud ones.
function scale(vol) {
  return Math.min(2, Math.max(0.35, vol / 0.05));
}
function beep(f, d, type = "square", vol = 0.06, slide = 0) {
  ac();
  const s = scale(vol);
  let played = false;
  if (f >= 1500)
    played = playSound("click", { vol: s }); // hitmarker tick
  else if (type === "triangle")
    // kill confirm: wet burst + gurgle
    played =
      playSound("hitWet", { vol: s, pitch: 1.1 }) &&
      playSound("gurgle", { vol: s * 0.7, noDist: true });
  else if (f >= 940 && f <= 1260 && type === "square" && vol <= 0.05)
    played = playSound("click", { vol: s, pitch: 1.35 }); // Gusher warning
  else if (f >= 690 && f <= 1120 && type === "sine" && !slide)
    played = playSound("charge", { vol: s }); // solar charging hum
  else if (f >= 895 && f <= 905)
    played = playSound("switchClick", { vol: s }); // empty charge
  else if (f >= 870 && f <= 890 && vol <= 0.04)
    played = playSound("gurgle", { vol: s, pitch: 1.4 }); // Surfer windup
  else if (f >= 490 && f <= 510 && type === "sine")
    played = playSound("splashBig", { vol: s }); // Gusher burst body
  else if ((f >= 490 && f <= 510) || (f >= 340 && f <= 360))
    played = playSound("switchClick", { vol: s, pitch: f < 400 ? 0.8 : 1 });
  else if (f >= 590 && f <= 610 && type === "sine")
    // evaporation: steam over a small splash
    played =
      playSound("steam", { vol: s }) &&
      playSound("splashSmall", { vol: s * 0.6 });
  else if (f >= 310 && f <= 330 && type === "sawtooth")
    played = playSound("splashSmall", { vol: s * 0.8, pitch: 0.7 }); // water jet
  else if (f >= 290 && f <= 310 && type === "sine")
    played = playSound("land", { vol: s * 0.7, pitch: 1.1 }); // jump
  else if (f >= 410 && f <= 430 && type === "sine")
    played = playSound("land", { vol: s * 0.7, pitch: 1.3 }); // double jump
  else if (f >= 195 && f <= 205 && type === "sine")
    played = playSound("stepWet", { vol: s, pitch: 0.75 }); // slide on sand
  else if (f >= 170 && f <= 270 && type === "sine")
    played = playSound("splashSmall", { vol: s * 0.8, pitch: 0.7 }); // rip current, Sponge body
  else if (f >= 130 && f <= 150 && type === "sawtooth" && slide > 0)
    played = playSound("growl", { vol: s }); // Brute windup
  else if (f >= 130 && f <= 150 && type === "sawtooth")
    // player hurt: body thud (distance would lie, so pin it near)
    played = playSound("slam", { vol: s * 0.8, pitch: 1.6, noDist: true });
  else if (f >= 230 && f <= 250 && type === "sawtooth" && slide > 0)
    played = playSound("steam", { vol: s * 0.8, pitch: 0.55 }); // Surfer dash
  if (!played) synthBeep(f, d, type, vol, slide);
}
function noiseHit(d = 0.18, vol = 0.12, fc = 2500) {
  ac();
  const s = scale(vol);
  let played = false;
  if (d < 0.04 && fc >= 1400) {
    // Heat Ray per shot: welding crackle with sizzle layered over it
    played = playSound("weld", { vol: s });
    played = playSound("sizzle", { vol: s * 0.8 }) || played;
  } else if (d <= 0.05 && fc >= 1400)
    played = playSound("hitWet", { vol: s, pitch: 1.15 }); // kill burst
  else if (fc >= 2500)
    played = playSound("hitWet", { vol: s }); // monster takes damage
  else if (fc <= 400) {
    // Brute slam: recorded body fall pitched down + synthesized sub thump
    played = playSound("slam", { vol: s });
    synthBeep(72, 0.35, "sine", 0.16 * Math.min(1.5, s), -38);
  } else if (d >= 0.3 && fc >= 800 && fc <= 1000)
    played = playSound("splashBig", { vol: s }); // Gusher burst
  else if (d >= 0.25 && fc >= 1100 && fc <= 1300)
    played = playSound("steam", { vol: s }); // evaporation
  else if (fc >= 600 && fc <= 800)
    played = playSound("splashSmall", { vol: s, pitch: 0.8 }); // Sponge Burst
  else if (fc >= 850 && fc <= 950 && d < 0.15)
    played = playSound("click", { vol: s, pitch: 0.7 }); // shield absorbs
  if (!played) synthNoise(d, vol, fc);
}

// Test/capture hooks: which clips are in, how many voices are live, the caps,
// and the master node (so a recorder can tap the mix inside the page).
function audioDebug() {
  return {
    ext: EXT,
    state: AC ? AC.state : "none",
    loaded: [...buffers.keys()].sort(),
    sounds: Object.keys(SOUNDS),
    caps: Object.fromEntries(
      Object.entries(SOUNDS).map(([k, v]) => [k, v.cap]),
    ),
    voices: Object.fromEntries(voices),
    totalVoices,
    ambienceOn,
    master,
    context: AC,
  };
}

export { ac, initAudio, beep, noiseHit, playSound, stepSound, audioDebug };
