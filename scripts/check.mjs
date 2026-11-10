import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { parse } from "espree";
import { browserScripts, filesIn } from "./files.mjs";

const files = [
  ...(await filesIn("src", ".js")),
  ...(await filesIn("scripts", ".mjs")),
  "eslint.config.mjs",
];
const scripts = await browserScripts();
for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], {
    encoding: "utf8",
  });
  assert.equal(result.status, 0, `${file}: ${result.stderr}`);
}
for (const script of scripts) {
  const result = spawnSync(
    process.execPath,
    [
      "--check",
      `--input-type=${script.sourceType === "module" ? "module" : "commonjs"}`,
    ],
    { input: script.code, encoding: "utf8" },
  );
  assert.equal(result.status, 0, `${script.file}: ${result.stderr}`);
}
// Browser resolution uses the import map, never a runtime npm dependency on Three.
const importMap = JSON.parse(
  (await readFile("index.html", "utf8")).match(
    /<script type="importmap">([\s\S]*?)<\/script>/,
  )[1],
).imports;
for (const file of await filesIn("tools", ".html")) {
  const map = JSON.parse(
    (await readFile(file, "utf8")).match(
      /<script type="importmap">([\s\S]*?)<\/script>/,
    )[1],
  ).imports;
  assert.deepEqual(map, importMap, `${file}: import map drift`);
}
assert.equal(
  importMap.three,
  "https://cdn.jsdelivr.net/npm/three@0.187.0/build/three.module.js",
);
assert.equal(
  importMap["three/addons/"],
  "https://cdn.jsdelivr.net/npm/three@0.187.0/examples/jsm/",
);
let imports = 0;
const exportsByFile = new Map();
const exportNames = new Map();
function getExports(file, code) {
  const ast = parse(code, { ecmaVersion: "latest", sourceType: "module" });
  const names = new Set();
  for (const node of ast.body) {
    if (node.type !== "ExportNamedDeclaration") continue;
    if (node.declaration?.id) names.add(node.declaration.id.name);
    for (const item of node.declaration?.declarations || [])
      names.add(item.id.name);
    for (const item of node.specifiers || []) names.add(item.exported.name);
  }
  exportNames.set(file, names);
  return ast;
}
for (const entry of [
  ...(await Promise.all(
    (await filesIn("src", ".js")).map(async (file) => ({
      file,
      code: await readFile(file, "utf8"),
    })),
  )),
  ...scripts.filter((script) => script.sourceType === "module"),
]) {
  const ast = getExports(path.resolve(entry.file), entry.code);
  for (const node of ast.body.filter(
    (item) => item.type === "ImportDeclaration",
  )) {
    const source = node.source.value;
    imports++;
    if (source.startsWith(".")) {
      const target = path.resolve(path.dirname(entry.file), source);
      assert.ok(
        (await stat(target)).isFile(),
        `${entry.file}: missing ${source}`,
      );
      exportsByFile.set(target, true);
      if (!exportNames.has(target))
        getExports(target, await readFile(target, "utf8"));
      for (const item of node.specifiers) {
        if (item.type !== "ImportSpecifier") continue;
        assert.ok(
          exportNames.get(target).has(item.imported.name),
          `${entry.file}: missing export ${item.imported.name} in ${source}`,
        );
      }
    } else {
      const external =
        importMap[source] ||
        Object.keys(importMap)
          .filter((key) => key.endsWith("/") && source.startsWith(key))
          .map((key) => importMap[key])[0];
      assert.ok(
        external?.startsWith("https://"),
        `${entry.file}: unmapped ${source}`,
      );
    }
  }
}
console.log(
  `Syntax OK: ${files.length} module files + ${scripts.length} inline scripts. Import-map/path checks OK: ${imports} imports, ${exportsByFile.size} local targets, 3 matching HTML import maps.`,
);
