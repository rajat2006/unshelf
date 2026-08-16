# Date-picker calendar treatment prototype

Status: **awaiting human review**

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

The three treatments share one page and are linkable with `?variant=A`,
`?variant=B`, or `?variant=C`. Use the floating switcher or the Left and Right
arrow keys when focus is not inside a form control.

## Treatments

- **A — Bookplate:** compact field and centred popover; circular selection and
  restrained action row.
- **B — Reading desk:** wide, two-part popover; the selected-date context and
  actions sit beside a scan-oriented grid.
- **C — Almanac:** typographic field and popover; stronger editorial hierarchy,
  ink-block selection, and a more explanatory footer.

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

Pending a live human-in-the-loop comparison. Record the winning treatment,
borrowed details, rejected alternatives, and any accessibility blockers here
before resolving the ticket.
