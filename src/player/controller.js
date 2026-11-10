import { $ } from "../core/utils.js";
import * as THREE from "three";
import { clamp, rand, V3 } from "../core/utils.js";
import {
  state as S,
  player,
  input,
  look,
  PLAYER_R,
  OCEAN_GRACE,
  refillSpots,
  lifecycle,
} from "../core/state.js";
import { resolveCollision } from "../core/collision.js";
import { PIER, updateBalls } from "../world/beach.js";
import { inSea } from "../world/ocean.js";
import { spawnP } from "../vfx/particles.js";
import { beep } from "../core/audio.js";
import { EL, feed } from "../ui/hud.js";
import { emit } from "../core/events.js";
const _v3 = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _wish = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
let coyoteTime = 0;
let jumpBuffer = 0;
let slideHeld = false;
function consumeJump() {
  if (jumpBuffer <= 0) return;
  if (player.onGround || coyoteTime > 0) {
    player.vy = 8.2;
    player.onGround = false;
    player.jumps = 1;
    player.sliding = 0;
    coyoteTime = 0;
    jumpBuffer = 0;
    emit("jump", { double: false });
    beep(300, 0.1, "sine", 0.05, 200);
  } else if (player.jumps < 2) {
    player.vy = 7.4;
    player.jumps = 2;
    jumpBuffer = 0;
    emit("jump", { double: true });
    spawnP(
      player.pos.clone().add(V3(0, 0.2, 0)),
      10,
      0xffffff,
      1.5,
      0.4,
      -1,
      1,
    );
    beep(420, 0.1, "sine", 0.05, 200);
  }
}
function tryJump() {
  if (S.mode !== "play") return;
  jumpBuffer = 0.1;
  consumeJump();
}
function hurtPlayer(dmg) {
  if (player.hurtCd > 0 || S.mode !== "play") return;
  player.hurtCd = 0.45;
  S.hp -= dmg;
  S.shake = 0.45;
  S.combo = 0;
  emit("hurt", { dmg });
  $("dmgVig").style.boxShadow = "inset 0 0 120px 45px rgba(255,40,0,.55)";
  setTimeout(
    () =>
      ($("dmgVig").style.boxShadow = "inset 0 0 120px 40px rgba(255,40,0,0)"),
    180,
  );
  beep(140, 0.2, "sawtooth", 0.09, -60);
  if (S.hp <= 0) {
    S.hp = 0;
    lifecycle.gameOver(false);
  }
}

