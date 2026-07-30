import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

const productTypeScript = [
  "packages/shared/{src,test}/**/*.ts",
  "apps/api/{src,test}/**/*.ts",
  "apps/api/{drizzle,vitest}.config.ts",
  "apps/web/{src,test}/**/*.{ts,tsx}",
  "apps/web/{playwright,vite}.config.ts",
];

export default defineConfig(
  globalIgnores([
    ".sandcastle/**",
    "**/{dist,build,coverage,.turbo}/**",
    "apps/api/drizzle/**",
  ]),
  {
    files: productTypeScript,
    extends: [
      js.configs.recommended,
      tseslint.configs.recommendedTypeChecked,
    ],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-namespace": ["error", { allowDeclarations: true }],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/require-await": "off",
    },
  },
  {
    files: ["apps/web/src/**/*.{ts,tsx}", "apps/web/test/browser/main.tsx"],
    plugins: {
      "react-hooks": reactHooks,
    },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",
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
);
