# Date-picker calendar treatment prototype

Status: **accepted — B, Separate tiles**

This throwaway prototype supports
[Choose the warm-editorial desktop calendar treatment](https://github.com/rajat2006/unshelf/issues/417)
within
[Wayfinder: specify a themed reusable date picker](https://github.com/rajat2006/unshelf/issues/414).
It answers which interactive treatment Unshelf should carry into the final
implementation specification; it does not implement the production picker.

## Run it

From the repository root:

```sh
pnpm --filter @unshelf/web prototype:calendar-treatment
```

The five treatments share one page and are linkable with `?variant=A` through
`?variant=E`. Use the floating switcher or the Left and Right arrow keys when
focus is not inside a form control.

## Treatments

- **A — Ink circle:** the selected Bookplate direction with circular selection.
- **B — Separate tiles:** individually boxed dates with small gutters.
- **C — Ledger grid:** a continuous hairline table around every date.
- **D — Editorial underline:** no enclosing selector; ink, weight, and an
  underline carry selection.
- **E — Soft square:** a compact rounded-square selector between A and B.

Each treatment uses React DayPicker v10 for the calendar grid and the local
Radix Select for direct month/year navigation. The prototype includes both
Target date and Daily Focus contexts, localized `DD/MM/YYYY` typing and invalid
state, Today/Clear, Light/Dark, a simulated disabled/saving state, selected,
today, keyboard-focus, and disabled specimens, plus visible current-versus-
committed values to expose the two feature semantics.

Following the first HITL review, every treatment was reduced to a compact
desktop footprint: smaller popovers, tighter internal spacing, 32px calendar
cells and navigation controls, compact field actions, and reduced display type.
The coarse-pointer theme contract still expands shared controls to touch size.

Following the second HITL review, the prototype converged on A and now compares
five A-family selection geometries. The redundant explanatory header and
selected-date badge were removed. The popover is 252px wide, with 28px desktop
calendar cells and navigation controls, a compact icon-only trigger, and no
space beyond month/year navigation, the grid, and Today/Clear.

## Review checklist

- Compare the closed field, open popover, information hierarchy, and density in
  Light and Dark.
- Type a partial or impossible date and commit it with Enter or blur.
- Open the calendar and operate the grid with arrows, Home/End, Page Up/Down,
  Shift + Page Up/Down, Enter/Space, and Escape.
- Choose a month and year from the nested Radix selects; confirm the outer
  popover stays open and focus is not stranded.
- Choose a date, use Today, use Clear, and dismiss with Escape; confirm focus
  returns predictably to the calendar trigger.
- Toggle Daily Focus and confirm a selected date remains staged until **View
  date**, while Target date updates its displayed saved value immediately.
- Inspect at 200% zoom and with reduced motion enabled.

## Verdict

**Accepted: B — Separate tiles.**

Carry the compact Bookplate structure into the implementation specification:

- A 252px desktop popover with no explanatory title, Item context, or repeated
  selected-date badge. Month/year navigation, the calendar grid, and compact
  Today/Clear actions are the complete visual hierarchy.
- Each date is a discrete square tile with a quiet hairline border and a small
  gutter. The geometry makes scanning, hover, and keyboard focus unambiguous
  without making the calendar read as a dense spreadsheet.
- Selection uses a soft accent fill, stronger primary border, and heavier text.
  Today remains a small dot, keyboard focus remains an outer ring, outside-month
  dates are muted, and disabled dates remain visibly subdued. These states must
  stay independently recognizable in Light and Dark.
- The closed field retains localized typing and an icon-only calendar trigger.
  Target date still commits immediately; Daily Focus still stages until **View
  date**. The visual decision changes neither domain semantic.
- Natural month height is preferred over forcing six weeks, avoiding empty
  calendar rows. The production implementation may adjust exact pixels only as
  accessibility testing requires; compactness and absence of redundant chrome
  are the intent to preserve.

The circular selector was rejected because separate boxes make the scan and
interaction boundary clearer at this size. The continuous ledger was too rigid
and visually dense; underline-only selection was too weak; the soft square did
not communicate the boundary of every available date as clearly as B.

No `CONTEXT.md` or ADR change is needed: this resolves a reversible visual and
interaction treatment while preserving the existing meanings of Target date and
Daily Focus.
