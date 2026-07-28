import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

const sharedTypeScript = ["packages/shared/{src,test}/**/*.ts"];

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
);
