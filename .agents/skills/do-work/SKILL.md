---
name: do-work
description: "Execute a unit of work end-to-end: gather context, implement, validate with typecheck/lint/tests, review, then commit. Use when the user wants to do work, build a feature, fix a bug, or take a ticket home."
---

# Do Work

Execute a complete unit of work: understand it, build it, validate it, review it, commit it.

## 1. Gather context

- If the task references a ticket, fetch it — see `docs/agents/issue-tracker.md`.
- If the ticket is labelled `wayfinder:*`, consult `/wayfinder` for how to resolve it.
- Read `CONTEXT.md` and any ADRs in `docs/adr/` covering the area you're touching, so naming matches the domain language.
- Load `/coding-standards` before writing code.
- Explore the relevant files and follow the patterns already there.

If the task is ambiguous, clarify scope with the user before proceeding. If it's more than one context window of work, use `/to-tickets` to slice it first and do one slice per session.

## 2. Implement

**Backend / shared logic**: use `/tdd` — one failing test, minimum code to pass, repeat. Vertical slices, not all tests upfront. Seams must be agreed with the user before the first test.

**Frontend**: implement directly; add tests only at agreed seams.

## 3. Validate

Run the feedback loop and fix what it reports. Repeat until clean.

```
pnpm run ci:product:typecheck
pnpm run ci:product:lint
pnpm run ci:product:test
```

During the loop, prefer the narrower turbo filter or a single test file for speed; run the three above in full before moving on. `pnpm run ci:product` runs build + all three.

## 4. Review

Run `/code-review` and address what it finds.

## 5. Commit

Commit to the current branch. If the work resolves a ticket, reference it in the message and close it per `docs/agents/issue-tracker.md`.
