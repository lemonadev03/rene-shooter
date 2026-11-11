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
// Startup hints: index.html must preload exactly the modules reachable from src/main.js and
// the startup assets the loaders request, so the browser starts every fetch at once.
const html = await readFile("index.html", "utf8");
const links = [...html.matchAll(/<link\b([^>]*)>/gi)].map((match) => ({
  rel: match[1].match(/\brel="([^"]*)"/)?.[1],
  href: match[1].match(/\bhref="([^"]*)"/)?.[1],
  as: match[1].match(/\bas="([^"]*)"/)?.[1],
  crossorigin: /\bcrossorigin\b/.test(match[1]),
}));
// loadHDR, loadGLTF and loadTexture fetch their files. WebKit downloads a fetch preload twice, so
// those preloads are listed in a JSON block that an inline script injects outside WebKit.
const fetchPreloads = JSON.parse(
  html.match(
    /<script id="fetch-preloads" type="application\/json">([\s\S]*?)<\/script>/,
  )[1],
);
for (const link of links.filter((item) => item.rel === "preload"))
  assert.notEqual(
    link.as,
    "fetch",
    `index.html: move ${link.href} into the fetch-preloads JSON block`,
  );
const sourceFor = new Map();
async function source(file) {
  if (!sourceFor.has(file)) sourceFor.set(file, await readFile(file, "utf8"));
  return sourceFor.get(file);
}
const reachable = new Set();
async function walk(file) {
  if (reachable.has(file)) return;
  reachable.add(file);
  const ast = parse(await source(file), {
    ecmaVersion: "latest",
    sourceType: "module",
  });
  for (const node of ast.body) {
    const from = node.source?.value;
    if (from?.startsWith("."))
      await walk(path.relative(".", path.resolve(path.dirname(file), from)));
  }
}
await walk("src/main.js");
const modulePreloads = links.filter((link) => link.rel === "modulepreload");
const threeCore = importMap.three.replace(/[^/]*$/, "three.core.js");
const preloadedModules = new Set();
for (const link of modulePreloads) {
  if (link.href.startsWith("https://")) {
    assert.equal(
      link.href,
      threeCore,
      `index.html: unexpected modulepreload ${link.href}`,
    );
    assert.ok(
      link.crossorigin,
      `index.html: modulepreload ${link.href} needs crossorigin`,
    );
    continue;
  }
  assert.ok(
    (await stat(link.href).catch(() => null))?.isFile(),
    `index.html: modulepreload ${link.href} points at a missing file`,
  );
  assert.ok(
    reachable.has(link.href),
    `index.html: modulepreload ${link.href} is not reachable from src/main.js`,
  );
  assert.ok(
    !preloadedModules.has(link.href),
    `index.html: duplicate modulepreload ${link.href}`,
  );
  preloadedModules.add(link.href);
}
for (const file of reachable)
  assert.ok(
    preloadedModules.has(file),
    `index.html: add <link rel="modulepreload" href="${file}"> for ${file}`,
  );
assert.ok(
  modulePreloads.some((link) => link.href === threeCore),
  `index.html: add <link rel="modulepreload" href="${threeCore}" crossorigin>`,
);

// Asset URLs come from new URL("<relative path>", import.meta.url). Template parts are
// filled in from the string literals of the same file, and a directory plus a literal
// file name (the weapon textures) counts too.
const assetPattern = /\.(hdr|glb|webp)$/;
const loaderUrls = new Map();
for (const file of reachable) {
  const code = await source(file);
  const literals = new Set();
  const urlArguments = [];
  (function visit(node) {
    if (!node || typeof node.type !== "string") return;
    if (node.type === "Literal" && typeof node.value === "string")
      literals.add(node.value);
    if (
      node.type === "NewExpression" &&
      node.callee.name === "URL" &&
      node.arguments[1]?.type === "MemberExpression" &&
      node.arguments[1].object.type === "MetaProperty"
    )
      urlArguments.push(node.arguments[0]);
    for (const value of Object.values(node))
      for (const child of Array.isArray(value) ? value : [value]) visit(child);
  })(parse(code, { ecmaVersion: "latest", sourceType: "module" }));
  const resolved = new Set();
  for (const argument of urlArguments) {
    let options = [""];
    const quasis =
      argument.type === "TemplateLiteral"
        ? argument.quasis
        : [{ value: { cooked: argument.value } }];
    quasis.forEach((quasi, index) => {
      options = options.map((prefix) => prefix + quasi.value.cooked);
      if (index < quasis.length - 1)
        options = options.flatMap((prefix) =>
          [...literals].map((literal) => prefix + literal),
        );
    });
    for (const option of options)
      resolved.add(
        path.posix.normalize(
          path.posix.join(
            path.posix.dirname(file.split(path.sep).join("/")),
            option,
          ),
        ),
      );
  }
  loaderUrls.set(file, {
    resolved,
    literals,
    usesTextureLoader: code.includes("THREE.TextureLoader"),
  });
}
const preloadedAssets = new Set();
const assetPreloads = [
  ...links.filter((item) => item.rel === "preload"),
  ...fetchPreloads.map((href) => ({
    rel: "preload",
    href,
    as: "fetch",
    crossorigin: true,
  })),
];
for (const link of assetPreloads) {
  assert.ok(
    assetPattern.test(link.href),
    `index.html: unexpected preload ${link.href}`,
  );
  assert.ok(
    (await stat(link.href).catch(() => null))?.isFile(),
    `index.html: preload ${link.href} points at a missing file`,
  );
  const owner = [...loaderUrls.values()].find(
    ({ resolved, literals }) =>
      resolved.has(link.href) ||
      [...resolved].some(
        (url) =>
          url.endsWith("/") &&
          link.href.startsWith(url) &&
          literals.has(link.href.slice(url.length)),
      ),
  );
  assert.ok(owner, `index.html: no loader requests ${link.href}`);
  assert.equal(
    link.as,
    owner.usesTextureLoader ? "image" : "fetch",
    `index.html: preload ${link.href} has the wrong as=`,
  );
  assert.ok(
    link.crossorigin,
    `index.html: preload ${link.href} needs crossorigin`,
  );
  preloadedAssets.add(link.href);
}
for (const { resolved, literals } of loaderUrls.values()) {
  const urls = [...resolved].flatMap((url) =>
    url.endsWith("/") ? [...literals].map((name) => url + name) : [url],
  );
  for (const url of urls)
    if (assetPattern.test(url) && (await stat(url).catch(() => null)))
      assert.ok(
        preloadedAssets.has(url),
        `index.html: add <link rel="preload" href="${url}"> for ${url}`,
      );
}
console.log(
  `Syntax OK: ${files.length} module files + ${scripts.length} inline scripts. Import-map/path checks OK: ${imports} imports, ${exportsByFile.size} local targets, 3 matching HTML import maps. Preloads OK: ${preloadedModules.size} modules, ${preloadedAssets.size} assets.`,
);
