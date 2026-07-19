# The visual theme is Direction C "Quiet Focus", shipped through a CSS-custom-property token layer

The web-UI redesign (wayfinder map #53) picked a visual direction for `apps/web`,
and the direction chosen is the hard-to-reverse half: every restyled component will
be built against it, so it is recorded here alongside the token mechanism it
requires. The direction was chosen from a throwaway prototype app (entry
`apps/web/prototype-theme.html` → `apps/web/src/prototype/ThemePrototype.tsx`
on `worktree-issue-55-theme-prototype`, three directions rendered) and settled on
issue #55; this ADR records the load-bearing outcome, not the exploration.

The theme is **Direction C · Quiet Focus** — calm, modern, minimal, making Unshelf's
"enable, don't automate" promise *visual*. Deliberately **not** bookish and **not**
map-themed.

- **Palette.** Cool near-neutral greyscale + a single **indigo** accent (light
  `#4B57C4`, dark `#7C88FF`). **Green** signals *done*; **quiet-slate** signals the
  derived *past target* state (ADR-0005) — **never red**. The soft, never-nagging
  character of a Target date (glossary) reaches the UI here: nothing overdue turns
  alarm-red.
- **Type.** One modern **grotesque** for everything. Ship candidate **Inter**, or
  the native `system-ui` stack for **zero webfont cost** — the cheapest option and a
  live choice at build time.
- **Spacing & shape.** A **4px** spacing grid (4 / 8 / 12 / 16 / 24 / 40); radii
  6 / 8 / 10.

**Light and dark are peers.** Both are first-class and ship together — dark is not a
later add-on. They are expressed through a **CSS-custom-property token layer**:
surface, text, accent, and state colours are named tokens, and switching light↔dark
redefines roughly ten of them. This token layer **replaces today's inline
`style={}`** (the current `apps/web` styling approach) and is therefore a **build
prerequisite for any theming** — no component can honour Quiet Focus, or flip to
dark, until it reads tokens instead of literals.

## Considered options

- **Directions A and B** (the other two prototype directions — bookish / warmer and
  map-themed). Rejected on #55: they dramatise the metaphor, working against the calm
  "organise once" promise Quiet Focus expresses plainly.
- **Light-only, dark later.** Rejected: retrofitting dark onto literal colours is the
  exact cost the token layer removes; making the two peers from the start is nearly
  free once tokens exist and avoids a second pass.
- **A formal design-token / component system** as a deliverable. Rejected as **out
  of scope** for this map — the effort ships a rough prototype + spec, not a design
  system. The token layer here is the minimum needed to theme and to support dark,
  not a component library.
- **Keep inline `style={}`.** Rejected: it cannot express a themeable palette or a
  light/dark flip without duplicating every literal, and it is what the redesign is
  moving away from.

## Consequences

- **`apps/web` gains a token layer** (CSS custom properties) as the styling
  foundation; restyling any surface to Quiet Focus depends on it. This is a build
  task, downstream of this spec (#74), not done here.
- **Every colour decision routes through a token**, so the light/dark peers and the
  "never red for past-target" rule are enforced in one place, not per component.
- **The font is a build-time pick** between Inter and `system-ui`; both satisfy the
  "one grotesque" rule, and `system-ui` keeps webfont cost at zero.
- **The Trail canvas is reskinned to these tokens** — see ADR-0010, updated by this
  effort: the warm survey-chart skin drops in favour of the cool-neutral surface.
- **Full spec:** `docs/ui-design-spec.md` §1. Chosen from the throwaway theme
  prototype (`apps/web/prototype-theme.html` →
  `apps/web/src/prototype/ThemePrototype.tsx`, `worktree-issue-55-theme-prototype`),
  never merged.
