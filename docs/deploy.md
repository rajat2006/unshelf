# Deploy Unshelf through Dokploy

This is the operator runbook for the deployment boundary recorded by
[ADR-0017](adr/0017-ci-images-and-managed-postgresql.md) and the direct workflow
authority recorded by [ADR-0020](adr/0020-direct-actions-own-deployment.md).

It describes the accepted replacement and its cutover. While the decision
document PR remains unmerged, implementation must use its pinned version rather
than assume the current default branch already contains the direct workflows.

## Operational contract

GitHub Actions is the only image publisher and deployment orchestrator. Dokploy
owns raw Compose resources, domains, deployment history, private image pulls,
and the running projection. Managed PostgreSQL lives outside application
Compose.

There are exactly three deployment entry workflows:

| Channel | Trigger | Selected revision | Dokploy target |
| --- | --- | --- | --- |
| Development | 22:00 `Asia/Kolkata` daily or manual dispatch | Exact current `dev` head | One configured stable Compose resource |
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
- Dokploy isolated deployment owns ingress. Native Dokploy Domains route
  `/api` to API port 3001 and `/` to web port 80 on one HTTPS origin.
- API and migrate additionally join the channel's private database network.

The complete resource environment contains:

| Name | Rule |
| --- | --- |
| `API_IMAGE` | Full `ghcr.io/rajat2006/unshelf-api@sha256:…` reference supplied by the workflow. |
| `WEB_IMAGE` | Full `ghcr.io/rajat2006/unshelf-web@sha256:…` reference supplied by the workflow. |
| `DATABASE_URL` | Opaque internal connection URL; never assemble or print it in workflow logs. |
| `DATABASE_TIME_ZONE` | PostgreSQL timezone defining Unshelf's server calendar day. |
| `DATABASE_NETWORK` | Private attachable overlay for the channel's managed PostgreSQL service. |
| `APP_NAME` | Dokploy-written isolated ingress network name. |
| `APPLICATION_NAME` | Stable channel/resource identity. |
| `PUBLIC_ORIGIN` | Exact canonical HTTPS origin with no trailing slash, path, query, fragment, or credentials. |
| `CLERK_SECRET_KEY` | Runtime secret for the matching Clerk instance. |
| `CLERK_PUBLISHABLE_KEY` | Runtime publishable key for the matching Clerk instance. |
| `MIGRATION_MODE` | `apply` for development and production; `verify` for previews. |
| `LOG_LEVEL` | Optional; defaults to `info`. |

The web publishable key is compiled into each channel-local web image. It is
not runtime configuration, and images are never promoted between channels.

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
   runtime environment, and both immutable references.
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

Use only the immutable pull-request number for resource identity:

- exact Compose name: `unshelf-pr-<number>`;
- stable application name: `unshelf-pr-<number>`;
- stable host: `pr-<number>.<configured preview suffix>`.

Search inside the configured preview environment and client-side exact-match
the resource name because Dokploy search is substring-based. If the resource is
absent, count exact `unshelf-pr-<integer>` resources and refuse creation when
three exist. A new resource requires:

1. `compose.create`, capturing its returned Compose ID;
2. one complete `compose.update` with trusted Compose, environment, isolation,
   and the digest pair;
3. one Domain record for `/api` and one for `/`; and
4. the same deploy, correlated poll, health, and marker sequence used by the
   stable channels.

A refresh begins with the complete update and reuses the resource and domains.
GitHub Actions is the only preview creator or updater. Deletion and capacity
recovery are explicit maintainer actions in Dokploy; closing, merging, or
unlabelling a pull request does not delete anything automatically.

## Channel policy

### Development

Development uses one fixed concurrency group. A delayed scheduled run still
resolves the current `dev` head when it starts; it does not deploy a stale event
SHA. Manual dispatch follows exactly the same path.

Development uses `MIGRATION_MODE=apply`. It reuses the existing Compose
resource, managed PostgreSQL service, private database network, domains, and
runtime configuration when the live preflight passes.

The schedule is absent during the initial authority switch. Enable the 22:00
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
| Secret | `DOKPLOY_DEVELOPMENT_COMPOSE_ENV` | Complete development runtime environment except workflow-bound images and public origin. |

Retain the aggregate Compose-environment secret initially. Its contents remain
runtime configuration even though the custom control-plane adapter disappears.

### Preview environment created

| Kind | Name | Rule |
| --- | --- | --- |
| Variable | `DOKPLOY_NONPRODUCTION_URL` | Same non-production Dokploy origin, stored in preview scope. |
| Variable | `DOKPLOY_PREVIEW_ENV_ID` | Fixed Dokploy environment in which preview resources are searched and created. |
| Variable | `DOKPLOY_PREVIEW_DOMAIN_SUFFIX` | Trusted suffix used to derive `pr-<number>` hosts. |
| Secret | `DOKPLOY_NONPRODUCTION_API_KEY` | Same project-scoped value, independently stored in preview scope. |
| Secret | `DOKPLOY_PREVIEW_COMPOSE_ENV` | Preview runtime environment with `MIGRATION_MODE=verify` and the accepted shared database superuser. |

