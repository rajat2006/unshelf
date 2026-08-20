# Navigational-comment calibration prototype

> PROTOTYPE for [Calibrate comment guidance against representative dev files](https://github.com/rajat2006/unshelf/issues/480). This is evidence for the eventual `comments.md`, not coding guidance itself. Human verdict: **accepted** for the map's current calibration; the eventual standard may still revise the rules.

Calibrated against [`dev` at `ed75de19`](https://github.com/rajat2006/unshelf/tree/ed75de19e0b3b7d6f26c625a1b0ce427971ff389), then revalidated unchanged on [`dev` at `0ec1ff5`](https://github.com/rajat2006/unshelf/tree/0ec1ff527b06e03c88a2afbd7e05d099ee0dde6c) before publication.

## Rules under test

1. Admit a comment only when it preserves verified, stable, non-obvious maintenance knowledge whose safety or reconstruction value exceeds its drift cost.
2. Prefer names, types, interfaces, extraction, and module boundaries when they can carry the meaning proportionately.
3. Put the comment at the narrowest stable owner and state the maintained constraint, policy, boundary, or rationale—not neighboring mechanics.
4. Keep broader authorities authoritative; an adjacent comment states only their local consequence.
5. Revalidate the complete comment when its claim enters a semantic change surface. Tighten useful mixed prose; delete false, obsolete, redundant, or displaced prose.

## Calibration matrix

| Case | Exact location | Judgment | Rule applied |
| --- | --- | --- | --- |
| Clerk isolation and test seam | [`apps/api/src/middleware/auth.ts:7`](https://github.com/rajat2006/unshelf/blob/ed75de19e0b3b7d6f26c625a1b0ce427971ff389/apps/api/src/middleware/auth.ts#L7-L14) | **Keep** the existing comment | The injected identity seam, Clerk ownership boundary, and per-User isolation test consequence are stable and not recoverable from the function signature alone. |
| Dokploy public-health delay | [`packages/deployment-control-plane/src/index.ts:369`](https://github.com/rajat2006/unshelf/blob/ed75de19e0b3b7d6f26c625a1b0ce427971ff389/packages/deployment-control-plane/src/index.ts#L369-L385) | **Keep** the existing comment | It records verified third-party behavior and the local retry consequence at the function forced into that shape. |
| Learning Plan module model | [`apps/api/src/learning-plan/repository.ts:26`](https://github.com/rajat2006/unshelf/blob/ed75de19e0b3b7d6f26c625a1b0ce427971ff389/apps/api/src/learning-plan/repository.ts#L26-L40) | **Replace** the stale mixed preamble | The ownership, tenant-isolation, and acyclicity knowledge qualifies, but claims that a Learning Plan is not persisted and contains only Stages contradict current code. Revalidate the whole model instead of patching one sentence. |
| Daily Planning entry point | [`apps/api/src/daily-focus/planning-repository.ts:43`](https://github.com/rajat2006/unshelf/blob/ed75de19e0b3b7d6f26c625a1b0ce427971ff389/apps/api/src/daily-focus/planning-repository.ts#L43-L52) | **Delete** the existing docstring | “Build today's capped suggestion projection” paraphrases the name, return type, and limit; it omits the non-obvious selection policy actually worth preserving. |
| Daily Planning selection policy | [`apps/api/src/daily-focus/planning-repository.ts:178`](https://github.com/rajat2006/unshelf/blob/ed75de19e0b3b7d6f26c625a1b0ce427971ff389/apps/api/src/daily-focus/planning-repository.ts#L178-L198) | **Add** a comment | Iteration order encodes product fairness, priority, and deterministic presentation; changing an array or loop can silently change behavior. |
| Concurrent Today additions | [`apps/web/src/surfaces/TodaySurface.tsx:271`](https://github.com/rajat2006/unshelf/blob/ed75de19e0b3b7d6f26c625a1b0ce427971ff389/apps/web/src/surfaces/TodaySurface.tsx#L271-L287) | **Add** a comment | The functional merge prevents out-of-order mutation responses from erasing another confirmed addition; the safety reason is not apparent from the state update mechanics. |
| Declarative request schema | [`packages/shared/src/validation.ts:32`](https://github.com/rajat2006/unshelf/blob/ed75de19e0b3b7d6f26c625a1b0ce427971ff389/packages/shared/src/validation.ts#L32-L40) | **No comment** | Names, Zod structure, and inferred types are the authority and fully express this validation contract. File-wide importance or exported status is not an admission criterion. |
| Skeleton catalogue component | [`apps/web/src/components/ui/skeleton.tsx:5`](https://github.com/rajat2006/unshelf/blob/ed75de19e0b3b7d6f26c625a1b0ce427971ff389/apps/web/src/components/ui/skeleton.tsx#L5-L18) | **No comment** | The component is transparent composition with no hidden policy or local consequence. A purpose docstring would merely rename the symbol in prose. |

## Proposed wording where commentary is warranted

### Keep: Clerk isolation and test seam

The existing wording is the proposed wording. Each sentence contributes distinct maintained knowledge: external dependency ownership, the injected seam's purpose, and the resulting isolation-test capability.

### Keep: Dokploy public-health delay

The existing wording is the proposed wording. It names the external mismatch, the observable transition that lags, and why polling—not immediate failure—is correct.

### Replace: Learning Plan module model

Place at the current module preamble:

```ts
/**
 * Owns persisted topology for one Learning Plan: Stage and direct-Item nodes
 * connected by directed edges. Every operation scopes through both the
 * authenticated User and Learning Plan, so a foreign node is indistinguishable
 * from a missing one at the API boundary. The schema cannot cheaply enforce
 * acyclicity; this repository owns that invariant at the write seam.
 */
```

This retains the stable ownership, isolation, and invariant while dropping obsolete model narration and the duplicated ADR history.

### Add: Daily Planning selection policy

Place immediately before `const selected`:

```ts
// Give each populated signal one slot before filling spare capacity in signal
// priority order. SIGNALS therefore owns both suggestion diversity and final
// presentation order; per-signal sorting keeps every choice deterministic.
```

### Add: Concurrent Today additions

Place immediately before the successful `setState` in `add`:

```ts
// Adds may resolve out of order. Merge this server-confirmed Item into the
// current Focus so an older response cannot erase another confirmed Add.
```

## Explicit no-comment controls

- Do not add a declaration comment to `createItemRequestSchema`. If a future rule recommends one merely because the schema is exported, shared, or validation-sensitive, that is a false positive.
- Do not add a declaration comment to `Skeleton`. If a future rule recommends one because the component lacks prose or belongs to a shared catalogue, that is a false positive.

## Calibration questions

1. **False positives:** Do either proposed additions fail the admission gate, or should either retained comment be tightened or deleted?
2. **False negatives:** Does either no-comment control hide qualifying knowledge, or is a higher-value case missing from this set?
3. **Missing distinctions:** Does the draft need sharper treatment of mixed comments, product-policy ordering, external behavior, concurrency, or authority overlap?
4. **Rule revision:** Which rule would an agent need changed before these judgments become consistently repeatable?
