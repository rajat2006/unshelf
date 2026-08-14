# Wayfinder artifact publication

Wayfinder decisions must arrive with the repository artifacts that support them. This policy extends the generic `/wayfinder` workflow for this repository. It applies while planning or resolving a Wayfinder map, writing its PRD, and implementing from that PRD.

An **artifact** is a repository file created or changed to support or record a ticket's resolution. Issue comments are resolution records, not artifacts.

This policy governs artifacts produced by future Wayfinder work. Existing research and prototype references already maintained on the default branch stay in place; publication does not migrate, delete, or reclassify them.

## Publication surfaces

Each map may have one shared branch and draft pull request for each artifact class. Create a class's branch and PR only when its first artifact appears.

| Class | Shared branch | Contents | Lifecycle |
| --- | --- | --- | --- |
| **Decision-document PR** | `wayfinder/map-<map-number>-decision-documents` | Durable documentation intended for the maintained repository, including `CONTEXT.md`, ADRs, and maintained project documentation | Mergeable; keep draft while the map accumulates decisions. It may remain unmerged when decomposition or implementation starts. |
| **Research-and-prototype PR** | `wayfinder/map-<map-number>-research-and-prototypes` | Supporting evidence outside the maintained documentation tree, including cited research and accepted, rejected, or inconclusive prototypes with their runnable files and verdicts | Keep draft and close without merging when the user no longer needs the live review surface. |

Use the map number, not its mutable title, in branch names. Open both PR classes against the repository's default branch and include the map link in the PR body. Reuse the existing map-level PR for every later ticket in that class; a ticket never opens its own artifact PR.

Raw research belongs in the research-and-prototype PR by default. Promote a durable finding deliberately by expressing it in an ADR, `CONTEXT.md`, or another maintained document on the decision-document PR. Preserve rejected, unsuccessful, and inconclusive work when its evidence or limits explain the decision.

Before committing, inspect every staged file. Keep credentials, tokens, personal or prohibited data, accidental generated output, and unrelated files out of repository history. Replace sensitive evidence with a safe description that still records the useful conclusion. If the artifact cannot be made safe to publish, stop and ask the user how to preserve the conclusion.

## Publish one ticket

Publish each artifact-producing ticket through a temporary, ticket-local branch. A ticket that produces both artifact classes uses a separate ticket-local branch and commit for each class so neither shared branch receives the other class's files.

For each class:

1. Determine the map number, artifact class, deterministic shared branch, and any existing PR before editing. Start a uniquely named ticket-local branch from the latest remote shared branch, or from the current remote default branch when the shared branch does not exist.
2. Create or update only that ticket's artifacts. Include enough instructions and dependencies to inspect or run a prototype, and record its accepted, rejected, or inconclusive verdict beside it.
3. Stage the complete artifact set, perform the publication safety inspection, and create one distinct commit attributable to the ticket. Include the ticket number in the commit message.
4. Fetch the remote immediately before integration. Rebase the ticket-local branch onto the latest remote shared branch, or the remote default branch for the first publication, then rerun the artifact's relevant checks.
5. Push the ticket commit to the shared map branch with a normal, fast-forward push. A rejected push means another session integrated first: fetch, rebase onto the updated shared branch, rerun the checks, and retry. Resolve every conflict before continuing. Shared map branches are never force-pushed.
6. If this is the class's first publication, open its map-level PR as a draft. If another session created the branch or PR concurrently, fetch and reuse it rather than opening a duplicate. Confirm the integrated commit and draft PR are reachable on GitHub.
7. Copy the final commit SHA after any rebase. For every relevant artifact, construct a GitHub file permalink pinned to that full commit SHA, not a branch-head URL. Confirm each permalink opens before resolving the ticket.

A ticket's artifacts may span several files but remain attributable to its distinct commit. Later corrections use a new ticket-attributable commit and new permalinks; linked commit history is never rewritten.

## Record the resolution

An artifact-producing ticket is ready to resolve only when all of these are true:

- its final commit is remotely reachable on the appropriate shared map branch;
- the appropriate map-level draft PR exists;
- every relevant artifact has an immutable file-at-commit permalink;
- the resolution comment contains the PR URL and artifact permalinks; and
- the parent map contains those same direct pointers.

Use this shape in the resolution comment:

```markdown
## Resolution

<answer and verdict>

## Artifacts

- <Decision-document PR or Research-and-prototype PR>: <stable PR URL>
- [<artifact path>](<full-commit file permalink>) — <what it contributes>
```

Append the ticket to the map's **Decisions so far** as the generic Wayfinder workflow requires. Its one-line entry keeps the decision as a gist and adds the PR URL plus direct artifact permalinks. The map remains an index: it points to the ticket and primary artifacts without copying their decision prose or contents.

A ticket with no repository artifact follows the normal Wayfinder resolution flow and does not create an empty branch or PR.

## Build the implementation handoff

Generate the final PRD only after all of the map's Wayfinder tickets are resolved and the settled artifact set is known. Keep the PRD self-contained about selected behavior, then add a **Wayfinder sources** manifest containing:

- the parent map's stable URL;
- each map-level artifact PR that exists, named as a **Decision-document PR** or **Research-and-prototype PR**;
- an explicit note for any decision documents that are not merged into the PRD's base branch; and
- the immutable file-at-commit permalink for every artifact relevant to implementation, grouped by its source ticket.

The manifest supplies primary evidence and deeper rationale; it does not replace implementation decisions with links. If an exceptional decision change occurs after PRD publication, publish the new artifact commit and update the manifest to pin the new authoritative version before another implementation run uses the PRD.

An implementation agent treats the versions pinned by the PRD as authoritative, including unmerged decision documents. Read those documents from their GitHub permalinks. Keep their independently mergeable history on the decision-document PR rather than cherry-picking artifact commits into the implementation branch. A decision-document PR does not need to merge before decomposition or implementation begins.

## Close or abandon a map

Closing a research-and-prototype PR is a manual user action. Close it without merging after implementation when its live review surface is no longer useful; the workflow does not automatically close the PR or delete its branch. Durable findings that should outlive that review surface belong in maintained documentation through a separate, reviewable change.

If a map is abandoned before producing a PRD, close its research-and-prototype PR without merging. Review its decision-document PR independently, then retain it for review, merge still-valid documentation, or close it. Record the chosen disposition on the map so historical readers understand the remaining draft PRs.

## Review walkthroughs

Before declaring a policy or PRD change complete, walk through these cases and verify that the publication, links, and lifecycle remain unambiguous:

- a research-only ticket, including an inconclusive result;
- a prototype ticket with a preserved rejected variant and verdict;
- a grilling or domain-modeling ticket that changes an ADR or `CONTEXT.md`;
- two concurrent tickets publishing to the same shared map branch;
- implementation consuming an unmerged decision document from a pinned permalink; and
- an abandoned map with one or both artifact PR classes.
