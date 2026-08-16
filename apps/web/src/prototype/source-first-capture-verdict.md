# Source-first Capture prototype verdict

**Wayfinder ticket:** [Prototype Source-first Capture across success, partial, and failure states](https://github.com/rajat2006/unshelf/issues/402)

## Verdict

Accepted: **Variant A — Quiet inline**, with Source given the stronger visual
emphasis explored in Variant C.

The implementation should keep one stable form across inspection states:

- Source is the first and visually primary field.
- Inspection begins immediately for a valid public HTTP(S) Source.
- Progress, partial completion, failure, and Retry appear quietly inline without
  creating a separate stage.
- Suggestions populate the ordinary editable Title and Type fields and never
  overwrite User edits.
- Type remains the ordinary select control.
- **Add to Library** remains the single explicit confirmation.

Rejected: Variant B's separate inspection receipt. It duplicates information,
splits attention between inspection and confirmation, and becomes crowded at
phone width.

Rejected: Variant C's progressive composition and Type pills. They make routine
Capture feel more elaborate than the one-paste, one-confirmation goal requires.

## Scenario coverage

The preserved prototype simulates fast complete suggestions, Type-only partial
results, progress near the three-second deadline, quiet failure and Retry, User
edits during inspection, replacement by a different Source with a stale response,
and title-only/offline Capture. The simulator performs no network requests or
real Item creation.

## Running the prototype

From the repository root:

```sh
pnpm --filter @unshelf/web dev
```

Open
`http://127.0.0.1:5173/prototype-source-first-capture.html?variant=A`.
Use the bottom switcher to compare Variants A–C and the top selector to change
scenarios.
