# Interrupted Actions and outstanding Dokploy work

Research date: 2026-08-21

## Question

How often has an Unshelf deployment run stopped after asking Dokploy to deploy,
leaving queued or running remote work that a later run could overlap? Is there a
defensible industry-wide frequency for this condition?

## Verdict

**It is a credible edge case, but no confirmed occurrence appears in Unshelf's
retained GitHub Actions history.** Across all 213 retained attempts of `Deploy
development`, GitHub recorded **zero `cancelled` and zero `timed_out`
attempts**. Across the 74 attempts whose deployment job actually ran, the result
is still zero. At least 47 attempts reached a correlated Dokploy deployment;
none was interrupted by GitHub while that work was known to be outstanding.

The evidence does not justify bespoke recovery code or a dedicated map ticket.
The accepted response is one operator rule: if an Actions deployment is
interrupted after Dokploy mutation may have begun, check Dokploy and wait for it
to settle before retrying.

No defensible industry-wide base rate was found. GitHub exposes repository- and
organization-level run/failure metrics, not a platform-wide rate for an Actions
runner ending after a third-party deployment API accepts work.[^github-metrics]
Availability reports sometimes publish incident-specific failure rates, but
those are outage windows, not a baseline for this compound condition.[^github-incident]

## Retained Unshelf history

The Actions REST API was queried for every retained run of workflow IDs
`329904320` (`Deploy development`) and `329904321` (`Publish candidate images`),
then every prior rerun attempt was queried separately so that a later attempt's
conclusion could not hide an earlier one.[^github-runs-api][^deploy-runs][^publish-runs]
The population spans 2026-08-08 10:16 UTC through 2026-08-21 11:32 UTC. GitHub
returned contiguous run numbers beginning at 1, so this is the workflows' full
history, not a sample.

| Workflow population | Attempts | Success | Failure | Skipped | Cancelled | Timed out |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `Deploy development` | 213 | 6 | 68 | 139 | **0** | **0** |
| `Publish candidate images` | 209 | 70 | 116 | 23 | **0** | **0** |

The 213 deployment attempts are 209 logical runs plus four earlier attempts of
one run that finished on attempt 5.[^deploy-reruns] The 209 publication attempts
are 208 logical runs plus one earlier attempt of one rerun.[^publish-rerun]
Publication has no Dokploy authority, so its count is pipeline context rather
than a remote-work-risk denominator. The older three-run Dokploy image
prototype also had three successes and no interruptions, but only built GHCR
images; it did not call Dokploy.

### Where the 68 failed deployment attempts stopped

Every failed attempt's job steps and allowlisted terminal log record were
inspected.[^github-jobs-api] The historical control plane deliberately emitted
generic adapter errors, so some failures cannot be placed on one side of
`compose.deploy` without inventing precision.

| Classification | Attempts | What the evidence establishes |
| --- | ---: | --- |
| Image-pair resolution failed | 10 | Before reconciliation; no Dokploy call. |
| `github-failure` | 4 | First live-authority check; before Dokploy. |
| `remote-deployment-failed` | 40 | A correlated Dokploy record reached terminal `error` or `cancelled`; remote work was no longer outstanding when Actions exited. |
| `health-check-failure` | 1 | Dokploy had reached `done`; external health then failed. |
| `dokploy-failure` | 12 | Unknown phase: one code covered initial inspect/update/start and later polling. |
| `invalid-adapter-result` | 1 | Unknown phase: malformed inspect result could be initial or post-enqueue. |

