# End-to-end continuous-deployment state machine

Research date: 2026-08-01

## Question

What is the simplest complete, implementation-ready orchestration for continuously
deploying Unshelf same-repository pull-request previews, hosted development, and
production through Dokploy v0.29.13? The decision must combine Product CI,
environment-specific image publication, the Dokploy handoff, migration and health
gates, stage-aware cancellation, latest-only queuing, failure visibility,
fix-forward recovery, release finalization, and the four authorized branch flows.

This memo resolves [Design the end-to-end continuous-deployment state
machine][ticket]. It specifies orchestration and failure semantics, not workflow
YAML or deployment code.

## Decision

Use one two-stage GitHub Actions pipeline around each deployable target:

1. A **replaceable candidate stage** runs Product CI and publishes an
   environment-specific API/web digest pair. Newer work may cancel this stage.
2. A **non-cancelable remote stage** takes a per-target lock, revalidates that its
   SHA is still desired, converges the Dokploy resource, waits for the exact
   correlated Dokploy deployment, runs external health checks, and finalizes the
   channel or release. Once Dokploy has been called, this stage is allowed to
   finish.

The deployment state machine is:

```text
observed
  -> Product CI passed for the exact candidate
  -> API and web trace tags published and verified as one digest pair
  -> target lock acquired; eligibility and latest desired SHA revalidated
  -> trusted raw Compose and runtime values rendered/validated in Dokploy
  -> Dokploy queue acceptance correlated to one deployment record
  -> deployment record: running -> done
  -> HTTPS API/database check + HTTPS web-root check passed
  -> healthy channel tags advanced
  -> production only: notes, image version tags, Git tag, draft Release verified
  -> finalized
```

Every arrow is fail-closed. `error`, `cancelled`, a timeout, an ambiguous identity,
or a failed external check ends the run visibly without advancing a healthy moving
tag, creating a product Git tag, or claiming success. Persistent environments are
fixed forward. Failed preview generations are torn down as already specified by
the preview-database decision.

## Inputs fixed by the earlier map decisions

This state machine composes, rather than reopens, the related ticket resolutions:

| Decision | Input used here |
| --- | --- |
| [Inventory the live Dokploy and VPS deployment state][inventory] | The installed target is Dokploy v0.29.13 on one 2-vCPU VPS; its current source-build deployment, malformed ingress, app-local database, and ineffective backup are migration inputs, not the target topology. |
| [Choose the Dokploy topology and Compose contract][topology] | One raw, isolated Compose resource per environment/preview contains `migrate`, `api`, and `web`; managed PostgreSQL stays outside Compose; CI owns resource convergence and Dokploy Domains owns same-origin HTTPS routing. |
| [Prototype multi-service Dokploy development and preview routing][prototype] | The live host proved generated HTTPS, `/api` plus `/` on one origin, exact-origin Clerk login, private digest pulls, and external logical-database connectivity. |
| [Define environment-specific image build, tag, and CD handoff][images] | Preview, development, and production each build distinct API/web images; the deployable unit is the verified digest pair; `migrate` and `api` share the exact API digest. |
| [Verify Clerk Development on generated HTTP hosts][clerk] | Non-production must use generated HTTPS and exact `PUBLIC_ORIGIN`; cleartext generated hosts and suffix-based trust are forbidden. |
| [Design ordinary and schema-changing preview database automation][preview-db] | Ordinary previews verify the shared development ledger without DDL; schema previews use revision-keyed clones; one fail-closed reconciler owns admission, replacement, and teardown. |
| [Design R2 backup, restore, and full-VPS recovery procedure][recovery] | Production migrations are backed by hourly R2 dumps; exceptional database/VPS recovery is manual, version-pinned, and best effort. |
| [Define product version and GitHub Release automation][releases] | `dev` to `main` supplies a bump label, hotfixes infer patch, the unreleased range makes retries failure-stable, and version state is created only after production health. |
| [Define CI/CD secrets and permission boundaries][permissions] | PR jobs have no Dokploy secrets; preview uses a trusted `workflow_run`; development and production use separate Actions environments, Dokploy projects, and API keys; Actions alone publishes images. |

