# Daily Project Digest message prototype verdict

## Question

Which concrete Discord presentation best serves a currently nontechnical and
eventually mixed audience across typical, quiet, blocked, released, and
high-volume days while keeping section meaning, maintenance grouping, overflow,
source links, and AI fallback behavior immediately understandable?

## Verdict

**Accepted: Variant A, Lifecycle briefing, with Variant C's deterministic
headline.**

Use one Discord message and one embed. Begin with a short headline derived from
authoritative lifecycle counts, then present single-column lifecycle sections in
this order when non-empty: Released, Completed, Blocked, In progress, and
Internal maintenance. Every section pairs its canonical name with a plain-language
explanation. Every detailed item is one plain-language sentence linked to its
canonical GitHub subject.

Internal maintenance remains grouped last when AI classification succeeds and
shows each item's deterministic lifecycle as metadata. If AI fails, use
deterministic fallback wording and place each maintenance candidate back in its
ordinary lifecycle section. Show no more than ten detailed items per section and
link a count for the remainder. A day with no items uses the compact standalone
quiet-day message.

The headline is deterministic presentation, not a new status authority. It may
summarize Released and Completed together as changes that landed because the
sections immediately below preserve their authoritative distinction.

## Alternatives

- **Variant B, Status stack — rejected.** Separate embeds make each status
  visually strong, but add scrolling and consume the ten-embed budget without
  improving the underlying decision.
- **Variant C, Human-first pulse — rejected as the primary structure.** Its
  audience-friendly group names are approachable, but combining Released and
  Completed weakens the lifecycle distinction that mixed technical readers need.
  Its deterministic headline was retained.

## Prototype controls

Run `pnpm --filter @unshelf/web dev`, then open
`/prototype-daily-project-digest.html`. Use `?variant=A|B|C`,
`?day=typical|quiet|blocked|released|volume`, and `?copy=ai|fallback` to inspect
the alternatives and edge cases.
