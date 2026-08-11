# Prototype radical end-to-end learning workspace models

Throwaway prototype for [Prototype radical end-to-end learning workspace models](https://github.com/rajat2006/unshelf/issues/263).

> Four structurally different end-to-end workspace models, switchable via
> `?variant=`, at `/prototype-learning-workspaces.html`.

Run from the repository root:

```sh
pnpm --filter @unshelf/web prototype:workspaces
```

Then open `http://127.0.0.1:5173/prototype-learning-workspaces.html?variant=D`.
State is in memory and shared while switching variants. Refresh or use **Reset**
to restore the representative corpus.

## Question

Which workspace model makes recurring discovery, a flat Library, structured and
one-off Items, an ordered Learning Plan, and Daily Focus feel like one coherent
learning workflow without collapsing their distinct lifecycles?

## Variant hypotheses

### A — Rooms

Hypothesis: four explicit destinations make each lifecycle calm and legible, and
the cost of navigation is lower than the cost of mixing them.

- Validated: four distinct destinations make the selected lifecycles legible,
  and its livelier visual theme felt good in the live review.
- Falsified: the literal global sidebar is not the selected navigation; it would
  compete with the local Library drawer needed inside an open Learning Plan.
- Steal for the winning direction: the four-room information model and theme
  direction.

### B — Flow board

Hypothesis: seeing Candidate → Library → Learning Plan → Today together makes
transitions obvious enough to outweigh the risk of turning learning into a
process-management board.

- Validated: Candidate → Keep → Item is a real transition whose boundary should
  stay visible.
- Falsified: Library → Plan → Today is not a pipeline—Items remain in the Library
  and are referenced elsewhere—so the board makes the product model harder to
  picture as an everyday workspace.
- Steal for the winning direction: no surface structure; retain its explicit
  lifecycle explanation only in the product brief where useful.

### C — Plan cockpit

Hypothesis: a chosen Learning Plan should anchor the workspace, while discovery,
the Library, and Daily Focus work as contextual sidecars around the plan.

- Validated: the central plan canvas, Library placement drawer, and Today actions
  make sense after the User has entered one Learning Plan.
- Falsified: a Learning Plan cannot anchor the whole product; the live review
  could not picture how C would be used locally until D placed it inside Plans.
- Steal for the winning direction: the plan-centered local workspace.

### D — Rooms + plan studio

Hypothesis: A's four lifecycle rooms should govern the product globally, while
C's plan-centered canvas becomes a local workspace only after the User enters a
specific Learning Plan. The local drawer may place existing Library Items, but
Candidate intake remains in Discover. Today shows derived completion from the
shared Status of its dated picks without becoming a plan or storing progress.

- Validated: selected. A persistent top bar exposes Today, Discover, Library, and
  Plans globally; entering a specific Plan opens C's local studio without moving
  Candidate intake into it. Today shows derived completion from the shared Status
  of its dated picks.
- Falsified: nothing about the workspace model in the live pass. The theme is a
  current preference, not a permanently locked design decision.
- Steal for the winning direction: D is the winning direction rather than a
  source for another hybrid.

## Live-session verdict

- Winner or hybrid: **D — Rooms + plan studio**.
- Why it fits: distinct global lifecycle rooms stay visible in a compact top bar,
  while the richer plan canvas appears only within an open Learning Plan. The
  local studio can place existing Library Items and reference today's picks
  without collapsing Capture, Candidate intake, organisation, commitment, or
  dated focus into one flow.
- What it rejects: A's literal sidebar, B as the product workspace, C as the
  global shell, Candidate intake inside a Plan, and separately stored Daily Focus
  progress.
- Required changes before the product brief: describe D as the chosen information
  architecture; carry the lively theme as a provisional preference to revisit
  later rather than a locked theme specification.
