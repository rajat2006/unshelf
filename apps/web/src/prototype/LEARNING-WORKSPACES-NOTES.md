# Prototype radical end-to-end learning workspace models

Throwaway prototype for [Prototype radical end-to-end learning workspace models](https://github.com/rajat2006/unshelf/issues/263).

> Four structurally different end-to-end workspace models, switchable via
> `?variant=`, at `/prototype-learning-workspaces.html`.

Run from the repository root:

```sh
pnpm --filter @unshelf/web prototype:workspaces
```

Then open `http://127.0.0.1:5173/prototype-learning-workspaces.html?variant=A`.
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

- Validated if:
- Falsified if:
- Steal for the winning direction:

### B — Flow board

Hypothesis: seeing Candidate → Library → Learning Plan → Today together makes
transitions obvious enough to outweigh the risk of turning learning into a
process-management board.

- Validated if:
- Falsified if:
- Steal for the winning direction:

### C — Plan cockpit

Hypothesis: a chosen Learning Plan should anchor the workspace, while discovery,
the Library, and Daily Focus work as contextual sidecars around the plan.

- Validated if:
- Falsified if:
- Steal for the winning direction:

### D — Rooms + plan studio

Hypothesis: A's four lifecycle rooms should govern the product globally, while
C's plan-centered canvas becomes a local workspace only after the User enters a
specific Learning Plan. The local drawer may place existing Library Items, but
Candidate intake remains in Discover. Today shows derived completion from the
shared Status of its dated picks without becoming a plan or storing progress.

- Validated if:
- Falsified if:
- Steal for the winning direction:

## Live-session verdict

- Winner or hybrid:
- Why it fits:
- What it rejects:
- Required changes before the product brief:
