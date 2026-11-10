import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

export async function filesIn(directory, extension) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...(await filesIn(file, extension)));
    else if (file.endsWith(extension)) result.push(file);
  }
  return result.sort();
}

export async function browserScripts() {
  const result = [];
  for (const file of ["index.html", ...(await filesIn("tools", ".html"))]) {
    const html = await readFile(file, "utf8");
    let index = 0;
    for (const match of html.matchAll(
      /<script\b([^>]*)>([\s\S]*?)<\/script>/gi,
    )) {
      const attributes = match[1];
      if (
        /\bsrc\s*=/i.test(attributes) ||
        /type=["']importmap["']/i.test(attributes)
      )
        continue;
      const type = attributes.match(/\btype=["']([^"']+)["']/i)?.[1];
      if (
        type &&
        !["module", "text/javascript", "application/javascript"].includes(type)
      )
        continue;
      const sourceType = /type=["']module["']/i.test(attributes)
        ? "module"
        : "script";
      const lineOffset =
        html.slice(0, match.index + match[0].indexOf(">") + 1).split("\n")
          .length - 1;
      result.push({
        file,
        sourceType,
        lineOffset,
        code: match[2],
        virtualFile: `${file}.inline-${index++}.js`,
      });
    }
  }
  return result;
}
