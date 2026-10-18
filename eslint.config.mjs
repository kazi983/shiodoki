// Repo-wide ESLint config for the JS/TS parts (desktop/, firebase/). Formatting is Prettier's job:
// eslint-config-prettier comes last and turns off every rule that would fight it.
import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["**/node_modules/", "**/out/", "**/dist/", "**/test-results/", "android/", "desktop/e2e/screenshots/"],
  },
  js.configs.recommended,
  // Syntax-only rules (no type information): fast, and independent of desktop's TypeScript version.
  tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node } },
  },
  {
    // Playwright's page.evaluate() callbacks run in the page.
    files: ["desktop/e2e/**"],
    languageOptions: { globals: { ...globals.browser } },
  },
  {
    files: ["desktop/src/renderer/**/*.{ts,tsx}"],
    languageOptions: { globals: { ...globals.browser } },
    ...reactHooks.configs.flat.recommended,
  },
  {
    files: ["desktop/src/renderer/**/*.{ts,tsx}"],
    rules: {
      // Pages load with `void load()` in an effect; the setState runs after an await, not synchronously.
      "react-hooks/set-state-in-effect": "off",
    },
  },
  {
    rules: {
      // `let x!: T` assigned later and read from callbacks created before that is intentional.
      "prefer-const": ["error", { ignoreReadBeforeAssign: true }],
      // `_` marks a parameter that is required by a signature but not used.
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  prettier,
);
