import { z } from "zod";

/**
 * One merge conflict the agent resolved while bringing the branch current with
 * `main`. `file` is a repo-relative path; `resolution` is a one-line prose note
 * on how the two sides were reconciled (which side won, or how they were
 * combined) so a reviewer can sanity-check the resolution without re-diffing.
 */
export const conflictResolutionSchema = z.object({
  file: z.string().min(1),
  resolution: z.string().min(1),
});

/**
 * The structured `<output>` block the `update-branch` capability emits —
 * validated by the extraction wrapper against this schema, so a malformed block
 * self-corrects via same-session retry before the workflow posts anything
 * (spec #52 / #67).
 *
 * - `summary` — always required; the one-line headline the posted comment leads
 *   with (e.g. "Merged main into the branch, resolving 2 conflicts.").
 * - `alreadyCurrent` — `true` when `main` was already an ancestor of the branch
 *   head, so the merge was a no-op and no commit was made. `conflicts` must then
 *   be empty; the workflow's push is a no-op.
 * - `conflicts` — one entry per file that conflicted during the merge and was
 *   resolved. Empty for a clean merge (or an already-current branch). A
 *   non-empty list on an `alreadyCurrent` run is contradictory and is rejected
 *   below so the agent re-emits an honest block.
 */
export const updateBranchOutputSchema = z
  .object({
    summary: z.string().min(1),
    alreadyCurrent: z.boolean(),
    conflicts: z.array(conflictResolutionSchema),
  })
  .refine((o) => !(o.alreadyCurrent && o.conflicts.length > 0), {
    path: ["conflicts"],
    message:
      "conflicts must be empty when alreadyCurrent is true — an already-current " +
      "branch performed no merge, so nothing could have conflicted",
  });

export type ConflictResolution = z.infer<typeof conflictResolutionSchema>;
export type UpdateBranchOutput = z.infer<typeof updateBranchOutputSchema>;
