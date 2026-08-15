# Prototype the intake-first Discover room

Throwaway prototype for [Prototype the intake-first Discover room](https://github.com/rajat2006/unshelf/issues/380).

> Three compositions of the Discover room, switchable via `?variant=`, at
> `/prototype-discover-intake.html`.

Run from the repository root:

```sh
pnpm --filter @unshelf/web prototype:discover
```

Then open `http://127.0.0.1:5173/prototype-discover-intake.html?variant=A`.
State is in memory. Use **Reset corpus** to restore it.

## Question

Which Discover-room composition makes recurring intake and Follow setup clear
without turning the stream into a Library backlog or hiding Follow health?

## Representative corpus

The earlier learning-workspace corpus is retained: Jack Herrington, ByteByteGo,
and MIT OpenCourseWare YouTube Candidates, including “How DNS works” already in
the Library and “Distributed Systems lecture 1” previously dismissed. It is
expanded with a recurring React Server Components search, a credentialed private
playlist, prior kept and dismissed Discoveries, partial Provider failure, expired
authorization, and enough new arrivals to exercise bulk review.

## Variant hypotheses

The first live pass rejected a long all-at-once feed and established a combined
queue with a left Follow filter. The second pass then falsified the oversized,
one-at-a-time Discovery card: it made overview and rapid triage too slow. This
pass keeps the Follow organization but compares dense, directly actionable
Candidate overviews.

### A — Compact rows

Hypothesis: a small thumbnail, one-line title, essential metadata, history, and
always-visible decisions form the best balance of recognition and density.

### B — Triage table

Hypothesis: removing thumbnails and aligning metadata and decisions into columns
makes the fastest overview and comparison surface.

### C — Small cards

Hypothesis: small visual cards preserve thumbnail recognition while fitting six
or more directly actionable Candidates in a desktop viewport.

## Live-session verdict

- Winner or hybrid: **Pending live fit-check.**
- Validated: one combined queue across all Follows; optional filtering by Follow;
  Candidate decisions must remain directly available from the overview.
- Falsified: a long spacious feed and the large one-at-a-time review deck.
- Required changes: compare compact rows, a triage table, and small cards to
  choose the useful density and role of thumbnails.
