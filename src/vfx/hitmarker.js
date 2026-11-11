// @ts-check
import { on } from "../core/events.js";
import { beep, noiseHit } from "../core/audio.js";
import { state } from "../core/state.js";

/** @type {HTMLElement | null} */
let mark,
  remaining = 0,
  duration = 0,
  killed = false;

function paint() {
  if (!mark) return;
  const visible = remaining > 0 && state.mode === "play";
  const pop = visible ? remaining / duration : 0;
  mark.style.opacity = visible ? "1" : "0";
  mark.style.color = killed ? "#ff6335" : "#ffffff";
  mark.style.textShadow = killed ? "0 0 9px #ff7a24" : "0 0 4px #ffffff80";
  mark.style.transform = `translate(-50%,-50%) scale(${1 + (killed ? 0.65 : 0.24) * pop})`;
}

export function initHitmarker() {
  mark = document.getElementById("hitmark");
  on("hit", () => {
    if (!killed || remaining <= 0) {
      killed = false;
      remaining = duration = 0.08;
    }
    beep(1750, 0.025, "sine", 0.035, -550);
    paint();
  });
  on("kill", () => {
    killed = true;
    remaining = duration = 0.22;
    noiseHit(0.045, 0.035, 1800);
    beep(740, 0.1, "triangle", 0.07, 640);
    paint();
  });
}

/** @param {number} dt */
export function updateHitmarker(dt) {
  remaining = state.mode === "play" ? Math.max(0, remaining - dt) : 0;
  // Every hit and kill emits an event, so this module is the only writer of #hitmark.
  paint();
}
