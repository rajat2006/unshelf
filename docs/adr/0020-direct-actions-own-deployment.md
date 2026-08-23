# Direct GitHub Actions workflows own deployment

## Status

Accepted

## Context

ADR-0017 established the durable runtime boundary: GitHub Actions builds private,
channel-local API/web image pairs; Dokploy consumes immutable digests; one
`migrate -> api -> web` Compose contract connects to managed PostgreSQL. The
first implementation put candidate selection, image correlation, deployment
reconciliation, and retry rules in a custom `deployment-control-plane` package
and two chained workflows. That machinery made a small deployment policy harder
to inspect and still failed to provide a usable same-revision retry.

The replacement must support only scheduled/manual development, manually
requested label-authorized previews, and manual production. It deliberately
does not provide automatic rollback, automatic preview lifecycle management,
image retention, cross-channel promotion, release versions, or a deployment
ledger.

## Decision

Three channel-specific GitHub Actions workflows are the only deployment
authorities. Each workflow keeps its channel policy visible, selects and pins an
authorized revision, requires exact-revision Product CI, builds one fresh
channel-local API/web pair, passes the resulting digests directly to its deploy
job, updates Dokploy once with the coherent pair, follows one correlated
deployment, requires basic external health, and records a non-secret
last-healthy marker. There is no generic dispatcher, candidate state machine,
durable ledger, moving channel tag, or custom orchestration package.

Development selects the current green `dev` head at 22:00 Asia/Kolkata or on
manual request. Preview deployment is a manual action for an open, non-draft,
same-repository pull request into `dev` carrying `deploy:preview`; the workflow
creates or refreshes a stable `unshelf-pr-<number>` resource and refuses a
fourth preview. Preview deletion remains a manual Dokploy operation. Production
is a no-input manual action for the exact current green `main` head; the latest
healthy `production` GitHub Deployment is its canonical release record.

The accepted installed control-plane baseline is Dokploy v0.30.2. Network
Management is an officially released feature from v0.30.0 onward, and the exact
published v0.30.2 image plus the upgraded live dashboard were verified before
this decision: authenticated `network.all` succeeds and **Docker → Networks →
Add network** exposes an overlay driver and attachable option. That read-only
evidence authorizes a fresh installed-version acceptance run; it does not by
itself authorize creating a network or changing PostgreSQL or Compose.

The v0.29.14 preflight established that a preview has two Compose identities.
Its exact logical `name` and Unshelf `APPLICATION_NAME` are
`unshelf-pr-<number>`; they own lookup, admission, the public host, and
application observability.
`compose.create` receives that value as the requested `appName` base but returns
an immutable `unshelf-pr-<number>-<six-character suffix>` runtime `appName` and
an opaque Compose ID. Dokploy owns that runtime value, writes it as `APP_NAME`,
and uses it for the Compose project, runtime objects, and resource directory.
The workflow reads both values from the Compose record on every run and creates
no identity mapping or ledger. Because v0.30 changes Compose network behavior
and deprecates Isolated Deployment, the complete v0.30.2 acceptance run must
reverify the returned identity and network projection instead of inheriting the
partial v0.29.14 result.

Preview search is scoped to the configured environment and client-side exact
matches the logical `name`; zero matches creates, one refreshes by Compose ID,
and more than one fails as ambiguous. Each canonical Compose record consumes
one of the three slots, including duplicates and partial resources. Domains
derive from the logical pull-request identity and attach by Compose ID, while
deployment polling uses that ID plus an exact run title. Manual deletion captures
the runtime `appName` before removing the Compose record so host cleanup can
audit the exact Docker project, network, containers, and directory.

The repository authority changes atomically: the direct entry workflows replace
the contained candidate/development workflows in the same implementation
change that removes `packages/deployment-control-plane` and its integration
surface. Development begins manual-only, proves a deployment and same-revision
no-op against the reused live resource, then enables and observes the schedule.
Preview follows development. A new, separately provisioned production
foundation follows preview and does not block retirement of development-only
machinery.

