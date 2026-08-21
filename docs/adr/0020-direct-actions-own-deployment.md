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

The repository authority changes atomically: the direct entry workflows replace
the contained candidate/development workflows in the same implementation
change that removes `packages/deployment-control-plane` and its integration
surface. Development begins manual-only, proves a deployment and same-revision
no-op against the reused live resource, then enables and observes the schedule.
Preview follows development. A new, separately provisioned production
foundation follows preview and does not block retirement of development-only
machinery.

Reuse the live development Compose resource, domains, managed PostgreSQL
service, and network when their preflight passes. Repair version-sensitive
configuration in place; if the Compose resource is incompatible, replace only
that resource while preserving the managed database foundation. Delete only
inventoried orphans after replacement health. Existing GHCR versions remain
untouched, and Dokploy's built-in unused-local-image cleanup owns VPS image
pruning.

As a temporary accepted exception, development and preview share the existing
non-production database superuser. `MIGRATION_MODE=verify` prevents the preview
migration command from applying migrations, but database grants do not prevent
preview application code from issuing destructive SQL. Non-production data is
therefore disposable, and same-repository review, the preview label, exact CI,
the conservative schema-path refusal, and manual dispatch are organizational
controls rather than database enforcement. The deferred remediation is
[Split hosted-development database roles](https://github.com/rajat2006/unshelf/issues/290).
Production must use separate infrastructure and production-only credentials.

## Consequences

- Workflow YAML and small local helpers may validate HTTP/JSON, but channel
  policy cannot move behind a reusable orchestration engine or hidden state
  machine.
- Every non-no-op attempt leaves its images in GHCR. A retained digest may be a
  manual recovery option, but no rollback or retention window is promised.
- Manual preview refresh, capacity recovery, and teardown are accepted operator
  work until observed burden justifies another decision.
- Failed deployment, migration, or health never advances the healthy marker and
  triggers no automatic retry, rollback, cleanup, or notification workflow.
- Dokploy's installed-version behavior and all destructive cleanup remain live
  acceptance gates; API success alone does not prove runtime resources were
  removed.
- ADR-0017 remains accepted because the image, Compose, routing, and managed
  PostgreSQL boundaries it records are unchanged.
