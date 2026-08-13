# shadcn/Radix architecture validation prototype

> **Throwaway primary source for the Wayfinder ticket.** This is not production
> UI and must not be merged as the interface rewrite.

## Question

Can shadcn/ui generated with the Radix base, Tailwind CSS v4, and one semantic
CSS-variable theme implement Unshelf's real shell + Library + URL-owned Item
detail + Capture slice without losing warm-editorial fidelity, accessibility,
source clarity, or maintainability?

This is one architecture and one representative composition. It deliberately
uses URL-controlled presentation states instead of the prototype skill's usual
competing visual variants: the layout direction is already accepted, and this
ticket validates the architecture rather than choosing a design.

## Run

```bash
pnpm --filter @unshelf/web prototype:architecture
```

Open <http://127.0.0.1:5173/>. This command uses the standalone prototype
configuration: it serves fixture data at the advertised root and needs no API,
database, authentication, or environment credentials.

## State matrix

- `?state=ready|loading|empty|error` selects the recurring presentation state.
- `?theme=light|dark` selects a resolved appearance; Light is the default.
- `?capture=open` opens the Radix-backed Capture dialog over the Library.
- Selecting an Item navigates to `/items/:itemId` and opens its
  Radix-backed Sheet while preserving the Library beneath it.
- The development-only workbench cycles states with its controls or the Left
  and Right arrow keys. It does not intercept keys inside editable or composite
  controls.

Review each appearance at 390 px, 768 px, and 1440 px. Use keyboard-only input,
pointer input, a coarse pointer/touch viewport, and reduced motion.

## Ownership map

- `prototype.css` is the one theme and approved-value source. Light/Dark values,
  typography, semantic colours, radii, focus treatment, touch sizing, and
  reduced motion live there.
- `src/components/ui/**` contains generated shadcn source. Component defaults,
  sizes, and finite visual variants are changed there rather than at call sites.
- `src/components/unshelf/item-status-badge.tsx` is the sample recurring
  domain component: product meaning wraps a generic visual primitive.
- Files in this directory own the unique shell/Library/Item/Capture composition.
  They use semantic utilities and may own layout geometry, but do not introduce
  palette values or a second styling system.
- `components.json` records the Radix base, Tailwind v4 stylesheet, aliases,
  icon library, and generated component location for the CLI and future agents.

The intended agent workflow is **discover → reuse → extend**: inspect this map
and `components.json`, reuse a component and semantic value, extend the canonical
component when a need recurs, and keep one-off composition local.

## Deliberate limits

- Static fixture data keeps the prototype deterministic; it performs no API or
  persistence mutations.
- Only the validation slice is rewritten. Existing application routes and the
  production `theme.css` remain untouched.
- The exact production component catalogue, file boundaries, agent guardrails,
  and rewrite slices remain downstream Wayfinder decisions.
