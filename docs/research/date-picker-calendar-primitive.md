# Accessible calendar primitive for Unshelf's reusable date picker

Research date: 2026-08-16

**Verdict:** accepted — wrap React DayPicker v10 through a repository-owned
shadcn `Calendar`, composed with the local Radix `Popover`, `Select`, `Input`,
and `Button` controls. Keep React DayPicker's `Date` values private to that
wrapper; the reusable picker and both feature consumers exchange only validated
proleptic-Gregorian `YYYY-MM-DD` strings (or `null` where clearing is allowed).

This memo resolves
[Choose the accessible calendar primitive for Unshelf's reusable date picker](https://github.com/rajat2006/unshelf/issues/416)
for
[Wayfinder: specify a themed reusable date picker](https://github.com/rajat2006/unshelf/issues/414).
It selects a primitive and records constraints for the visual prototype and the
later component contract. It does not specify or implement the production UI.

## Question

Which mature accessible calendar primitive best fits Unshelf's React 19,
Tailwind CSS v4, repository-owned shadcn/Radix architecture while supporting a
keyboard-operated single-date grid, direct month/year navigation, localized
typed entry, timezone-free calendar-date values, complete Light/Dark styling,
reasonable dependency cost, and a native mobile fallback?

## Repository constraints

- Unshelf uses React 19 and Tailwind CSS v4. Its generic complex interactions
  come from repository-owned shadcn components with the Radix base; importing a
  second primitive family directly would contradict the ownership boundary in
  [ADR-0019](../adr/0019-tailwind-shadcn-visual-architecture.md) and the
  [Frontend and UI standard](../../.agents/skills/coding-standards/frontend-and-ui.md).
- `apps/web/components.json` selects the `radix-nova` shadcn style and maps
  catalogue controls to `@/components/ui`.
- Target date and Daily Focus paths share a real proleptic-Gregorian date schema
  (`YYYY-MM-DD`, years `0001` through `9999`). Target date is an optional, soft,
  passive Item property, not an instant or deadline
  ([ADR-0005](../adr/0005-soft-target-and-completion-dates-on-the-item.md)).
- Desktop gets the custom calendar. Mobile retains a native date input and must
  not regress, consistent with the desktop-primary scope in
  [ADR-0008](../adr/0008-single-responsive-web-app-desktop-primary.md).

## Candidate screen

Radix has accessible Popover, Select, and Dialog primitives, but no calendar-grid
primitive in its component catalogue.[^radix-components] The two credible
calendar implementations were therefore React DayPicker and React Aria
Components:

| Criterion | React DayPicker 10.0.1 | React Aria Components 1.20.0 |
| --- | --- | --- |
| React 19 | Package peer range is React `>=16.8.0`, so React 19 is admitted.[^rdp-package] | Peer range explicitly admits React 19; the project also shipped React 19 ref-cleanup support in 2025.[^rac-package][^rac-react19] |
| Existing architecture | Exact calendar used by shadcn's Radix `Calendar`; current registry source already maps DayPicker parts to semantic Tailwind classes and the local `Button` API.[^shadcn-calendar][^shadcn-calendar-source] | Unstyled and Tailwind-compatible, but its DatePicker also brings React Aria's own field, popover, dialog, calendar, focus, and state composition—a second generic interaction family beside Radix.[^rac-rfc] |
| Grid accessibility | Declares APG alignment, manages the focused day, and implements arrows, Home/End, Page Up/Down, and Shift-modified month/year movement in released source and tests.[^rdp-accessibility][^rdp-focus][^rdp-keys][^rdp-key-tests] | Strong APG, screen-reader, keyboard, localization, and adaptive interaction support across an integrated DatePicker.[^rac-readme][^rac-datepicker] |
| Month/year navigation | Previous/next controls plus `captionLayout="dropdown"`; `navLayout` can preserve visual/tab order. Explicit `startMonth` and `endMonth` are required for a deliberate year range.[^rdp-navigation] | Current releases include `CalendarMonthPicker` and `CalendarYearPicker`.[^rac-month-year] |
| Typed localized entry | Intentionally not built in. The owner documents that the wrapper must synchronize input text, parsed selection, visible month, validation, and overlay behavior.[^rdp-input] | Integrated segmented DateField uses the user's locale and `CalendarDate` values.[^rac-datepicker][^rac-calendar-date] |
| Date-only semantics | Calendar works in native `Date` objects, so Unshelf must supply a safe date-only adapter and prevent `Date` from crossing the component boundary.[^rdp-timezone] | `CalendarDate` natively represents a date without time or time zone and serializes to ISO 8601.[^rac-calendar-date] |
| Styling | Every part can receive classes or a custom component. The released guidance explicitly warns custom components to forward `aria-*`, `tabIndex`, refs, and handlers.[^rdp-custom] | Every part is styleable through classes/render props, but Unshelf would need to create and maintain an additional catalogue implementation.[^rac-rfc] |
| Published package footprint | `react-day-picker`: 987,344 unpacked bytes, 818 files; runtime dependencies are `date-fns` and `@date-fns/tz`.[^npm-rdp][^rdp-package] | `react-aria-components`: 6,418,565 unpacked bytes, 1,416 files and direct dependencies on the React Aria/Stately aggregators plus internationalization packages.[^npm-rac][^rac-package] |
| Maintenance and licence | Latest 10.0.1 release published 2026-05-15; MIT.[^rdp-release][^rdp-license] | Latest 1.20.0 release published 2026-07-31; Apache-2.0.[^rac-release][^rac-license] |

The package footprints are installation artefact sizes, **not browser bundle
measurements**. Both candidates are tree-shakeable and both pull transitive
code, so production weight must be measured from the final composition. The
figures are useful only as a maintenance/dependency proxy. Neither licence is a
blocker.

## Decision

Choose **React DayPicker v10**.

It is the only candidate that satisfies the calendar behavior without creating
a second application-wide primitive architecture. shadcn already treats a date
picker as a composition of its local `Popover` and `Calendar`, and its Radix
`Calendar` is built on React DayPicker.[^shadcn-date-picker] This follows the
repository's discover → reuse → extend rule: add the local shadcn Calendar and
Popover, then put Unshelf's date-only value and typed-entry behavior in one
repository-owned composite.

Use the `react-day-picker` package/import emitted by the current shadcn Radix
registry and pin major v10 in `apps/web/package.json`; the lockfile supplies the
exact release. DayPicker v10 recommends `@daypicker/react` for new direct uses,
while retaining `react-day-picker` as a compatibility package.[^rdp-upgrade]
Following the registry spelling avoids an immediate local fork for no behavioral
gain. Only `@/components/ui/calendar` may import it, so a later registry/package
rename stays a one-module change.

Add `date-fns` as an explicit web dependency because Unshelf's input adapter will
use it directly. Do not rely on DayPicker's transitive dependency.

React Aria Components is **rejected for this map**, not rejected as an
accessibility implementation. It has the cleaner integrated localized DateField
and date-only `CalendarDate` model. Those benefits do not outweigh a parallel
popover/focus/component system when DayPicker supplies the missing grid inside
the already-selected shadcn/Radix architecture. Using only React Aria's lower
level hooks would instead make Unshelf author the calendar DOM and behavior—the
hand-built outcome this map explicitly excludes. Reconsider React Aria only if
the interactive prototype finds a concrete, unfixable accessibility failure in
the DayPicker + Radix composition.

## Constraints for the prototype and component contract

### 1. Separate the three ownership layers

The implementation should have three discoverable layers:

1. `@/components/ui/calendar` owns the local shadcn styling and the DayPicker
   adapter. It exposes calendar behavior, not Unshelf API calls.
2. One reusable date-picker field owns text entry, parsing, validation, the
   Radix Popover, responsive native fallback, focus, and conversion between
   `YYYY-MM-DD` and DayPicker's private `Date`.
3. Feature consumers own meaning and commitment. Item Target date commits a
   valid selection immediately and supplies Today/Clear plus its save/retry
   state. Daily Focus stages a valid date until the User activates “View date”.

Do not put Target date, Daily Focus, API, navigation, or async-save knowledge in
the generic control.

### 2. Treat `YYYY-MM-DD` as the only public value

The field's controlled value must be a validated `YYYY-MM-DD` string; clearing
uses `null` only where the consumer permits it. Do not expose native `Date`, UTC
timestamps, or `CalendarDate` in the public props.

ECMAScript interprets a bare `YYYY-MM-DD` passed to `Date.parse` or the string
`Date` constructor as UTC, while a date-time without an offset is local.[^ecma-date]
Consequently:

- never use `new Date(value)`, `Date.parse(value)`, `toISOString()`, or UTC
  getters to bridge the field and DayPicker;
- parse the three numeric fields, validate them against the shared date schema,
  and construct DayPicker's local calendar `Date` explicitly (including
  `setFullYear` so years `0001`–`0099` are not remapped to 1901–1999);
- serialize DayPicker selections from local calendar fields, padding them back
  to `YYYY-MM-DD`; and
- unit-test the adapter under widely separated time zones and across DST dates,
  leap days, invalid dates, and years below 100.

DayPicker defaults to the browser's local zone and also offers explicit timezone
support, but a timezone prop does not turn an instant-bearing `Date` into
Unshelf's date-only domain value.[^rdp-timezone]

### 3. Own localized typing explicitly

DayPicker does not provide an input binding. The field must maintain draft text
separately from its last valid controlled value and synchronize four things:
draft text, parsed value, selected day, and visible month.[^rdp-input]

The specification must define one locale adapter used by both formatting and
parsing. `Intl.DateTimeFormat` formats but does not parse, so “browser-localized”
cannot mean passing arbitrary strings to `Date.parse`. A viable implementation
is a supported `date-fns` locale with its localized short-date pattern, selected
from `navigator.languages` with a documented fallback. The prototype must show
the actual format hint/placeholder and error message.

Partial or invalid text remains visible, sets `aria-invalid`, and produces an
associated error description; it must not emit `onValueChange`. The later
contract must decide the exact commit events (for example Enter and blur) so
typing a partial date cannot trigger Target date saves.

### 4. Theme the *opened* month/year controls too

Use a one-month DayPicker with previous/next navigation and direct month/year
selection. Set `captionLayout="dropdown"` and an explicit accessible
`navLayout`; never inherit the legacy layout whose tab order can differ from the
visual order.[^rdp-navigation]

The upstream shadcn Calendar visually overlays DayPicker's native `<select>`
elements. Their opened menus remain browser/OS UI—the same class of theme break
this effort is fixing.[^shadcn-calendar-source] The prototype should therefore
replace DayPicker's `Dropdown` slot with Unshelf's local Radix `Select`, forwarding
the provided value, options, `aria-label`, disabled state, and change semantics.
DayPicker's customization guidance expressly supports design-system dropdowns
but requires those accessibility props and handlers to survive.[^rdp-custom]

Prototype and keyboard-test the portalled Radix Select inside the portalled
Radix Popover: choosing a month/year must not dismiss the outer picker, strand
focus, or make Escape order ambiguous.

The direct-year control needs an explicit range. DayPicker defaults dropdowns to
roughly the previous 100 years through the current year, which is wrong for
future Target dates and narrower than the API contract.[^rdp-navigation] The
later specification must choose a practical range that always expands to include
the controlled value. Typing may remain the escape hatch for valid years outside
that navigation range; do not render thousands of Select options.

### 5. Preserve the primitive's grid behavior

Use DayPicker's single-selection mode and default DayButton behavior. Prefer
class mappings and composition over replacing structural/grid components. If a
custom component is unavoidable, forward every received prop, ref, ARIA
attribute, tabindex, and event handler.[^rdp-custom]

Required keyboard behavior follows the APG date picker grid: one day in the Tab
sequence; arrows move by day/week; Home/End move to week edges; Page Up/Down move
by month; Shift + Page Up/Down move by year; Enter/Space selects; Escape closes
the containing popover and returns focus to its trigger.[^apg-date-picker]
DayPicker implements the grid movements, and Radix Popover implements dismissal
and trigger focus return.[^rdp-keys][^radix-popover]

On open, focus the selected day, otherwise today, otherwise the first focusable
day in range. Coordinate Radix's open autofocus with DayPicker's `autoFocus`
rather than letting two focus managers race. On close after selection, dismissal,
Today, or Clear, return focus predictably to the text field or calendar trigger
chosen by the final field design.

The prototype is not accepted on axe results alone. Verify the full keyboard
sequence, accessible names for the field/trigger/month/year/day controls, live
announcement when the visible month changes, focus return, high-contrast focus
visibility, Light/Dark contrast, 200% zoom, and a screen-reader smoke test.

### 6. Keep motion and styling repository-owned

Use semantic theme utilities from `globals.css`; do not import DayPicker's stock
stylesheet or introduce parallel calendar color variables. Style selected,
today, outside-month, disabled, hover, and focused states independently in both
Light and Dark. A selected day must remain distinguishable from today without
color alone.

Month animation is opt-in in DayPicker. Leave it off unless the selected
prototype needs it; if enabled, provide `motion-reduce` behavior and test focus
during rapid navigation.[^rdp-start]

### 7. Preserve the native mobile path through the same value seam

The reusable field—not either consumer—chooses the desktop composite or native
`<input type="date">` at the agreed responsive boundary. Both variants use the
same controlled `YYYY-MM-DD` value and emit the same valid value events, so
switching width cannot change the date or feature semantics.

Do not render a custom DayPicker dialog/tray on mobile in this effort. Avoid two
simultaneously focusable inputs or duplicate IDs if both responsive variants are
mounted for CSS switching. Browser tests must cover one phone-width Target date
set/clear path and one phone-width Daily Focus history submission.

## Implementation validation prompted by this decision

The final implementation-ready specification should require:

- focused unit tests for the pure ISO/local-Date adapter and localized draft
  parser;
- component tests for valid, partial, invalid, clear, Today, controlled-value
  replacement, and both consumer commit modes;
- keyboard tests for the DayPicker grid and nested month/year Selects;
- axe plus Light/Dark visual checks for the open popover and error/save states;
- Playwright coverage for Item Target date immediate save/failure retry, Daily
  Focus manual “View date”, focus restoration, and the two mobile native flows;
  and
- a production-build comparison after adding the dependency, recording the
  actual route/application bundle delta rather than treating npm package size as
  browser cost.

No additional Wayfinder ticket is required from this research. The open visual
prototype can settle the dropdown treatment and focus composition; the open
contract ticket can settle localized commit behavior and the year range.

## Sources

[^radix-components]: Radix UI, [Primitives component catalogue](https://www.radix-ui.com/primitives/docs/components).
[^radix-popover]: Radix UI, [Popover features, focus, and keyboard interactions](https://www.radix-ui.com/primitives/docs/components/popover).
[^shadcn-calendar]: shadcn/ui, [Radix Calendar documentation](https://ui.shadcn.com/docs/components/radix/calendar).
[^shadcn-calendar-source]: shadcn/ui, [`radix` Calendar registry source at commit `d4fc45b`](https://github.com/shadcn-ui/ui/blob/d4fc45b1fbabfccb7a6a4333d8004cf19481caa9/apps/v4/registry/bases/radix/ui/calendar.tsx).
[^shadcn-date-picker]: shadcn/ui, [Radix Date Picker composition](https://ui.shadcn.com/docs/components/radix/date-picker).
[^rdp-package]: React DayPicker, [`react-day-picker` 10.0.1 package manifest](https://github.com/gpbl/react-day-picker/blob/v10.0.1/packages/react-day-picker/package.json).
[^rdp-release]: React DayPicker, [10.0.1 release](https://github.com/gpbl/react-day-picker/releases/tag/v10.0.1).
[^rdp-license]: React DayPicker, [MIT licence at 10.0.1](https://github.com/gpbl/react-day-picker/blob/v10.0.1/LICENSE).
[^rdp-upgrade]: React DayPicker, [v10 package-name guidance](https://daypicker.dev/upgrading).
[^rdp-start]: React DayPicker, [v10 getting started and opt-in animation](https://daypicker.dev/start).
[^rdp-accessibility]: React DayPicker, [accessible date picker guidance](https://daypicker.dev/guides/accessibility).
[^rdp-focus]: React DayPicker, [`useFocus` and focus-target implementation at 10.0.1](https://github.com/gpbl/react-day-picker/blob/v10.0.1/packages/react-day-picker/src/useFocus.ts).
[^rdp-keys]: React DayPicker, [released DayPicker key handler at 10.0.1](https://github.com/gpbl/react-day-picker/blob/v10.0.1/packages/react-day-picker/src/DayPicker.tsx).
[^rdp-key-tests]: React DayPicker, [released keyboard interaction tests at 10.0.1](https://github.com/gpbl/react-day-picker/blob/v10.0.1/examples/Keyboard.test.tsx).
[^rdp-navigation]: React DayPicker, [caption and navigation layouts](https://daypicker.dev/docs/caption-and-nav-layouts).
[^rdp-input]: React DayPicker, [input-field integration guide](https://daypicker.dev/guides/input-fields).
[^rdp-custom]: React DayPicker, [custom-component accessibility contract](https://daypicker.dev/guides/custom-components).
[^rdp-timezone]: React DayPicker, [timezone behavior](https://daypicker.dev/localization/setting-time-zone).
[^npm-rdp]: npm registry, [`react-day-picker` 10.0.1 package metadata](https://www.npmjs.com/package/react-day-picker/v/10.0.1).
[^rac-package]: Adobe React Spectrum, [`react-aria-components` 1.20.0 package manifest](https://github.com/adobe/react-spectrum/blob/react-aria-components%401.20.0/packages/react-aria-components/package.json).
[^rac-release]: Adobe React Spectrum, [`react-aria-components` 1.20.0 release](https://github.com/adobe/react-spectrum/releases/tag/react-aria-components%401.20.0).
[^rac-month-year]: Adobe React Spectrum, [`CalendarMonthPicker` and `CalendarYearPicker` introduction in 1.18.0](https://github.com/adobe/react-spectrum/releases/tag/react-aria-components%401.18.0).
[^rac-license]: Adobe React Spectrum, [Apache-2.0 licence at the 1.20.0 tag](https://github.com/adobe/react-spectrum/blob/react-aria-components%401.20.0/LICENSE).
[^rac-react19]: Adobe React Spectrum, [May 2025 React 19 compatibility release notes](https://react-spectrum.adobe.com/v3/releases/2025-05-19.html).
[^rac-readme]: Adobe React Spectrum, [React Spectrum libraries and accessibility guarantees](https://github.com/adobe/react-spectrum).
[^rac-rfc]: Adobe React Spectrum, [React Aria Components architecture RFC](https://github.com/adobe/react-spectrum/blob/main/rfcs/2023-react-aria-components.md).
[^rac-datepicker]: Adobe React Spectrum, [DatePicker behavior, localization, and value model](https://react-spectrum.adobe.com/DatePicker).
[^rac-calendar-date]: Adobe React Spectrum, [date-only `CalendarDate` model](https://react-spectrum.adobe.com/v3/DatePicker.html#value).
[^npm-rac]: npm registry, [`react-aria-components` 1.20.0 package metadata](https://www.npmjs.com/package/react-aria-components/v/1.20.0).
[^ecma-date]: Ecma International, [ECMAScript Date Time String Format and `Date.parse`](https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-date.parse).
[^apg-date-picker]: W3C WAI-ARIA Authoring Practices, [Date Picker Dialog Example](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/examples/datepicker-dialog/).