## Stage 1: Product gate and image-pair publication

### The gate

The stable deployment gate is the existing `Product` job/check in workflow `CI`. In the current
repository it runs the product build, type-check, lint, and test tasks on every
pull request and on pushes to `dev` and `main`.[^local-ci] Keep that job name
stable and require it on pull requests to both protected branches. A deployment
producer must also inspect the exact check run and require `conclusion=success`;
GitHub distinguishes `success` from `skipped`, `cancelled`, `timed_out`, and other
terminal conclusions, and a skipped required job can otherwise appear successful
at the pull-request level.[^github-status-checks][^github-check-runs]

The source identity is:

- the current `pull_request.head.sha` for a same-repository preview;
- the pushed `dev` SHA for hosted development; and
- the pushed `main` SHA for production.

For a pull request, Product CI continues to test GitHub's PR integration ref,
which contains that exact head against its target base; the image publisher
checks out and labels the exact head SHA. The privileged preview consumer then
requires the originating run to have succeeded and independently requires the
PR's *current* head to equal that source SHA. For `dev` and `main`, Product CI and
publication are jobs in the same trusted push run, connected with `needs`, so a
different run or SHA cannot satisfy the gate.

Preview publication has the additional secret-free migration-history,
`db:generate`, Drizzle check, mode, and `migrationRevision` validations fixed by
the preview-database decision. Those checks may be separate jobs, but every one
must succeed before the preview publisher is considered successful.

### Pair publication

After the gate, build API and web from the same exact source SHA using the target
environment's public build inputs. Publish only the write-once trace tags fixed by
the image decision:

- `preview-pr-<number>-sha-<full-sha>`;
- `development-sha-<full-sha>`; or
- `production-sha-<full-sha>`.

The API and web jobs may run in parallel. A pair-finalizer runs only after both
jobs succeed, resolves both registry digests, reads them back from GHCR, and emits
only these deployable identities:

```text
API_IMAGE=ghcr.io/rajat2006/unshelf-api@sha256:<digest>
WEB_IMAGE=ghcr.io/rajat2006/unshelf-web@sha256:<digest>
```

A partial push is an orphan candidate, never a deployment. No environment consumes
a trace tag or a moving tag. This is necessary because the registry has no atomic
operation spanning the two package repositories; the digest pair is Unshelf's
commit point for image publication.[^oci-distribution][images]

Same-repository preview publication uses only its job-scoped `GITHUB_TOKEN` with
`packages: write`. Forks, drafts, PRs not targeting `dev`, and PRs whose head
repository is not this repository stop after secret-free CI. The trusted preview
handoff is a `workflow_run` workflow stored on `dev`; it can access the
`development` environment, but it must not check out PR code or consume a
PR-produced executable or configuration artifact. GitHub documents both the
privilege elevation and the risk of running untrusted content in this trigger.[^github-workflow-run][^github-secure-use]

## Stage-aware cancellation and latest-only queuing

Use **job-level**, repository-wide concurrency names shared by every workflow
that can affect the same target. Do not put the whole pipeline in one
`cancel-in-progress` group: that could terminate the observer while Dokploy is
still changing the host.

### Replaceable candidate stage

Product/publish work uses a candidate group per target with
`cancel-in-progress: true`:

- `cd-candidate-preview-<pr-number>`;
- `cd-candidate-development`; and
- `cd-candidate-production`.

A newer SHA may cancel install, build, test, or publication for an older SHA so
long as the older run has not entered the remote stage. Orphan images are handled
by the established immediate/nightly pair-aware cleanup.

### Non-cancelable remote stage

The remote job and everything after it use `cancel-in-progress: false` and the
default single pending slot:

- one global `cd-preview-reconcile` group, because the three-preview cap, database
  operator, and cleanup are shared global state;
- `cd-development`; and
- `cd-production`.

