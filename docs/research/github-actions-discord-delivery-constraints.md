# GitHub Actions and Discord delivery constraints for the Daily Project Digest

Researched 2026-08-16 against current primary GitHub and Discord sources.

## Question

What platform constraints govern a reliable nightly GitHub Actions job that
posts the Daily Project Digest through one Discord incoming webhook, including
schedule timing, manual runs, checkpoint discovery, payload limits, retries,
partial delivery, and practical idempotency?

## Conclusion

The proposed automation fits GitHub Actions and a Discord incoming webhook,
with four important qualifications:

1. A GitHub Actions schedule is **best effort**, not an exact-time guarantee.
   GitHub now accepts an IANA timezone directly, so 11:00 PM India time can be
   written as `cron: "0 23 * * *"` with `timezone: "Asia/Kolkata"`; however,
   GitHub warns that top-of-hour schedules can be delayed and, under enough
   load, dropped.
2. A successful workflow run is only a usable delivery checkpoint if preview
   runs cannot be mistaken for deliveries. The run API exposes trigger,
   conclusion, timestamps, run ID, and attempt, but it does not encode the
   application's meaning of “Discord accepted this digest.” That meaning must
   be represented deliberately by workflow separation, a delivery-only job or
   artifact, or another durable checkpoint.
3. Discord delivery should use `wait=true` and
   `allowed_mentions: {"parse": []}`. `wait=true` waits for server confirmation
   and returns the created Message, including its ID; the default `wait=false`
   can return no error even when the message is not saved. The message ID and
   the same webhook token allow later fetch, edit, or deletion.
4. Discord documents no idempotency key for Execute Webhook. Therefore a
   network failure after Discord saves a message but before the runner receives
   its response cannot be resolved perfectly with an incoming webhook alone.
   Concurrency, a stable logical digest key, recorded message IDs, and
   edit-on-known-retry reduce duplicates, but they do not create an atomic
   transaction between Discord and a GitHub-side checkpoint.

The reliable target is consequently **confirmed, at-least-once delivery with a
small, explicitly handled duplicate window**, not exactly-once delivery.

## GitHub Actions constraints

### Scheduling is timezone-aware but best effort

The `schedule` event:

- supports POSIX cron and, now, an optional IANA `timezone` value;
- runs the latest commit on the repository's default branch and only runs when
  the workflow file exists on that branch;
- may be delayed at high-load times, particularly at the start of an hour, and
  GitHub says sufficiently delayed queued jobs may be dropped;
- is automatically disabled in a public repository after 60 days without
  repository activity; and
- has a minimum interval of five minutes.

([GitHub: `schedule` event](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule))

For the agreed time, the direct current representation is:

```yaml
on:
  schedule:
    - cron: "0 23 * * *"
      timezone: "Asia/Kolkata"
```

The minute `0` places the job in the top-of-hour load window GitHub explicitly
calls out. The reliability decision must therefore either accept 11:00 PM as a
best-effort trigger or move a few minutes off the hour. A checkpointed catch-up
window is necessary either way; the cron expression must never define the
reporting boundary.

### Manual preview and delivery are supported, but must be distinguishable

A workflow with `workflow_dispatch` can be run from the Actions UI, GitHub CLI,
or REST API. The workflow file must exist on the default branch, the person
dispatching it needs repository write access, and the UI can select a branch.
The trigger supports typed inputs; GitHub currently allows up to 25 top-level
inputs and a 65,535-character combined input payload.

([GitHub: manually run a workflow](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow),
[GitHub: `workflow_dispatch` inputs](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onworkflow_dispatchinputs))

Those mechanics support an explicit `preview` versus `deliver` choice. They do
not make a successful preview distinguishable in a later workflow-run query:
both modes can have event `workflow_dispatch` and conclusion `success`. The
implementation must expose a delivery-specific signal instead of treating the
latest successful run of a mixed-mode workflow as the checkpoint.

