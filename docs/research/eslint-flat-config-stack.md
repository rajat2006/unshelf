# Supported ESLint flat-config stack

Research date: 2026-07-27

## Question

What exact, currently supported ESLint flat-config stack should unshelf use for
its Node 22 / TypeScript 5.7 pnpm monorepo, across the Express API, React/Vite
web app, browser-neutral shared package, Vitest tests, and Playwright tests?

## Local constraints

- The root declares Node `>=22`, TypeScript `^5.7.2`, pnpm workspaces, and no
  package `"type"`.
- `apps/api`, `apps/web`, and `packages/shared` are ESM packages.
- The web app is React 19 on Vite. Unit tests use Vitest; browser tests use
  Playwright.
- Every current Vitest test imports its APIs from `vitest`; every Playwright
  test imports `test` and `expect` from `@playwright/test`.
- API and web TSConfigs include their source, tests, and tool config files.
  `packages/shared/tsconfig.json` includes only `src`, while
  `packages/shared/test` contains two TypeScript test files.
- Prettier already runs separately through `format` and `format:check`.

## Recommendation

### Use ESLint 10 and tighten the Node floor

Use this minimal root development-dependency stack:

| Package | Recommended range | Purpose |
| --- | ---: | --- |
| `eslint` | `^10.8.0` | Current flat-config linter |
| `@eslint/js` | `^10.0.1` | ESLint core recommended rules |
| `typescript-eslint` | `^8.65.0` | TypeScript parser, plugin, configs, and helper |
| `globals` | `^17.8.0` | Explicit runtime globals for flat config |
| `eslint-plugin-react-hooks` | `^7.1.1` | Rules of React and Hooks |
| `eslint-plugin-react-refresh` | `^0.5.3` | Vite Fast Refresh boundaries |

These are the current releases published by the owning projects on the research
date.[^npm-eslint][^npm-eslint-js][^npm-tseslint][^npm-globals][^npm-hooks][^npm-refresh]

Change the root Node engine from `>=22` to `>=22.13`. ESLint 10 requires
`^20.19.0 || ^22.13.0 || >=24`, so the current declaration admits Node
22.0–22.12 even though the linter cannot run there.[^eslint-package]

Do not begin a new specification on ESLint 9. The official support table marks
v10 as Current and v9 as Maintenance with end of life on 2026-08-06—ten days
after this research.[^eslint-support]

`typescript-eslint@8.65.0` explicitly supports ESLint 8.57, 9, and 10,
TypeScript `>=4.8.4 <6.1.0`, and Node
`^18.18.0 || ^20.9.0 || >=21.1.0`. TypeScript 5.7 and Node 22.13 are therefore
inside its supported ranges.[^tseslint-package]

### Use a root ESM flat config

Create one root `eslint.config.mjs`. ESLint recognizes `.js`, `.mjs`, and
`.cjs` config files, but the root package has no `"type": "module"`, so a root
`.js` config would be CommonJS. `.mjs` gives unambiguous ESM without changing
the root package's module semantics and provides `import.meta.dirname` for
TSConfig resolution.[^eslint-config-files]

Compose it with `defineConfig` from `eslint/config`:

- all product TypeScript: `js.configs.recommended` and
  `tseslint.configs.recommendedTypeChecked`;
- React files: `reactHooks.configs.flat.recommended`;
- Vite React source: `reactRefresh.configs.vite()`.

`recommendedTypeChecked` already contains the non-type-checked recommended
TypeScript rules, so do not also add `tseslint.configs.recommended`.
typescript-eslint describes it as the stable, correctness-oriented typed
starting point. `strictTypeChecked` is more opinionated and not semver-stable;
`stylisticTypeChecked` adds stylistic, not defect-finding, policy. Neither
belongs in this minimal initial baseline.[^tseslint-configs]

### Configure Project Service, then fix the shared-test gap

Apply this to the TypeScript scope:

```js
languageOptions: {
  parserOptions: {
    projectService: true,
    tsconfigRootDir: import.meta.dirname,
  },
}
```

Do not also set `parserOptions.project`. typescript-eslint recommends
`projectService`: it chooses the nearest `tsconfig.json` for each file, uses
the same TypeScript project-service behavior as editors, and avoids maintaining
TSConfig path globs. `tsconfigRootDir` makes behavior independent of the
directory from which ESLint runs.[^tseslint-parser][^tseslint-monorepo]

Before enabling typed linting, give `packages/shared/test/*.ts` a real
TypeScript project. Its nearest current TSConfig excludes it, so Project Service
will reject those test files. The durable choices are:

1. include `test` in `packages/shared/tsconfig.json` if tests should be part of
   that package's normal typecheck; or
2. add `packages/shared/test/tsconfig.json`, extending the package config,
   setting `noEmit: true` and a package-wide `rootDir`, and including the tests.

A narrow `allowDefaultProject: ["packages/shared/test/*.ts"]` plus
`defaultProject` can bridge the two current files, but typescript-eslint warns
that each out-of-project match has a performance cost and caps matches at eight
by default. It is not the durable monorepo design.[^tseslint-project-errors][^tseslint-parser]

Keep `eslint.config.mjs` outside the typed scope. It is JavaScript and does not
belong to a TSConfig; apply only `js.configs.recommended` and Node globals to
it. `tseslint.configs.disableTypeChecked` is available for any future
JavaScript or generated-file override that inherits typed rules.[^tseslint-configs]

### Scope runtime globals precisely

Flat config does not use legacy `env`; predefined globals belong in
`languageOptions.globals`.[^eslint-globals]

- API source/tests and Node-run configs: `globals.nodeBuiltin`.
- Browser React source and the browser harness: `globals.browser`.
- Playwright specifications: both `globals.nodeBuiltin` and `globals.browser`;
  the test module runs in Node, while current `page.evaluate` callbacks refer
  to `window` and `document`.
- Shared source/tests: no Node or browser globals.
- Vitest files: no Vitest globals, because all current tests import their APIs.

`globals.nodeBuiltin` is more accurate than `globals.node` for these ESM
packages. The former supplies real Node globals such as `process` and `Buffer`;
the latter additionally admits CommonJS wrapper names such as `require`. The
package explicitly recommends `nodeBuiltin` outside CommonJS wrappers.[^globals-readme]

No `@vitest/eslint-plugin` environment and no manually copied Vitest globals
are needed. If the repo later enables Vitest's `test.globals`, reevaluate then.
Similarly, imported Playwright APIs are ordinary bindings, not globals.

### Use the supported Hooks and Refresh flat configs

Apply `reactHooks.configs.flat.recommended` to all web source TypeScript,
including `.ts` custom Hooks as well as TSX components. The React
project calls this the recommended stable flat config. It documents
`recommended-latest` as the bleeding-edge experimental compiler preset, so do
not make that the production default.[^hooks-readme][^hooks-package]

The current React Refresh API is a named `reactRefresh` export whose presets are
functions. For Vite source, use `reactRefresh.configs.vite()`. It enables
`allowConstantExport`, which the plugin states is supported by Vite's React
integration. Scope it to `apps/web/src/**/*.{ts,tsx}`; do not apply Fast Refresh
boundary rules to the shared package or Playwright harness.[^refresh-readme][^refresh-source][^refresh-package]

Do not add `eslint-plugin-react` to this minimal stack. TypeScript already parses
and typechecks the repo's JSX, while the requested React-specific defect seams
are Hooks correctness and Vite Refresh boundaries. The broader React plugin is
a separate rule-policy choice, not a prerequisite for those two flat configs.

### Omit test-framework plugins and eslint-config-prettier

Do not add `@vitest/eslint-plugin` or `eslint-plugin-playwright` to the initial
stack. All test files receive the same typed correctness baseline as product
code, and all test APIs are explicit imports. Framework-specific opinionated
rules can be considered separately; they are not required for correct parsing,
typed linting, or globals.

Do not add `eslint-config-prettier` for this candidate preset set. The chosen
ESLint, TypeScript, Hooks, and Refresh presets are defect-focused, and
`stylisticTypeChecked` is deliberately absent. Prettier remains a separate
formatter, so there are no ESLint formatting rules to turn off.

If a future specification adds stylistic presets or individual formatting
rules, then install `eslint-config-prettier`, import
`eslint-config-prettier/flat`, and place it last. Its official contract is only
to disable unnecessary or Prettier-conflicting rules; it does not run
Prettier.[^prettier-readme]

## Concrete composition

This is the supported shape. Exact global ignores and repository-specific rule
exceptions remain implementation decisions.

