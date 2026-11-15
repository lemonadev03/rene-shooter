import { $, titleCase } from "../core/utils.js";
import { state as S } from "../core/state.js";
import { beep } from "../core/audio.js";
import { iconEl } from "./icons.js";
const EL = {
  hpBar: $("hpBar"),
  hpTxt: $("hpTxt"),
  waterBar: $("waterBar"),
  waterTxt: $("waterTxt"),
  score: $("score"),
  combo: $("combo"),
  left: $("enemiesLeft"),
  hint: $("hint"),
  puStack: $("puStack"),
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
  placeBanner();
  bannerTimer = setTimeout(() => $("banner").classList.add("hidden"), 2200);
}
function feed(txt, icon) {
  const d = document.createElement("div");
  if (icon) d.append(iconEl(icon.name, icon.color, 14));
  const label = document.createElement("span");
  label.textContent = txt;
  d.append(label);
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
    ? `I scored ${S.score.toLocaleString()} on RENE SHOOTER (Wave ${S.wave}, ${S.kills} evaporated). Can you beat it?`
    : "RENE SHOOTER — first-person beach shooter in the browser. Evaporate the water monsters.";
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
      btn.textContent = "Link copied";
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

// the first two slots are the real weapons; tapping one selects it
function initWeaponSlots(select) {
  document.querySelectorAll(".slot").forEach((el, i) => {
    if (i > 1) return;
    el.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (S.mode === "play") select(i + 1);
    });
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
// Timer-line colour per power-up key: warm buffs gold, cool buffs teal.
const PU_LINE = {
  rapid: "#ffd23a",
  power: "#ffd23a",
  speed: "#2dd4bf",
  freeze: "#2dd4bf",
};
const puRows = new Map();
function renderPowerups(powerupTypes) {
  const active = new Set();
  for (const t of powerupTypes) {
    if (!(t.dur > 0 && S.pu[t.k] > 0)) continue;
    active.add(t.k);
    let row = puRows.get(t.k);
    if (!row) {
      const el = document.createElement("div");
      el.className = "pu";
      const name = document.createElement("span");
      name.textContent = titleCase(t.name);
      const secs = document.createElement("b");
      const line = document.createElement("i");
      line.style.background = PU_LINE[t.k] || "#ffd23a";
      el.append(iconEl(t.icon, t.iconColor, 16), name, secs, line);
      row = { el, secs, line, text: "", width: "" };
      puRows.set(t.k, row);
    }
    EL.puStack.append(row.el);
    const text = `${Math.ceil(S.pu[t.k])} s`;
    if (row.text !== text) {
      row.text = text;
      row.secs.textContent = text;
    }
    const width = `${Math.max(0, Math.min(100, (S.pu[t.k] / t.dur) * 100))}%`;
    if (row.width !== width) {
      row.width = width;
      row.line.style.width = width;
    }
  }
  for (const [key, row] of puRows) {
    if (!active.has(key)) {
      row.el.remove();
      puRows.delete(key);
    }
  }
  if (!bannerEl.classList.contains("hidden")) placeBanner();
}

// On phones the health/charge plate sits in the top-left column, under the
// power-ups; on wider screens it returns to the bottom-left of the HUD.
const phoneLayout = window.matchMedia("(max-width: 640px)");
const barsEl = document.querySelector(".bottom-left");
const topLeftEl = document.querySelector(".top-left");
const barsHome = barsEl?.parentElement;
const barsNext = barsEl?.nextElementSibling;
function placeBars() {
  if (!barsEl || !topLeftEl || !barsHome) return;
  if (phoneLayout.matches) topLeftEl.append(barsEl);
  else barsHome.insertBefore(barsEl, barsNext);
}
placeBars();
phoneLayout.addEventListener("change", placeBars);

// On phones the top-left column (power-ups plus bars) grows downward, so the
// wave banner starts below it instead of at its fixed 21% line.
const bannerEl = $("banner");
function placeBanner() {
  if (!phoneLayout.matches || !topLeftEl) {
    bannerEl.style.top = "";
    return;
  }
  const below = topLeftEl.getBoundingClientRect().bottom + 12;
  bannerEl.style.top = `${Math.max(window.innerHeight * 0.21, below)}px`;
}

export function updateHud(frame, expectedAlive, powerupTypes) {
  if (frame - _hudFrame >= 5) {
    _hudFrame = frame;
    setText("combo", S.combo > 1 ? "Combo ×" + S.combo : "");
    setWidth("hpBar", S.hp + "%");
    setText("hpTxt", Math.ceil(S.hp));
    setWidth("waterBar", S.water + "%");
    setText("waterTxt", Math.ceil(S.water) + "%");
    setText("score", S.score.toLocaleString());
    setText("left", expectedAlive + " left");
    renderPowerups(powerupTypes);
  }
}
export {
  EL,
  showBanner,
  hideBanner,
  feed,
  setWeapon,
  initShares,
  initWeaponSlots,
};
