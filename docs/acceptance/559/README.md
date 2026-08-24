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

## Refresh and deletion

Pending a newer exact-green pull-request revision, identity-preserving refresh,
authenticated same-origin observation, pre-delete identity capture, manual
Dokploy deletion with volume removal disabled, and residue audit.
