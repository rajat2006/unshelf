# Audit of the existing Playwright behavioral suite

- Research date: 2026-08-14
- Repository snapshot: [`243d86e2c2d8846f205b36c793d365ab4d835d38`](https://github.com/rajat2006/unshelf/tree/243d86e2c2d8846f205b36c793d365ab4d835d38)
- Wayfinder ticket: [Audit the existing Playwright behavioral suite](https://github.com/rajat2006/unshelf/issues/338)

## Question

What purpose and value does each part of the existing Playwright browser setup
serve, which parts should be retained, rewritten, separated, or deleted, and
what must change before a behavioral end-to-end journey can be trusted as a
deterministic CI gate?

## Executive answer

**Do not put the current suite into required CI.** Keep Playwright and the core
real-application seam, but treat the current suite as untrusted prior art and
rebuild the gate around a small set of browser-only contracts.

The strongest part is the middle of the stack: a real React `App`, real HTTP
calls, the real Express application, committed migrations, and a real ephemeral
PostgreSQL container, with Clerk replaced at an intentional application-auth
boundary.[^current-harness] That gives substantially more integration value
than a mocked component test.

The suite around that seam has not earned gate status:

- It collects **152 project cases**: 76 source cases run through both a desktop
  and phone project. Twenty-four are skipped conditionally at runtime, leaving
  128 executions, all serialized through one worker and one shared database.
  The specs alone are 3,425 lines.[^current-count]
- Browser state is isolated by Playwright, but server state is not. One
  PostgreSQL container lives for the whole invocation; several tests reuse the
  same User identity, and no test-scoped reset or cleanup exists.[^shared-state]
- Both projects assume a machine-installed branded Google Chrome. The phone
  project is iPhone-shaped **Chrome/Chromium emulation**, not Mobile Safari or
  WebKit coverage. Neither the package scripts nor CI explicitly provisions a
  browser.[^browser-target]
- The suite is opt-in and absent from Product CI by design. There is no browser
  install step, reporter policy, artifact upload, retry/flaky-test policy, or
  current repeatability benchmark in CI.[^not-a-gate]
- The repository has repeated first-party failure evidence: different
  navigation/timing tests failed under concurrent runner load, isolated reruns
  passed, a review hit its one-hour cap, later runs recorded a phone
  pointer-interception race and another isolated-pass timing failure, and one
  run had to kill leftover browser-harness processes before it could proceed.
  These are not one deterministic regression with one known fix.[^failure-history]
- Much of the browser suite re-proves API/service facts already covered by
  lower-level tests. The browser should own routing, history, real DOM and
  input behavior, responsive boundaries, and a few cross-room journeys—not
  tenancy constraints, domain ordering, migration mechanics, and every loading
  or error rendering in two viewports.[^duplication]

The right destination is three explicit suites:

1. **Required browser-behavior gate:** a small Chromium suite of independent,
   browser-specific journeys, with a phone project only where behavior differs.
2. **Non-gating browser audits:** accessibility sweeps, expanded responsive
   checks, exact visual/CSS checks, and the legacy-migration UI proof. Run on
   demand or on a schedule until each class independently earns gate status.
3. **Environment smoke checks:** real Clerk/OAuth and the built/deployed
   Caddy/Traefik application. These have different credentials, failure modes,
   and ownership from the deterministic in-process application harness.

## Evidence: what exists now

### Execution shape

The current [`playwright.config.ts`](https://github.com/rajat2006/unshelf/blob/243d86e2c2d8846f205b36c793d365ab4d835d38/apps/web/playwright.config.ts#L1-L31)
does the following:

| Setting | Observed purpose/value | Audit finding |
| --- | --- | --- |
| `testDir: "./test/browser"` | Keeps Playwright specs separate from Vitest. | Retain. |
| `fullyParallel: false`, `workers: 1` | Avoids simultaneous writes to the one shared database and gives each test full runner resources. Playwright itself recommends one CI worker for stability.[^playwright-ci] | Retain for the first gate. It currently masks shared-state coupling rather than solving it. |
| `timeout: 120_000`, `expect.timeout: 10_000` | Allows the real database/API/UI stack and slow runner interactions time to settle. | Rewrite. The two-minute per-test ceiling makes a stuck action expensive. Use an ordinary 30–45 second test timeout and explicit longer fixture/setup timeouts only where measured. |
| `baseURL` plus `webServer` | Starts and waits for the owned Vite/API/PostgreSQL harness automatically. | Retain the ownership model; rewrite lifecycle and ports. |
| `channel: "chrome"` | Runs the public stable branded browser rather than Playwright's bundled Chromium. | Replace with Playwright-pinned Chromium unless stable Chrome is an explicit product requirement. |
| `trace: "retain-on-failure"` | Keeps a trace for a failed local attempt. | Retain tracing, but add a retry/flaky policy and upload the trace/report from CI. |
| `desktop` and `phone` projects | Exercises 1440×900 and iPhone 13 emulation. | Retain the two behavior classes, but do not run every test through both. Select phone-only contracts explicitly. |

The package exposes only an opt-in
[`test:browser`](https://github.com/rajat2006/unshelf/blob/243d86e2c2d8846f205b36c793d365ab4d835d38/apps/web/package.json#L7-L15)
script. Both `test` and `test:product` explicitly exclude `test/browser/**`, and
the root `ci:product:test` invokes `test:product`, not Playwright.[^not-a-gate]

Static collection at the audited snapshot is:

| Spec | Source cases | Desktop + phone project cases | Conditional skips | Executed cases |
| --- | ---: | ---: | ---: | ---: |
| `application.spec.ts` | 2 | 4 | 1 | 3 |
| `capture.spec.ts` | 14 | 28 | 0 | 28 |
| `item-sidebar.spec.ts` | 10 | 20 | 6 | 14 |
| `learning-plan-migration.spec.ts` | 1 | 2 | 1 | 1 |
| `learning-plan.spec.ts` | 9 | 18 | 7 | 11 |
| `learning-plans.spec.ts` | 4 | 8 | 0 | 8 |
| `library.spec.ts` | 13 | 26 | 0 | 26 |
| `quiet-focus.spec.ts` | 5 | 10 | 4 | 6 |
| `shell.spec.ts` | 9 | 18 | 0 | 18 |
| `stage-sidebar.spec.ts` | 6 | 12 | 5 | 7 |
| `today.spec.ts` | 3 | 6 | 0 | 6 |
| **Total** | **76** | **152** | **24** | **128** |

The six generated Capture-surface cases account for the difference between 70
top-level `test(...)` declarations and 76 source cases.[^current-count]

### Harness and support files

| Part | Purpose and current value | Disposition |
| --- | --- | --- |
| [`harness.ts`](https://github.com/rajat2006/unshelf/blob/243d86e2c2d8846f205b36c793d365ab4d835d38/apps/web/test/browser/harness.ts#L1-L36) | Centralizes loopback origins and implements a clearly branded, local-only bearer credential that maps an explicit test User through the real auth middleware. This is a good, small seam. | **Retain**, behind a Playwright fixture. Make ports configurable and make the test identity test-scoped. |
| [`index.html`](https://github.com/rajat2006/unshelf/blob/243d86e2c2d8846f205b36c793d365ab4d835d38/apps/web/test/browser/index.html#L1-L12) | Gives Vite a separate test entry document. | **Retain or fold into a reusable application bootstrap.** It is not itself production-hosting coverage. |
| [`main.tsx`](https://github.com/rajat2006/unshelf/blob/243d86e2c2d8846f205b36c793d365ab4d835d38/apps/web/test/browser/main.tsx#L1-L67) | Mounts the real `App` and real router while injecting deterministic loading/signed-out/signed-in auth states. | **Retain the injection idea; rewrite the bootstrap.** It bypasses production `AuthProvider`, does not render the real Clerk `UserButton`, and does not call production's synchronous `initializeThemePreference()` path.[^auth-divergence] Share one mount/bootstrap function with production so only the auth adapter and router basename vary. |
| [`server.ts`](https://github.com/rajat2006/unshelf/blob/243d86e2c2d8846f205b36c793d365ab4d835d38/apps/web/test/browser/server.ts#L1-L155) | Owns a real Express app, API proxy, Vite server, database, migration replay, deep-link rewrite, and two time-control endpoints. This is the suite's main integration value. | **Rewrite.** Give it deterministic per-run ports, unambiguous teardown, attached logs, a normal current-schema fixture by default, and an opt-in legacy-migration fixture. |
| [`test-helpers.ts`](https://github.com/rajat2006/unshelf/blob/243d86e2c2d8846f205b36c793d365ab4d835d38/apps/web/test/browser/test-helpers.ts#L1-L78) | Builds test URLs, performs fast authenticated API arrangement, and advances database dates without waiting for wall time. These are useful techniques. | **Rewrite as typed Playwright fixtures.** Separate arrangement from assertions, allocate one User namespace per test/retry, and expose an injected clock or narrowly owned time control. |
| [`legacy-learning-plan-fixture.ts`](https://github.com/rajat2006/unshelf/blob/243d86e2c2d8846f205b36c793d365ab4d835d38/apps/web/test/browser/legacy-learning-plan-fixture.ts#L1-L12) | Supplies fixed pre-migration identifiers for one end-to-end migration proof. | **Retain, but separate.** It should not determine how the database for all ordinary browser tests is created. |
| [`apps/api/test/harness.ts`](https://github.com/rajat2006/unshelf/blob/243d86e2c2d8846f205b36c793d365ab4d835d38/apps/api/test/harness.ts#L133-L196) | Starts PostgreSQL 16, applies real committed migrations, wires the real app, and can seed immediately before the Learning Plan migration. | **Retain and deepen.** Expose explicit `current schema` and `legacy migration` modes and a safe isolation/reset contract suitable for browser workers. |

The harness is not a deployed end-to-end stack. Production uses a different
entry point with Clerk, builds static assets, and serves them through Caddy with
its own SPA fallback; the browser harness uses Vite middleware, a `/test/browser`
basename, a custom deep-link rewrite, and an in-memory auth adapter.[^production-divergence]
That is appropriate for a deterministic application integration suite, but the
name and claims must say so.

### What each spec is worth

| Spec | Unique browser-level value | Duplication / cost | Recommended disposition |
| --- | --- | --- | --- |
| [`application.spec.ts`](https://github.com/rajat2006/unshelf/blob/243d86e2c2d8846f205b36c793d365ab4d835d38/apps/web/test/browser/application.spec.ts#L1-L176) | Proves a coherent cross-room workflow through real UI, HTTP, persistence, and reload; uniquely checks for external requests, but only in these two tests. | The first journey repeats Capture persistence and tenancy. The second is very long and repeats most room-specific specs. | **Rewrite and retain one sentinel journey.** Keep the Power Learner cross-room coherence, shorten it to intent-level steps, and move the non-loopback network ban into an automatic fixture. Delete the first journey after compact Capture and API tenancy coverage are authoritative. |
| [`capture.spec.ts`](https://github.com/rajat2006/unshelf/blob/243d86e2c2d8846f205b36c793d365ab4d835d38/apps/web/test/browser/capture.spec.ts#L1-L227) | Real keyboard routing, editable-control suppression, modal visibility, unchanged URL, and recovery after an intercepted request failure. | Six surfaces × two projects repeat one global control. Source preservation, duplicate policy, validation, and persistence already have API tests. All cases share one default User per project. | **Rewrite.** Keep one desktop keyboard/dialog journey, one origin-preservation journey, and one phone interaction only if phone behavior differs. Move domain validation and duplicate/source facts down; cover the shared component's surface availability below Playwright. |
| [`shell.spec.ts`](https://github.com/rajat2006/unshelf/blob/243d86e2c2d8846f205b36c793d365ab4d835d38/apps/web/test/browser/shell.spec.ts#L1-L212) | Deep links, URL restoration, browser history, persisted theme/media behavior, focus-visible CSS, and real viewport overflow are legitimate browser contracts. | “Sign in” is only an in-memory state change; exact app hosting and Clerk are bypassed. Some route existence checks are cheap but broad. | **Retain and split.** Put routing/history/focus/theme/overflow sentinels in the gate. Label fake-auth cases as application-auth-adapter tests. Put a real Clerk and built-SPA smoke elsewhere. |
| [`learning-plans.spec.ts`](https://github.com/rajat2006/unshelf/blob/243d86e2c2d8846f205b36c793d365ab4d835d38/apps/web/test/browser/learning-plans.spec.ts#L1-L172) | Proves index-to-stable-URL navigation and lifecycle controls work in a browser. | Creation, tenancy, progress, archive, and restore semantics are exhaustively covered at the API/service seam. | **Rewrite.** Retain one create/open/archive/restore UI flow; move tenancy and exact progress semantics down. |
| [`learning-plan.spec.ts`](https://github.com/rajat2006/unshelf/blob/243d86e2c2d8846f205b36c793d365ab4d835d38/apps/web/test/browser/learning-plan.spec.ts#L1-L604) | Real pointer/keyboard authoring, responsive read-only behavior, topology interaction, and contextual Today navigation are high-value browser behavior. | At 604 lines it mixes topology, privacy, placements, phone presentation, sidecar errors, and API facts. Seven scattered skips encode the desktop/phone matrix indirectly. | **Rewrite aggressively.** Keep one desktop topology-authoring journey, one placement/context journey, and one phone read-only/overflow contract. Move privacy, placement invariants, and contained error renderings to API/component tests. |
| [`stage-sidebar.spec.ts`](https://github.com/rajat2006/unshelf/blob/243d86e2c2d8846f205b36c793d365ab4d835d38/apps/web/test/browser/stage-sidebar.spec.ts#L1-L411) | Cold deep links, back/forward behavior, sidebar-over-canvas context, and interactive ordering are browser-level. | Membership preservation, other-Stage effects, loading, retry, and order persistence overlap API/service behavior or can be component-state tests. | **Rewrite.** Keep cold-link/history/context and one keyboard ordering interaction. Migrate domain and synthetic loading/error cases before deleting them. |
| [`item-sidebar.spec.ts`](https://github.com/rajat2006/unshelf/blob/243d86e2c2d8846f205b36c793d365ab4d835d38/apps/web/test/browser/item-sidebar.spec.ts#L1-L454) | Canonical URL, preserved underlying route/filter, browser history, and synchronization across open Item routes are valuable integration contracts. | Parts semantics, tenancy, loading, error/retry, and shared Item facts have lower seams. Six phone skips make most of the duplicated matrix dead work. | **Rewrite.** Keep canonical URL/history/context plus one form interaction; move Parts/domain/tenancy/error assertions down. |
| [`library.spec.ts`](https://github.com/rajat2006/unshelf/blob/243d86e2c2d8846f205b36c793d365ab4d835d38/apps/web/test/browser/library.spec.ts#L1-L594) | URL-owned filters across refresh/history, keyboard label interaction, no stale refresh overwrite, and real responsive presentation are defensible browser contracts. | Status/date/Label ownership, search semantics, invalid identifiers, empty states, and API results heavily duplicate API tests. Every one of 13 cases runs in both projects. | **Rewrite aggressively.** Keep URL/history, one keyboard retrieval flow, and the stale-response contract if it cannot be made authoritative in a component integration test. Move the rest down before removal. |
| [`today.spec.ts`](https://github.com/rajat2006/unshelf/blob/243d86e2c2d8846f205b36c793d365ab4d835d38/apps/web/test/browser/today.spec.ts#L1-L300) | Proves search/add/complete navigation, historical-route context, and one room-to-room workflow. | Suggestion ordering, snapshots, suppression rollover, status derivation, and tenancy already have focused service coverage. | **Rewrite.** Keep one current-focus journey and one historical navigation/re-add journey; move the detailed planning ranking matrix down. |
| [`learning-plan-migration.spec.ts`](https://github.com/rajat2006/unshelf/blob/243d86e2c2d8846f205b36c793d365ab4d835d38/apps/web/test/browser/learning-plan-migration.spec.ts#L1-L53) | Uniquely proves a legacy row remains usable through migration, HTTP, UI, stable URLs, and refresh. | Lower-level migration tests already own schema/data correctness; the special fixture makes every ordinary browser invocation start from a legacy database. | **Separate and retain one case.** Run as a migration-specific gate when migrations change, or as a scheduled audit—not as the default fixture for every browser behavior. |
| [`quiet-focus.spec.ts`](https://github.com/rajat2006/unshelf/blob/243d86e2c2d8846f205b36c793d365ab4d835d38/apps/web/test/browser/quiet-focus.spec.ts#L1-L222) | Axe in a real rendered app, reduced-motion media behavior, internal-vs-page overflow, and non-color state cues require a browser or browser-like engine. | Exact colors and Georgia assertions are visual-contract checks, not behavioral E2E. Repeated whole-page Axe scans are slow and are not complete accessibility acceptance. | **Separate.** Keep representative Axe, reduced-motion, overflow, and state-cue audits in an accessibility/responsive suite. Delete exact visual values from the behavioral gate; let the prototype-fidelity mechanism own them. |

## Duplication with lower-level tests

At the audited snapshot, the product has 260 recognizable API/service test
declarations and 26 web component/unit declarations outside Playwright.[^lower-tests]
The browser suite frequently uses the same real API merely to restate those
domain contracts through visible text:

- Capture title/type/source validation, duplicate sources, ownership, and
  persistence duplicate [`items.test.ts`](https://github.com/rajat2006/unshelf/blob/243d86e2c2d8846f205b36c793d365ab4d835d38/apps/api/test/items.test.ts#L63-L165)
  and [`tenancy.test.ts`](https://github.com/rajat2006/unshelf/blob/243d86e2c2d8846f205b36c793d365ab4d835d38/apps/api/test/tenancy.test.ts#L30-L72).
- Library Status/Target date/Label/filter ownership overlaps
  [`items.test.ts`](https://github.com/rajat2006/unshelf/blob/243d86e2c2d8846f205b36c793d365ab4d835d38/apps/api/test/items.test.ts#L290-L710)
  and [`labels.test.ts`](https://github.com/rajat2006/unshelf/blob/243d86e2c2d8846f205b36c793d365ab4d835d38/apps/api/test/labels.test.ts#L45-L259).
- Learning Plan creation, lifecycle, progress, privacy, graph invariants, Stage
  membership, and order overlap
  [`learning-plans.test.ts`](https://github.com/rajat2006/unshelf/blob/243d86e2c2d8846f205b36c793d365ab4d835d38/apps/api/test/learning-plans.test.ts#L48-L600),
  [`learning-plan.test.ts`](https://github.com/rajat2006/unshelf/blob/243d86e2c2d8846f205b36c793d365ab4d835d38/apps/api/test/learning-plan.test.ts#L168-L810),
  and [`stages.test.ts`](https://github.com/rajat2006/unshelf/blob/243d86e2c2d8846f205b36c793d365ab4d835d38/apps/api/test/stages.test.ts#L216-L1515).
- Part/status derivation overlaps
  [`parts.test.ts`](https://github.com/rajat2006/unshelf/blob/243d86e2c2d8846f205b36c793d365ab4d835d38/apps/api/test/parts.test.ts#L18-L463).
- Daily Focus snapshots, origin context, completion, history, suppression, and
  suggestion ordering overlap the focused
  [`daily-focus` service tests](https://github.com/rajat2006/unshelf/tree/243d86e2c2d8846f205b36c793d365ab4d835d38/apps/api/src/daily-focus).
- The migration's data preservation is already owned by
  [`learning-plan-migration.test.ts`](https://github.com/rajat2006/unshelf/blob/243d86e2c2d8846f205b36c793d365ab4d835d38/apps/api/test/learning-plan-migration.test.ts#L1-L78).

The duplication is not an instruction to delete browser files immediately.
Web component coverage is still sparse, so some loading, error, focus, and
interaction states exist only in Playwright. Move those contracts to a cheaper
authoritative seam first. Then delete browser assertions whose failure would
only repeat a more precise API/service/component failure.

A browser gate earns its cost where it detects a class of defect the lower seam
cannot: route/history restoration, actual focus and keyboard dispatch, modal and
pointer behavior, DOM accessibility semantics, viewport overflow, media-query
behavior, stale network responses integrated with React state, and a small
number of cross-room workflows.

## Why the current runs are not deterministic

### Server state is shared even though browser contexts are fresh

Playwright creates an isolated browser context and page per test, which protects
cookies, local storage, routes, and other browser state.[^playwright-isolation]
The Unshelf `webServer`, however, calls `startTestAppWithLegacyFixture` once and
keeps its one PostgreSQL database for the entire invocation. It does not reset
between tests or projects.[^shared-state]

Most specs derive a User from the project and scenario, which is helpful. Some
do not: Capture's default identity is only
`` `${testInfo.project.name}-capture-user` ``, so its generated surface tests
and later mutating cases share one User and accumulate records in source order.[^capture-user]
`workers: 1` keeps this latent. A retry, shard, reordered file, future second
worker, or overlapping process can observe different server state.

This also makes retries unsafe: a failed state-changing attempt can leave rows
that its retry sees. Playwright's auth guidance explicitly warns against shared
accounts when tests modify server-side state, and recommends unique accounts per
parallel worker in that situation.[^playwright-auth]

### The auth seam is valuable but is not Clerk E2E

Production's thin [`auth.tsx`](https://github.com/rajat2006/unshelf/blob/243d86e2c2d8846f205b36c793d365ab4d835d38/apps/web/src/auth.tsx#L1-L66)
adapter owns Clerk loading, signed-in state, tokens, modal sign-in, and User
control. The harness replaces all of it with a query-selected status, a local
bearer token, a `span` click that changes React state, and an empty User control.
That deliberately removes network, secrets, OAuth redirects, cookies, token
refresh, Clerk UI, and Clerk failure modes.[^auth-divergence]

Retain that seam for deterministic application behavior. Rename its claims:
“intended route survives the injected application-auth transition” is true;
“the User can sign in with Google” is not proven. Test the production Clerk
adapter at a focused lower seam, and if real identity assurance is required,
run one separately credentialed smoke journey against a dedicated Clerk test
tenant. Do not mix it into the hermetic gate.

### Browser provisioning is implicit and drifting

`@playwright/test` is lockfile-pinned, but `channel: "chrome"` tells Playwright
to use branded Google Chrome available on the machine. Playwright documents
that branded Chrome is not installed by default and that it differs from the
bundled Chromium it normally controls.[^playwright-browsers]

The repository has no `playwright install`, `install --with-deps`, pinned
Playwright container, or browser-cache policy in package scripts or workflows.
The existing agent runs succeeded because their hosted image happened to have a
compatible Chrome. That is an environment assumption, not repository-owned
provisioning.

Use the Playwright-version-matched Chromium build and install it explicitly with
its Linux dependencies, or use the exactly matching official Playwright image.
Only keep a separate stable-Chrome project if a concrete browser-compatibility
requirement justifies accepting that external update channel. The phone project
should be described as mobile emulation on Chromium; add WebKit only if Safari
compatibility is a chosen requirement, not to make the matrix look complete.

### Runtime is large, variable, and poorly bounded

No clean current CI benchmark exists because there is no browser CI job. The
first-party run history nevertheless bounds the problem:

- In the July review incident, an isolated 100-pass/18-skip browser run took
  roughly 2½ minutes; concurrent full-repository attempts spent roughly six
  minutes before failing in one or two different browser cases.[^run-30445236704]
- A later full suite reported 101 passes/19 skips after roughly 2¼ minutes of
  isolated execution.[^run-31514151409]
- The August integration run reported 127 passes/24 skips and one unrelated
  timing failure that passed immediately in isolation. The full browser phase
  and follow-up consumed several minutes.[^run-31567253336]
- Even one targeted test pays for Vite, the API, PostgreSQL container startup,
  legacy seeding, and all migrations. Several agent logs also show that
  `pnpm --filter @unshelf/web test:browser -- <file>` unexpectedly selected a
  broader suite; the reliable targeted form was
  `pnpm --filter @unshelf/web exec playwright test <file>`.[^invocation-history]

The suite must be measured in its intended dedicated CI job after isolation and
scope reduction. Runtime targets should be based on that data. The existing
two-minute test timeout and a 30–60 minute outer job limit are safety ceilings,
not acceptable latency targets.

### Diagnostics stop at the runner filesystem

The current config retains a trace on failure, which is useful. It does not
configure screenshots, video, an HTML/JUnit/GitHub reporter, or an attachment
fixture for browser console errors, page errors, failed requests, API logs, or
PostgreSQL/container output. The API harness already has a collecting logger,
but `server.ts` does not expose or attach it. `test-results/` and
`playwright-report/` are ignored, and no workflow uploads either directory.[^diagnostics]

Playwright's CI example explicitly installs browsers and uploads the HTML report;
its fixture model supports attaching automatic failure logs.[^playwright-ci]
A failed required check without retained traces and server/browser logs is not
operable, even if its pass rate improves.

### The suite is maintainable in selectors, but not in ownership

The specs mostly use `getByRole`, `getByLabel`, and visible User language rather
than CSS/test-id internals. Comments explain domain intent. Those are strengths.

The ownership shape is weak:

- Every unqualified test silently doubles into both projects, while 24 inline
  conditional skips decide after collection which project actually matters.
- Large files mix browser contracts, API contract assertions, synthetic
  loading/error states, exact visual tokens, and accessibility sweeps.
- Common setup is a loose helper library rather than fixtures with setup and
  teardown guarantees.
- Hard-coded ports prevent concurrent worktree/process runs.
- The special legacy fixture is global rather than scoped to its one migration
  case.
- There is no documented canonical full/targeted command, local browser
  prerequisite, quarantine rule, owner, runtime budget, or artifact-reading
  workflow. The older [responsive harness ticket](https://github.com/rajat2006/unshelf/issues/30)
  still asks for setup and local/CI prerequisites.

Playwright fixtures are intended to encapsulate setup and teardown, remain
isolated between tests, and attach diagnostic logs automatically when needed.[^playwright-fixtures]
Use that structure rather than adding more helpers and `test.skip` branches.

## Documented failure history

This chronology distinguishes repository evidence from inference:

1. The first real-browser responsive experiment was added and then reverted in
   [T6 — Stops: create, membership & view](https://github.com/rajat2006/unshelf/pull/34).
   The maintainer recorded that it was outside that issue's scope and returned
   browser harness work to the separate responsive-harness ticket. This was a
   scope correction, not a reliability finding.
2. The current architecture began in
   [`test: establish browser application seam`](https://github.com/rajat2006/unshelf/commit/5ae7469f30f684543ec17e9bd4a58fa992c81138)
   and expanded across [the locked web UI redesign](https://github.com/rajat2006/unshelf/pull/101).
   The explicit goal was a real application/backend behind an injected Clerk-free
   boundary.
3. [Establish enforced product CI](https://github.com/rajat2006/unshelf/issues/125)
   and its [implementation](https://github.com/rajat2006/unshelf/pull/133)
   expressly excluded Playwright. Product CI therefore provides no continuing
   evidence about browser-suite health.
4. During [Agent Review run 30445236704](https://github.com/rajat2006/unshelf/actions/runs/30445236704),
   the browser suite failed repeatedly under concurrent repository load:
   a pre-existing accessibility case flaked during navigation; the next run
   failed a different element timeout at 99 passes; the isolated web rerun
   passed 100 cases with 18 skips; a later concurrent run failed two different
   timing/navigation cases at 98 passes and again passed in isolation; the last
   concurrent attempt failed yet another single case at 99 passes. The workflow
   was cancelled at its one-hour cap while attempting the established isolated
   rerun.
5. The repository then committed
   [`chore: take the browser suite out of the default test gate`](https://github.com/rajat2006/unshelf/commit/48d6e7cd4fd9a3958aa61a03bf1521a35fa0d3ab),
   explicitly citing timing/navigation flakes under concurrent load and the
   one-hour stall. A review fix briefly restored the default gate, then
   [`Revert review fix: keep flaky browser suite opt-in`](https://github.com/rajat2006/unshelf/commit/f6977e2d6842202d6bfbf07c2d3d9b0d94c0165e)
   reinstated the opt-in decision. The merged record is
   [typed ESLint as the product lint gate](https://github.com/rajat2006/unshelf/pull/205).
6. [Agent Implement PRD run 31504778534](https://github.com/rajat2006/unshelf/actions/runs/31504778534)
   reached the complete browser suite only 42 seconds before the job's 60-minute
   outer limit and was cancelled mid-run. The subsequent
   [PRD timeout change](https://github.com/rajat2006/unshelf/pull/318) records
   that completed local work was lost because the push never ran. This does not
   prove a Playwright defect, but it proves that placing the full suite at the
   end of a large agent workflow is operationally unsafe.
7. [Run 31520341082](https://github.com/rajat2006/unshelf/actions/runs/31520341082)
   accidentally ran 124 browser cases through a broadly forwarded command and
   recorded one pre-existing phone focus test timing out on a
   pointer-interception race; the targeted rerun passed.
8. [Run 31562767146](https://github.com/rajat2006/unshelf/actions/runs/31562767146)
   found browser/server processes still bound during repeated targeted runs and
   manually killed them before continuing. This is direct lifecycle/port
   evidence.
9. [Run 31567253336](https://github.com/rajat2006/unshelf/actions/runs/31567253336)
   later recorded 127 passes, 24 intentional skips, and one unrelated timing
   failure that passed on immediate isolated rerun. The suite has grown since
   the July incident, but the failure class remains.

The evidence supports a narrow conclusion: resource contention amplifies the
problem, but isolation alone is not yet a sufficient reliability policy. Test
state, process lifecycle, browser provisioning, diagnostics, and scope all need
explicit ownership.

## Recommended target design

### 1. Preserve the deep application seam

Keep one repository-owned harness that runs:

```text
Playwright Chromium
  → real React App and router
  → injected deterministic application-auth adapter
  → real HTTP API
  → real Express application
  → real committed migrations and ephemeral PostgreSQL
```

Make its limits part of its name and documentation: it is a **browser
application integration** suite, not proof of Clerk, Docker images, Caddy,
Traefik, or a deployed environment.

### 2. Make isolation structural

Before introducing a required gate:

1. Define typed Playwright fixtures for `testUser`, API arrangement, clock
   control, browser log capture, and application URL.
2. Give every test and retry a deterministic unique User namespace derived from
   project + file + title + retry/parallel index. No mutable default User may be
   shared between cases.
3. Start from the current schema for normal behavior. Put the legacy seed and
   pre-migration replay behind a separate migration project/fixture.
4. Keep one worker initially. If parallelism is later desired, allocate a
   database/schema and ports per worker; do not merely raise `workers`.
5. Make web/API ports configurable or dynamically allocated and make one owner
   responsible for process teardown on success, failure, signal, and timeout.
6. Reject every non-loopback request by default. Permit external access only in
   an explicitly non-hermetic project.
7. Prove independence by running gate cases individually, in the full suite,
   under `--repeat-each`, and in more than one file/shard order before enabling
   CI enforcement.

### 3. Own the browser exactly

For the deterministic gate:

- use Playwright's version-matched bundled Chromium;
- install it and Linux dependencies explicitly with the package's Playwright
  CLI, or use the exactly matching official Playwright container image;
- record Node, pnpm, Playwright, browser version, runner image, and test command
  in the job log;
- keep `workers: 1` until data/process isolation is proven; and
- treat phone as an explicit emulation project selected only for phone-specific
  behavior.

Playwright's documented CI baseline is dependency install, browser plus OS
dependency install, then the test command; its configuration guidance also
calls out `forbidOnly`, CI-specific retries/workers, reporter selection, and
trace collection.[^playwright-config]

### 4. Establish a small required contract

Start with approximately these browser-only sentinels, not the existing whole
matrix:

- routed shell deep link and back/forward restoration;
- Capture keyboard/dialog/origin behavior;
- one Library URL filter/history and retrieval flow;
- one canonical Item sidebar/context edit;
- one current Today choose/complete flow and one history return;
- one Learning Plan desktop authoring/context flow;
- one phone read-only/overflow and touch/pointer flow; and
- one short Power Learner cross-room journey proving the pieces compose.

That is a candidate shape, not a requirement to preserve these exact tests.
Each case must answer: “What browser-only regression would this catch that a
lower test would not?” If there is no concrete answer, move it down.

Run the gate in a **dedicated job**, not concurrently inside `turbo run test`.
Let Product CI and browser behavior be separately named checks and separate
resource domains. This preserves fast, precise lower-level feedback while
preventing API/shared workload contention from recreating the documented July
failure mode.

### 5. Split the other browser work by failure domain

- **Accessibility/responsive audit:** Axe, reduced motion, focus survey,
  overflow, and a wider viewport/state matrix. Initially scheduled/manual.
- **Visual fidelity:** prototype comparison and visual-intent evidence. Exact
  colors, fonts, spacing, and screenshots belong here, not in the behavioral
  journey gate.
- **Migration UI proof:** the single legacy fixture and migrated-URL refresh
  test, triggered when migrations change or scheduled.
- **Real identity/deployment smoke:** production bootstrap, Clerk test tenant,
  built assets, and hosted routing. Credentials and external availability make
  this a separate check with a separate response policy.

Playwright projects and tags can select different configurations and test
classes without collecting every test into every viewport.[^playwright-projects]

### 6. Make a failure actionable and a flake fail

Configure and retain:

- CI `forbidOnly: true`;
- one diagnostic retry, with `failOnFlakyTests: true`, so a retry never converts
  a flaky case into a green gate;
- trace on first retry or retained on failure;
- screenshot on failure and video on first retry only if it materially helps;
- a concise CI reporter plus an HTML report;
- automatic attachments for browser console errors, uncaught page errors,
  failed requests, API collecting-logger events, and harness/container logs;
- report/trace artifacts uploaded on every non-cancelled CI run, with a stated
  retention period and awareness that traces can contain sensitive data; and
- test annotations linking quarantined cases to an issue and naming the owner.

Playwright supports failing CI when any retry is classified as flaky, and its
reporting/artifact facilities are designed for this use.[^playwright-testconfig]

Do not add unconditional retries that turn the historic isolated-rerun pattern
into green. A flaky required test should be removed from the required project,
tracked, and fixed; the gate remains trustworthy only if green means every
required case passed without a flaky classification.

### 7. Set an evidence bar before enforcement

The first required browser check should not be enabled until all of the
following are recorded from the exact candidate workflow:

- browser installation succeeds from a clean Ubuntu runner with no reliance on
  preinstalled Chrome;
- every case is independent when run alone and in the full project;
- at least 20 consecutive fresh CI runs pass with zero failed first attempts,
  zero flaky classifications, zero leaked processes/containers, and no manual
  reruns;
- a stress batch using `--repeat-each` shows no order/retry contamination;
- the observed median and p95 runtime fit an agreed job budget with meaningful
  headroom below its timeout;
- an induced assertion failure preserves an HTML report, trace, screenshot, and
  server/browser logs sufficient to diagnose it;
- a deliberate `test.only` fails the job;
- the non-loopback network guard fails on an unexpected external request; and
- the documented local command reproduces the CI command and targeted-file
  selection exactly.

Twenty clean runs are a proposed minimum evidence sample, not proof that
flakiness is mathematically impossible. Any recurrence of the historic
different-test timeout pattern resets the qualification run and blocks gate
promotion until the cause is understood.

## Final disposition

| Decision | Answer |
| --- | --- |
| Keep Playwright? | **Yes.** It is well suited to browser behavior, diagnostics, accessibility automation, and a later visual-fidelity implementation path. |
| Keep the real App/API/PostgreSQL harness? | **Yes, after isolation and lifecycle rewrites.** It is the suite's highest-value asset. |
| Keep fake auth? | **Yes for hermetic application behavior; no as a claim about Clerk/OAuth.** Separate the real identity smoke. |
| Keep every current spec in the required gate? | **No.** Rewrite a small browser-specific set; migrate duplicated assertions down; separate audit/migration/visual classes. |
| Keep both projects on every test? | **No.** Select desktop/phone by behavior; phone emulation is not Safari coverage. |
| Add the existing `test:browser` command to Product CI? | **No.** Create a dedicated, provisioned, diagnostic browser check after qualification. |
| Use retries to obtain green? | **No.** Use at most a diagnostic retry plus `failOnFlakyTests`; quarantine any flaky case from the gate. |
| Current suite trusted as deterministic? | **No.** Repository history explicitly demonstrates otherwise. |

The current suite should remain opt-in while this work is done. Its code is
useful evidence and a source of candidate contracts, but its existence grants
neither Playwright nor any particular test a place in the final required gate.

[^current-harness]: The browser server starts the API test harness with a real PostgreSQL container and committed migrations, then exposes it through a Vite proxy: [`server.ts`](https://github.com/rajat2006/unshelf/blob/243d86e2c2d8846f205b36c793d365ab4d835d38/apps/web/test/browser/server.ts#L19-L111) and [`apps/api/test/harness.ts`](https://github.com/rajat2006/unshelf/blob/243d86e2c2d8846f205b36c793d365ab4d835d38/apps/api/test/harness.ts#L133-L196).
[^current-count]: Counted from the 11 specs under [`apps/web/test/browser`](https://github.com/rajat2006/unshelf/tree/243d86e2c2d8846f205b36c793d365ab4d835d38/apps/web/test/browser): 70 top-level declarations plus six cases generated by the [`Capture` surface loop](https://github.com/rajat2006/unshelf/blob/243d86e2c2d8846f205b36c793d365ab4d835d38/apps/web/test/browser/capture.spec.ts#L31-L58), collected under the two configured projects. The 24 project-conditional `test.skip` calls are visible across the specs; the source specs total 3,425 lines at this snapshot.
[^shared-state]: [`server.ts`](https://github.com/rajat2006/unshelf/blob/243d86e2c2d8846f205b36c793d365ab4d835d38/apps/web/test/browser/server.ts#L19-L32) creates one `testApp` before serving the full run, while [`playwright.config.ts`](https://github.com/rajat2006/unshelf/blob/243d86e2c2d8846f205b36c793d365ab4d835d38/apps/web/playwright.config.ts#L4-L18) owns one web server and one worker. There is no per-test database fixture or reset.
[^browser-target]: Global `channel: "chrome"` and the two projects are in [`playwright.config.ts`](https://github.com/rajat2006/unshelf/blob/243d86e2c2d8846f205b36c793d365ab4d835d38/apps/web/playwright.config.ts#L9-L30). The phone spreads `devices["iPhone 13"]` but explicitly sets `browserName: "chromium"`; the global Chrome channel remains.
[^not-a-gate]: [`apps/web/package.json`](https://github.com/rajat2006/unshelf/blob/243d86e2c2d8846f205b36c793d365ab4d835d38/apps/web/package.json#L7-L15) excludes browser tests from both ordinary and product tests. The root [`package.json`](https://github.com/rajat2006/unshelf/blob/243d86e2c2d8846f205b36c793d365ab4d835d38/package.json#L8-L22) invokes `test:product`, and [`.github/workflows/ci.yml`](https://github.com/rajat2006/unshelf/blob/243d86e2c2d8846f205b36c793d365ab4d835d38/.github/workflows/ci.yml#L21-L56) has no browser provisioning or Playwright step.
[^failure-history]: Primary records are [PR 205](https://github.com/rajat2006/unshelf/pull/205), [run 30445236704](https://github.com/rajat2006/unshelf/actions/runs/30445236704), [run 31520341082](https://github.com/rajat2006/unshelf/actions/runs/31520341082), [run 31562767146](https://github.com/rajat2006/unshelf/actions/runs/31562767146), and [run 31567253336](https://github.com/rajat2006/unshelf/actions/runs/31567253336).
[^duplication]: Representative lower seams include API [`items`](https://github.com/rajat2006/unshelf/blob/243d86e2c2d8846f205b36c793d365ab4d835d38/apps/api/test/items.test.ts), [`labels`](https://github.com/rajat2006/unshelf/blob/243d86e2c2d8846f205b36c793d365ab4d835d38/apps/api/test/labels.test.ts), [`learning plans`](https://github.com/rajat2006/unshelf/blob/243d86e2c2d8846f205b36c793d365ab4d835d38/apps/api/test/learning-plans.test.ts), [`topology`](https://github.com/rajat2006/unshelf/blob/243d86e2c2d8846f205b36c793d365ab4d835d38/apps/api/test/learning-plan.test.ts), [`stages`](https://github.com/rajat2006/unshelf/blob/243d86e2c2d8846f205b36c793d365ab4d835d38/apps/api/test/stages.test.ts), [`parts`](https://github.com/rajat2006/unshelf/blob/243d86e2c2d8846f205b36c793d365ab4d835d38/apps/api/test/parts.test.ts), and [`daily-focus`](https://github.com/rajat2006/unshelf/tree/243d86e2c2d8846f205b36c793d365ab4d835d38/apps/api/src/daily-focus) tests.
[^playwright-ci]: Playwright, [Continuous Integration](https://playwright.dev/docs/ci), recommends explicitly installing browsers and dependencies, one worker for CI stability, and uploading the HTML report in its GitHub Actions example.
[^auth-divergence]: Compare production [`main.tsx`](https://github.com/rajat2006/unshelf/blob/243d86e2c2d8846f205b36c793d365ab4d835d38/apps/web/src/main.tsx#L1-L24) and [`auth.tsx`](https://github.com/rajat2006/unshelf/blob/243d86e2c2d8846f205b36c793d365ab4d835d38/apps/web/src/auth.tsx#L1-L66) with the browser [`main.tsx`](https://github.com/rajat2006/unshelf/blob/243d86e2c2d8846f205b36c793d365ab4d835d38/apps/web/test/browser/main.tsx#L1-L67).
[^production-divergence]: Production builds with [`apps/web/Dockerfile`](https://github.com/rajat2006/unshelf/blob/243d86e2c2d8846f205b36c793d365ab4d835d38/apps/web/Dockerfile) and serves through [`Caddyfile`](https://github.com/rajat2006/unshelf/blob/243d86e2c2d8846f205b36c793d365ab4d835d38/apps/web/Caddyfile); the harness instead creates Vite middleware and rewrites `/test/browser` deep links in [`server.ts`](https://github.com/rajat2006/unshelf/blob/243d86e2c2d8846f205b36c793d365ab4d835d38/apps/web/test/browser/server.ts#L76-L125).
[^lower-tests]: Static count at the audited snapshot. The focused web tests are [`themePreference.test.ts`](https://github.com/rajat2006/unshelf/blob/243d86e2c2d8846f205b36c793d365ab4d835d38/apps/web/src/themePreference.test.ts), [`topology.test.ts`](https://github.com/rajat2006/unshelf/blob/243d86e2c2d8846f205b36c793d365ab4d835d38/apps/web/src/topology.test.ts), [`LearningPlanCanvas.test.tsx`](https://github.com/rajat2006/unshelf/blob/243d86e2c2d8846f205b36c793d365ab4d835d38/apps/web/src/learning-plan/LearningPlanCanvas.test.tsx), [`LearningPlansIndex.test.tsx`](https://github.com/rajat2006/unshelf/blob/243d86e2c2d8846f205b36c793d365ab4d835d38/apps/web/src/learning-plans/LearningPlansIndex.test.tsx), and [`StagesSection.test.tsx`](https://github.com/rajat2006/unshelf/blob/243d86e2c2d8846f205b36c793d365ab4d835d38/apps/web/src/stages/StagesSection.test.tsx).
[^playwright-isolation]: Playwright, [Isolation](https://playwright.dev/docs/browser-contexts), describes a fresh browser context per test and why clean-slate independence prevents cascading failures.
[^capture-user]: [`capture.spec.ts`](https://github.com/rajat2006/unshelf/blob/243d86e2c2d8846f205b36c793d365ab4d835d38/apps/web/test/browser/capture.spec.ts#L14-L19) defaults every case in a project to the same User unless a test overrides it.
[^playwright-auth]: Playwright, [Authentication](https://playwright.dev/docs/auth), says shared authenticated state is inappropriate when tests mutate server-side state and describes unique per-worker accounts.
[^playwright-browsers]: Playwright, [Browsers](https://playwright.dev/docs/browsers), distinguishes its version-matched Chromium from branded `chrome`, notes that branded browsers must already be available or be installed explicitly, and documents `playwright install --with-deps chromium`.
[^run-30445236704]: [Agent Review run 30445236704](https://github.com/rajat2006/unshelf/actions/runs/30445236704), especially the review-step log from 11:15 through cancellation at 11:51 UTC.
[^run-31514151409]: [Agent Implement PRD run 31514151409](https://github.com/rajat2006/unshelf/actions/runs/31514151409) recorded the full browser command at 17:56:16 UTC and 101 passes/19 skips in its final summary at 17:58:38 UTC.
[^run-31567253336]: [Agent Implement PRD run 31567253336](https://github.com/rajat2006/unshelf/actions/runs/31567253336) recorded the full browser command at 06:22:58 UTC and the 127-pass/24-skip plus isolated timing-retry result in its 06:28 summary.
[^invocation-history]: [Run 31520341082](https://github.com/rajat2006/unshelf/actions/runs/31520341082) says a broader-than-intended invocation exercised 124 cases before the corrected `exec playwright` command selected six passes/six skips. [Run 31523898670](https://github.com/rajat2006/unshelf/actions/runs/31523898670) independently records the same argument-forwarding surprise for a desktop Stage command.
[^diagnostics]: Current evidence: only `trace: "retain-on-failure"` in [`playwright.config.ts`](https://github.com/rajat2006/unshelf/blob/243d86e2c2d8846f205b36c793d365ab4d835d38/apps/web/playwright.config.ts#L9-L14); ignored outputs in [`.gitignore`](https://github.com/rajat2006/unshelf/blob/243d86e2c2d8846f205b36c793d365ab4d835d38/.gitignore#L1-L10); and no browser/report step in [`ci.yml`](https://github.com/rajat2006/unshelf/blob/243d86e2c2d8846f205b36c793d365ab4d835d38/.github/workflows/ci.yml#L21-L56).
[^playwright-fixtures]: Playwright, [Fixtures](https://playwright.dev/docs/test-fixtures), documents isolated, composable setup/teardown, worker-scoped services, fixture-specific timeouts, and automatic failure-log attachments.
[^playwright-config]: Playwright, [Configuration](https://playwright.dev/docs/test-configuration), shows CI `forbidOnly`, retries, workers, reporter, trace, web server, output directory, and separate test/expect timeouts.
[^playwright-projects]: Playwright, [Projects](https://playwright.dev/docs/test-projects), describes projects as logical groups for browsers, devices, environments, timeouts, and retries; [Annotations](https://playwright.dev/docs/test-annotations) documents tags and `--grep` selection.
[^playwright-testconfig]: Playwright, [`TestConfig`](https://playwright.dev/docs/api/class-testconfig), documents `failOnFlakyTests` and `forbidOnly`; [Continuous Integration](https://playwright.dev/docs/ci) documents report artifact upload.