GitHub permits at most one running member and, by default, one pending member of a
concurrency group; a newer pending member replaces the older pending member.
Ordering is not a sufficient correctness guarantee, so the surviving job must
still re-fetch `dev`, `main`, or the PR and compare the current desired SHA
immediately before it mutates Dokploy.[^github-concurrency]

The remote lock is held through Dokploy completion, external health, moving-tag
updates, production finalization, and required teardown. Once `compose.deploy`
has been called, do not cancel the running Actions job and do not invoke
Dokploy's `killBuild`, `killProcess`, or cloud-only cancellation APIs merely
because a newer commit exists. The current remote attempt finishes; the one
surviving pending job then reconciles the newest desired state. This implements
the map's exact policy: cancel obsolete local work, finish in-progress remote
work, deploy only the newest queued revision.

At remote-job entry, query Dokploy's queue and deployment history for the target.
If an older deployment is already waiting or active—such as after an Actions
runner failure—wait for it to become terminal before saving new resource values.
Do not assume the Actions lock proves that Dokploy is idle. A bounded wait timeout
fails the observer but does not kill the remote command; the next run repeats the
same preflight.

## Dokploy preparation, trigger, discovery, and polling

### Prepare the exact desired resource

Under the remote lock:

1. Revalidate Product success, source SHA, digest syntax and registry resolution,
   branch/PR eligibility, and any release or preview-database policy.
2. For a persistent target, select the pre-provisioned Compose ID. For a preview,
   let the global reconciler create or select its deterministic Compose resource,
   generated hostname, domains, and database generation.
3. Read trusted deployment Compose text from the exact authorized `dev` or `main`
   revision. Preview Compose text comes from trusted `dev`, never PR head.
4. Preserve all non-image runtime configuration and save the complete raw Compose
   environment with only the intended `API_IMAGE`, `WEB_IMAGE`, `PUBLIC_ORIGIN`,
   database mode/URL/network, and non-secret provenance changed. Never log the raw
   environment response. Parse the saved environment in memory and emit only
   booleans proving that the allowlisted `API_IMAGE` and `WEB_IMAGE` values read
   back as the intended digest pair.
5. Call `compose.getConvertedCompose` and reject a render that does not contain
   exactly the expected `migrate`, `api`, and `web` graph, the intended image
   variable wiring, and no local `build:` or PostgreSQL service. The converted
   text may preserve `${API_IMAGE}` and `${WEB_IMAGE}` interpolation, so this is
   a trusted shape/graph check, not proof of digest values or a secret dump.

Saving configuration and triggering are separate mutations. If preparation fails
after save but before queue acceptance, the running containers remain whatever
was previously running while Dokploy's stored desired configuration may show the
candidate. Mark the run failed, prohibit an unsynchronized manual redeploy, and
let the next fix-forward run overwrite or resume it.

### Trigger with a durable correlation key

Call `POST /api/compose.deploy` once with an allowlisted title and description
that together contain:

- channel or preview PR number;
- full source SHA;
- Actions run ID; and
- Actions run attempt.

For example, the normalized correlation key can be
`unshelf/development/<full-sha>/actions/<run-id>/<attempt>`. It contains no branch
title, user text, credential, URL query, or environment value.

On self-hosted v0.29.13, `compose.deploy` returns only `{ success: true, message:
"Deployment queued", composeId }`; it does **not** return a deployment ID. The
router merely enqueues the title/description, and the deployment record is
created later when the worker begins that job.[^dokploy-compose-router][^dokploy-compose-service]
Queue acceptance is therefore neither deployment completion nor a stable remote
identity.

Because these resources use Dokploy's raw Compose source, the non-raw completion
branch that replaces deployment title/description with Git metadata does not run;
the correlation key remains stable through terminal status.[^dokploy-compose-service]

### Discover one record, then poll that record

The observer uses this exact algorithm:

1. Before triggering, call `deployment.allByCompose` and
   `deployment.queueList`. If the same correlation key already identifies a
   deployment record, resume it. If it identifies a waiting/active queue job but
   no record yet, do not enqueue a duplicate; continue discovery.