Reuse the live development Compose resource, domains, and managed PostgreSQL
service when their preflight passes. The live database's sole attachment,
`dokploy-network`, is Dokploy's shared platform overlay and is not the accepted
environment-specific database boundary. Through Dokploy-owned configuration,
create the attachable overlay `unshelf-nonprod-db`, persist it as PostgreSQL's
only Swarm network attachment, and remove the shared attachment. Do not replace
the retained database or add a separate database hostname alias: its generated
service `appName` remains the host inside the opaque connection URL.

Create that overlay only through the verified v0.30.2 Dokploy surface and
inspect both the Dokploy record and Docker overlay before touching the retained
service. Immediately before the PostgreSQL update, re-read its record identity,
data-volume attachment, generated service identity, credential references, and
intentional TCP 5432 publication. Only its absolute `networkSwarm` list is an
authorized change. After redeployment, reverify those invariants and the sole
overlay attachment before allowing a disposable application fixture to use the
network.

Development and preview workflows bind the non-secret literal
`DATABASE_NETWORK=unshelf-nonprod-db` in trusted repository code rather than a
GitHub variable, aggregate secret, runtime discovery, or identity ledger. If the
installed Dokploy API cannot persist and reapply the network configuration,
cutover stops rather than falling back to a manual Docker mutation. If the
Compose resource is incompatible, replace only that resource while preserving
the managed database foundation. Delete only inventoried orphans after
replacement health. Existing GHCR versions remain untouched, and Dokploy's
built-in unused-local-image cleanup owns VPS image pruning.

As a temporary accepted exception, development and preview share the existing
non-production database superuser. `MIGRATION_MODE=verify` prevents the preview
migration command from applying migrations, but database grants do not prevent
preview application code from issuing destructive SQL. Non-production data is
therefore disposable, and same-repository review, the preview label, exact CI,
the conservative schema-path refusal, and manual dispatch are organizational
controls rather than database enforcement. The deferred remediation is
[Split hosted-development database roles](https://github.com/rajat2006/unshelf/issues/290).
Production must use separate infrastructure and production-only credentials.

Local development also connects directly to that managed non-production
PostgreSQL service through its VPS TCP 5432 endpoint. The published endpoint and
password-authenticated access are an intentional development-only exception,
not an application Compose port or an isolation failure. Hosted API, migration,
and preview services still use the private database overlay. This accepts that
the PostgreSQL authentication surface is externally reachable while preserving
the current low-friction local workflow and disposable-data boundary. A tunnel,
private network, or narrower network policy remains future hardening only when
observed need justifies it. Production must not copy the exception.

## Consequences

- Workflow YAML and small local helpers may validate HTTP/JSON, but channel
  policy cannot move behind a reusable orchestration engine or hidden state
  machine.
- Every non-no-op attempt leaves its images in GHCR. A retained digest may be a
  manual recovery option, but no rollback or retention window is promised.
- Manual preview refresh, capacity recovery, and teardown are accepted operator
  work until observed burden justifies another decision.
- Dokploy `name` is the stable preview lookup identity; its generated `appName`
  is runtime truth. Neither is copied into GitHub configuration or a separate
  persistent mapping.
- Failed deployment, migration, or health never advances the healthy marker and
  triggers no automatic retry, rollback, cleanup, or notification workflow.
- Dokploy's installed-version behavior and all destructive cleanup remain live
  acceptance gates; API success alone does not prove runtime resources were
  removed.
- The full eleven-gate compatibility run restarts on v0.30.2. The earlier
  v0.29.14 partial results are not carried forward because default and
  per-service networking changed and Isolated Deployment was deprecated.
- The installed-version gate records and authenticates through development's
  intentional PostgreSQL endpoint; the endpoint's presence alone is not failed
  isolation. Application ingress, private-overlay membership, and production
  database isolation remain separate requirements.
- Ordinary PostgreSQL deploys reapply the Dokploy-stored
  `unshelf-nonprod-db` attachment. Deleting the overlay or PostgreSQL record is a
  separate reprovisioning event and requires restoring that explicit contract.
- Local development keeps the published TCP 5432 path while hosted development
  and previews use only the dedicated overlay. Production must use its own
  dedicated overlay and remains private-only.
- ADR-0017 remains accepted because the image, Compose, routing, and managed
  PostgreSQL boundaries it records are unchanged.
