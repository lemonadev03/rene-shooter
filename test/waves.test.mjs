import assert from "node:assert/strict";
import test from "node:test";
import { MON } from "../src/config/monsters.js";
import { FINAL_WAVE } from "../src/config/waves.js";
import {
  maxAliveByKind,
  maxGlowing,
  waveCount,
  waveKinds,
} from "../src/enemies/waveComposition.js";

test("pool sizes and light slots match the wave data", () => {
  assert.deepEqual(maxAliveByKind(), [8, 3, 3, 3, 2, 2, 3, 2]);
  assert.equal(maxGlowing(), 5);
});

test("every wave lists waveCount kinds, all valid kind IDs", () => {
  for (let n = 1; n <= FINAL_WAVE; n++) {
    const kinds = waveKinds(n);
    assert.equal(kinds.length, waveCount(n), `wave ${n} length`);
    for (const kind of kinds) {
      assert.ok(
        Number.isInteger(kind) && kind >= 0 && kind < MON.length,
        `wave ${n} has invalid kind ${kind}`,
      );
    }
  }
});

test("wave 1 spawns only droplets and surfers", () => {
  for (const kind of waveKinds(1)) assert.ok(kind === 0 || kind === 3);
});

test("pool sizes cover every kind the waves spawn", () => {
  const pools = maxAliveByKind();
  assert.equal(pools.length, MON.length);
  for (let n = 1; n <= FINAL_WAVE; n++) {
    for (const kind of waveKinds(n)) assert.ok(pools[kind] > 0);
  }
});