2. After accepted queueing, poll `deployment.allByCompose?composeId=...`, which
   returns newest-first deployment rows, until exactly one row has the exact title
   and description. While no row exists, use `deployment.queueList` only to
   distinguish still-waiting from lost/ambiguous acceptance.[^dokploy-deployment-router]
3. Once found, persist its `deploymentId` in the job summary and poll that same
   row. `running` waits; `done` advances to external verification; `error` or
   `cancelled` fails. Any other value or more than one exact match is an invariant
   violation.
4. Use bounded polling with backoff and a total remote timeout. On timeout, report
   `remote outcome unknown`, retain the deployment ID and dashboard pointer, and
   stop observing without cancellation. A later run first waits/resumes as above.
5. On error, link to the Dokploy deployment and expose only the deployment ID,
   status, timings, and a sanitized error category. `deployment.readLogs` is a
   bounded operator aid, but raw logs are not copied to Actions because runtime
   values and user data are sensitive.[^dokploy-deployment-api][permissions]

Dokploy's deployment row has `running`, `done`, `error`, and `cancelled` states;
v0.29.13 writes `finishedAt` for `done` and `error` and returns per-Compose history
newest first.[^dokploy-deployment-schema][^dokploy-deployment-service] Poll the
row, not only the Compose resource's shared `composeStatus`, because only the row
is tied to the correlation key.

### What `done` proves—and does not prove

The installed Compose builder runs:

```text
docker compose -p <app> -f docker-compose.yml up -d --build --remove-orphans
```

Dokploy sets the deployment row to `done` when that detached command returns
successfully.[^dokploy-compose-builder][^dokploy-compose-service] The Compose
dependency conditions preserve the application sequence: `migrate` must complete
successfully before `api` starts, and `web` starts after `api`; Docker documents
`service_completed_successfully` as the gate for a one-shot dependency.[^docker-startup]

`done` still does **not** prove that Traefik routing, TLS, the API process, database
queries, or the web root work from outside the host. `web`'s ordinary dependency
on `api` also proves start order, not HTTP readiness. External checks are a
separate state transition.

## External health gate

Poll for up to five minutes after Dokploy `done`, with bounded connect/request
timeouts and capped backoff. Use the exact configured `https://` origin, standard
certificate validation, and no insecure TLS override. Reject a redirect to a
different host or scheme.

1. `GET <origin>/api/health` must return HTTP 200 JSON with
   `status == "ok"`, `db == "up"`, and a parseable `time`. The endpoint performs a
   real query against the `health_check` table, so this one response verifies the
   routed API and database connectivity together.[^local-api-health]
2. `GET <origin>/` must independently return HTTP 200 over HTTPS, an HTML content
   type, and the Unshelf application shell (`<title>Unshelf</title>` and the root
   mount element). Do not substitute Caddy's `/healthz`; the map explicitly
   requires the user-facing web root.[^local-web-root][^local-caddy]

Both checks must pass against the same origin and the same attempt. Authentication
smoke testing is not a per-deployment blocking check in v1: the routing prototype
proved Clerk sign-in once, while the ordinary gate remains API/database plus web
root. Clerk exact-origin configuration is still rendered and revalidated for
every resource.

Only this external gate changes a digest pair from `deployed` to `healthy`.

## Channel flows

### Same-repository pull request into `dev`

1. The `Product` job/check in workflow `CI` and the migration classifier run for every PR. A fork, draft,
   stale head, wrong base, or failed check gets no image publication or preview.
2. An eligible current head publishes its preview-specific digest pair.
3. The trusted `workflow_run` on `dev` ignores artifacts, re-fetches the PR/checks
   and GHCR tags, and enters the global preview reconciliation group.
4. The reconciler first removes closed/ineligible resources, then admits the
   oldest eligible PRs up to three. Ordinary PRs use shared development data with
   a verification-only migration container; schema PRs receive a fresh or reused
   revision-keyed clone exactly as specified in the database decision.
