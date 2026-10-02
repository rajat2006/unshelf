# Unshelf ticket publication

Apply these repository-specific rules when `/to-tickets` publishes to a real issue tracker.

## Parentage

When the source is an existing issue, publish every ticket as its native sub-issue. Treat the issue body's Parent reference as supporting context; the tracker-native relationship is authoritative.

The skill's instruction to preserve the parent allows attaching native sub-issues as part of publication. Preserve the parent's body, labels, and state.

## Completion

Publication is complete only when re-reading the tracker confirms that:

- When the source is an existing issue, every created ticket appears in its native sub-issue list.
- Every declared blocker appears in the native relationship where available or in the ticket's Blocked by fallback.

If an expected relationship cannot be established, report publication as blocked rather than complete.
