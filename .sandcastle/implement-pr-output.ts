import { z } from "zod";

/**
 * What the implement-pr agent did about one review comment/thread within the run.
 *
 * - `addressed` — the agent changed the code to satisfy the comment and committed
 *   the fix; the commit is on the branch and the workflow pushes it.
 * - `deferred` — left for a human: too risky/ambiguous to act on, out of scope for
 *   the comment, or a disagreement that needs a maintainer decision. No commit;
 *   the reason goes in `action` so the posted summary explains why.
 */
export const IMPLEMENT_PR_STATUSES = ["addressed", "deferred"] as const;

/**
 * One review comment the implement-pr run acted on. `comment` is a short gist of
 * the reviewer's point (not the full quote); `file` is an optional repo-relative
 * path for a line/file-scoped comment; `action` records what the agent changed
 * (for `addressed`) or why it left the comment alone (for `deferred`).
 */
export const implementPrItemSchema = z.object({
  comment: z.string().min(1),
  status: z.enum(IMPLEMENT_PR_STATUSES),
  file: z.string().min(1).optional(),
  action: z.string().min(1),
});

/**
 * The structured `<output>` block the `implement-pr` capability emits — validated
 * by the extraction wrapper against this schema, so a malformed block
 * self-corrects via same-session retry before the workflow posts anything (spec
 * #52 / #66).
 *
 * `items` may be empty only for the degenerate case where the PR carried no
 * actionable review comments; normally it has one entry per comment the run
 * considered, including the ones it deferred. `summary` is always required — it's
 * the one-line headline the posted comment leads with.
 */
export const implementPrOutputSchema = z.object({
  summary: z.string().min(1),
  items: z.array(implementPrItemSchema),
});

export type ImplementPrStatus = (typeof IMPLEMENT_PR_STATUSES)[number];
export type ImplementPrItem = z.infer<typeof implementPrItemSchema>;
export type ImplementPrOutput = z.infer<typeof implementPrOutputSchema>;