5. It converges raw Compose from trusted `dev`, triggers/polls Dokploy, and runs
   the external health gate. Success advances both `preview-pr-<number>` moving
   tags and records the origin/SHA/digests as non-secret resource metadata.
6. A new PR head repeats the flow. A migration-revision change gets a fresh clone;
   an unchanged schema revision may reuse its isolated database. The old isolated
   generation is deleted only after the replacement is healthy.
7. Close, merge, or loss of eligibility triggers immediate Compose-first teardown,
   followed by isolated database/role teardown where applicable. A periodic full
   reconciliation repairs missed lifecycle events.

A failed preview deploy or health check receives no moving tags. Stop/delete the
failed Compose resource and destroy only the new isolated generation; the next
commit fixes forward. Ordinary shared development data is never reverted.

### Push to `dev`

1. The exact accepted `dev` SHA must pass Product CI before development images
   publish.
2. The development remote group revalidates that the SHA is still `dev` HEAD,
   updates the persistent raw Compose resource with the development digest pair,
   and runs the common trigger/poll/health sequence.
3. Health success advances both `development` moving tags and then performs
   pair-aware retention, keeping only the current healthy development pair.
4. A successful development database migration triggers a full preview
   reconciliation. Existing PRs whose histories no longer contain current `dev`
   as their byte-identical prefix fail closed until rebased; cleanup and admission
   are recalculated from current state.

A failed `dev` migration or health check leaves the previous healthy tags in
place. It may leave the persistent deployment unavailable because this design is
in-place and has no zero-downtime or rollback guarantee. Land a correcting commit
on `dev`; do not run a down-migration or point moving tags at the failed pair.

### `dev` to `main` release

The PR to `main` must pass Product CI plus the required release-policy check:
same repository, exact `dev` -> `main`, current `main` contained by `dev`, and
exactly one of `release:patch`, `release:minor`, or `release:major`. Merging is the
human production authorization; no production image or secret is exposed to the
PR run.

On the resulting `main` push:

1. Re-run Product CI for the exact merge commit.
2. Reconstruct at-merge bump intent for every unreleased production PR, compute
   the failure-stable candidate from the last product tag, and repair any partial
   older finalization before continuing.
3. Publish the production-specific digest pair and deploy it by digest through
   the production Actions environment and production-only Dokploy key.
4. After Dokploy `done` and both external checks pass, advance the `production`
   moving tags to the healthy pair.
5. Generate and coverage-check release notes; add write-once `vX.Y.Z` tags to
   both image digests and verify them; create and verify the lightweight Git tag
   at the deployed `main` SHA; create and verify the draft GitHub Release with
   SHA and digest provenance.
6. Mark the release finalized after the draft verifies. Human review/publication
   of the draft remains outside CD. Run pair-aware cleanup afterward, retaining
   this release plus the five previous production image pairs.

The Git reference is the product-version commit point. Failures before health
consume no version. Partial post-health finalization freezes and repairs the same
candidate before any newer production release; it never moves an existing
version tag or skips to another number.[releases]

### Direct production hotfix

“Direct” means a reviewed same-repository hotfix PR from a branch cut from current
`main` back into `main`, never an unreviewed direct push. The release-policy check
requires the branch to be current with `main`, forbids all `release:*` labels, and
contributes an inferred patch bump.

Immediately after merge, independently of the production deployment outcome, the
workflow summary emits the exact `main` -> `dev` compare/create-PR pointer and
names opening that carry-back PR as the human follow-up. The exact same `main`
Product/publication/deploy/health/finalization sequence also runs; there is no
reduced emergency lane and no bypass around migrations or backups. A production
failure does not postpone carry-back, and a carry-back delay does not invalidate
an already healthy production release, but the next `dev` -> `main`
release-policy check must fail until `dev` contains current `main`. Keeping the PR
human-opened avoids introducing a separate long-lived GitHub credential merely
to create it.

## Failure reporting and fix-forward recovery