Thus 14 failed attempts are confirmed pre-Dokploy, 41 are confirmed after a
remote terminal result, and 13 are ambiguous relative to enqueue. There were no
`missing-deployment` poll timeouts. A representative terminal remote failure is
[Deploy development run 201](https://github.com/rajat2006/unshelf/actions/runs/32448947767);
the five-attempt historical rerun containing both generic Dokploy failures and
a terminal remote failure is [Deploy development run 3](https://github.com/rajat2006/unshelf/actions/runs/31252950697).

None of the 13 ambiguous attempts is recorded as cancelled or timed out, and
the retained evidence shows no duplicate deployment or overlap caused by a
released Actions concurrency lock. They exited normally with structured
failures. The phase-redacted logs cannot prove whether remote work briefly
continued after those exits, so the exact condition has **0 confirmed
occurrences, 13 possible-but-unprovable occurrences, and 0 confirmed duplicate
or overlapping deployments**.

These are descriptive counts, not a stable probability estimate: the evidence
covers only thirteen days, the attempts are correlated, configuration changed
during rollout, and remote phase detail was intentionally redacted.

## Why the edge remains technically possible

GitHub cancellation stops runner processes; it does not undo a request already
accepted by an external service.[^github-cancellation] GitHub concurrency only
governs Actions runs: after cancellation, timeout, or runner loss the group can
admit another run.[^github-concurrency]

Pinned Dokploy v0.29.13 source shows that `compose.deploy` enqueues a job and
returns without a deployment ID, while the deployment record is created only
when a worker begins the job.[^dokploy-router][^dokploy-worker] There is a real
observation gap between acceptance and record appearance. A runner can disappear
in that gap even though Unshelf has not observed it.

## Recommendation for the Wayfinder map

Classify this as a **low-frequency, bounded-impact operational edge risk**:

- do not add a standalone architecture/recovery decision or revive correlation
  state machinery based on zero observed occurrences;
- do not add queue inspection, adoption, cancellation, or recovery logic to the
  GitHub Actions workflows;
- document only: “if a deployment run is interrupted, check Dokploy and wait for
  it to settle before retrying.”

[^github-runs-api]: GitHub, [REST API endpoints for workflow runs](https://docs.github.com/en/rest/actions/workflow-runs?apiVersion=2022-11-28#list-workflow-runs-for-a-workflow).
[^github-jobs-api]: GitHub, [REST API endpoints for workflow jobs](https://docs.github.com/en/rest/actions/workflow-jobs?apiVersion=2022-11-28#list-jobs-for-a-workflow-run-attempt).
[^deploy-runs]: GitHub Actions API, [`Deploy development` retained runs, page 1](https://api.github.com/repos/rajat2006/unshelf/actions/workflows/329904320/runs?per_page=100&page=1), [page 2](https://api.github.com/repos/rajat2006/unshelf/actions/workflows/329904320/runs?per_page=100&page=2), and [page 3](https://api.github.com/repos/rajat2006/unshelf/actions/workflows/329904320/runs?per_page=100&page=3).
[^publish-runs]: GitHub Actions API, [`Publish candidate images` retained runs, page 1](https://api.github.com/repos/rajat2006/unshelf/actions/workflows/329904321/runs?per_page=100&page=1), [page 2](https://api.github.com/repos/rajat2006/unshelf/actions/workflows/329904321/runs?per_page=100&page=2), and [page 3](https://api.github.com/repos/rajat2006/unshelf/actions/workflows/329904321/runs?per_page=100&page=3).
[^deploy-reruns]: GitHub Actions API, [`Deploy development` run 3, attempt 1](https://api.github.com/repos/rajat2006/unshelf/actions/runs/31252950697/attempts/1) through [attempt 5](https://api.github.com/repos/rajat2006/unshelf/actions/runs/31252950697/attempts/5).
[^publish-rerun]: GitHub Actions API, [`Publish candidate images` run 3, attempt 1](https://api.github.com/repos/rajat2006/unshelf/actions/runs/31252877994/attempts/1) and [attempt 2](https://api.github.com/repos/rajat2006/unshelf/actions/runs/31252877994/attempts/2).
[^github-cancellation]: GitHub, [Workflow cancellation reference](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-cancellation).
[^github-concurrency]: GitHub, [Control the concurrency of workflows and jobs](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency).
[^github-metrics]: GitHub, [About GitHub Actions metrics](https://docs.github.com/en/actions/concepts/metrics).
[^github-incident]: GitHub, [Availability report: May 2026](https://github.blog/news-insights/company-news/github-availability-report-may-2026/).
[^dokploy-router]: Dokploy v0.29.13, [Compose API router at the pinned source revision](https://github.com/Dokploy/dokploy/blob/8b868c66d6672be40b86315a704ea1b3b09cb2d3/apps/dokploy/server/api/routers/compose.ts).
[^dokploy-worker]: Dokploy v0.29.13, [Compose deployment worker at the pinned source revision](https://github.com/Dokploy/dokploy/blob/8b868c66d6672be40b86315a704ea1b3b09cb2d3/packages/server/src/services/compose.ts).
