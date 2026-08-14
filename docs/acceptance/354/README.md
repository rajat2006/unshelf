# Whole-interface acceptance record

Issue: [#354](https://github.com/rajat2006/unshelf/issues/354)

PRD: [#342](https://github.com/rajat2006/unshelf/issues/342)

Reviewed: 2026-08-14

This is the tool-independent acceptance record for the warm-editorial production
rewrite. It records observations and finding dispositions; it is not a second
styling specification. Current values and component APIs remain owned by
`apps/web/components.json` and the production sources it identifies.

## Outcome

- [x] Every agent-observable material finding is resolved.
- [x] The production application is ready for final human visual approval.
- [ ] Final human visual approval is granted. This is the remaining gate before
      the integration branch can merge atomically and #342 can close.

## Review method and fixtures

- [x] Reviewed the real routed React application behind its application-auth
      boundary, using the repository's local API/database fixture to create
      populated User-owned data without external accounts.
- [x] Reviewed every route, persistent panel, and overlay below at 390, 768, and
      1440 CSS pixels in resolved Light and Dark: 66 full-page observations.
- [x] Asserted `documentElement.scrollWidth <= clientWidth` during every review.
- [x] Exercised mutations through current accessible controls rather than treating
      screenshots or implementation markup as workflow evidence.
- [x] Used focused axe, reduced-motion, focus, and overflow checks as supporting
      evidence. The historical Playwright suite is not the acceptance authority.

Generated screenshots are not retained in the repository. The production source
and executable checks remain the current authority; this document records the
historical review method and finding dispositions only.

## Route, panel, and overlay matrix

Each checked cell is one populated steady-state observation in the named resolved
appearance. Authentication and recovery states use their naturally sparse
content. Learning Plan observations include its persistent Library drawer and
Today sidecar.

| Surface | 390 L | 390 D | 768 L | 768 D | 1440 L | 1440 D |
| --- | --- | --- | --- | --- | --- | --- |
| Authentication loading | [x] | [x] | [x] | [x] | [x] | [x] |
| Sign-in | [x] | [x] | [x] | [x] | [x] | [x] |
| Today | [x] | [x] | [x] | [x] | [x] | [x] |
| Historical Daily Focus | [x] | [x] | [x] | [x] | [x] | [x] |
| Library | [x] | [x] | [x] | [x] | [x] | [x] |
| Plans | [x] | [x] | [x] | [x] | [x] | [x] |
| Learning Plan, Library drawer, Today sidecar, topology | [x] | [x] | [x] | [x] | [x] | [x] |
| Stage detail and intake | [x] | [x] | [x] | [x] | [x] | [x] |
| Canonical Item detail | [x] | [x] | [x] | [x] | [x] | [x] |
| Capture overlay | [x] | [x] | [x] | [x] | [x] | [x] |
| Not-found recovery | [x] | [x] | [x] | [x] | [x] | [x] |

Shell coverage in those frames also confirms the wordmark, global Capture,
Today, disabled Discover with “Coming later,” Library, Plans, current-room cue,
and theme control. `/` redirects to Today, and not-found recovery returns there.

## Preference resolution

- [x] With no stored preference and an operating-system Dark preference, the
      application resolves to Light.
- [x] Explicit Dark persists through reload.
- [x] System persists as the selected preference and resolves to Dark while the
      operating system is Dark.
- [x] Changing the operating system to Light while System is selected updates the
      resolved appearance to Light; System never creates a third theme.

## Distinct presentation states

Shared components are checked once where their presentation and behavior are the
same across rooms.

- [x] Loading — authentication placeholder plus layout-preserving Library,
      Today, Learning Plan, Stage, and Item skeletons.
- [x] Empty — Today, Library, Plans, plan topology, Stage intake, Parts, Labels,
      and placement states retain explanation and the relevant next action.
- [x] Error — Capture, Library, Today, Learning Plan canvas, plan sidecar, Stage,
      and Item failures remain local and recoverable without replacing the shell.
- [x] Invalid — Capture exposes adjacent Title/Type explanation, preserves entered
      values, and moves focus to the first invalid field.
- [x] Disabled — Discover states “Coming later”; unavailable fields/actions remain
      readable and named; submitting controls prevent duplicates without resizing.
- [x] Archived — archived Learning Plans are visibly read-only, preserve live
      progress, allow daily consultation, and restore to the active collection.
- [x] Phone read-only — Learning Plan and Stage structure remains consultable while
      topology, placement, Stage mutation, and destructive authoring controls are
      absent.
- [x] Status variants — not started, in progress, done, and quiet past-target cues
      retain text/icon/shape rather than depending on color.

## Preserved User workflows

- [x] Capture creates an uncommitted Item, returns to the originating room, and
      makes it retrievable in Library.
- [x] Library search/filtering retrieves recognizable facts; canonical Item detail
      updates shared Status and Target date and survives navigation.
- [x] Today planning adds Items from search and plan context, changes Status,
      removes current selections, and preserves frozen Daily Focus history with
      explicit reconsideration.
- [x] Learning Plan lifecycle creates, renames, archives, reads, restores, and
      retains derived progress.
- [x] Stage intake moves a Library Item into the Stage while preserving the shared
      Item; ordering and Stage removal keep their existing domain behavior.
- [x] Plan placement adds/removes direct Items without removing them from Library.
- [x] Topology authoring creates, sequences, forks, rejoins, disconnects, and
      persists mixed Plan Nodes through keyboard-operable controls.
- [x] Phone consultation exposes current structure, Item facts, Status/daily
      actions, and the internally pannable canvas without authoring controls.

## Responsive and accessibility review

- [x] No reviewed route has page-level horizontal scrolling.
- [x] Content wraps or stacks without dropping below the production type floors.
- [x] Phone actions do not depend on hover and touch actions use the catalogue's
      touch sizing. The compact navigation rail and topology canvas are the only
      reviewed horizontal internal scrolling regions, both necessary to preserve
      their behavior at phone width.
- [x] Persistent labels and meaningful accessible names cover fields, navigation,
      dialogs, panels, progress, Status, and icon-only actions.
- [x] Tab order is logical and focus-visible styling is present on operable
      controls. Current/selected/disabled/archived states have non-color cues.
- [x] Capture traps focus, closes with Escape, and returns focus to its trigger.
- [x] Keyboard operation covers navigation, Capture, selects, Item actions, Stage
      intake, placement, and topology authoring.
- [x] The focused axe pass reports no violations on representative shipped rooms,
      completed content, Capture, canonical Item detail, and Stage detail.
- [x] Reduced motion removes nonessential Learning Plan progress transitions.

## Findings and disposition

| Finding | Materiality | Disposition |
| --- | --- | --- |
| The canonical Item Status menu used item-aligned portal positioning; from Item detail its options could render below the viewport and could not be clicked. | Material | Resolved by using collision-aware popper positioning at the shared Item Status seam. The canonical cold-link test now requires the menu option to intersect the viewport and passes at desktop and phone widths. |
| Historical browser specifications still contain selectors for superseded native selects and segmented Status buttons. | Non-gating test debt | Not used as acceptance authority, as required by #354. Focused acceptance cases for theme resolution and canonical Item Status were updated to current public control semantics; production behavior is covered by the matrix, current-control workflow pass, focused browser checks, and Vitest. |
| Production JavaScript remains above the bundler's advisory 500 kB chunk warning. | Non-gating visibility | Recorded below. The architecture explicitly accepts nontrivial bundle weight, and #354 introduces no numeric budget. No runtime or acceptance failure was observed. |

No unresolved material agent-observable finding remains.

## Bundle visibility

Production Vite output, compared with the human-accepted #322 isolated prototype:

| Asset | Accepted prototype | Production | Change |
| --- | ---: | ---: | ---: |
| CSS | 49.90 kB | 56.55 kB | +6.65 kB (+13.3%) |
| CSS gzip | 9.47 kB | 10.81 kB | +1.34 kB (+14.2%) |
| JavaScript | 410.23 kB | 567.08 kB | +156.85 kB (+38.2%) |
| JavaScript gzip | 129.05 kB | 168.49 kB | +39.44 kB (+30.6%) |

These figures are visibility evidence, not a new budget. The prototype was an
isolated validation slice; production includes the complete routed application.

## Validation ledger

- [x] Production build: `turbo run build`
- [x] Focused current-control mutation pass: Capture, retrieval, Item update,
      archive, restore
- [x] Focused route/workflow browser checks: 12 passed, 4 intentional
      viewport-capability skips
- [x] Focused accessibility/motion/overflow checks: 6 passed, 4 intentional
      viewport-capability skips
- [x] Canonical Item Status viewport regression: desktop and phone
- [x] Light/Dark/System resolution and persistence at the running-app seam
- [x] Repository typecheck: `turbo run typecheck`
- [x] Repository tests: `turbo run test`
- [x] Product lint: `pnpm run lint`
- [x] Changed-file formatting: `pnpm exec prettier --check <changed files>`

The repository-wide formatting check also reports five unchanged API files:
`diagnostics.ts`, `labels/router.ts`, `process-failures.ts`, `stages/router.ts`,
and `test/validation.test.ts`. They are outside #354 and were left untouched.
