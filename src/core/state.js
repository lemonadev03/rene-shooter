import * as THREE from "three";
import { V3 } from "./utils.js";
export const state = {
  mode: "title",
  hp: 100,
  water: 100,
  score: 0,
  kills: 0,
  wave: 0,
  combo: 0,
  comboT: 0,
  weapon: 1,
  shake: 0,
  time: 0,
  pu: { rapid: 0, power: 0, speed: 0, freeze: 0 },
  puSpawnT: 6,
};
export const player = {
  pos: V3(0, 0, -10),
  vel: V3(),
  yaw: 0,
  vy: 0,
  onGround: true,
  jumps: 0,
  speedNow: 0,
  sliding: 0,
  aiming: false,
  firing: false,
  fireCd: 0,
  hurtCd: 0,
  oceanTime: 0,
};
export const OCEAN_GRACE = 4; // seconds of free swimming before the rip current starts draining HP

// Yaw zero faces the ocean (+Z). Position is the capsule's feet.
export const PLAYER_R = 0.45;
export const look = { yaw: 0, pitch: -0.16 };
export const input = {
  keys: {},
  mouseDown: false,
  rmb: false,
  locked: false,
  dragging: false,
  lastMX: 0,
  lastMY: 0,
  lookX: 0,
  lookY: 0,
  joyVec: { x: 0, y: 0 },
  touchFire: false,
  touchAim: false,
};
export const scene = new THREE.Scene();
export const camera = new THREE.PerspectiveCamera(
  72,
  innerWidth / innerHeight,
  0.1,
  400,
);
export const enemies = [];
export const bullets = [];
export const fireballs = [];
export const colliders = [];
export const balls = [];
export const refillSpots = [];
export const powerups = [];
export const waveState = {
  clearT: 0,
  pending: 0,
  nextTimer: null,
  spawnTimers: new Set(),
};
// Main supplies the state-machine transition; gameplay modules never import main.
export const lifecycle = { gameOver: null };
