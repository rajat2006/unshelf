# Daily Project Digest operations

The `Daily Project Digest` GitHub Actions workflow previews or delivers one
Discord message describing the repository's preceding 24 hours and current
active work. It runs nightly at 11:00 PM `Asia/Kolkata` only after commissioning
is complete.

## Provision the credentials

Use credentials dedicated to this automation. Do not reuse `AGENT_PAT` or an
application credential.

1. In the OpenAI platform, create or select a project dedicated to the digest.
   Open the project's **API keys**, choose **Create new secret key**, name the key
   `unshelf-daily-project-digest`, copy it once, and keep it out of local files
   and issue comments.
2. In Discord, open the destination channel's **Edit Channel** settings, choose
   **Integrations** > **Webhooks** > **New Webhook**, name it `Unshelf Daily
   Project Digest`, verify the channel, and copy its webhook URL.
3. In the GitHub repository, open **Settings** > **Environments** and create an
   environment named `daily-project-digest`.
4. In that environment, leave **Required reviewers** disabled. Under
   **Deployment branches and tags**, select **Selected branches and tags** and
   allow only the repository's default branch, `dev`.
5. Add these environment secrets:

   - `DAILY_DIGEST_OPENAI_API_KEY`: the dedicated OpenAI project key.
   - `DAILY_DIGEST_DISCORD_WEBHOOK_URL`: the destination channel's webhook URL.

6. Open **Settings** > **Secrets and variables** > **Actions** > **Variables**.
   Create the repository variable `DAILY_DIGEST_SCHEDULE_ENABLED` with the value
   `false`. This is the commissioning latch; it is deliberately not an
   environment secret.

The workflow uses the automatic `GITHUB_TOKEN` with read-only access to
contents, pull requests, issues, and deployments. The OpenAI key is passed only
to the OpenAI adapter. The Discord webhook is passed only to scheduled delivery
or an explicit manual `deliver` run; a preview has no Discord capability.

## Commission delivery

Do these steps after the workflow is present on `dev`. Keep
`DAILY_DIGEST_SCHEDULE_ENABLED=false` until all checks pass.

1. Open **Actions** > **Daily Project Digest** > **Run workflow**.
2. Select branch `dev`, choose `preview`, and run the workflow.
3. Open the completed run's summary. Review the exact prospective Discord JSON:
   wording, lifecycle claims, links, section order, overflow, and mention
   suppression. A quiet day legitimately shows the compact quiet-day payload.
4. If the payload is not acceptable, fix the implementation and repeat preview.
   Do not enable the schedule.
5. Run the workflow again on `dev`, this time choosing `deliver`.
6. Confirm both that the workflow succeeded and that exactly one expected
   message appeared in the intended Discord channel. Success means Discord
   returned an accepted Message, not merely that the request was sent.
7. Return to the repository Actions variables and change
   `DAILY_DIGEST_SCHEDULE_ENABLED` to `true`.

Commissioning requires one human-approved exact preview and one successful
manual delivery. It does not require the superseded sixty-call paid model
qualification.

The schedule is `0 23 * * *` with timezone `Asia/Kolkata`. GitHub schedules are
best effort: a run may start late or be dropped. Every run freezes its actual
start time and reports the half-open 24-hour window ending then; enabling the
latch or a delayed start does not change those rolling-window semantics.

## Monitor runs

Use **Actions** > **Daily Project Digest** as the operational record.

- A scheduled job shown as **skipped** normally means the repository variable is
  absent or is not exactly `true`.
- A successful preview summary contains the exact preflighted Discord payload.
- A successful delivery summary says `Discord accepted the digest.`
- A failed run records only a generic sanitized failure. Inspect failed-step
  annotations for the failure category. Logs and summaries intentionally omit
  credentials, raw provider responses, and sensitive external identifiers.
- Configure GitHub Actions failure notifications for the repository owner, and
  check the Discord channel when a scheduled run is missing or failed.

GitHub may automatically disable scheduled workflows in a public repository
after 60 days without repository activity. If nightly runs disappear, inspect
the workflow on the Actions page, re-enable it if GitHub disabled it, verify the
latch remains `true`, and run a fresh preview before manually delivering.

## Rotate credentials

Rotate one provider at a time so failures have a clear cause.

### OpenAI project key

1. Create a replacement key in the same dedicated OpenAI project.
2. Replace the environment secret `DAILY_DIGEST_OPENAI_API_KEY` in GitHub.
3. Run and approve a manual preview. OpenAI failure is non-fatal and uses the
   deterministic fallback, so verify whether AI wording was actually present.
4. After verification, revoke the old OpenAI key.

### Discord webhook

1. Create a replacement webhook in the same Discord channel.
2. Replace `DAILY_DIGEST_DISCORD_WEBHOOK_URL` in the GitHub environment.
3. Perform one manual `deliver` run and confirm the message in Discord.
4. Delete the old webhook only after the replacement succeeds.

If either credential may be compromised, disable the schedule latch first,
revoke or delete the credential immediately, install its replacement, and repeat
the preview and manual-delivery commissioning checks before re-enabling it.

## Recover by fixing forward

There is no checkpoint, delivery receipt, automatic catch-up, or cross-run
idempotency.

1. Set `DAILY_DIGEST_SCHEDULE_ENABLED=false` if repeated scheduled failures are
   possible.
2. Diagnose from the sanitized step category. Correct code or configuration on
   `dev`; do not paste credentials or provider responses into an issue.
3. Run and approve a new manual preview.
4. Check Discord before retrying delivery. A lost webhook response can mean the
   message was created even though the workflow failed.
5. Run a fresh manual `deliver` when appropriate, confirm it in Discord, and
   restore the latch to `true`.

A manual recovery uses its own actual start time and fresh preceding 24-hour
window. It does not replay the failed window. Activity may therefore fall into a
gap after a missed or failed run. Overlapping scheduled, manual, or rerun windows
may repeat activity. A retry after an ambiguous webhook response can produce a
recognizable duplicate carrying the same digest identifier; a later workflow
rerun uses a fresh identifier. These are accepted at-least-once limitations;
remove an unwanted duplicate manually rather than adding a receipt or backfill
mechanism.

Finally, the digest reports **Released** only from authoritative successful
GitHub Deployments whose environment is exactly `production`. Until this
repository emits such Deployment records, the absence of Released items is
expected even when code has merged or images have been published.
