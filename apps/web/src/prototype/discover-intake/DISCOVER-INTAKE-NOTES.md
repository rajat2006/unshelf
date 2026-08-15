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

The first live pass rejected a long all-at-once feed. It established a stronger
common model for the next pass: Discover has one combined queue across every
Follow by default; the left Follow rail filters that queue; the right side
reviews one Discovery at a time. Follow health and whether intake feels finite
remain open questions.

### A — Filter rail + deck

Hypothesis: the lightest expression is enough—a persistent filter rail and one
large Discovery card with previous/next controls.

### B — Queue + focus

Hypothesis: after filtering by Follow, a compact queue list helps the User jump
within the filtered intake without losing the one-at-a-time focus card.

### C — Follow sessions

Hypothesis: choosing a Follow should feel like starting a bounded review session;
the stacked deck and explicit remaining count may make intake feel finite without
turning it into a Library backlog.

## Live-session verdict

- Winner or hybrid: **Pending live fit-check.**
- Validated: one combined queue across all Follows; optional filtering by Follow;
  one-at-a-time review on the right.
- Falsified: rendering every unresolved Discovery as a long all-at-once feed.
- Required changes: compare the revised variants and decide how much queue
  preview and session framing the focused review needs.
