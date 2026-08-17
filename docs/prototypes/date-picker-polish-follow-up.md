# Date picker polish follow-up

Status: **accepted — A, Warm bookplate**

## Question

How should the reusable date picker gain enough visual character to avoid
feeling bland, while keeping a Target date subtle and calm? The follow-up also
tested whether the calendar should open from the date input itself instead of a
separate adjacent button.

## Compared treatments

- **A — Warm bookplate:** a quiet tinted field, restrained depth, a softly
  framed calendar header, and tactile separate day tiles.
- **B — Editorial ledger:** an underlined field and a low-container calendar
  structured by rules and typography.
- **C — Milestone card:** an expressive date badge, stronger colour block, and
  contextual target summary.
- **D — Warm milestone hybrid:** C's field and header hierarchy combined with
  A's separate day tiles.

Each treatment was reviewed in the resolved Light and Dark appearances. In all
four, clicking or focusing the date input opens the calendar; the embedded
calendar icon is decorative rather than a separate focus target.

## Verdict

Choose **A — Warm bookplate**. Its subtle tint, small amount of depth, and
separate day tiles make the control feel designed without making a passive
Target date visually urgent. B felt too visually busy, while C and D assigned
more emphasis than this soft planning value needs.

Carry the interaction decision into production as well: the whole desktop date
field opens the calendar. Preserve localized typing, the native mobile input,
DayPicker keyboard behavior, focus return, and existing Today/Clear actions.

## Run

```sh
pnpm --filter @unshelf/web prototype:date-picker-polish
```

Use `?variant=A&theme=light` or `?variant=A&theme=dark` for the accepted
treatment. Variants B–D remain rejected comparison evidence on this branch.