### Run history is queryable, but its timestamps are not an application checkpoint

The workflow-runs REST endpoint can be scoped to one workflow file and filtered
by `actor`, `branch`, `event`, `status`/conclusion, `created`, and other fields.
It returns at most 100 records per page and caps a filtered search at 1,000
results. Returned runs include `id`, `event`, `status`, `conclusion`,
`created_at`, `updated_at`, `run_started_at`, `run_attempt`, and links to jobs
and artifacts. Reading workflow runs requires Actions repository read
permission for private data and is unauthenticated for public data.

([GitHub: list workflow runs for a workflow](https://docs.github.com/en/rest/actions/workflow-runs?apiVersion=2026-03-10#list-workflow-runs-for-a-workflow))

This is enough to find a previous candidate delivery run, but none of those
generic fields prove that a particular Discord message was accepted or record
the exact upper bound used to query GitHub activity. In particular:

- `created_at` and `run_started_at` drift when the scheduler or runner is
  delayed;
- `updated_at` reflects workflow lifecycle, not a preselected reporting
  boundary;
- a preview can also end in `success`; and
- a rerun retains the same `github.run_id`, while `github.run_attempt`
  increments.

([GitHub: `github.run_id` and `github.run_attempt`](https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#github-context))

The digest should select and persist an explicit `window_end` before gathering
data. A delivery identity should include at least the logical window and the
GitHub run ID; reruns must check prior delivery state rather than blindly POST
again.

### Artifacts are a useful delivery receipt, not permanent state

GitHub can list artifacts for a workflow run, filter them by name, and download
them using Actions read permission. This makes a small JSON artifact containing
`window_start`, `window_end`, digest hash, GitHub run/attempt, and Discord
message IDs a queryable delivery receipt.

([GitHub: list workflow-run artifacts](https://docs.github.com/en/rest/actions/artifacts?apiVersion=2026-03-10#list-workflow-run-artifacts))

Artifacts and logs expire after 90 days by default. For public repositories the
configured retention range is 1–90 days; for private repositories it is
1–400 days. Deleting a workflow run also deletes its artifacts.

([GitHub: artifact and log retention](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository#configuring-the-retention-period-for-github-actions-artifacts-and-logs-in-your-repository),
[GitHub: artifacts from deleted runs](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/remove-workflow-artifacts#artifacts-from-deleted-workflow-runs))

An artifact-only checkpoint therefore needs an expiry/missing-state fallback
and cannot guarantee indefinite catch-up. A durable alternative would need a
repository write surface or external store, which is a separate permissions
and operating-model choice.

### Concurrency prevents overlap, not duplicate HTTP side effects

GitHub Actions permits concurrent runs by default. A shared concurrency group
can restrict delivery to one running job. Current GitHub Actions can also use
`queue: max` to queue up to 100 pending runs in FIFO order by the time each run
started waiting; ordering by original dispatch time is not guaranteed.

([GitHub: control workflow concurrency](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency))

The scheduled and explicit-manual **delivery** paths should share a concurrency
group and should not cancel a running delivery. Preview does not mutate Discord
and need not occupy that group. Concurrency prevents two jobs from racing on
the same checkpoint; it cannot tell whether an already-issued Discord POST was
saved after the client lost its response.

### Authentication and API budget

GitHub recommends using the built-in, repository-scoped `GITHUB_TOKEN` for API
calls from a workflow and granting only the required permissions. Its primary
REST rate limit is 1,000 requests per hour per repository (15,000 for resources
owned by a GitHub Enterprise Cloud account). GitHub says to observe rate-limit
headers, honor `retry-after`/reset values, and use increasing waits for repeated
secondary-limit failures.

([GitHub: authenticate from Actions](https://docs.github.com/en/rest/authentication/authenticating-to-the-rest-api#authenticating-in-a-github-actions-workflow),
[GitHub: REST API rate limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api#primary-rate-limit-for-github_token-in-github-actions))

A once-daily, paginated digest should sit far below that budget, but it should
still paginate and fail clearly rather than silently summarize an incomplete
page.

## Discord incoming-webhook constraints

### The URL is the credential

Discord describes incoming webhooks as channel-bound HTTP endpoints that need
no bot or persistent connection, explicitly listing scheduled reports as a
suitable use case. Incoming webhooks post using a generated token; the webhook
resource calls that token “secure,” and token-bearing webhook endpoints require
no separate bot authorization.

([Discord: incoming webhooks](https://docs.discord.com/developers/platform/webhooks#incoming-webhooks),
[Discord: webhook object and token](https://docs.discord.com/developers/resources/webhook#webhook-object))

The full URL, containing webhook ID and token, must therefore be treated as a
credential and stored as a GitHub Actions secret such as
`DISCORD_PROJECT_DIGEST_WEBHOOK_URL`. GitHub encrypts Actions secrets and
redacts their exact values from workflow logs, but warns that transformed
secret values may not always be redacted. The workflow must never print the URL
or include it in an error body.

([GitHub: Actions secrets](https://docs.github.com/en/actions/concepts/security/secrets#how-secrets-work))

### Delivery confirmation and message identity require `wait=true`

Execute Webhook is `POST /webhooks/{webhook.id}/{webhook.token}`. With
`wait=true`, Discord waits for server confirmation and returns the created
Message. With the default `wait=false`, it returns `204 No Content`, and Discord
warns that a message which is not saved does not return an error. The Message
response supplies the message ID needed for later operations.

The same webhook token can fetch a previously sent message, edit it, or delete
it. Editing also returns the Message. A replacement webhook token cannot manage
messages sent by the old token because these endpoints operate on a message
“from the same token.”

([Discord: Execute Webhook](https://docs.discord.com/developers/resources/webhook#execute-webhook),
[Discord: Get and Edit Webhook Message](https://docs.discord.com/developers/resources/webhook#get-webhook-message))

Every delivery POST must therefore set `wait=true`, validate a 2xx response,
parse the returned message ID, and retain that ID in the delivery receipt.

### Payload and embed limits

One webhook execution creates one Discord message. Its relevant limits are:

| Surface | Limit |
| --- | ---: |
| Message `content` | 2,000 characters |
| Embeds on one message | 10 |
| Embed title | 256 characters |
| Embed description | 4,096 characters |
| Fields per embed | 25 |
| Field name / value | 256 / 1,024 characters |
| Footer text / author name | 2,048 / 256 characters |
| All textual embed fields across all embeds on the message | 6,000 characters |

Exceeding an embed constraint returns `400 Bad Request`. Discord also
deduplicates embeds that use the same URL, showing only the first.

([Discord: Execute Webhook parameters](https://docs.discord.com/developers/resources/webhook#execute-webhook),
[Discord: embed limits](https://docs.discord.com/developers/resources/message#embed-limits))

The 6,000-character aggregate embed budget gives the digest more room than
plain content while remaining one confirmed message. The formatter must count
final rendered characters, including AI output and links, and apply its agreed
item cap before calling Discord. If a digest still cannot fit, multiple webhook
executions are separate operations and can partially succeed.

### Mentions must be disabled explicitly

For webhooks, Discord's default allowed-mentions behavior still parses user
mentions. Discord recommends `allowed_mentions` when passing user-generated
strings. Setting `{"parse": []}` suppresses all mentions. The setting must also
be supplied on edits: Discord says an edit without explicit
`allowed_mentions` uses the defaults afresh rather than inheriting the original
message's restrictions.

([Discord: allowed mentions](https://docs.discord.com/developers/resources/message#allowed-mentions-object),
[Discord: Edit Webhook Message](https://docs.discord.com/developers/resources/webhook#edit-webhook-message))

Because PR titles, issue text, and AI output are not trusted Discord markup,
both create and edit requests should always send:

```json
{"allowed_mentions": {"parse": []}}
```

### Rate limits and retryable responses

Discord says rate limits vary and must not be hard-coded. Clients should use
the returned bucket and remaining/reset headers. A `429` response includes
`Retry-After` and `retry_after`; the client must wait that duration before
retrying. Webhook ID or webhook ID plus token is a top-level resource used in
per-route limit calculation. With no authorization header, the global limit is
associated with the source IP.

([Discord: rate limits](https://docs.discord.com/developers/topics/rate-limits))

Discord explicitly classifies `502 Gateway Unavailable` as “wait a bit and
retry.” Other `5xx` responses mean a server error. Validation and credential
failures (`400`, `401`, `403`) require correction, not automatic retry. Discord
specifically says that after a webhook returns `404`, clients should stop using
it; repeated invalid requests can contribute to temporary IP restrictions.

([Discord: HTTP response codes](https://docs.discord.com/developers/topics/opcodes-and-status-codes#http-response-codes),
[Discord: invalid-request limit](https://docs.discord.com/developers/topics/rate-limits#invalid-request-limit-aka-cloudflare-bans))

A bounded delivery retry policy can safely follow explicit `429` instructions
and retry `502` after a delay. A connection loss or timeout after transmitting
the POST is different: Discord may already have saved the message, so another
POST can duplicate it.

## Partial delivery and practical idempotency

Discord's documented Execute Webhook request has no idempotency-key or `nonce`
parameter. `nonce` exists on Discord's bot-authenticated Create Message API,
but it is not part of the incoming-webhook Execute request. This absence, plus
the separate GitHub checkpoint write, creates two unavoidable failure gaps:

([Discord: Execute Webhook parameters](https://docs.discord.com/developers/resources/webhook#execute-webhook),
[Discord: Create Message parameters](https://docs.discord.com/developers/resources/message#create-message))

1. Discord accepts the message, but the runner loses the response before it
   learns the message ID.
2. The runner receives the ID, but stops before persisting the delivery receipt.

In either gap, the next attempt cannot prove from a webhook POST alone whether
the digest already exists. A split digest adds further partial-success states:
message one can be accepted while message two fails, and Discord documents no
transaction that commits several webhook messages together.

The evidence supports this baseline for the later reporting-window and
idempotency decision:

1. Choose a closed-open logical window `[window_start, window_end)` before data
   collection; never derive it from nominal cron time.
2. Serialize scheduled and manual deliveries through one non-cancelling
   concurrency group. Keep preview non-delivering and unmistakable in the
   checkpoint query.
3. Prefer one Discord message using embeds, so there is one confirmation and no
   split-message partial state. Preflight every Discord length/count limit.
4. POST with `wait=true` and empty allowed mentions. On success, capture the
   returned message ID before performing nonessential work.
5. Persist a receipt containing the logical window, digest hash, run ID,
   run-attempt metadata, and every Discord message ID. Advance
   `window_start` only from a delivery receipt, never from an AI-success or
   preview-success signal.
6. If the message ID is known, retry by fetching/editing that message rather
   than creating another. If the outcome is ambiguous and no ID is known, a
   repeated POST is an explicit at-least-once choice and should retain the same
   visible digest/window identity so a duplicate is recognizable.
7. Honor Discord's exact `retry_after` on `429`; retry `502` after a delay; bound
   retries and fail delivery on exhausted transient errors. Do not retry an
   invalid/deleted webhook indefinitely.
8. Treat a missing/expired checkpoint and 60-day scheduled-workflow disablement
   as runbook cases. An artifact checkpoint alone cannot bridge arbitrary
   inactivity because of retention limits.

These constraints fully supply the existing decision ticket **Choose
reporting-window, retry, and idempotency semantics**. They do not require a new
Wayfinder ticket: that ticket already owns the remaining product tradeoffs,
including exact 11:00 PM versus moving off the hour, artifact receipt versus a
more durable store, and what visible behavior is acceptable in the ambiguous
duplicate window.
