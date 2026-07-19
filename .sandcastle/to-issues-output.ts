import { z } from "zod";

/**
 * One child issue the `to-issues-prd` capability decomposes a PRD into. The
 * agent only *emits* these — the `agent-to-issues.yml` workflow does the
 * `gh issue create` and links each as a sub-issue of the parent PRD (spec #52 /
 * #69). So `title`/`body` are exactly what the workflow feeds to
 * `gh issue create --title … --body-file …`.
 *
 * `title` is capped at GitHub's 256-char issue-title limit. `body` is required —
 * an agent-sized ticket with no description is not actionable; forcing it here
 * (not just in the prompt) triggers a same-session retry rather than creating a
 * bodyless issue. No `labels` field: the workflow deliberately applies no state
 * label, so a human triages each child before it enters the agent lane.
 */
export const childIssueSchema = z.object({
  title: z.string().min(1).max(256),
  body: z.string().min(1),
});

/**
 * The structured `<output>` block the `to-issues-prd` capability emits —
 * validated by {@link import("./run-with-retry").runWithRetry} against this
 * schema, so a malformed or empty block self-corrects via same-session retry
 * before the workflow creates anything (spec #52 / #69).
 *
 * `children` requires at least one entry: a decomposition that yields zero child
 * issues is not a decomposition. `summary` is the one-line headline the parent
 * PRD comment leads with after the children are created.
 */
export const toIssuesOutputSchema = z.object({
  summary: z.string().min(1),
  children: z.array(childIssueSchema).min(1),
});

export type ChildIssue = z.infer<typeof childIssueSchema>;
export type ToIssuesOutput = z.infer<typeof toIssuesOutputSchema>;
