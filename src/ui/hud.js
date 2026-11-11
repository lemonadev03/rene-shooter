import { $ } from "../core/utils.js";
import { state as S } from "../core/state.js";
import { beep } from "../core/audio.js";
const EL = {
  hpBar: $("hpBar"),
  hpTxt: $("hpTxt"),
  waterBar: $("waterBar"),
  waterTxt: $("waterTxt"),
  score: $("score"),
  combo: $("combo"),
  left: $("enemiesLeft"),
  hint: $("hint"),
  power: $("powerPill"),
  ocean: $("oceanWarn"),
  cold: $("coldVig"),
};

let _hudFrame = -9;
let bannerTimer = 0;
function hideBanner() {
  clearTimeout(bannerTimer);
  $("banner").classList.add("hidden");
}
function showBanner(t, s) {
  clearTimeout(bannerTimer);
  $("bannerTitle").textContent = t;
  $("bannerSub").textContent = s;
  $("banner").classList.remove("hidden");
  bannerTimer = setTimeout(() => $("banner").classList.add("hidden"), 2200);
}
function feed(txt) {
  const d = document.createElement("div");
  d.textContent = txt;
  $("killFeed").prepend(d);
  setTimeout(() => d.remove(), 2600);
  while ($("killFeed").children.length > 4) $("killFeed").lastChild.remove();
}
function setWeapon(w) {
  S.weapon = w;
  document
    .querySelectorAll(".slot")
    .forEach((el, i) => el.classList.toggle("on", i === w - 1));
  $("ammo").innerHTML =
    w === 1 ? "∞ <small>/ HEAT RAY</small>" : "◉◉◉ <small>/ SPONGE</small>";
  beep(w === 1 ? 500 : 350, 0.08, "square", 0.05);
}
// share (Web Share API with clipboard fallback)
async function shareGame(btn, withScore) {
  const url = "https://lemonadev03.github.io/rene-shooter/";
  const text = withScore
    ? `I scored ${S.score.toLocaleString()} on RENE SHOOTER ☀️💦 (Wave ${S.wave}, ${S.kills} evaporated) — beat that:`
    : "RENE SHOOTER ☀️💦 first-person beach shooter in the browser — evaporate the water monsters!";
  try {
    if (navigator.share) {
      await navigator.share({
        title: "RENE SHOOTER — Beach Dry-Out Showdown",
        text,
        url,
      });
    } else {
      await navigator.clipboard.writeText(text + " " + url);
      const o = btn.textContent;
      btn.textContent = "✓ Link copied!";
      setTimeout(() => (btn.textContent = o), 1800);
    }
  } catch (e) {
    /* dismissed */
  }
}
function initShares() {
  $("shareScore")?.addEventListener("click", (e) =>
    shareGame(e.currentTarget, true),
  );
  document.querySelectorAll(".shareBtn").forEach((b) => {
    if (b.tagName === "BUTTON" && !b.id)
      b.addEventListener("click", () => shareGame(b, false));
  });
}

// last value written per element property, so unchanged values skip the DOM write
const _last = {};
function setText(key, v) {
  if (_last[key] === v) return;
  _last[key] = v;
  EL[key].textContent = v;
}
function setWidth(key, v) {
  const k = key + "W";
  if (_last[k] === v) return;
  _last[k] = v;
  EL[key].style.width = v;
}
export function updateHud(frame, expectedAlive, powerupTypes) {
  if (frame - _hudFrame >= 5) {
    _hudFrame = frame;
    setText("combo", S.combo > 1 ? "COMBO ×" + S.combo + " 🔥➜💦" : "");
    setWidth("hpBar", S.hp + "%");
    setText("hpTxt", Math.ceil(S.hp));
    setWidth("waterBar", S.water + "%");
    setText("waterTxt", Math.ceil(S.water) + "%");
    setText("score", S.score.toLocaleString());
    setText("left", "🔥 " + expectedAlive + " left");
    const act = powerupTypes
      .filter((t) => t.dur > 0 && S.pu[t.k] > 0)
      .map((t) => `${t.emoji} ${t.name} ${Math.ceil(S.pu[t.k])}s`);
    const hide = !act.length;
    if (_last.powerHidden !== hide) {
      _last.powerHidden = hide;
      EL.power.classList.toggle("hidden", hide);
    }
    if (act.length) setText("power", act.join("  ·  "));
  }
}
export { EL, showBanner, hideBanner, feed, setWeapon, initShares };
