import { ESLint } from "eslint";
import { browserScripts } from "./files.mjs";

const eslint = new ESLint();
const results = await eslint.lintFiles([
  "src/**/*.js",
  "scripts/**/*.mjs",
  "eslint.config.mjs",
]);
for (const script of await browserScripts()) {
  const inline = new ESLint({
    overrideConfig: { languageOptions: { sourceType: script.sourceType } },
  });
  const [result] = await inline.lintText(script.code, {
    filePath: script.virtualFile,
  });
  result.filePath = script.file;
  for (const message of result.messages) {
    message.line += script.lineOffset;
    if (message.endLine) message.endLine += script.lineOffset;
  }
  results.push(result);
}
const formatter = await eslint.loadFormatter("stylish");
console.log(formatter.format(results));
const counts = {};
let errors = 0;
for (const result of results) {
  errors += result.errorCount;
  for (const message of result.messages) {
    const rule = message.ruleId || "parse";
    counts[rule] = (counts[rule] || 0) + 1;
  }
}
console.log(
  JSON.stringify({ checked: results.length, errors, counts }, null, 2),
);
// Reject additional debt while allowing the untouched baseline to pass.
const warningBudget = {
  "no-duplicate-imports": 1,
};
const addedDebt = Object.entries(counts).some(
  ([rule, count]) => count > (warningBudget[rule] || 0),
);
if (addedDebt)
  console.error(
    "Findings exceed the per-rule baseline. Fix new findings before merging.",
  );
process.exitCode = errors || addedDebt ? 1 : 0;