GitHub Actions is the canonical status surface. Each remote job ends with a stable
name (`CD / Preview reconcile`, `CD / Development`, or `CD / Production`) and
writes a summary containing only target, SHA, digest pair, last completed state,
Actions run/attempt, Dokploy deployment ID and dashboard link, health category,
and next action. A failed transition exits non-zero; a genuinely superseded
pre-Dokploy candidate is cancelled/neutral rather than reported as a deployment
failure. GitHub Actions creates checks for workflow jobs and exposes run state in
the Actions tab.[^github-status-checks]

Use GitHub's built-in Actions email notifications as the initial alert channel;
do not add SMTP, webhook, or paging credentials. The repository owner/operator
must enable failed-workflow email notifications and acceptance-test one sanitized
failure in each of the three remote workflows. GitHub documents that subscribed
users can receive completion or failure-only email/web notifications and that the
message includes the run status.[^github-actions-email]

Dokploy's native Compose build-error notification can remain a supplementary
operator pointer once its shared email provider is configured, but it is not the
deployment authority and no email credential enters Actions.[^dokploy-compose-service]

The automated response to application failure is always **stop, report, and fix
forward**:

| Failure boundary | Result and next step |
| --- | --- |
| Product/classification/image publication | No Dokploy mutation; repair code or publisher. Orphans are cleanup candidates. |
| Resource save/render or queue acceptance | Running containers may still be old while stored desired configuration is newer. Do not manually redeploy; the next locked run converges exact state. |
| Remote `error`/`cancelled` | Do not advance tags. Inspect the correlated deployment and current `migrate`/API/web logs, preserve evidence if needed, then land a new commit. |
| Observer timeout/runner loss | Remote outcome is unknown; do not cancel or enqueue blindly. The next run discovers/waits for the queue or exact deployment row. |
| Dokploy `done`, API/database or web failure | Treat the deployment as failed despite Dokploy success; no healthy tags or release state. Fix forward. |
| Preview clone/migrate/health failure | Tear down the failed Compose and new isolated generation; no fallback to shared data for a schema PR. |
| Persistent migration failure | No down-migration and no automatic database restore. The API may be unavailable; correct the forward migration and redeploy. |
| Production post-health finalization failure | The deployed pair remains healthy. Repair the frozen image/Git/Release transaction before any newer release. |
| Retention cleanup failure | The healthy channel/release remains valid. Fail visibly and retry deletion only; never delete the healthy replacement to “undo” cleanup. |

No automatic rollback is added. The API image contains both the migration runner
and server, Compose deploys in place, Drizzle is forward-only, and the map
explicitly excludes blue/green and zero-downtime guarantees.

## Manual exceptional-recovery pointers

Implementation must consolidate these pointers into `docs/deploy.md` so an
operator does not improvise during a failure:

- **Before a corrective deploy during an incident:** preserve current
  container-local evidence using the existing “Export before planned replacement”
  procedure; container recreation otherwise discards prior logs.[^local-deploy]
- **Migration or application failure:** use the correlated Dokploy deployment,
  stopped `migrate` container, and bounded API/web/database logs; never bypass the
  migration gate or run Drizzle manually against production.[^local-deploy]
- **Stuck/unknown remote deployment:** freeze the target, inspect Dokploy queue and
  deployment history, and let an operator decide whether host-level termination is
  safer than waiting. Routine automation never kills it.
- **Preview cleanup or operator-secret failure:** follow the preview reconciler's
  Compose-first teardown and operator-quarantine procedure; an orphan consumes
  preview capacity until cleanup succeeds.[preview-db]
- **Partial release finalization:** run a “finalize/repair” path for the already
  healthy SHA/digest/version transaction; do not redeploy or calculate a new bump
  merely because a Git tag or draft is missing.[releases]
- **Credential exposure:** revoke/rotate first, update only the authoritative
  Actions environment or Dokploy store, then revalidate the affected boundary.
  Deleting a log is not credential recovery.[permissions]
