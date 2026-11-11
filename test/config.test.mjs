import assert from "node:assert/strict";
import test from "node:test";
import { MON } from "../src/config/monsters.js";
import { PU_TYPES } from "../src/config/powerups.js";
import { MAX_CHARGE } from "../src/config/session.js";
import {
  HEAT_RAY_COST,
  HEAT_RAY_COST_RAPID,
  SPONGE_COST,
  SPONGE_COST_RAPID,
} from "../src/config/weapons.js";
import { FINAL_WAVE, WAVE_SUBS } from "../src/config/waves.js";

// The timed buffs in src/core/state.js `state.pu`.
const TIMED_POWERUP_KEYS = ["rapid", "power", "speed", "freeze"];

test("MON has 8 kinds with positive stats and one shielded kind", () => {
  assert.equal(MON.length, 8);
  MON.forEach((def, kind) => {
    assert.ok(def.hp > 0, `kind ${kind} hp`);
    assert.ok(def.speed > 0, `kind ${kind} speed`);
    assert.ok(def.dmg > 0, `kind ${kind} dmg`);
    if (kind === 6) assert.ok(def.shield > 0, "kind 6 shield");
    else assert.equal(def.shield, undefined, `kind ${kind} shield`);
  });
});

test("shot costs never exceed the charge cap", () => {
  for (const cost of [
    HEAT_RAY_COST,
    HEAT_RAY_COST_RAPID,
    SPONGE_COST,
    SPONGE_COST_RAPID,
  ]) {
    assert.ok(cost <= MAX_CHARGE);
  }
});

test("one banner line per wave, plus the unused index 0", () => {
  assert.equal(WAVE_SUBS.length, FINAL_WAVE + 1);
});

test("powerup keys are unique and timed ones match state.pu", () => {
  const keys = PU_TYPES.map((type) => type.k);
  assert.equal(new Set(keys).size, keys.length);
  for (const type of PU_TYPES) {
    if (type.dur > 0) {
      assert.ok(TIMED_POWERUP_KEYS.includes(type.k), `timed key ${type.k}`);
    }
  }
});
