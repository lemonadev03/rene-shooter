import { $ } from "./utils.js";
import { clamp } from "./utils.js";
import { state as S, input, look } from "./state.js";

const canvas = $("c");
export const LOOK_SENSITIVITY = 0.0022;
const PITCH_LIMIT = (89 * Math.PI) / 180;

export async function requestPointerLock() {
  if (!canvas.requestPointerLock || input.locked) return;
  try {
    await canvas.requestPointerLock({ unadjustedMovement: true });
  } catch {
    try {
      await canvas.requestPointerLock();
    } catch {
      /* Drag remains available. */
    }
  }
}

export function applyLookInput() {
  look.yaw -= input.lookX * LOOK_SENSITIVITY;
  look.pitch = clamp(
    look.pitch - input.lookY * LOOK_SENSITIVITY,
    -PITCH_LIMIT,
    PITCH_LIMIT,
  );
  input.lookX = 0;
  input.lookY = 0;
}

export function resetInput() {
  for (const key in input.keys) delete input.keys[key];
  Object.assign(input, {
    mouseDown: false,
    rmb: false,
    dragging: false,
    lookX: 0,
    lookY: 0,
    touchFire: false,
    touchAim: false,
  });
  input.joyVec.x = 0;
  input.joyVec.y = 0;
  $("joyStick").style.transform = "translate(-50%,-50%)";
}

export function initInput({ tryJump, setWeapon }) {
  addEventListener("keydown", (e) => {
    input.keys[e.code] = true;
    if (e.code === "Space") {
      e.preventDefault();
      tryJump();
    }
    if (e.code === "Digit1") setWeapon(1);
    if (e.code === "Digit2") setWeapon(2);
    if (
      [
        "KeyW",
        "KeyA",
        "KeyS",
        "KeyD",
        "ArrowUp",
        "ArrowDown",
        "ArrowLeft",
        "ArrowRight",
      ].includes(e.code)
    )
      e.preventDefault();
  });
  addEventListener("keyup", (e) => (input.keys[e.code] = false));
  canvas.addEventListener("mousedown", (e) => {
    if (e.button === 0) input.mouseDown = true;
    if (e.button === 2) input.rmb = true;
    if (S.mode === "play") requestPointerLock();
  });
  addEventListener("mouseup", (e) => {
    if (e.button === 0) input.mouseDown = false;
    if (e.button === 2) input.rmb = false;
  });
  addEventListener("contextmenu", (e) => e.preventDefault());
  document.addEventListener("pointerlockchange", () => {
    input.locked = document.pointerLockElement === canvas;
    input.dragging = false;
  });
  canvas.addEventListener("pointerdown", (e) => {
    if (e.pointerType !== "mouse") return;
    input.dragging = true;
    input.lastMX = e.clientX;
    input.lastMY = e.clientY;
  });
  addEventListener("pointerup", () => (input.dragging = false));
  addEventListener("mousemove", (e) => {
    if (S.mode !== "play") return;
    if (input.locked) {
      input.lookX += e.movementX;
      input.lookY += e.movementY;
    } else if (input.dragging) {
      input.lookX += e.clientX - input.lastMX;
      input.lookY += e.clientY - input.lastMY;
      input.lastMX = e.clientX;
      input.lastMY = e.clientY;
    }
  });
  addEventListener("blur", resetInput);

  const joy = $("joy");
  const joyStick = $("joyStick");
  let joyId = null;
  let lookId = null;
  let lookLast = { x: 0, y: 0 };
  canvas.addEventListener(
    "touchstart",
    (e) => {
      for (const t of e.changedTouches) {
        if (t.clientX > innerWidth * 0.45 && lookId === null) {
          lookId = t.identifier;
          lookLast = { x: t.clientX, y: t.clientY };
        }
      }
    },
    { passive: false },
  );
  canvas.addEventListener(
    "touchmove",
    (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (t.identifier !== lookId) continue;
        // Preserve the touch look speed, using the same unsmoothed frame path.
        input.lookX += ((t.clientX - lookLast.x) * 0.008) / LOOK_SENSITIVITY;
        input.lookY += ((t.clientY - lookLast.y) * 0.008) / LOOK_SENSITIVITY;
        lookLast = { x: t.clientX, y: t.clientY };
      }
    },
    { passive: false },
  );
  const releaseLook = (e) => {
    for (const t of e.changedTouches)
      if (t.identifier === lookId) lookId = null;
  };
  canvas.addEventListener("touchend", releaseLook);
  canvas.addEventListener("touchcancel", releaseLook);
  joy.addEventListener(
    "touchstart",
    (e) => (joyId = e.changedTouches[0].identifier),
    { passive: true },
  );
  joy.addEventListener(
    "touchmove",
    (e) => {
      const t = [...e.changedTouches].find((t) => t.identifier === joyId);
      if (!t) return;
      const r = joy.getBoundingClientRect();
      let dx = (t.clientX - r.left - r.width / 2) / 38;
      let dy = (t.clientY - r.top - r.height / 2) / 38;
      const length = Math.hypot(dx, dy);
      if (length > 1) {
        dx /= length;
        dy /= length;
      }
      input.joyVec.x = dx;
      input.joyVec.y = dy;
      joyStick.style.transform = `translate(calc(-50% + ${dx * 30}px),calc(-50% + ${dy * 30}px))`;
    },
    { passive: true },
  );
  const releaseJoy = () => {
    joyId = null;
    input.joyVec.x = 0;
    input.joyVec.y = 0;
    joyStick.style.transform = "translate(-50%,-50%)";
  };
  joy.addEventListener("touchend", releaseJoy);
  joy.addEventListener("touchcancel", releaseJoy);
  $("btnJump").addEventListener(
    "touchstart",
    (e) => {
      e.preventDefault();
      tryJump();
    },
    { passive: false },
  );
  $("btnFire").addEventListener(
    "touchstart",
    (e) => {
      e.preventDefault();
      input.touchFire = true;
    },
    { passive: false },
  );
  $("btnFire").addEventListener("touchend", () => (input.touchFire = false));
  $("btnFire").addEventListener("touchcancel", () => (input.touchFire = false));
  $("btnAim").addEventListener(
    "touchstart",
    (e) => {
      e.preventDefault();
      input.touchAim = !input.touchAim;
    },
    { passive: false },
  );
}
