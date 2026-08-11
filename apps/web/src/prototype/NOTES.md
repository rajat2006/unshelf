# Calm resurfacing prototype — decision

Issue: [Prototype calm resurfacing for dormant learning material](https://github.com/rajat2006/unshelf/issues/271)

## Selected designs

- **Library B — faceted catalog.** The Library stays a passive, searchable store: Views and Labels narrow a dense Item list, while selection opens Item detail. It does not become an obligation queue.
- **Daily Planning D — central plan with a smart sidecar.** The chosen Items are the primary, executable agenda. One continuously available sidecar combines exact Item search and learning-intention input, followed by Recently added and Suggested for you.

## Behavioral decision

Resurfacing does **not** earn a persisted domain concept. It remains a projection over Library Items, their Status and age, the current Daily Focus, and the User's immediate input.

- Suggestions appear when the User opens Daily Planning; Unshelf does not schedule or send them.
- Only explicit **Add** puts an Item into today's plan.
- **Not today** suppresses a suggestion for the current dated focus only. There is no separate snooze duration.
- An Item may appear again on a later day if it is relevant; there is no guaranteed repetition cadence.
- Every suggestion explains the signal actually used. Natural-language matching shown here is deliberately shallow prototype logic.
- Daily Planning changes the shared Item **Status** (`not started`, `in progress`, `done`) and derives plan completion from done Items.
- The UI does not infer time estimates. Timing may appear later only from reliable User- or provider-supplied metadata.

## Placement

Daily Planning is a full page inside the existing app shell. The central agenda receives most of the content width; the subordinate sidecar remains narrow. This branch is a throwaway decision artifact, not production-ready code and not intended for merge.
