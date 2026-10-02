# Chapter research operations

Issue #612 implements research through temporary preview only. Confirmation and
Part creation remain in #613. Capture and manual Part entry work independently.

Set optional `OPENAI_API_KEY` on the API service to enable research. An absent or
blank key returns `missing_configuration` before admission or paid I/O. No browser
key or model call is needed for deterministic tests.

Before deploying this feature, configure and verify the **actual Traefik ingress
response timeout** allows the 60-second server attempt plus overhead (at least
65 seconds). Check every intervening proxy as well. Repository settings do not
prove the deployed timeout. This implementation does not provision or deploy
that configuration. The browser stops waiting after 65 seconds and discards late
responses. Neither cancellation nor a timeout guarantees billing has stopped.

Admission uses a Postgres row per User, a UTC daily count, and a 65-second opaque
claim. The upsert atomically admits one active attempt and ten daily dispatches.
A crash between reservation and dispatch conservatively consumes a slot because
whether paid I/O began cannot be established. Expiry recovers active admission;
late completion can release only its own claim. Pre-dispatch cancellation observed
by the running process refunds its own reservation.

The structured logger emits `unshelf.chapters.attempt.ended` and, above the $0.10
monitored target, `unshelf.chapters.cost.over_target`. Estimates use pricing version
`openai-2026-09-07`: Luna input $0.20, cached input $0.02, output $1.20 per million
tokens; web search $0.01 per observed call. Cached input is subtracted from input
before applying the ordinary rate. Reported input already includes search content;
output already includes reasoning, so neither is added again. Missing usage or an
unrecognized returned model yields unknown cost, never zero.

Rates checked against [Luna](https://developers.openai.com/api/docs/models/gpt-5.6-luna)
and [OpenAI pricing](https://developers.openai.com/api/docs/pricing) on 2026-09-07.
Request controls follow [Responses](https://developers.openai.com/api/reference/cli/resources/responses/methods/create)
and [web search](https://developers.openai.com/api/docs/guides/tools-web-search).

Logs omit titles, prompts, chapters, evidence and raw provider errors, including
failed HTTP snapshots. Existing Docker rotation applies; logs are operational
visibility, not a durable billing ledger or a guaranteed retention period.
Crashes can leave usage unknown without a terminal event. `store: false` disables
response state storage; it is not a universal provider no-retention guarantee.

Deterministic fixtures establish request configuration, provenance structure,
UI lifecycle and database concurrency. They do not establish live-model quality
or independently verify chapter facts. No paid model evaluation was performed.
