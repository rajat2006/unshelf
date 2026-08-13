# Prototype evidence

This file records reproducible observations for the Wayfinder prototype ticket.
It is evidence, not the resolution; the human visual/interaction review is still
required before the ticket can close.

## Current provisional judgment

The architecture clears the machine-checkable eligibility and ownership gates.
It is **promising but not yet decided**: warm-editorial fidelity, visual parity,
interaction feel, and final accessibility require the live review at every
target width and appearance.

| Concern | Provisional evidence | Rating |
| --- | --- | --- |
| Uniformity | Button/Input/Select defaults and finite variants live in generated component files; Item Status has one domain wrapper; theme roles are shared. | Strong structurally; visual review pending |
| Warm-editorial fidelity | System UI + Georgia, warm layered surfaces, forest action/focus, leaf/ochre/slate state roles, peer Light/Dark values. | Acceptable structurally; visual review pending |
| Agent source clarity | `README.md`, `components.json`, `shadcn info`, one token file, generated primitives, one recurring domain component, and local composition boundaries are discoverable. Both fresh-agent trials found the right seams and invented no values; one also caught a product-contract conflict. Utility-heavy composition remains noisy; CLI preset metadata still reports Nova's Geist seed even though the actual token contract deliberately uses system UI. | Strong navigation; acceptable source density |
| Accessibility | Radix Dialog/Sheet/Select/Tooltip, visible focus, persistent labels, colour-plus-words, shell-preserving states, responsive/coarse-pointer target rules, and reduced-motion rules are present. | Acceptable by inspection; browser/axe review pending |
| Customization cost | Unshelf values fit in one 155-line contract. Ten generated primitives total 755 lines; the representative composition totals 1,421 TypeScript/CSS lines and contains 111 `className` sites. No raw colours, `dark:` colour overrides, or `!important` appear in TSX. | Acceptable, with material utility-source density |
| Generated/runtime weight | Tailwind compiles to CSS with no browser runtime. The isolated full slice is 49.90 kB CSS / 9.47 kB gzip and 410.23 kB JS / 129.05 kB gzip. See attribution below. | Acceptable, not light |
| Maintenance ergonomics | Current `shadcn add --diff` shows meaningful Unshelf changes concentrated in Button; Dialog is formatting-only and Sheet differs only by the generated client directive. Updates remain legible but are overwrite-and-reconcile operations. | Acceptable |

## Reproducible build evidence

The following all pass on the prototype branch:

```text
pnpm --filter @unshelf/web typecheck
pnpm --filter @unshelf/web lint
pnpm --filter @unshelf/web build
pnpm --filter @unshelf/web prototype:architecture:build
```

The local runner used Node 23.10.0 and emitted the repository's expected engine
warning because the repository declares Node 24 or newer. No validation failure
resulted from the warning.

The prototype-only production build emits:

```text
CSS  49.90 kB raw / 9.47 kB gzip
JS  410.23 kB raw / 129.05 kB gzip
```

Standalone tree-shaken minified estimates (React externalized where relevant):

```text
CVA                         1,018 B raw /   551 B gzip
clsx                          379 B raw /   240 B gzip
tailwind-merge             27,012 B raw / 8,464 B gzip
exercised Radix subset    105,197 B raw / 35,338 B gzip
exercised Lucide subset     7,541 B raw / 2,823 B gzip
Tailwind browser runtime        0 B
```

These standalone figures are attribution aids, not additive totals: the Vite
bundle deduplicates shared code and also contains React, React Router, prototype
logic, and data.

## Rendered class evidence

A server render of the populated ready state contains:

```text
126 elements with class attributes
25,394 total class-attribute characters
202 mean characters per class-bearing element
732 maximum characters on one element
41,767 bytes of rendered markup
```

This is the clearest cost of the chosen authoring model: semantic values and
component policy are centralized, but generated utility output is verbose and
feature composition carries long utility strings. It is source/runtime text,
not inline CSS or a Tailwind browser runtime.

## CLI and upgrade drill

`shadcn info --json` correctly discovers Vite, Tailwind v4, the Radix base, the
prototype stylesheet, aliases, icon library, and all ten installed primitives.
It also exposes current documentation and registry-source links to agents.

`shadcn add button --diff`, `dialog --diff`, and `sheet --diff` complete without
changing files. The customized Button diff is localized and understandable;
Dialog has formatting-only differences; Sheet has only the generated
`"use client"` difference. Re-adding with overwrite would still replace local
customizations, so production updates require a reviewed merge.

## Fresh-agent trials

Both trials started from detached copies of the same committed baseline, used
only ordinary repository guidance, changed no tracker state, and left the
primary prototype branch untouched.

### Recurring primary pressed state

The agent was asked to keep the forest hue and add one clearly distinct pressed
state across recurring primary buttons. It found:

- `prototype.css` as the semantic value source (`--primary` and its utility
  mapping);
- the prototype README's rule that recurring component policy belongs in
  `src/components/ui/**`; and
- `buttonVariants` as the canonical default Button ownership seam.

It added `active:bg-primary/72` once to the default Button variant, reusing an
intensity already present in that file. It invented no value or abstraction and
added no caller override. Typecheck, lint, the prototype build, and diff checks
passed with no human correction.

### Compact read-only completed treatment

The agent was asked to add a compact recurring treatment and use it for
completed Library Items. It found:

- the ownership map in the prototype README;
- the existing recurring `ItemStatusBadge` domain component;
- canonical Badge sizing;
- Light/Dark `--status-completed` roles and their Tailwind mapping; and
- the shared `Status.Done` enum and `Done` presentation label.

It reused those sources without inventing a value or abstraction. It also found
that applying a read-only treatment to the Library row would violate the reviewed
UI design spec, which requires every row to keep the editable three-state Status
control. It explicitly requested human reconciliation instead of silently
changing product behavior. Validation passed. The trial change was not adopted.

Together, the trials are strong evidence that the documented discover → reuse →
extend workflow is usable. They do not yet test a completely unguided agent
without the prototype README, and they do not remove the readability cost of
utility-heavy feature composition.

## Human review matrix

Pending. Review all of the following at 390 px, 768 px, and 1440 px:

- Light and Dark;
- ready, loading, empty, and error;
- URL-owned Item detail and Capture overlay;
- keyboard focus order, Escape dismissal, focus return, arrow-key Select use,
  hover, pressed, disabled, and pointer behavior;
- coarse-pointer/touch targets and page-level horizontal overflow;
- reduced motion; and
- an axe scan or equivalent accessibility inspection.

Tailwind v4's documented modern-browser floor also needs explicit product
acceptance before production adoption; the prototype does not decide the
supported-browser policy.
