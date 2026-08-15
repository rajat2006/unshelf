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
Candidate overviews. The third pass selected the small-card direction: thumbnails
make it calm and familiar rather than haphazard, while continuous vertical scroll
remains unresolved. The fourth pass narrows to visual gallery density and whether
the review should be paged.

### A — Balanced grid

Hypothesis: the selected small-card composition already strikes the right balance:
three columns beside the Follow rail, several visible Candidates, and no extra
review mechanism.

### B — Contact sheet

Hypothesis: moving Follow filters into a compact strip and using the entire width
for four or five columns reduces vertical scrolling without making the gallery
feel cluttered.

### C — Paged gallery

Hypothesis: a fixed six-Candidate review screen makes intake explicitly finite and
eliminates continuous scrolling, while preserving the selected thumbnail grid.

## Live-session verdict

- Winner or hybrid: **A — Balanced grid**, with the product top bar and Follow
  rail held stationary while only the Candidate feed scrolls.
- Validated: one combined queue across all Follows; optional filtering by Follow;
  Candidate decisions must remain directly available from the overview; compact
  thumbnails make the intake calm, scannable, and appropriately familiar; three
  columns beside the Follow rail preserve useful density without feeling like a
  crowded contact sheet.
- Falsified: a long spacious feed, the large one-at-a-time review deck, compact
  rows, the thumbnail-free triage table, the full-width contact sheet, and explicit
  pagination.
- Required production behavior: the workspace top bar remains sticky; the Follow
  rail and intake heading remain stationary within Discover; only the Candidate
  grid becomes the vertical scroll container. At phone width the Follow filter
  reflows above the same independently scrolling feed.
