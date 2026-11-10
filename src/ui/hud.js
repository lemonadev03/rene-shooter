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
function showBanner(t, s) {
  $("bannerTitle").textContent = t;
  $("bannerSub").textContent = s;
  $("banner").classList.remove("hidden");
  setTimeout(() => $("banner").classList.add("hidden"), 2200);
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

export function updateHud(frame, expectedAlive, powerupTypes) {
  if (frame - _hudFrame >= 5) {
    _hudFrame = frame;
    EL.combo.textContent = S.combo > 1 ? "COMBO ×" + S.combo + " 🔥➜💦" : "";
    EL.hpBar.style.width = S.hp + "%";
    EL.hpTxt.textContent = Math.ceil(S.hp);
    EL.waterBar.style.width = S.water + "%";
    EL.waterTxt.textContent = Math.ceil(S.water) + "%";
    EL.score.textContent = S.score.toLocaleString();
    EL.left.textContent = "🔥 " + expectedAlive + " left";
    const act = powerupTypes
      .filter((t) => t.dur > 0 && S.pu[t.k] > 0)
      .map((t) => `${t.emoji} ${t.name} ${Math.ceil(S.pu[t.k])}s`);
    EL.power.classList.toggle("hidden", !act.length);
    if (act.length) EL.power.textContent = act.join("  ·  ");
  }
}
export { EL, showBanner, feed, setWeapon, initShares };
