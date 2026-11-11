import js from "@eslint/js";
import globals from "globals";

export default [
  {
    ignores: ["node_modules/**", "test-results/**", "playwright-report/**"],
  },
  js.configs.recommended,
  {
    files: ["src/**/*.js", "tools/**/*.inline-*.js", "*.inline-*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: globals.browser,
    },
    rules: {
      // Existing debt stays visible; correctness checks remain errors.
      "no-unused-vars": [
        "warn",
        { args: "all", argsIgnorePattern: "^_", caughtErrors: "none" },
      ],
      "no-empty": ["error", { allowEmptyCatch: true }],
      "no-duplicate-imports": "warn",
      "prefer-const": "warn",
      "no-useless-assignment": "warn",
    },
  },
  {
    files: ["scripts/**/*.mjs", "test/**/*.mjs", "eslint.config.mjs"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: globals.node,
    },
  },
  {
    files: ["scripts/smoke.mjs", "scripts/perf.mjs"],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
];
