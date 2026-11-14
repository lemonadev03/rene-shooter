import { $, clamp, rand, V3 } from "../core/utils.js";
import * as THREE from "three";
import {
  state as S,
  player,
  input,
  look,
  sunPoolSpots,
  lifecycle,
} from "../core/state.js";
import { MAX_HP, MAX_CHARGE } from "../config/session.js";
import {
  PLAYER_R,
  PLAYER_HEIGHT,
  OCEAN_GRACE,
  OCEAN_WARNING_TIME,
  OCEAN_RECOVERY_RATE,
  OCEAN_DRAIN_BASE,
  OCEAN_DRAIN_RAMP,
  OCEAN_DRAIN_MAX,
  OCEAN_SHAKE,
  BOUNDS_MIN_X,
  BOUNDS_MAX_X,
  BOUNDS_MIN_Z,
  BOUNDS_MAX_Z,
  WALK_SPEED,
  SPRINT_SPEED,
  AIM_SPEED,
  CROUCH_SPEED,
  SPEED_POWERUP_MULT,
  GROUND_ACCEL_TIME,
  GROUND_STOP_SPEED,
  GROUND_STOP_TIME,
  AIR_CONTROL_RATE,
  AIR_CONTROL_MIN_SPEED,
  AIR_CONTROL_GAIN,
  SLIDE_MIN_SPEED,
  SLIDE_DURATION,
  SLIDE_DECAY_RATE,
  JUMP_VELOCITY,
  DOUBLE_JUMP_VELOCITY,
  GRAVITY,
  COYOTE_TIME,
  JUMP_BUFFER_TIME,
  HARD_LANDING_VY,
  HURT_COOLDOWN,
  HURT_SHAKE,
  CHARGE_RATE_SUN_POOL,
  CHARGE_RATE_SUN_POOL_BOOST,
  CHARGE_RATE_BEACH,
  CHARGE_RATE_OCEAN,
  LOW_CHARGE_HINT,
  HP_REGEN_DELAY,
  HP_REGEN_RATE,
} from "../config/player.js";
import { resolveCollision } from "../core/collision.js";
import { updateBalls } from "../world/beach.js";
import { PIER } from "../world/pier.js";
import { inSea } from "../world/ocean.js";
import { spawnP } from "../vfx/particles.js";
import { beep, stepSound } from "../core/audio.js";
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
let strideLeft = 0;
export function resetController() {
  coyoteTime = 0;
  jumpBuffer = 0;
  slideHeld = false;
  strideLeft = 0;
}
function consumeJump() {
  if (jumpBuffer <= 0) return;
  if (player.onGround || coyoteTime > 0) {
    player.vy = JUMP_VELOCITY;
    player.onGround = false;
    player.jumps = 1;
    player.sliding = 0;
    coyoteTime = 0;
    jumpBuffer = 0;
    emit("jump", { double: false });
    beep(300, 0.1, "sine", 0.05, 200);
  } else if (player.jumps < 2) {
    player.vy = DOUBLE_JUMP_VELOCITY;
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
  jumpBuffer = JUMP_BUFFER_TIME;
  consumeJump();
}
function hurtPlayer(dmg) {
  if (player.hurtCd > 0 || S.mode !== "play") return;
  player.hurtCd = HURT_COOLDOWN;
  S.hp -= dmg;
  S.shake = HURT_SHAKE;
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
  coyoteTime = player.onGround ? COYOTE_TIME : Math.max(0, coyoteTime - dt);
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
    player.speedNow > SLIDE_MIN_SPEED
  ) {
    player.sliding = SLIDE_DURATION;
    spawnP(player.pos.clone().add(V3(0, 0.15, 0)), 12, 0xf0d488, 2, 0.5, -3, 1);
    beep(200, 0.15, "sine", 0.04, -80);
  }
  slideHeld = !!crouch;
  if (player.sliding > 0) player.sliding = Math.max(0, player.sliding - dt);
  const maxSpeed =
    (player.aiming
      ? AIM_SPEED
      : crouch && player.sliding <= 0
        ? CROUCH_SPEED
        : sprint
          ? SPRINT_SPEED
          : WALK_SPEED) * (S.pu.speed > 0 ? SPEED_POWERUP_MULT : 1);
  const fwd = _fwd.set(Math.sin(look.yaw), 0, Math.cos(look.yaw));
  const rightV = _right.crossVectors(fwd, _up).normalize();
  const wish = _wish
    .set(0, 0, 0)
    .addScaledVector(fwd, iz)
    .addScaledVector(rightV, ix);
  if (wish.lengthSq() > 0) wish.normalize();
  if (player.sliding > 0 && player.onGround) {
    // Retain entry direction and momentum, even when the view turns or W lifts.
    player.vel.multiplyScalar(Math.exp(-SLIDE_DECAY_RATE * dt));
  } else if (player.onGround) {
    const dx = wish.x * maxSpeed - player.vel.x;
    const dz = wish.z * maxSpeed - player.vel.z;
    const delta = Math.hypot(dx, dz);
    const accel =
      wish.lengthSq() > 0
        ? maxSpeed / GROUND_ACCEL_TIME
        : GROUND_STOP_SPEED / GROUND_STOP_TIME;
    const blend = delta > 0 ? Math.min(1, (accel * dt) / delta) : 0;
    player.vel.x += dx * blend;
    player.vel.z += dz * blend;
  } else {
    // Preserve the existing air control.
    const blend = Math.min(
      1,
      ((AIR_CONTROL_RATE * dt) / Math.max(AIR_CONTROL_MIN_SPEED, maxSpeed)) *
        AIR_CONTROL_GAIN,
    );
    player.vel.x += (wish.x * maxSpeed - player.vel.x) * blend;
    player.vel.z += (wish.z * maxSpeed - player.vel.z) * blend;
  }
  // gravity / jump
  player.vy -= GRAVITY * dt;
  player.pos.y += player.vy * dt;
  if (
    player.vy > 0 &&
    Math.abs(player.pos.x - PIER.x) < PIER.w / 2 &&
    Math.abs(player.pos.z - PIER.z) < PIER.len / 2 &&
    player.pos.y + PLAYER_HEIGHT > PIER.bottom
  ) {
    player.pos.y = PIER.bottom - PLAYER_HEIGHT;
    player.vy = 0;
  } // head bump under the pier deck
  if (player.pos.y <= 0) {
    if (!player.onGround) emit("land", { speed: -player.vy });
    if (!player.onGround && player.vy < HARD_LANDING_VY)
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
  player.pos.x = clamp(player.pos.x, BOUNDS_MIN_X, BOUNDS_MAX_X);
  player.pos.z = clamp(player.pos.z, BOUNDS_MIN_Z, BOUNDS_MAX_Z);
  // colliders push-out
  resolveCollision(player.pos, PLAYER_R);
  updateBalls(dt);
  player.speedNow = Math.hypot(player.vel.x, player.vel.z);
  // Footsteps: one per stride while grounded and moving, wet in the sea.
  if (player.onGround && player.speedNow > 0.8 && S.mode === "play") {
    strideLeft -= player.speedNow * dt;
    if (strideLeft <= 0) {
      strideLeft = 2.1;
      stepSound(inSea(player.pos.x, player.pos.z));
    }
  } else strideLeft = 0;

  player.yaw = look.yaw;
  return sprint;
}
export function updateSurvival(dt) {
  // solar charge (S.water = charge %): sun pools charge fast, plain beach sun trickles, saltwater shorts the gun out
  const inOcean = inSea(player.pos.x, player.pos.z);
  const spot = sunPoolSpots.find(
    (s) => Math.hypot(player.pos.x - s.x, player.pos.z - s.z) < s.r,
  );
  const chargeRate = spot
    ? CHARGE_RATE_SUN_POOL + (input.keys.KeyR ? CHARGE_RATE_SUN_POOL_BOOST : 0)
    : inOcean
      ? CHARGE_RATE_OCEAN
      : CHARGE_RATE_BEACH;
  const beforeCharge = S.water;
  S.water = clamp(S.water + chargeRate * dt, 0, MAX_CHARGE);
  if (spot && beforeCharge < MAX_CHARGE && Math.random() < 0.4) {
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
  EL.hint.classList.toggle("show", S.water < LOW_CHARGE_HINT);
  // 🌊 rip current: dip for refill, don't live out there — past the grace window HP drains harder the longer you stay
  if (inOcean) player.oceanTime += dt;
  else
    player.oceanTime = Math.max(0, player.oceanTime - dt * OCEAN_RECOVERY_RATE);
  const over = player.oceanTime - OCEAN_GRACE;
  if (player.oceanTime > OCEAN_WARNING_TIME) {
    EL.ocean.classList.remove("hidden");
    EL.ocean.classList.toggle("draining", over > 0);
    EL.ocean.textContent = !inOcean
      ? "Back on shore. The current is easing."
      : over > 0
        ? "Rip current. Get back to shore."
        : `In the ocean. Rip current in ${Math.max(0, -over).toFixed(1)} s`;
  } else {
    EL.ocean.classList.add("hidden");
    EL.ocean.classList.remove("draining");
  }
  EL.cold.style.boxShadow = `inset 0 0 130px 45px rgba(14,116,233,${clamp((player.oceanTime - 1.5) / 5, 0, 0.55)})`;
  if (inOcean && over > 0 && S.mode === "play") {
    const drain = Math.min(
      OCEAN_DRAIN_MAX,
      OCEAN_DRAIN_BASE + over * OCEAN_DRAIN_RAMP,
    );
    S.hp -= drain * dt;
    player.hurtCd = Math.max(player.hurtCd, 0);
    S.shake = Math.max(S.shake, OCEAN_SHAKE);
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
      feed("Rene was pulled under by the rip current");
      lifecycle.gameOver(false);
      $("endSub").textContent =
        "The rip current pulled Rene under. Fight from the sand and recharge in the sun pools.";
    }
  }
  // slow hp regen after no hurt
  player.hurtCd -= dt;
  if (player.hurtCd < -HP_REGEN_DELAY && S.hp < MAX_HP)
    S.hp = Math.min(MAX_HP, S.hp + HP_REGEN_RATE * dt);
}
export { tryJump, hurtPlayer };
