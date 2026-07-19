import { z } from "zod";

/**
 * The kinds of codebase-level finding the `architecture-review` capability
 * surfaces. Unlike the PR-scoped `review` (standards/spec on a single diff),
 * this capability sweeps the whole tree on `main` for structural drift and
 * deepening opportunities, using the repo's own `/improve-codebase-architecture`
 * and `/codebase-design` vocabulary (module, interface, depth, seam).
 *
 * - `drift` — code has diverged from a recorded decision (an ADR in `docs/adr/`)
 *   or from the `CONTEXT.md` ubiquitous language: a rule that is documented but
 *   no longer honoured, or a term used to mean something the model doesn't say.
 * - `deepening` — a shallow module whose interface exposes more than it hides;
 *   a *deepening opportunity* where more behaviour could sit behind a smaller
 *   surface.
 * - `duplication` — the same knowledge or logic repeated across modules, i.e. a
 *   seam that wants to exist but doesn't yet.
 * - `coupling` — modules entangled across what should be a clean seam, so a
 *   change in one forces a change in the other.
 * - `other` — architecturally notable, but none of the above.
 */
export const ARCHITECTURE_CATEGORIES = [
  "drift",
  "deepening",
  "duplication",
  "coupling",
  "other",
] as const;

/** Severity ladder for a single finding, worst → mildest. */
export const ARCHITECTURE_SEVERITIES = ["high", "medium", "low"] as const;

/**
 * One architecture-review finding. `area` locates it — a repo-relative path
 * (`apps/web/src/trail`), a module name, or a `CONTEXT.md`/ADR reference for a
 * `drift` finding — but is deliberately not a single `file:line` anchor: these
 * findings are codebase-level and land in a durable tracking issue, not as
 * inline PR comments, so there is no diff to cross-check a line against.
 */
export const architectureFindingSchema = z.object({
  category: z.enum(ARCHITECTURE_CATEGORIES),
  severity: z.enum(ARCHITECTURE_SEVERITIES),
  area: z.string().min(1),
  title: z.string().min(1),
  detail: z.string().min(1),
});

/**
 * The structured `<output>` block the `architecture-review` capability emits —
 * validated by the extraction wrapper against this schema, so a malformed block
 * self-corrects via same-session retry before the workflow opens or updates the
 * tracking issue (spec #52 / #70).
 *
 * `findings` may be empty: a clean sweep is a valid result, and the workflow
 * still refreshes the tracking issue with a clean bill of health. `summary` is
 * always required — it's the one-line headline the issue and its per-run comment
 * lead with.
 */
export const architectureReviewOutputSchema = z.object({
  summary: z.string().min(1),
  findings: z.array(architectureFindingSchema),
});

export type ArchitectureCategory = (typeof ARCHITECTURE_CATEGORIES)[number];
export type ArchitectureSeverity = (typeof ARCHITECTURE_SEVERITIES)[number];
export type ArchitectureFinding = z.infer<typeof architectureFindingSchema>;
export type ArchitectureReviewOutput = z.infer<
  typeof architectureReviewOutputSchema
>;
