import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

const sharedTypeScript = ["packages/shared/{src,test}/**/*.ts"];
const apiTypeScript = [
  "apps/api/{src,test}/**/*.ts",
  "apps/api/{drizzle,vitest}.config.ts",
];
const webTypeScript = [
  "apps/web/{src,test}/**/*.{ts,tsx}",
  "apps/web/{playwright,vite}.config.ts",
];

export default defineConfig(
  globalIgnores([
    ".sandcastle/**",
    "**/node_modules/**",
    "**/dist/**",
    "**/build/**",
    "**/coverage/**",
    "**/.turbo/**",
    "apps/api/drizzle/**",
    "apps/web/playwright-report/**",
    "apps/web/test-results/**",
  ]),
  {
    files: ["eslint.config.mjs"],
    extends: [js.configs.recommended],
    languageOptions: {
      globals: globals.nodeBuiltin,
    },
  },
  {
    files: sharedTypeScript,
    extends: [js.configs.recommended, tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: apiTypeScript,
    extends: [js.configs.recommended, tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      globals: globals.nodeBuiltin,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/no-namespace": ["error", { allowDeclarations: true }],
      "@typescript-eslint/no-unnecessary-type-assertion": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/require-await": "error",
    },
  },
  {
    files: ["apps/api/test/**/*.test.ts"],
    rules: {
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-return": "off",
    },
  },
  {
    files: ["apps/api/test/**/*.ts"],
    rules: {
      "@typescript-eslint/require-await": "off",
    },
  },
  {
    files: webTypeScript,
    extends: [js.configs.recommended, tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/no-namespace": ["error", { allowDeclarations: true }],
      "@typescript-eslint/no-unnecessary-type-assertion": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/require-await": "error",
    },
  },
  {
    files: ["apps/web/src/**/*.{ts,tsx}"],
    ...reactRefresh.configs.vite,
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    files: [
      "apps/web/src/**/*.{ts,tsx}",
      "apps/web/test/browser/**/*.{ts,tsx}",
    ],
    ...reactHooks.configs.flat.recommended,
    rules: {
      ...reactHooks.configs.flat.recommended.rules,
      "react-hooks/exhaustive-deps": "error",
      "react-hooks/incompatible-library": "error",
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/unsupported-syntax": "error",
    },
  },
  {
    files: ["apps/web/{playwright,vite}.config.ts"],
    languageOptions: {
      globals: globals.nodeBuiltin,
    },
  },
  {
    files: ["apps/web/test/browser/**/*.{ts,tsx}"],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.nodeBuiltin,
      },
    },
    rules: {
      "@typescript-eslint/require-await": "off",
    },
  },
  {
    files: ["apps/web/src/**/*.test.{ts,tsx}"],
    rules: {
      "@typescript-eslint/require-await": "off",
    },
  },
);
