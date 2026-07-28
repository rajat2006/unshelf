// PROTOTYPE for https://github.com/rajat2006/unshelf/issues/179
// Disposable candidate policy: do not merge this configuration into main.
import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

const productTypeScript = [
  "apps/api/**/*.ts",
  "apps/web/**/*.{ts,tsx}",
  "packages/shared/**/*.ts",
];

export default tseslint.config(
  {
    ignores: [
      ".sandcastle/**",
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/coverage/**",
      "apps/api/drizzle/**",
    ],
  },
  {
    name: "prototype/product-typescript",
    files: productTypeScript,
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommendedTypeChecked,
    ],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Redundant with recommendedTypeChecked, but explicit here so the
      // prototype documents and measures the intended Promise-safety policy.
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
    },
  },
  {
    name: "prototype/node-scopes",
    files: [
      "apps/api/**/*.ts",
      "apps/web/*.{config.ts,config.mts}",
      "apps/web/test/browser/{harness,server}.ts",
      "packages/shared/**/*.ts",
    ],
    languageOptions: {
      globals: globals.nodeBuiltin,
    },
  },
  {
    name: "prototype/browser-scopes",
    files: [
      "apps/web/src/**/*.{ts,tsx}",
      "apps/web/test/browser/**/*.{ts,tsx}",
    ],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    ...reactHooks.configs.flat.recommended,
    name: "prototype/react-hooks",
    files: ["apps/web/{src,test/browser}/**/*.{ts,tsx}"],
  },
  {
    ...reactRefresh.configs.vite,
    name: "prototype/react-refresh",
    files: ["apps/web/src/**/*.{ts,tsx}"],
  },
);
