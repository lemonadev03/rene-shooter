import assert from "node:assert/strict";
import { readFile, readdir, writeFile } from "node:fs/promises";

const target = new URL("./e2e-timings.json", import.meta.url);
const weights = JSON.parse(await readFile(target, "utf8"));
const samples = new Map();
const files = (await readdir("test-results")).filter((name) =>
  /^e2e.*\.json$/.test(name),
);
for (const file of files) {
  const report = JSON.parse(await readFile(`test-results/${file}`, "utf8"));
  // A partial or failed run is not a representative timing sample.
  if (report.result !== "pass") continue;
  for (const { name, ms } of report.blocks || []) {
    assert.ok(
      typeof name === "string" && Number.isFinite(ms) && ms > 0,
      `Invalid block timing in ${file}`,
    );
    if (!samples.has(name)) samples.set(name, []);
    samples.get(name).push(ms);
  }
}
assert.ok(
  samples.size > 0,
  "No passing block timings in test-results/e2e*.json",
);
for (const [name, values] of samples) {
  values.sort((a, b) => a - b);
  const middle = Math.floor(values.length / 2);
  weights[name] = Math.round(
    values.length % 2
      ? values[middle]
      : (values[middle - 1] + values[middle]) / 2,
  );
}
await writeFile(target, JSON.stringify(weights, null, 2) + "\n");
console.log(
  `Updated ${samples.size} block weights from ${files.length} reports`,
);