export function updatePlayer(dt) {
  coyoteTime = player.onGround ? 0.1 : Math.max(0, coyoteTime - dt);
  consumeJump();
  let ix = 0,
    iz = 0;
  if (input.keys.KeyW || input.keys.ArrowUp) iz += 1;
  if (input.keys.KeyS || input.keys.ArrowDown) iz -= 1;
  if (input.keys.KeyA || input.keys.ArrowLeft) ix -= 1;
  if (input.keys.KeyD || input.keys.ArrowRight) ix += 1;
  ix += input.joyVec.x;
  iz -= input.joyVec.y;
  const len = Math.hypot(ix, iz);
  if (len > 1) {
    ix /= len;
    iz /= len;
  }
  const sprint = (input.keys.ShiftLeft || input.keys.ShiftRight) && iz > 0.1;
  const crouch =
    input.keys.ControlLeft || input.keys.ControlRight || input.keys.KeyC;
  player.aiming = input.rmb || input.touchAim;
  // slide: crouch while sprinting & grounded
  if (
    crouch &&
    !slideHeld &&
    sprint &&
    player.onGround &&
    player.sliding <= 0 &&
    player.speedNow > 6
  ) {
    player.sliding = 0.65;
    spawnP(player.pos.clone().add(V3(0, 0.15, 0)), 12, 0xf0d488, 2, 0.5, -3, 1);
    beep(200, 0.15, "sine", 0.04, -80);
  }
  slideHeld = !!crouch;
  if (player.sliding > 0) player.sliding = Math.max(0, player.sliding - dt);
  const maxSpeed =
    (player.aiming
      ? 3.4
      : crouch && player.sliding <= 0
        ? 2.6
        : sprint
          ? 10
          : 5.6) * (S.pu.speed > 0 ? 1.4 : 1);
  const fwd = _fwd.set(Math.sin(look.yaw), 0, Math.cos(look.yaw));
  const rightV = _right.crossVectors(fwd, _up).normalize();
  const wish = _wish
    .set(0, 0, 0)
    .addScaledVector(fwd, iz)
    .addScaledVector(rightV, ix);
  if (wish.lengthSq() > 0) wish.normalize();
  if (player.sliding > 0 && player.onGround) {
    // Retain entry direction and momentum, even when the view turns or W lifts.
    player.vel.multiplyScalar(Math.exp(-0.65 * dt));
  } else if (player.onGround) {
    const dx = wish.x * maxSpeed - player.vel.x;
    const dz = wish.z * maxSpeed - player.vel.z;
    const delta = Math.hypot(dx, dz);
    const accel = wish.lengthSq() > 0 ? maxSpeed / 0.12 : 5.6 / 0.1;
    const blend = delta > 0 ? Math.min(1, accel * dt / delta) : 0;
    player.vel.x += dx * blend;
    player.vel.z += dz * blend;
  } else {
    // Preserve the existing air control.
    const blend = Math.min(1, ((8 * dt) / Math.max(1, maxSpeed)) * 3);
    player.vel.x += (wish.x * maxSpeed - player.vel.x) * blend;
    player.vel.z += (wish.z * maxSpeed - player.vel.z) * blend;
  }
  // gravity / jump
  player.vy -= 22 * dt;
  player.pos.y += player.vy * dt;
  if (
    player.vy > 0 &&
    Math.abs(player.pos.x - PIER.x) < PIER.w / 2 &&
    Math.abs(player.pos.z - PIER.z) < PIER.len / 2 &&
    player.pos.y + 1.85 > PIER.bottom
  ) {
    player.pos.y = PIER.bottom - 1.85;
    player.vy = 0;
  } // head bump under the pier deck
  if (player.pos.y <= 0) {
    if (!player.onGround) emit("land", { speed: -player.vy });
    if (!player.onGround && player.vy < -6)
      spawnP(
        player.pos.clone().add(V3(0, 0.1, 0)),
        8,
        0xf0d488,
        1.6,
        0.4,
        -3,
        1,
      );
    player.pos.y = 0;
    player.vy = 0;
    player.onGround = true;
    player.jumps = 0;
    consumeJump();
  }
  jumpBuffer = Math.max(0, jumpBuffer - dt);
  player.pos.x += player.vel.x * dt;
  player.pos.z += player.vel.z * dt;
  player.pos.x = clamp(player.pos.x, -52, 52);
  player.pos.z = clamp(player.pos.z, -40, 26);
  // colliders push-out
  resolveCollision(player.pos, PLAYER_R);
  updateBalls(dt);
  player.speedNow = Math.hypot(player.vel.x, player.vel.z);

  player.yaw = look.yaw;
  return sprint;
}
export function updateSurvival(dt) {
  // solar charge (S.water = charge %): sun pools charge fast, plain beach sun trickles, saltwater shorts the gun out
  const inOcean = inSea(player.pos.x, player.pos.z);
  const spot = refillSpots.find(
    (s) => Math.hypot(player.pos.x - s.x, player.pos.z - s.z) < s.r,
  );
  const chargeRate = spot
    ? 58 + (input.keys.KeyR ? 22 : 0)
    : inOcean
      ? -9
      : 2.2;
  const beforeCharge = S.water;
  S.water = clamp(S.water + chargeRate * dt, 0, 100);
  if (spot && beforeCharge < 100 && Math.random() < 0.4) {
    _v3.set(
      player.pos.x + rand(-0.6, 0.6),
      0.25,
      player.pos.z + rand(-0.6, 0.6),
    );
    spawnP(_v3, 2, 0xffd23a, 1.1, 0.55, 1.5, 2.2);
  }
  if (inOcean && Math.random() < 0.22) {
    _v3.set(
      player.pos.x + rand(-0.5, 0.5),
      0.5,
      player.pos.z + rand(-0.5, 0.5),
    );
    spawnP(_v3, 1, 0xbae6fd, 1.4, 0.35, -2, 1.4);
  }
  if (spot && input.keys.KeyR && Math.random() < 0.3)
    beep(rand(700, 1100), 0.05, "sine", 0.02);
  EL.hint.classList.toggle("show", S.water < 28);
  // 🌊 rip current: dip for refill, don't live out there — past the grace window HP drains harder the longer you stay
  if (inOcean) player.oceanTime += dt;
  else player.oceanTime = Math.max(0, player.oceanTime - dt * 2);
  const over = player.oceanTime - OCEAN_GRACE;
  if (player.oceanTime > 2.4) {
    EL.ocean.classList.remove("hidden");
    EL.ocean.classList.toggle("draining", over > 0);
    EL.ocean.textContent = !inOcean
      ? "🌊 Catch your breath — the current is fading…"
      : over > 0
        ? "🌊 RIP CURRENT! HP draining — get back to shore!"
        : `🌊 Rip current pulling… get out in ${Math.max(0, -over).toFixed(1)}s`;
  } else {
    EL.ocean.classList.add("hidden");
    EL.ocean.classList.remove("draining");
  }
  EL.cold.style.boxShadow = `inset 0 0 130px 45px rgba(14,116,233,${clamp((player.oceanTime - 1.5) / 5, 0, 0.55)})`;
  if (inOcean && over > 0 && S.mode === "play") {
    const drain = Math.min(14, 3 + over * 1.4);
    S.hp -= drain * dt;
    player.hurtCd = Math.max(player.hurtCd, 0);
    S.shake = Math.max(S.shake, 0.09);
    if (Math.random() < 0.3) {
      _v3.set(
        player.pos.x + rand(-0.6, 0.6),
        0.35,
        player.pos.z + rand(-0.6, 0.6),
      );
      spawnP(_v3, 2, 0xbae6fd, 1.6, 0.5, -3, 2.2);
    }
    if (Math.random() < 0.04) beep(rand(180, 260), 0.12, "sine", 0.035, -60);
    if (S.hp <= 0) {
      S.hp = 0;
      feed("🌊 The rip current got Rene!");
      lifecycle.gameOver(false);
      $("endSub").textContent =
        "The rip current dragged Rene under. The sea is monster turf — fight from the sand and recharge in the sun pools.";
    }
  }
  // slow hp regen after no hurt
  player.hurtCd -= dt;
  if (player.hurtCd < -4 && S.hp < 100) S.hp = Math.min(100, S.hp + 4 * dt);
}
export { tryJump, hurtPlayer };
