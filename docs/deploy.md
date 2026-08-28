# Deploy Unshelf through Dokploy

This is the operator runbook for the deployment boundary recorded by
[ADR-0017](adr/0017-ci-images-and-managed-postgresql.md) and the direct workflow
authority recorded by [ADR-0022](adr/0022-direct-actions-own-deployment.md).

It describes the accepted replacement and its cutover.

## Operational contract

GitHub Actions is the only image publisher and deployment orchestrator. Dokploy
owns raw Compose resources, domains, deployment history, private image pulls,
and the running projection. Managed PostgreSQL lives outside application
Compose.

There are exactly three deployment entry workflows:

| Channel | Trigger | Selected revision | Dokploy target |
| --- | --- | --- | --- |
| Development | 23:00 `Asia/Kolkata` daily or manual dispatch | Exact current `dev` head | One configured stable Compose resource |
| Preview | Manual dispatch with a pull-request number | Exact current head of an authorized pull request | Stable `unshelf-pr-<number>` Compose resource, at most three |
| Production | Manual dispatch with no inputs | Exact current `main` head | One configured stable Compose resource |

The workflows contain channel policy directly. Small repository-local helpers
may validate HTTP and JSON or keep YAML readable, but there is no generic
dispatcher, candidate object, custom control plane, persistent ledger, or
hidden state machine.

The system does not provide automatic rollback, down migration, cross-channel
image promotion, automatic GHCR cleanup, a bounded rollback window, release
versions, automatic preview refresh or deletion, a separate
deployment-notification workflow, or a zero-downtime guarantee.

## Runtime boundary

[`docker-compose.yml`](../docker-compose.yml) is the one trusted service graph
for every channel:

```text
migrate (API digest) ──completed──▶ api (same API digest) ──started──▶ web
          │                           │
          └──── private DB network ───┘
```

- `migrate` and `api` use the same full API digest.
- `api` cannot start until `migrate` exits successfully.
- `web` uses the paired web digest.
- Application Compose contains no PostgreSQL service, database volume, local
  image build, or host port publication.
- Dokploy owns application ingress. Native Dokploy Domains route `/api` to API
  port 3001 and `/` to web port 80 on one HTTPS origin. Read back the exact
  per-service network projection after configuration; do not assume the
  deprecated Isolated Deployment behavior. Retain
  `traefik.docker.network=${APP_NAME}` so Traefik selects the Dokploy-owned
  application ingress network rather than a private database network.
- API and migrate additionally join the channel's private database network.

The managed non-production PostgreSQL service is outside application Compose
and intentionally publishes VPS TCP 5432 for password-authenticated local
development. Hosted development and preview services do not use that endpoint;
they resolve the database service over the dedicated attachable overlay
`unshelf-nonprod-db`. PostgreSQL's only Swarm attachment is that overlay; it is
not attached to the shared `dokploy-network`. Treat the external authentication
surface as an accepted development-only exception while the local workflow
needs it. Do not copy it into production, and do not infer that application
service ports may be published.

The retained PostgreSQL record's generated `appName` remains the internal host
inside the opaque `DATABASE_URL`. There is no additional network alias. Normal
PostgreSQL deploys reapply the Dokploy-stored attachment; a manually applied
`docker service update --network-add` is not part of the contract.

The complete resource environment contains:

| Name | Rule |
| --- | --- |
| `API_IMAGE` | Full `ghcr.io/rajat2006/unshelf-api@sha256:…` reference supplied by the workflow. |
| `WEB_IMAGE` | Full `ghcr.io/rajat2006/unshelf-web@sha256:…` reference supplied by the workflow. |
| `DATABASE_URL` | Opaque internal connection URL; never assemble or print it in workflow logs. |
| `DATABASE_TIME_ZONE` | PostgreSQL timezone defining Unshelf's server calendar day. |
| `DATABASE_NETWORK` | Trusted workflow literal selecting the channel's private attachable overlay; development and preview use `unshelf-nonprod-db`. |
| `APP_NAME` | Dokploy-written runtime `appName`; selects the Compose project and runtime objects. Never supply or store it in GitHub configuration. |
| `APPLICATION_NAME` | Unshelf's stable logical channel/resource identity; derived by the workflow and persisted in the Compose environment. |
| `PUBLIC_ORIGIN` | Exact canonical HTTPS origin with no trailing slash, path, query, fragment, or credentials. |
| `CLERK_SECRET_KEY` | Runtime secret for the matching Clerk instance. |
| `CLERK_PUBLISHABLE_KEY` | Runtime publishable key for the matching Clerk instance. |
| `YOUTUBE_API_KEY` | Server-only YouTube Data API credential used for Discover previews and acquisition. |
| `MIGRATION_MODE` | `apply` for development and production; `verify` for previews. |
| `LOG_LEVEL` | Optional; defaults to `info`. |

The web publishable key is compiled into each channel-local web image. It is
not runtime configuration, and images are never promoted between channels.
Preview `name`, `appName`, and Compose ID live on the Dokploy Compose record;
the workflow derives or reads them for each run rather than storing dynamic
identity values in GitHub variables, secrets, repository files, or a ledger.
The non-production database network is different: its fixed, non-secret name is
deliberate repository policy, bound visibly by both trusted workflows.

## Revision authority and Product CI

Each workflow acquires its target concurrency group before selecting authority.
Active remote work is never cancelled (`cancel-in-progress: false`).

The workflow resolves the live branch or pull request itself; a dispatch input
never supplies a deployment SHA. It then requires a completed, successful
`Product` job from `ci.yml` for exactly that SHA and the required event:

- development: a `push` run for the exact `dev` SHA;
- preview: a `pull_request` run for the exact pull-request head SHA;
- production: a `push` run for the exact `main` SHA.

There is no last-green fallback. Once the workflow has selected and authorized
the revision, it pins that SHA for the attempt and does not re-read the ref,
pull-request head, or label after image building. A later change is handled by
a later manual or scheduled deployment.

Build jobs receive only `contents: read`, GHCR write authority, and non-secret
build configuration. They do not receive Dokploy, database, Clerk-secret, or
runtime environment credentials. A preview deploy job receives only trusted
workflow configuration and the two digest outputs; it never checks out or
executes pull-request material.

## Image identity

An authorized non-no-op attempt builds fresh API and web images in parallel
from the same full source SHA. Both tags include:

- channel;
- full source SHA;
- GitHub Actions run ID; and
- run attempt.

Preview tags also include the pull-request number. The two returned digests are
passed directly to the deploy job and validated as immutable SHA-256 digests.
Dokploy receives only `image@sha256:<digest>` references. There is no digest
rediscovery, mutable channel/success/failure tag, duplicate-tag rejection, or
cross-channel promotion.

Every pushed version remains in GHCR, including failed, cancelled, partial,
superseded, replaced-preview, and deleted-preview attempts. Registry
accumulation is accepted and is not a rollback promise.

## Direct Dokploy protocol

### Existing development or production resource

After authorization and CI, resolve the configured target exactly and read its
non-secret last-healthy marker. If the marker names the selected SHA and both
external probes are currently healthy, finish as an explicit no-op before
building images.

For a non-no-op attempt:

1. Build and pass the coherent API/web digest pair.
2. Call `compose.update` once with the complete trusted Compose configuration,
   runtime environment, `DATABASE_NETWORK=unshelf-nonprod-db` for development,
   and both immutable references.
3. Call `compose.deploy` once with a unique title containing channel, full SHA,
   run ID, and run attempt.
4. Poll only `deployment.allByCompose` for that exact title. Allow up to ten
   minutes for the record to appear and reach a terminal state.
5. After Dokploy reports `done`, poll public health for up to two minutes at
   five-second intervals.
6. Only after health passes, update the non-secret last-healthy description
   marker with channel, SHA, both digests, run/attempt, and Dokploy deployment
   identity.

Fail on an ambiguous record, `error`, `cancelled`, timeout, or failed health.
The organization-wide Dokploy queue, cancellation, staging, and route-promotion
APIs are not used.

### New or existing preview resource

Preview operations serialize through one global concurrency group so
count-and-create is race-free without a lock service.

The immutable pull-request number derives the stable logical identity:

- exact Compose `name`: `unshelf-pr-<number>`;
- Unshelf `APPLICATION_NAME`: `unshelf-pr-<number>`;
- stable host: `pr-<number>.<configured preview suffix>`.

Installed-version acceptance established a distinct Dokploy-owned runtime
identity. Creation supplies the logical name as the requested `appName` base,
then
requires the returned and read-back Compose record to contain the same exact
`name`, an opaque Compose ID, and `appName` equal to
`unshelf-pr-<number>-<six-character suffix>`. Dokploy writes that stored runtime
value into `APP_NAME`; the workflow never supplies, reconstructs, updates, or
separately persists it. A different returned shape or a later read-back
mismatch is installed-version drift and stops before deploy.

Search inside the configured preview environment because Dokploy filters by
substring. Client-side exact, case-sensitive matching on Compose `name` decides
the operation:

- zero exact matches: create after the capacity check;
- one exact match: refresh it by its returned Compose ID; and
- more than one exact match: fail as ambiguous and require manual cleanup.

For creation, count records whose exact `name` matches
`^unshelf-pr-[1-9][0-9]*$` and refuse a fourth. Count records rather than
distinct pull-request numbers: duplicates, failed creations, and partial
resources each consume a real slot. The limit does not prevent refreshing one
of the three existing previews.

A new resource requires:

1. `compose.create` with the exact logical `name` and requested `appName` base,
   capturing and validating the returned Compose ID and runtime `appName`;
2. one complete `compose.update` with trusted Compose, environment, the
   accepted v0.30.2 network configuration,
   `APPLICATION_NAME`, `DATABASE_NETWORK=unshelf-nonprod-db`, public origin, and
   the digest pair, omitting `appName`;
3. Domain reconciliation by Compose ID for the stable host: preserve the exact
   `/api` and `/` records, create either when missing, and fail without deleting
   on a duplicate or conflict; and
4. the same deploy, correlated poll, health, and marker sequence used by the
   stable channels.

A refresh repeats the exact-name lookup, validates the stored runtime
`appName`, performs the complete update, and applies the same bounded Domain
reconciliation. Deployment polling uses `deployment.allByCompose` for that
Compose ID and the exact channel/SHA/run/attempt title; neither name is a
correlation substitute. A retry can therefore finish missing Domain creation,
but it never repairs conflicting records or deletes anything automatically.

GitHub Actions is the only preview creator or updater. Deletion and capacity
recovery are explicit maintainer actions in Dokploy; closing, merging, or
unlabelling a pull request does not delete anything automatically. Immediately
before deletion, read the live Compose record and capture its exact logical
`name`, Compose ID, and runtime `appName`. Select the dashboard resource by
logical name and ID, then audit Dokploy records and stable host by logical
identity and audit the Docker project, application networks, containers, and
resource directory by the captured runtime `appName`. Never infer the suffix
after deleting the record.

## Channel policy

### Development

Development uses one fixed concurrency group. A delayed scheduled run still
resolves the current `dev` head when it starts; it does not deploy a stale event
SHA. Manual dispatch follows exactly the same path.

Development uses `MIGRATION_MODE=apply`. It reuses the existing Compose
resource, managed PostgreSQL service, private database network, domains, and
runtime configuration when the live read-back passes.

Local development connects directly to the managed non-production PostgreSQL
service through the VPS TCP 5432 endpoint with non-production credentials. The
endpoint is retained for that workflow; do not remove it merely to make the
managed service appear private-only. Never record its credentials or connection
string as acceptance evidence.

The schedule is absent during the initial authority switch. Enable the 23:00
`Asia/Kolkata` schedule only after one manual deployment and an immediate
same-revision healthy no-op pass. Observe one scheduled deployment or no-op
before declaring development rollout complete.

### Preview

The manual preview workflow accepts only a pull-request number and requires:

- an open, non-draft, same-repository pull request into `dev`;
- the `deploy:preview` label;
- exact successful Product CI for its current head; and
- no changes to API schema definitions, committed migrations, migration
  runner/verifier behavior, Drizzle configuration, or relevant
  migration-runtime dependency versions compared with current `dev`.

An eligible preview uses `MIGRATION_MODE=verify`; its migration step must find
exact ordered equality with the canonical development migration ledger.
Schema-affecting work receives a hosted preview only after its migration reaches
`dev`, development applies it, and the pull-request branch incorporates it.

Development and preview temporarily use the same managed non-production
database and the same database superuser. This means `verify` prevents the
migration command from applying schema changes but database grants do not stop
preview application code from issuing DDL or destructive SQL. A same-repository
label, exact CI, conservative path refusal, and manual dispatch reduce exposure;
they do not make the database read-only. Treat non-production data as
disposable. The deferred remediation is
[Split hosted-development database roles](https://github.com/rajat2006/unshelf/issues/290).

A development migration does not stop or recreate active previews. Existing
previews continue best-effort with no compatibility guarantee after the shared
schema advances.

### Production

Production has no pre-existing Dokploy foundation. Provision it last in a
separate Dokploy project with a distinct managed PostgreSQL service, network,
Compose resource, domains, registry access, API identity, database credentials,
Clerk Production instance, and GitHub secrets. It must not reuse the accepted
non-production superuser credential.

The production workflow is `workflow_dispatch` only and accepts no inputs. The
first attempt must run for `main`, resolve the current `main` head, and require
exact successful push Product CI. Manual dispatch itself is approval; the
GitHub Environment has no additional reviewer gate.

The full source SHA is the release identity. A release exists only after
Dokploy completes and external health passes. The successful workflow creates a
GitHub Deployment for environment `production` containing the full SHA, API/web
digests, Actions run/attempt, and Dokploy deployment reference. The latest
successful such Deployment is the canonical release record; Dokploy remains
literal runtime truth.

A built-in rerun preserves the original production SHA. Refuse it if a newer
production release has succeeded or that SHA is no longer part of `main`. A new
dispatch targets the then-current `main` head.

Production provisioning and acceptance do not block removal of the prior
development-only deployment machinery. Backup implementation and recovery
drills remain an independent effort.

## GitHub Actions configuration

Use separate `development`, `preview`, and `production` GitHub Environments.
Do not expose one environment's stored configuration to another channel job,
even where non-production values happen to be equal.

### Repository variables retained

| Name | Consumer |
| --- | --- |
| `VITE_CLERK_PUBLISHABLE_KEY_NONPRODUCTION` | Development and preview web builds. |
| `VITE_CLERK_PUBLISHABLE_KEY_PRODUCTION` | Production web builds. |

`GITHUB_TOKEN` is generated by Actions and is not a stored secret.

### Development environment retained

| Kind | Name | Rule |
| --- | --- | --- |
| Variable | `DOKPLOY_NONPRODUCTION_URL` | Exact HTTPS Dokploy origin. |
| Variable | `DOKPLOY_DEVELOPMENT_COMPOSE_ID` | Stable ID of the accepted development Compose resource. |
| Variable | `DEVELOPMENT_PUBLIC_ORIGIN` | Exact development HTTPS origin. |
| Secret | `DOKPLOY_NONPRODUCTION_API_KEY` | Non-owner identity restricted to the non-production project. |
| Secret | `DOKPLOY_DEVELOPMENT_COMPOSE_ENV` | Complete sensitive development runtime environment except workflow-bound images, public origin, and `DATABASE_NETWORK`. |

Retain the aggregate Compose-environment secret initially. Its contents remain
runtime configuration even though the custom control-plane adapter disappears.
Remove any stored `DATABASE_NETWORK` line from it when the trusted workflow
begins binding the accepted literal.

### Preview environment created

| Kind | Name | Rule |
| --- | --- | --- |
| Variable | `DOKPLOY_NONPRODUCTION_URL` | Same non-production Dokploy origin, stored in preview scope. |
| Variable | `DOKPLOY_PREVIEW_ENV_ID` | Fixed Dokploy environment in which preview resources are searched and created. |
| Variable | `DOKPLOY_PREVIEW_DOMAIN_SUFFIX` | Trusted suffix used to derive `pr-<number>` hosts. |
| Secret | `DOKPLOY_NONPRODUCTION_API_KEY` | Same project-scoped value, independently stored in preview scope. |
| Secret | `DOKPLOY_PREVIEW_COMPOSE_ENV` | Sensitive preview runtime environment with `MIGRATION_MODE=verify` and the accepted shared database superuser, excluding `DATABASE_NETWORK`. |

The workflow injects per-preview images, logical `APPLICATION_NAME`, and public
origin; it also injects the trusted `unshelf-nonprod-db` network literal. These
values do not belong in the aggregate secret. Dokploy derives `APP_NAME` from
its stored runtime `appName`; neither runtime value is GitHub configuration.

### Production environment populated later

| Kind | Name | Rule |
| --- | --- | --- |
| Variable | `DOKPLOY_PRODUCTION_URL` | Exact HTTPS production Dokploy origin. |
| Variable | `DOKPLOY_PRODUCTION_COMPOSE_ID` | Stable production Compose ID. |
| Variable | `PRODUCTION_PUBLIC_ORIGIN` | Exact production HTTPS origin. |
| Secret | `DOKPLOY_PRODUCTION_API_KEY` | Production-only project identity. |
| Secret | `DOKPLOY_PRODUCTION_COMPOSE_ENV` | Complete production runtime environment with `MIGRATION_MODE=apply` and production-only database credentials. |

Unrelated Sandcastle, Daily Project Digest, backup-monitoring, and agent secrets
or variables are not deployment-retirement targets. Delete a deployment setting
only after the replacement workflow demonstrably has no reference to it.

## Failure, retry, and evidence

Authority gates and workflows detect failures automatically. Every failed
authority/CI gate, build, Dokploy call, terminal deployment, timeout, migration,
or health probe fails the Actions run visibly. Operators retain control of
retry, rollback, repair, cancellation, and cleanup decisions. Failure:

- never advances the last-healthy marker;
- never retries automatically;
- never rolls back application or database state;
- never runs a down migration;
- never cancels remote work;
- never tears down a preview;
- never deletes an image; and
- never triggers a separate notification workflow.

A failed refresh may leave a preview degraded. A partially created preview
remains visible for manual retry or deletion. Recovery is another authorized
deployment, a built-in rerun where its identity remains valid, or a fix-forward
change.

Development and preview may retry through another manual action or a built-in
rerun. Retry the same SHA while it remains the authorized current revision;
otherwise a fresh manual action selects the then-current authorized revision.
Every retry receives a distinct run-attempt image-pair identity. Production
reruns follow the stricter preserved-release rules in the production section.

If an Actions run is interrupted after remote work begins, inspect the exact
Dokploy Compose resource and correlated deployment and wait for remote work to
settle before retrying. Do not cancel or adopt outstanding work automatically.
A one-off Docker extraction checksum failure permits a normal retry with the
same exact digests. If the checksum failure recurs, stop for diagnosis; image
removal, Docker restart, host repair, or substituting one image in the pair
requires reproducible evidence and a separate manual decision.

Each run writes an allowlisted summary containing channel, selected SHA,
API/web digests, gate/health outcomes, duration, and final state. Once a target
is resolved, also record its exact Compose `name`, Compose ID, runtime `appName`,
and deployment ID when one exists; a no-op records the first three without
inventing a deployment. These summaries are evidence, not configuration or an
identity ledger. The last-healthy marker does not duplicate the names because
it lives on the Compose record that owns them. Never print raw GitHub or Dokploy
responses, Compose environment, database URLs, tokens, cookies, secrets, or
private health bodies.

Public health requires:

- API: HTTP 200 with JSON `status: ok` and `db: up`;
- web: HTTP 200 serving the Unshelf HTML application shell at `/`.

Dokploy `done` is not application health. It only means its deployment command
finished.

## Pre-cutover read-back

The accepted control-plane baseline is exact Dokploy v0.30.2, and the retained
PostgreSQL service has already been moved through the supported Dokploy surface
to the dedicated attachable `unshelf-nonprod-db` overlay. Do not repeat the
discarded eleven-gate compatibility exercise.

Before the authority switch, independently re-read the exact installed Dokploy,
Docker, and Traefik versions; the retained PostgreSQL record, PostgreSQL 18
image, volume, generated identity, credential references, TCP 5432 publication,
and sole overlay attachment; the development Compose resource, Domains, runtime
identity, deployed revision/digests, and health; the orphan inventory; and the
unused-local-image-cleanup setting. Record only redacted, stable identifiers.

Stop for review on an unsupported field, ambiguous identity, changed retained
database invariant, failed isolation, untrusted transport, or capacity limit.
Do not substitute manual Docker network or service mutation. The intentional
non-production PostgreSQL endpoint is not by itself failed isolation: hosted
services must use the internal overlay path, invalid external authentication
must fail, and production remains private-only.

## Replacement cutover

### 1. Inventory the live non-production foundation

Record only redacted stable identifiers for:

- the current development Compose resource and domains;
- the managed PostgreSQL service and service-spec networks;
- its intentional development-only TCP 5432 publication and redacted
  authentication-required result;
- any legacy Compose resource, application-local database, volume, route,
  container, stack, directory, registry entry, or backup configuration;
- the currently deployed source/digests and health; and
- the current Dokploy unused-image-cleanup setting.

The accepted baseline has the retained PostgreSQL service attached only to the
Dokploy-owned attachable overlay `unshelf-nonprod-db`. Treat any missing,
additional, or changed attachment as drift and stop before application cutover.

### 2. Reuse or repair development

Prefer the existing development Compose resource, domains, managed PostgreSQL
service, and GitHub Environment. Before any application deploy, confirm that
the retained database record, PostgreSQL 18 image, named volume and mount,
generated service identity, credential references, internal port, intentional
TCP 5432 publication, and sole `unshelf-nonprod-db` attachment still match the
accepted baseline. Confirm authenticated local access works and invalid
authentication is rejected without recording credentials or raw output.

If any read-back differs, stop and leave the application resource unchanged.
Never rebuild or replace the retained database merely to repair deployment.

Preserve the managed service's TCP 5432 publication while direct local
development depends on it. Its presence is not drift and does not require
containment, replacement, a tunnel, or a private-network project. Revisit the
access path separately only when operational or security evidence justifies the
additional scope.

If the existing Compose resource cannot satisfy the accepted update, marker,
routing, or identity contract, create a replacement Compose resource in the
same non-production project and attach it to the existing managed database
foundation. Re-resolve and read back the exact target before any change. Do not
rebuild or delete the managed database merely because the Compose resource is
incompatible.

### 3. Switch repository authority atomically

In one implementation change:

- add the direct development (manual-only initially), preview, and production
  entry workflows;
- delete `.github/workflows/publish-candidate.yml` and
  `.github/workflows/deploy-development.yml`;
- delete `packages/deployment-control-plane`;
- remove its root scripts/filters, TypeScript globs, lockfile importer, and
  shared lint-contract expectations; and
- retain `docker-compose.yml`, Dockerfiles, Caddyfile, runtime Compose tests,
  and the still-required GitHub configuration.

Do not keep the old workflows as a fallback. Failure after the authority switch
is fixed forward; source history remains available for investigation without
leaving two runnable authorities.

### 4. Accept development and enable its schedule

1. Manually deploy the exact current green `dev` head.
2. Require coherent digests, migration success, Dokploy completion, public API
   and web health, same-origin Clerk login, a protected API call, and the
   last-healthy marker.
3. Confirm credential/log hygiene and that non-production automation cannot
   reach production.
4. Immediately rerun the same revision and prove a healthy no-op.
5. Add the 23:00 `Asia/Kolkata` schedule.
6. Observe one scheduled deployment or no-op.

### 5. Accept preview

1. Create and populate the `preview` GitHub Environment.
2. Label one eligible same-repository pull request.
3. Manually create its preview and verify exact logical-name lookup, the returned
   suffixed runtime `appName`, migration equality, domains, HTTPS, API/web health,
   authentication, and marker evidence.
4. Refresh it to a newer eligible revision.
5. Capture the logical `name`, Compose ID, and runtime `appName`, then delete it
   manually in Dokploy.
6. Verify by those captured identities that its resource, routes, containers,
   stack, network, and directory are absent while development, managed
   PostgreSQL, and the database network remain.
7. Prove three-preview admission behavior with automated tests; do not create
   three live previews solely to test capacity.

### 6. Remove proven orphans and enable local image cleanup

Only after the replacement development/preview targets pass acceptance:

**Do not remove the legacy resource** or any associated application-local
database volume until replacement health passes and the exact deletion target
has been resolved and re-read.

1. resolve every deletion target by exact stable identifier;
2. recheck it immediately before deletion;
3. remove only obsolete Compose resources, routes, containers, stacks,
   directories, application-local databases/volumes, and unused credentials;
4. directly audit the host because a successful Dokploy delete response does
   not prove runtime cleanup;
5. preserve the managed PostgreSQL service, accepted Compose resource,
   database network, domains, shared Dokploy/Traefik state, and unrelated
   resources;
6. leave all GHCR versions untouched;
7. enable Dokploy's built-in unused-local-image cleanup; and
8. observe one cleanup cycle and prove active digest-pinned images remain.

Record every irreversible removal and the evidence that distinguished the
orphan from retained state.

### 7. Provision and accept production last

Provision the isolated production foundation from scratch. Its first manual
deployment must pass exact-current-`main` Product CI, migration, Dokploy
completion, API/web and authentication checks, credential-isolation checks,
the last-healthy marker, and the successful GitHub Deployment record.

Production acceptance is not a prerequisite for closing the old
development-only authority. Do not close the independent backup/recovery work
as part of this deployment replacement.

### 8. Retire superseded tracker work

The replacement backlog must:

- close
  [Wayfinder: specify Dokploy CD for development, previews, and production](https://github.com/rajat2006/unshelf/issues/239)
  as a completed historical map whose decisions were later reopened;
- close
  [Continuously deliver development, PR previews, and production through Dokploy](https://github.com/rajat2006/unshelf/issues/268)
  and its remaining execution tickets as superseded, linking the replacement
  map and PRD;
- state that hosted development was genuinely deployed and that remaining live
  acceptance/cleanup moved to the replacement;
- keep
  [Split hosted-development database roles](https://github.com/rajat2006/unshelf/issues/290)
  open and broaden it to cover previews; and
- leave
  [Stand up R2 backups and recovery before the first non-founder user](https://github.com/rajat2006/unshelf/issues/40)
  untouched.

Legacy research/artifact PRs and the stale control-plane correction PR were
closed without merging with supersession comments. The current redesign's
[research/prototype PR](https://github.com/rajat2006/unshelf/pull/514) remains
open until its review surface is no longer useful.

## Testing and browser-automation boundary

Automated tests observe the development, preview, and production workflow
interfaces and the retained resolved-Compose and PostgreSQL migration
interfaces. Small helpers use fake GitHub and Dokploy adapters where necessary;
live acceptance uses workflow conclusions, independent API read-back, runtime
topology, and external health probes.

No automated or live test may read or depend on repository Playwright
configuration, `.playwright-cli` state, saved sessions, snapshots, screenshots,
traces, or generated browser artifacts. Do not add Playwright infrastructure
for deployment acceptance. A temporary authenticated browser session may
perform a UI-only configuration step when supported APIs and CLIs cannot, but
the session, click result, and screenshots are neither test inputs nor
acceptance evidence. Independently read back the resulting configuration.

## Live acceptance record

For each channel, record only:

- installed platform versions/digests;
- channel and exact source SHA;
- API/web digests;
- Actions run and attempt;
- exact non-secret Compose `name`, Compose ID, runtime `appName`, and deployment
  ID when a deployment exists;
- migration ordering and result;
- API/web/authentication pass/fail;
- no-op result where applicable;
- cleanup targets and post-delete audit result; and
- durations and final state.

Never record raw environments, connection strings, keys, tokens, cookies,
private response bodies, or sensitive incident logs in issues or Actions
summaries.

## Logs and incident evidence

Application containers use Docker's blocking `local` driver:

| Service | Rotation | Nominal budget |
| --- | ---: | ---: |
| api | `20m` × 5 | 100 MB |
| web | `5m` × 3 | 15 MB |
| migrate | `5m` × 3 | 15 MB |

The **130 MB** total is byte-bounded, not time-bounded. Rotation removes old
entries, container recreation removes previous-container history, and VPS loss
removes all local history. It is not an audit trail and not a cross-deployment
archive. Logs may include sensitive User data and require restricted access.

From the Dokploy Compose resource directory:

```sh
docker compose -f docker-compose.yml ps --all
docker compose -f docker-compose.yml logs --since=30m --tail=200 --timestamps api
docker compose -f docker-compose.yml logs --timestamps migrate
docker compose -f docker-compose.yml logs --since=2h --tail=500 --timestamps api web

docker inspect --format '{{.Name}} {{json .HostConfig.LogConfig}}' \
  "$(docker compose -f docker-compose.yml ps --quiet api)"
docker inspect --format '{{.Name}} {{json .HostConfig.LogConfig}}' \
  "$(docker compose -f docker-compose.yml ps --all --quiet migrate)"

docker compose -f docker-compose.yml logs \
  --since=24h --timestamps --no-color api web migrate > unshelf-predeploy.log
```

Treat `unshelf-predeploy.log` as sensitive incident evidence: restrict access,
inspect it for credentials before sharing, and remove it when no longer needed.
Prefer the allowlisted Actions summary and Dokploy's correlated deployment
record for ordinary diagnosis.
