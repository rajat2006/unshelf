# Preview lifecycle acceptance record

Issue: [#559](https://github.com/rajat2006/unshelf/issues/559)

Reviewed: 2026-08-24

This record contains allowlisted evidence for the live manual preview lifecycle.
It excludes credentials, aggregate environment values, private API response
bodies, browser state, and repository Playwright artifacts.

## GitHub configuration

- The `preview` GitHub Environment exists with no automatic deployment trigger
  or reviewer gate.
- Its variables are `DOKPLOY_NONPRODUCTION_URL`,
  `DOKPLOY_PREVIEW_ENV_ID`, and `DOKPLOY_PREVIEW_DOMAIN_SUFFIX`.
- Its secret-name inventory is `DOKPLOY_NONPRODUCTION_API_KEY` and
  `DOKPLOY_PREVIEW_COMPOSE_ENV`.
- The aggregate environment is allowlisted runtime configuration with
  `MIGRATION_MODE=verify`. Workflow-owned images, public origin, logical
  identity, runtime identity, and `DATABASE_NETWORK` are absent.
- The `deploy:preview` label exists as authorization only. Adding it to the
  acceptance pull request produced no workflow run.
- The non-production Dokploy identity can read `development` and `preview` but
  not `production`.

## Creation

- Pull request: [#570](https://github.com/rajat2006/unshelf/pull/570), open,
  non-draft, same-repository, targeting `dev`, carrying `deploy:preview`.
- Selected source:
  `86b47e5582821098bd800eefec83f58dd56288c2`, with exact successful Product
  CI before dispatch.
- Manual workflow:
  [run 32742934581](https://github.com/rajat2006/unshelf/actions/runs/32742934581),
  successful. Authorization, schema-change refusal, exact lookup/admission,
  both channel-local image builds, migration verification, one correlated
  deployment, public health, and final allowlisted summary all completed.
- Logical identity: `unshelf-pr-570`; public origin:
  `https://pr-570.200-141-9-57.sslip.io`.
- Independent public probes returned API status `ok` with database `up`, and a
  web document containing the Unshelf title and root mount.
- The creation run built both images; it was not a no-op.

## Refresh

- The acceptance record itself produced the newer pull-request revision
  `c5fefa99dd11509ef1067d12e604cfa612987d92`.
- Product CI for that exact revision passed on its single manual rerun. The
  first attempt completed all 384 API tests, then failed during PostgreSQL
  teardown with SQLSTATE `57P01` while the test database was being terminated.
- Manual workflow
  [run 32744008224](https://github.com/rajat2006/unshelf/actions/runs/32744008224)
  successfully refreshed the existing preview. It selected the newer exact
  SHA, rebuilt both images, skipped the no-op path, reconciled the same routes,
  and completed public API/database and web health checks.
- The logical identity and public origin remained `unshelf-pr-570` and
  `https://pr-570.200-141-9-57.sslip.io`.
- The refreshed runtime resolved to Compose ID `TY5oTtHdgm6uzv4WbdLIi`, runtime
  `appName` `unshelf-pr-570-lehmiv`, and deployment ID
  `v9zpIsdk1p9gUyjA2ANMc`.
- The deployed image digests were API
  `sha256:22f67991a54c34a6f6177b60bc2146770ac1e59f4ddc290fe035d215787cde1d`
  and web
  `sha256:a2416ef092533d6d2707bf135210e8aa657c10de48bb1a63d40099025897fa03`.
- A human signed in through the preview origin and observed an authenticated,
  same-origin `GET /api/items` request return HTTP 200. No browser state or
  response body was retained.

## Manual deletion

- Immediately before deletion, the live Compose record and both attached
  Domain records were read back by API. Their captured Domain IDs were
  `8VJsyt4tYKhf-h86KGAhr` and `kM8OewWNApNS3Zu6ODBBf`.
- A maintainer selected the resource by its exact logical name, Compose ID, and
  runtime `appName`, then deleted it manually in Dokploy with volume removal
  disabled.
- Post-delete API read-back found no Compose record by the captured logical
  name or ID and neither captured Domain record. The public preview route no
  longer answered.
- Read-only host checks found no captured Compose project, container, network,
  volume, or resource directory by runtime `appName`.
- The development Compose resource, managed PostgreSQL resource, shared
  `unshelf-nonprod-db` network, and development API/database health remained
  present.
- Removing `deploy:preview` from pull request #570 produced no workflow run;
  only the two manual `workflow_dispatch` runs exist.
