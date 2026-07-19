import { z } from "zod";

/**
 * One child issue the `to-issues-prd` capability decomposes a PRD into — emitted
 * as **structured fields**, never as a pre-rendered issue body.
 *
 * Mirrors CVM's runner-neutral to-issues contract: each child is an independent,
 * vertically-sliced tracer bullet, so there is **no dependency field** — CVM uses
 * the emitted *list order* as the dependency signal (earlier children land
 * first). The agent supplies the *content* (`whatToBuild` and the
 * `acceptanceCriteria` list); the runner {@link renderChildIssueBody}
 * deterministically renders the Markdown body — the parent back-reference and the
 * `- [ ]` checklist are code, not agent prose. That keeps every published child
 * in the house issue shape and stops a malformed, non-agent-ready body from being
 * created verbatim (spec #52 / #69).
 *
 * `title` is capped at GitHub's 256-char issue-title limit. `acceptanceCriteria`
 * requires at least one entry — an agent-sized slice with no testable outcome is
 * not actionable — so an empty list triggers a same-session retry rather than a
 * checklist-less issue. No `labels` field: the workflow deliberately applies no
 * state label, so a human triages each child before it enters the agent lane.
 */
export const childIssueSchema = z.object({
  title: z.string().min(1).max(256),
  whatToBuild: z.string().min(1),
  acceptanceCriteria: z.array(z.string().min(1)).min(1),
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

/**
 * Deterministically render a validated {@link ChildIssue} into the Markdown body
 * the workflow feeds to `gh issue create --body-file`.
 *
 * The structure — the `## Parent` back-reference to the PRD, the `## What to
 * build` prose, and the `## Acceptance criteria` checklist — is fixed here, not
 * left to the agent, so every child lands in the same house shape regardless of
 * what the agent emitted. `parentNumber` is the PRD's issue number; the trailing
 * newline keeps the file POSIX-clean.
 */
export function renderChildIssueBody(
  child: ChildIssue,
  parentNumber: string | number,
): string {
  const sections = [
    `## Parent\n\n#${parentNumber}`,
    `## What to build\n\n${child.whatToBuild.trim()}`,
    `## Acceptance criteria\n\n${child.acceptanceCriteria
      .map((c) => `- [ ] ${c.trim()}`)
      .join("\n")}`,
  ];

  return `${sections.join("\n\n")}\n`;
}
