import { z } from "zod";

/**
 * What a single `architecture-review` run decided. Mirroring CVM's
 * `improve-codebase-architecture` capability field-for-field
 * (`{status, title, body, oneLineSummary, candidatesConsidered}`): a run weighs
 * a handful of deepening candidates and either **proposes** the single freshest
 * one as a PRD or **skips**.
 *
 * - `proposed` — one deepening opportunity, not already covered by an open *or
 *   closed* `source:architecture-review` proposal, written up as a PRD
 *   (`title` + `body`). The workflow opens that PRD and labels it
 *   `source:architecture-review`; a human later expands it with `agent:to-issues`.
 * - `skipped` — nothing fresh worth proposing (the codebase is clean, or every
 *   candidate is already a past proposal). `oneLineSummary` carries why.
 */
export const ARCHITECTURE_STATUSES = ["proposed", "skipped"] as const;

/**
 * The candidate deepening opportunities the run weighed — each a short one-line
 * label — so the always-run Actions summary can report what was considered, not
 * just the one that won (CVM's `candidatesConsidered`). Present on both branches;
 * may be empty on a clean skip that surfaced no candidates at all.
 */
const candidatesConsidered = z.array(z.string());

/**
 * The structured `<output>` block the `architecture-review` capability emits — a
 * **discriminated union on `status`** so the contract is enforced, not just
 * documented: a `proposed` block *must* carry `title` + `body` and a `skipped`
 * block *cannot*, and neither can smuggle the other branch's fields. Validated by
 * the extraction wrapper, so a malformed or mixed block self-corrects via
 * same-session retry before the workflow opens any PRD (spec #52 / #70).
 *
 * One proposal per run (not a findings list): CVM proposes a single fresh
 * deepening opportunity at a time so each becomes its own PRD → child-issues
 * flow, rather than a rolling report.
 *
 * Each branch is `.strict()`: extra keys are rejected rather than silently
 * stripped, so a `skipped` block cannot smuggle a `title`/`body` and a `proposed`
 * block cannot carry a stray `reason` — the union enforces the shape it documents.
 */
export const architectureReviewOutputSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("proposed"),
      /** One-line headline of the deepening being proposed. */
      oneLineSummary: z.string().min(1),
      /** PRD title — imperative, within GitHub's 256-char issue-title limit. */
      title: z.string().min(1).max(256),
      /** The full PRD body (the seven-section spec shape) as Markdown. */
      body: z.string().min(1),
      candidatesConsidered,
    })
    .strict(),
  z
    .object({
      status: z.literal("skipped"),
      /** One-line reason nothing was proposed (drives the Actions summary). */
      oneLineSummary: z.string().min(1),
      candidatesConsidered,
    })
    .strict(),
]);

export type ArchitectureStatus = (typeof ARCHITECTURE_STATUSES)[number];
export type ArchitectureReviewOutput = z.infer<
  typeof architectureReviewOutputSchema
>;
