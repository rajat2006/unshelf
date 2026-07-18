# Theme-direction prototype — Unshelf issue #55 (THROWAWAY)

A `/prototype` (UI branch) moodboard answering issue **#55 — "Theme direction:
personality, palette, type, spacing, light/dark"**, a `wayfinder:prototype` child
of the [web-redesign map #53](https://github.com/rajat2006/unshelf/issues/53).

**This is throwaway.** It is not wired to the backend, has no tests, and mocks all
data. It lives on the `worktree-issue-55-theme-prototype` branch as the captured
primary source — the *decision* it settles is what gets folded into the real app
later (by a separate build effort), not this code. Do not merge to `main`.

## Run it

```bash
pnpm --filter @unshelf/web dev
# then open http://localhost:5173/prototype-theme.html
```

A dedicated Vite entry (`apps/web/prototype-theme.html` → `src/prototype/main.tsx`)
that mounts `<ThemePrototype>` standalone — no Clerk, no `/api`, no router (there
isn't one yet; that's #58). The real app entry (`index.html` → `main.tsx`) is
untouched.

## What it shows

Three **radically different** directions, switchable via the floating bottom bar,
`?variant=A|B|C` in the URL, or the `←`/`→` arrow keys. Each direction has its own
light/dark toggle. Every direction renders the *real* app content — the Add-item
form, the All list (with Status, Target date, a "Past target" row, Sources), Stops,
and a Trail slice using the actual `ProgressRing` component — so the theme is judged
against real density, not in a vacuum.

| Dir | Name | Personality | Signature |
| --- | ---- | ----------- | --------- |
| **A** | Reading Room | bookish, warm, calm | paper + claret; literary **serif** headings over humanist sans; roomy book-margins. Light-led, warm "night reading" dark. |
| **B** | Field Guide | map-like, wayfinding | promotes the **Trail's own** survey-chart palette (ADR-0010: parchment/pine/ochre) to the whole app; **signage** headings + a **mono** for waypoint labels; blaze-amber accent. |
| **C** | Quiet Focus | modern, minimal | cool neutral **grotesque**, one indigo accent, tight 4px grid; **dark-first**. Cheapest to ship (can stay on the system stack, no webfont). |

Type is shown via robust **system font stacks**; the "ship candidate" faces named
on each board (Newsreader / Archivo / Inter, etc.) are the actual recommendation
and imply a webfont cost noted per direction. Colours are the real proposed tokens.

## Once a direction is chosen

Record the pick + rationale on issue #55, close it, and add the context pointer to
map #53's "Decisions so far". Applying the tokens to the real (currently
inline-styled, `system-ui`, no-token) app is a downstream build task, not this
prototype.