- **Database restore or complete VPS loss:** freeze CD and follow the R2 temporary-
  restore or same-Dokploy-version reconstruction procedure. A restore is a manual
  incident decision, not an automatic rollback, and it carries no initial RTO.[recovery]

## Implementation boundaries and acceptance checks

The following are candidate module seams for final implementation review; they do
not settle the map's remaining exact file or ticket slicing:

1. shared, secret-free channel/SHA/tag/digest validation and Product-gate helpers;
2. environment-specific API/web publishers plus pair verification and cleanup;
3. one redacting Dokploy client implementing resource render, queue discovery,
   correlated deployment polling, and dashboard pointers;
4. one common external health checker;
5. persistent development and production orchestrators;
6. the global preview reconciler and database operator already scoped by the
   preview-database memo; and
7. release-policy/calculation/finalization plus operator runbook updates.

Reject the implementation unless tests demonstrate all of the following:

- a failed/skipped Product job, fork, draft, stale PR SHA, or malformed/missing
  digest cannot reach Dokploy;
- partial API/web publication never creates a deployable pair;
- a newer commit cancels replaceable work but cannot cancel a correlated remote
  deployment already started;
- three rapid revisions yield the running revision plus only the newest pending
  remote candidate, and each survivor revalidates current desired SHA;
- queue acceptance without a deployment ID is correlated exactly once through
  title/description, including ambiguous HTTP response and runner-restart cases;
- `running -> done`, `running -> error`, `cancelled`, missing record, duplicate
  match, and timeout paths all produce the specified result;
- a Dokploy `done` result with broken TLS, API, database, routing, or web root
  cannot advance moving/version tags;
- migration failure prevents API startup and never invokes a down-migration;
- preview close-during-deploy and schema-revision replacement converge without a
  leaked live Compose/database generation;
- a production health failure creates no version state, while every partial
  post-health finalization state repairs the same version idempotently;
- failure output and built-in email contain no environment dump, raw control-plane
  response, authorization header, connection string, Clerk key, or private user
  data; and
- manual hotfix carry-back, incident-log preservation, credential rotation,
  release repair, database restore, and full-VPS reconstruction all have a tested
  pointer in the runbook.

## Sources

[ticket]: https://github.com/rajat2006/unshelf/issues/249
[inventory]: https://github.com/rajat2006/unshelf/issues/240#issuecomment-5151271335
[topology]: https://github.com/rajat2006/unshelf/blob/d9263bf75eb2f3532215630c752b7264ee5a5c82/docs/research/dokploy-topology-and-compose-contract.md
[prototype]: https://github.com/rajat2006/unshelf/blob/bf7871422a501545d2d0a60f4cadb10204def0ac/prototypes/issue-242/RESULTS.md
[images]: https://github.com/rajat2006/unshelf/blob/1c34617b3e7fe1bdb911abcd428194554fad69ed/docs/research/environment-specific-image-build-tag-and-cd-handoff.md
[clerk]: https://github.com/rajat2006/unshelf/blob/28282b5611ca8a4e31956e95ec9c34a35ca000ab/docs/research/clerk-development-generated-http-hosts.md
[preview-db]: https://github.com/rajat2006/unshelf/blob/75f69d24e940f280f2ec1b73550c778e073b699b/docs/research/preview-database-automation.md
[recovery]: https://github.com/rajat2006/unshelf/blob/9ef79fb79ffe8078c89d6948f04db85c97e36170/docs/research/dokploy-r2-backup-restore-recovery.md
[releases]: https://github.com/rajat2006/unshelf/blob/57453dfc8d0fe43c93944aef1d16693145e5565d/docs/research/product-version-and-github-release-automation.md
[permissions]: https://github.com/rajat2006/unshelf/blob/7810c9ed669bd1b04b963765805e2909e9edcd6d/docs/research/ci-cd-secrets-and-permission-boundaries.md

[^local-ci]: Unshelf source, [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) and [`package.json`](../../package.json).
[^local-api-health]: Unshelf source, [`apps/api/src/app.ts`](../../apps/api/src/app.ts) and [`apps/api/src/schema.ts`](../../apps/api/src/schema.ts).
[^local-web-root]: Unshelf source, [`apps/web/index.html`](../../apps/web/index.html).
[^local-caddy]: Unshelf source, [`apps/web/Caddyfile`](../../apps/web/Caddyfile).
[^local-deploy]: Unshelf operator guide, [`docs/deploy.md`](../deploy.md), especially migration failure, container logs, and incident-evidence export.
[^github-status-checks]: GitHub Docs, [About status checks](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/collaborating-on-repositories-with-code-quality-features/about-status-checks).
[^github-check-runs]: GitHub Docs, [Using the REST API to interact with checks](https://docs.github.com/en/rest/guides/using-the-rest-api-to-interact-with-checks).
[^github-workflow-run]: GitHub Docs, [Events that trigger workflows: `workflow_run`](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_run).
[^github-secure-use]: GitHub Docs, [Secure use reference](https://docs.github.com/en/actions/reference/security/secure-use).
[^github-concurrency]: GitHub Docs, [Control workflow concurrency](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency).
[^github-actions-email]: GitHub Docs, [Notifications for workflow runs](https://docs.github.com/en/actions/concepts/workflows-and-actions/notifications-for-workflow-runs).
[^oci-distribution]: Open Container Initiative, [Distribution Specification](https://github.com/opencontainers/distribution-spec/blob/main/spec.md).
[^dokploy-compose-router]: Dokploy v0.29.13 source, [`compose.deploy` queue acceptance](https://github.com/Dokploy/dokploy/blob/8b868c66d6672be40b86315a704ea1b3b09cb2d3/apps/dokploy/server/api/routers/compose.ts#L407-L460).
[^dokploy-compose-service]: Dokploy v0.29.13 source, [Compose deployment execution and status updates](https://github.com/Dokploy/dokploy/blob/8b868c66d6672be40b86315a704ea1b3b09cb2d3/packages/server/src/services/compose.ts#L214-L338).
[^dokploy-deployment-router]: Dokploy v0.29.13 source, [`deployment.allByCompose` and `deployment.queueList`](https://github.com/Dokploy/dokploy/blob/8b868c66d6672be40b86315a704ea1b3b09cb2d3/apps/dokploy/server/api/routers/deployment.ts#L37-L125).
[^dokploy-deployment-service]: Dokploy v0.29.13 source, [newest-first Compose deployments and terminal timestamps](https://github.com/Dokploy/dokploy/blob/8b868c66d6672be40b86315a704ea1b3b09cb2d3/packages/server/src/services/deployment.ts#L786-L792) and [`updateDeploymentStatus`](https://github.com/Dokploy/dokploy/blob/8b868c66d6672be40b86315a704ea1b3b09cb2d3/packages/server/src/services/deployment.ts#L938-L955).
[^dokploy-deployment-schema]: Dokploy v0.29.13 source, [deployment status schema](https://github.com/Dokploy/dokploy/blob/8b868c66d6672be40b86315a704ea1b3b09cb2d3/packages/server/src/db/schema/deployment.ts#L20-L56).
[^dokploy-deployment-api]: Dokploy Docs, [Deployment API](https://docs.dokploy.com/docs/api/deployment).
[^dokploy-compose-builder]: Dokploy v0.29.13 source, [default detached Compose command](https://github.com/Dokploy/dokploy/blob/8b868c66d6672be40b86315a704ea1b3b09cb2d3/packages/server/src/utils/builders/compose.ts#L18-L67) and [`createCommand`](https://github.com/Dokploy/dokploy/blob/8b868c66d6672be40b86315a704ea1b3b09cb2d3/packages/server/src/utils/builders/compose.ts#L91-L108).
[^docker-startup]: Docker Docs, [Control startup and shutdown order in Compose](https://docs.docker.com/compose/how-tos/startup-order/) and [Compose `depends_on`](https://docs.docker.com/reference/compose-file/services/#depends_on).
