# Disposable product ESLint policy prototype

> **PROTOTYPE — do not merge this branch into `main`.**

This artifact answers [Prototype and measure the candidate product lint
policy](https://github.com/rajat2006/unshelf/issues/179): can one root,
type-aware ESLint policy cover every hand-written product TypeScript file, what
project setup does it require, how expensive is it beside the existing
typecheck, and which rules prevent a clean baseline?

## Run it

```sh
pnpm install
pnpm run lint:prototype
```

The prototype consists of:

- [`eslint.config.mjs`](../../eslint.config.mjs), one root flat config;
- the root development dependencies and `lint:prototype` script;
- [`packages/shared/test/tsconfig.json`](../../packages/shared/test/tsconfig.json),
  the real TypeScript project required for typed shared-package tests.

It uses ESLint 10.8, `recommendedTypeChecked`, the three Promise-safety rules
enabled by that preset, stable React Hooks, and the Vite React Refresh config.
Formatting, import ordering, test-framework plugins, generic React rules, and
`.sandcastle` are absent.

## Coverage and project resolution

ESLint returned a result for all 91 in-scope TypeScript files and no parser or
project-service failures:

| Scope | Files |
| --- | ---: |
| API source | 18 |
| API Vitest tests | 12 |
| API hand-written configs | 2 |
| Web source and colocated Vitest tests | 40 |
| Web Playwright tests and harness | 13 |
| Web hand-written configs | 2 |
| Shared source | 2 |
| Shared Vitest tests | 2 |

The invocation intentionally starts at `apps/api`, `apps/web`, and
`packages/shared`, while the config also globally ignores `.sandcastle`,
dependencies, `dist`, `build`, `coverage`, and generated
`apps/api/drizzle/`. The repository currently contains no tracked TypeScript
files under the generated Drizzle directory.

`apps/api` and `apps/web` resolve through their existing TSConfigs.
`packages/shared/src` resolves through `packages/shared/tsconfig.json`; tests
need the nearer `packages/shared/test/tsconfig.json`, which includes both the
tests and shared source and passes `tsc --noEmit`.

A fresh worktree must run a full `pnpm install`. Installing only the new root
lint packages leaves workspace package links absent and creates thousands of
false `type could not be resolved` diagnostics.

## Runtime

Measured on Node 23.10.0 and pnpm 11.12.0:

| Command | Wall time |
| --- | ---: |
| Existing product typecheck, Turbo forced (including its shared build dependency) | 5.493s |
| Candidate typed lint, no persistent cache | 7.746s |

Typed lint was 1.41× the forced typecheck in this sample. A first valid
worktree run measured 7.392s for lint; the first uncached product typecheck
measured 6.67s. These are local directional measurements, not CI benchmarks.

## Existing violations

The candidate reports 106 errors and one warning:

| Rule | Count | Concentration |
| --- | ---: | --- |
| `@typescript-eslint/no-unsafe-argument` | 32 | API Supertest assertions/helpers |
| `@typescript-eslint/no-unnecessary-type-assertion` | 26 | Mostly API tests; six product-source/browser cases |
| `@typescript-eslint/no-unsafe-member-access` | 21 | API Supertest `res.body` access |
| `@typescript-eslint/no-misused-promises` | 8 | Web async callbacks passed to void-returning UI seams |
| `react-hooks/set-state-in-effect` | 5 | Web loading/reset effects |
| `@typescript-eslint/require-await` | 5 | Test doubles |
| `react-refresh/only-export-components` | 4 | Hooks co-exported with providers/components in two modules |
| `@typescript-eslint/no-namespace` | 1 | Express request declaration merging |
| `@typescript-eslint/no-unused-vars` | 1 | Required `_next` Express error-handler parameter |
| `@typescript-eslint/no-unsafe-return` | 1 | API Supertest response helper |
| `@typescript-eslint/no-floating-promises` | 1 | Web route navigation |
| `react-hooks/exhaustive-deps` | 1 warning | Unstable `searchParams` fallback |
| `jsx-a11y/no-autofocus` | 1 | Stale suppression for a plugin intentionally not installed |

`@typescript-eslint/await-thenable` reports no violations.

## Live-review outcome

The human review accepted a conservative initial-rollout posture:

- Defer `react-hooks/set-state-in-effect`. It is an official React
  recommended-preset rule, but its five findings require deliberate changes to
  existing loading/reset effects and should not become incidental lint-baseline
  cleanup.
- Carry the remaining candidate rules and narrow relaxations into the dedicated
  final-rule-selection decision. In particular, React Refresh remains a
  candidate to evaluate there rather than being silently accepted or discarded
  by this prototype.
- Require the eventual implementation PR description to include a short
  plain-language explanation of every enabled rule or preset.

This preserves the prototype's full candidate configuration and measurements as
primary evidence; the config is not rewritten to pretend the measured rule was
never exercised.

## Proposed clean-baseline disposition for the rule-selection decision

1. Keep all three Promise-safety rules at error and fix the nine findings.
2. Add a narrow API-test override for
   `no-unsafe-argument`, `no-unsafe-member-access`, and `no-unsafe-return`
   because Supertest exposes `res.body` as `any`; retain them everywhere else.
3. Disable `require-await` only in test files, where the five findings are
   deliberately async test doubles.
4. Keep `no-unnecessary-type-assertion` and clean up its 26 findings.
5. Configure `no-namespace` to allow declaration merging, and ignore
   underscore-prefixed callback parameters for `no-unused-vars`.
6. Keep the established React Hooks checks, but initially disable
   `set-state-in-effect`; address its five effects as deliberate follow-up work.
7. Keep the React Refresh Vite rule and split the two mixed component/hook
   modules, unless live review decides preserving their current public seams is
   worth a four-site exception.
8. Remove the stale `jsx-a11y/no-autofocus` suppression; accessibility linting
   remains outside this policy.

React Refresh remains the meaningful open choice for the rule-selection
decision. The rest are narrow, mechanical ways to reach the map's required
zero-warning/error baseline without weakening production source checks.

## Compatibility observation

In `eslint-plugin-react-refresh@0.5.3`, the usable flat config is the object at
the default export's `configs.vite`. The package does not expose a named
`configs` export, and `vite` is not callable. The production specification
should show `reactRefresh.configs.vite`, not `configs.vite()` or
`reactRefresh.configs.vite()`.
