import { z } from "zod";

/**
 * What a single `architecture-review` run decided. Mirroring CVM's
 * `improve-codebase-architecture` capability, a run surfaces **exactly one fresh
 * deepening opportunity** and proposes it as a PRD — or finds nothing fresh worth
 * proposing and skips.
 *
 * - `proposed` — the run found one deepening opportunity not already covered by
 *   an open `source:architecture-review` proposal, and wrote it up as a PRD
 *   (`prdTitle` + `prdBody`). The workflow opens that PRD and labels it
 *   `source:architecture-review`; a human later expands it with `agent:to-issues`.
 * - `skipped` — nothing fresh worth proposing this run (the codebase is clean, or
 *   every candidate is already an open proposal). Carries a one-line `reason`.
 */
export const ARCHITECTURE_OUTCOMES = ["proposed", "skipped"] as const;

/**
 * The structured `<output>` block the `architecture-review` capability emits —
 * validated by the extraction wrapper against this schema, so a malformed or
 * self-contradictory block self-corrects via same-session retry before the
 * workflow opens any PRD (spec #52 / #70).
 *
 * A single proposal per run (not a findings list): CVM's capability proposes one
 * fresh opportunity at a time so each becomes its own PRD → child-issues flow,
 * rather than a rolling report. The refinements enforce that shape — `proposed`
 * must carry a PRD, `skipped` must carry a reason and no PRD — so the workflow
 * never opens an empty PRD or drops a proposal on the floor.
 */
export const architectureReviewOutputSchema = z
  .object({
    outcome: z.enum(ARCHITECTURE_OUTCOMES),
    /** One-line headline of the decision (the per-run log + PRD lead line). */
    summary: z.string().min(1),
    /** The proposed PRD's title — required (and only) when `proposed`. */
    prdTitle: z.string().min(1).max(256).optional(),
    /** The proposed PRD's Markdown body — required (and only) when `proposed`. */
    prdBody: z.string().min(1).optional(),
    /** Why nothing was proposed — required when `skipped`. */
    reason: z.string().min(1).optional(),
  })
  .refine((o) => o.outcome !== "proposed" || (!!o.prdTitle && !!o.prdBody), {
    path: ["prdTitle"],
    message:
      "a `proposed` outcome must include prdTitle and prdBody (the deepening opportunity written up as a PRD)",
  })
  .refine((o) => o.outcome !== "skipped" || !!o.reason, {
    path: ["reason"],
    message:
      "a `skipped` outcome must include a one-line reason (why nothing fresh was proposed)",
  })
  .refine((o) => o.outcome !== "skipped" || (!o.prdTitle && !o.prdBody), {
    path: ["prdTitle"],
    message: "a `skipped` outcome must not include prdTitle/prdBody",
  });

export type ArchitectureOutcome = (typeof ARCHITECTURE_OUTCOMES)[number];
export type ArchitectureReviewOutput = z.infer<
  typeof architectureReviewOutputSchema
>;