```js
import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import reactHooks from "eslint-plugin-react-hooks";
import { reactRefresh } from "eslint-plugin-react-refresh";
import globals from "globals";
import tseslint from "typescript-eslint";

const typescriptFiles = ["apps/**/*.{ts,tsx}", "packages/**/*.{ts,tsx}"];
const reactFiles = [
  "apps/web/src/**/*.{ts,tsx}",
  "apps/web/test/browser/main.tsx",
];
const playwrightFiles = ["apps/web/test/browser/**/*.spec.ts"];

export default defineConfig(
  {
    files: ["eslint.config.mjs"],
    extends: [js.configs.recommended],
    languageOptions: { globals: globals.nodeBuiltin },
  },
  {
    files: typescriptFiles,
    extends: [js.configs.recommended, tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: [
      "apps/api/**/*.ts",
      "apps/web/{vite,playwright}.config.ts",
      "apps/web/test/browser/{harness,server,test-helpers}.ts",
    ],
    languageOptions: { globals: globals.nodeBuiltin },
  },
  {
    files: ["apps/web/src/**/*.{ts,tsx}", "apps/web/test/browser/main.tsx"],
    languageOptions: { globals: globals.browser },
  },
  {
    files: playwrightFiles,
    languageOptions: {
      globals: { ...globals.nodeBuiltin, ...globals.browser },
    },
  },
  {
    files: reactFiles,
    extends: [reactHooks.configs.flat.recommended],
  },
  {
    files: ["apps/web/src/**/*.{ts,tsx}"],
    extends: [reactRefresh.configs.vite()],
  },
);
```

## Sources

[^npm-eslint]: npm registry, [`eslint` versions](https://www.npmjs.com/package/eslint?activeTab=versions).
[^npm-eslint-js]: npm registry, [`@eslint/js` versions](https://www.npmjs.com/package/%40eslint/js?activeTab=versions).
[^npm-tseslint]: npm registry, [`typescript-eslint`](https://www.npmjs.com/package/typescript-eslint).
[^npm-globals]: npm registry, [`globals` versions](https://www.npmjs.com/package/globals?activeTab=versions).
[^npm-hooks]: npm registry, [`eslint-plugin-react-hooks`](https://www.npmjs.com/package/eslint-plugin-react-hooks).
[^npm-refresh]: npm registry, [`eslint-plugin-react-refresh`](https://www.npmjs.com/package/eslint-plugin-react-refresh).
[^eslint-package]: ESLint, [current package metadata](https://github.com/eslint/eslint/blob/main/package.json).
[^eslint-support]: ESLint, [Version Support](https://eslint.org/version-support/).
[^eslint-config-files]: ESLint, [Configuration Files](https://eslint.org/docs/latest/use/configure/configuration-files).
[^eslint-globals]: ESLint, [Configure Language Options — Predefined Global Variables](https://eslint.org/docs/latest/use/configure/language-options#predefined-global-variables).
[^tseslint-package]: typescript-eslint, [`typescript-eslint` package metadata](https://github.com/typescript-eslint/typescript-eslint/blob/main/packages/typescript-eslint/package.json).
[^tseslint-configs]: typescript-eslint, [Shared Configs](https://typescript-eslint.io/users/configs/).
[^tseslint-parser]: typescript-eslint, [`@typescript-eslint/parser` — `projectService` and `tsconfigRootDir`](https://typescript-eslint.io/packages/parser/#projectservice).
[^tseslint-monorepo]: typescript-eslint, [Monorepo Configuration](https://typescript-eslint.io/troubleshooting/typed-linting/monorepos/).
[^tseslint-project-errors]: typescript-eslint, [Typed Linting — Project Service file-inclusion errors](https://typescript-eslint.io/troubleshooting/typed-linting/).
[^globals-readme]: `globals`, [official README](https://github.com/sindresorhus/globals#readme).
[^hooks-readme]: React, [`eslint-plugin-react-hooks` README](https://github.com/facebook/react/tree/main/packages/eslint-plugin-react-hooks#readme).
[^hooks-package]: React, [`eslint-plugin-react-hooks` package metadata](https://github.com/facebook/react/blob/main/packages/eslint-plugin-react-hooks/package.json).
[^refresh-readme]: `eslint-plugin-react-refresh`, [official README](https://github.com/ArnaudBarre/eslint-plugin-react-refresh#readme).
[^refresh-source]: `eslint-plugin-react-refresh`, [current exported config implementation](https://github.com/ArnaudBarre/eslint-plugin-react-refresh/blob/main/src/index.ts).
[^refresh-package]: `eslint-plugin-react-refresh`, [package metadata](https://github.com/ArnaudBarre/eslint-plugin-react-refresh/blob/main/package.json).
[^prettier-readme]: Prettier, [`eslint-config-prettier` README](https://github.com/prettier/eslint-config-prettier#readme).