The workflow injects per-preview images, application name, and public origin;
they do not belong in the aggregate secret.

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

Every failed authority/CI gate, build, Dokploy call, terminal deployment,
timeout, migration, or health probe fails the Actions run visibly. Failure:

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

Each run writes an allowlisted summary containing channel, selected SHA,
API/web digests, Dokploy resource and deployment identity, gate/health outcomes,
duration, and final state. Never print raw GitHub or Dokploy responses, Compose
environment, database URLs, tokens, cookies, secrets, or private health bodies.

Public health requires:

- API: HTTP 200 with JSON `status: ok` and `db: up`;
- web: HTTP 200 serving the Unshelf HTML application shell at `/`.

Dokploy `done` is not application health. It only means its deployment command
finished.

## Installed-version compatibility gate

Before the authority switch, record the live Dokploy, Traefik, and Docker
versions/digests and use a disposable preview-shaped resource to prove:

1. the Dokploy API origin is trusted HTTPS and rejects ambiguous URL forms;
2. the project-scoped API key works only inside its project;
3. Dokploy's registry credential can pull both private packages but cannot
   publish;
4. accepted `compose.create` fields and the returned Compose ID;
5. complete raw Compose/environment/isolation update behavior;
6. the private database-network attachment and isolated ingress topology;
7. exact search projection and last-healthy marker persistence;
8. two same-host Domain records and trusted HTTPS routing;
9. correlated deployment-record appearance and terminal states;
10. migration-before-API ordering and external health behavior; and
11. delete behavior, including a direct audit for leftover stacks, networks,
   domains, directories, and containers.

Stop for review on any unsupported field, ambiguous identity, failed isolation,
untrusted transport, or capacity limit. This compatibility check is disposable
acceptance evidence, not a new control plane.

## Replacement cutover

### 1. Inventory the live non-production foundation

Record only redacted stable identifiers for:

- the current development Compose resource and domains;
- the managed PostgreSQL service and service-spec networks;
- any legacy Compose resource, application-local database, volume, route,
  container, stack, directory, registry entry, or backup configuration;
- the currently deployed source/digests and health; and
- the current Dokploy unused-image-cleanup setting.

The non-production database overlay was historically attached manually. Verify
it in the PostgreSQL service spec, not just a running container. A Dokploy
Rebuild may drop an attachment that Dokploy does not own.

### 2. Reuse or repair development

Prefer the existing development Compose resource, domains, managed PostgreSQL
service, network, and GitHub Environment. Repair installed-version or network
drift in place when safe.

If the existing Compose resource cannot satisfy the accepted update, marker,
routing, or identity contract, create a replacement Compose resource in the
same non-production project and attach it to the existing managed database
foundation. Do not rebuild or delete the managed database merely because the
Compose resource is incompatible.

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
5. Add the 22:00 `Asia/Kolkata` schedule.
6. Observe one scheduled deployment or no-op.

### 5. Accept preview

1. Create and populate the `preview` GitHub Environment.
2. Label one eligible same-repository pull request.
3. Manually create its preview and verify migration equality, domains, HTTPS,
   API/web health, authentication, and marker evidence.
4. Refresh it to a newer eligible revision.
5. Delete it manually in Dokploy.
6. Verify its resource, routes, containers, stack, and directory are absent
   while development, managed PostgreSQL, and the database network remain.
7. Prove three-preview admission behavior with automated tests; do not create
   three live previews solely to test capacity.

### 6. Remove proven orphans and enable local image cleanup

Only after the replacement development/preview targets pass acceptance:

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

## Live acceptance record

For each channel, record only:

- installed platform versions/digests;
- channel and exact source SHA;
- API/web digests;
- Actions run and attempt;
- exact non-secret Compose and deployment identities;
- migration ordering and result;
- API/web/authentication pass/fail;
- no-op result where applicable;
- cleanup targets and post-delete audit result; and
- durations and final state.

Never record raw environments, connection strings, keys, tokens, cookies,
private response bodies, or sensitive incident logs in issues or Actions
summaries.

## Logs and incident evidence

Application containers use Docker's blocking `local` driver with byte-bounded
rotation. Local logs are not an audit trail: rotation removes old entries,
container recreation removes previous-container history, and VPS loss removes
everything local.

Treat exported logs as sensitive. Restrict access, inspect them for credentials
before sharing, and remove them when no longer needed. Prefer the allowlisted
Actions summary and Dokploy's correlated deployment record for ordinary
diagnosis.
