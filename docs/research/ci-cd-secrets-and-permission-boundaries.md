# CI/CD secrets and permission boundaries

**Research date:** 2026-08-01
**Issue:** [Define CI/CD secrets and permission boundaries](https://github.com/rajat2006/unshelf/issues/248)

## Question

What least-privilege credentials and GitHub/Dokploy permission boundaries implement the trust model fixed by [the CI/CD wayfinder map](https://github.com/rajat2006/unshelf/issues/239), without recording any credential value?

## Recommendation

Use three static GitHub Actions environments and two Dokploy projects:

- `development`, restricted to the `dev` branch, contains only the non-production Dokploy API key in the baseline design. Same-repository PR builds do not reference it. A trusted `workflow_run` workflow stored on `dev` performs preview orchestration after independently validating the originating run and image digests. If the later preview-database decision proves that an external provisioning login is unavoidable, that distinct non-production-only credential is the sole permitted addition.
- `production`, restricted to `main`, contains only the production Dokploy API key. The reviewed `dev` → `main` release PR is the human approval boundary. Required environment reviewers are optional Enterprise hardening, not a baseline dependency, because they are unavailable for private repositories on ordinary GitHub Free, Pro, and Team plans.[^github-environments]
- `backup-monitoring`, restricted to `dev`, contains only the R2 Object Read-only access-key pair used by the default-branch backup sentinel. Although called read-only, this credential can download every object in the one private backup bucket, including production database and control-plane archives; the latter contains its encryption key. It is therefore production-equivalent and must never be exposed to build, preview, development-deploy, or production-deploy jobs.

Use separate **production** and **non-production** Dokploy projects, not merely environments in one project. In Dokploy v0.29.13, Compose creation authorizes against `projectId`; a member allowed to create services in a shared project could select its production environment.[^dokploy-compose-create][^dokploy-service-access] Give two non-owner member users separate expiring API keys and access only to their own project/services. Retain one machine-account GHCR classic PAT with only `read:packages` for Dokploy pulls; do not split it by deployment environment.

Keep runtime credentials in the narrowest Dokploy service/environment scope. GitHub Actions publishes images with its per-job `GITHUB_TOKEN` and never stores or passes the raw production Clerk, database, or R2 write credentials. The production Dokploy API key is nevertheless transitive authority over service configuration under v0.29.13's coarse member permissions, so protect it as if it were the production runtime-secret set. Same-repository preview containers intentionally receive non-production runtime access; collaborators who can write repository code are therefore inside the non-production trust boundary. Production networks, projects, services, and credentials remain unreachable from pull-request and non-production automation.

## Trust boundaries

| Boundary | Trusted inputs | Authority deliberately granted | Authority explicitly denied |
| --- | --- | --- | --- |
| Fork pull request | Untrusted fork commit | Secret-free test/build with `contents: read` | Environments, repository secrets, package publication, Dokploy, Clerk, database, R2 |
| Same-repository pull request into `dev` | Code from a repository collaborator, but not trusted as workflow control-plane code | Test/build and GHCR publication with job-scoped `GITHUB_TOKEN`; deployed container may use shared non-production runtime services | GitHub environment secrets in the PR-run workflow; production Dokploy/project/network/secrets; R2 credentials |
| Trusted preview handoff | Workflow stored on protected default branch `dev`, validated metadata, immutable image digests | Non-production Dokploy preview create/update/delete | Checkout or execution of PR code/scripts/artifacts; production project; backup credential |
| Trusted `dev` deployment | Reviewed code on protected `dev` | Publish images and deploy persistent development | Production Dokploy; production runtime secrets; backup credential |
| Production release | Reviewed `dev` → `main` PR and workflow stored on `main` | Publish production-specific images and deploy the production service; the Dokploy key is transitive authority over that service's runtime configuration | Non-production automation key; backup credential; raw runtime-secret values in workflow inputs or stored GitHub secrets |
| Backup sentinel | Reviewed workflow code on protected `dev`, scheduled/default-branch invocation | R2 bucket list/head operations using a production-equivalent Object Read-only key | Pull-request invocation; build/deploy reuse; object downloads by policy, although R2 cannot enforce that narrower operation set |

GitHub's private-fork defaults give fork pull requests a read-only token and no secrets. Keep “Send write tokens to workflows from pull requests” and “Send secrets to workflows from pull requests” disabled.[^github-fork-settings] Users with repository write access can change workflow code and can access repository-level secrets through a workflow, which is why external secrets belong in constrained environments and trusted follow-up jobs rather than repository secrets.[^github-secure-use]

## GitHub Actions design

### Static environments

| Environment | Deployment branch rule | Secrets | Non-secret variables | Allowed jobs |
| --- | --- | --- | --- | --- |
| `development` | Selected branch `dev` only | `DOKPLOY_API_KEY` for the non-production member | Dokploy URL, non-production project/environment/service identifiers, public hostnames | Trusted preview orchestrator and persistent development deploy |
| `production` | Selected branch `main` only | `DOKPLOY_API_KEY` for the production member | Dokploy URL, production project/environment/service identifiers, public hostnames | Production deploy only |
| `backup-monitoring` | Selected branch `dev` only | R2 Object Read-only access-key ID and secret | Bucket name, account endpoint, expected backup identifiers/age thresholds | Scheduled or manually dispatched default-branch sentinel only |

Environment branch restrictions are evaluated against the deployment ref. A `workflow_run` workflow runs from the default branch and can receive secrets and a write-capable token even when its triggering workflow could not, which makes it a useful but sensitive privilege boundary.[^github-events] Configure all three environments in advance: referencing a nonexistent environment can create it without protection rules or secrets.[^github-manage-environments]

Do not make required environment reviewers part of the baseline. This private repository can rely on protected-branch review of the release PR plus the `main` restriction for `production`. If the repository later moves to a plan that supports reviewers for private repositories, a non-self-approving production reviewer and prevention of administrator bypass are worthwhile extra controls.[^github-environments]

Keep public data as variables rather than secrets. Examples include Dokploy URLs and identifiers, image/package names, domains, and Clerk publishable keys. The browser-facing Clerk publishable key is intentionally public; the Clerk secret key must stay server-side.[^clerk-environment-variables]

### Trusted preview handoff

The pull-request workflow must remain unprivileged with respect to environments. It may build/test and, only for same-repository non-draft pull requests targeting `dev`, publish the API and web images with its job `GITHUB_TOKEN`. A separate `workflow_run` workflow on `dev` references `development` and performs orchestration.

Before contacting Dokploy, the trusted workflow must re-fetch and validate all control data from GitHub rather than trusting artifact content from the untrusted run:

1. The upstream workflow conclusion is `success` and its event was `pull_request`.
2. The pull request is open, non-draft, targets `dev`, and its head repository is this repository.
3. The pull request's current head SHA exactly equals the upstream run's head SHA.
4. Both environment-specific image packages exist under full-SHA tags, and the resolved API/web digests match the accepted digest syntax.
5. Only allowlisted scalar identifiers—PR number, head SHA, image digests, and preconfigured Dokploy IDs—are sent to Dokploy.

The trusted workflow must never check out the pull-request head, execute its scripts, import its generated code, or consume a PR-produced executable/configuration artifact. GitHub explicitly warns that privileged `workflow_run` consumers can be compromised by untrusted code or artifacts.[^github-events] This design keeps the `development` environment restricted to `dev`; it does not need to allow `refs/pull/*/merge`.

### Job permissions

Set `permissions: {}` at workflow scope, then grant only what each job needs. Once any permissions are specified, omitted permissions become `none`.[^github-workflow-syntax]

| Job | GitHub token permissions | Environment / external credential |
| --- | --- | --- |
| Fork and general PR CI | `contents: read` | None |
| Same-repository PR image publisher | `contents: read`, `packages: write` | None; only the ephemeral job `GITHUB_TOKEN` |
| `dev`/`main` image publisher | `contents: read`, `packages: write` | None; only the ephemeral job `GITHUB_TOKEN` |
| Trusted preview orchestrator | `actions: read`, `pull-requests: read`, `packages: read`; add `contents: read` only if implementation proves it necessary | `development` and its Dokploy key |
| Persistent development deploy | `contents: read` or none, depending on implementation | `development` and its Dokploy key |
| Production deploy | `contents: read` or none, depending on implementation | `production` and its Dokploy key |
| Post-health moving/version tag update | `packages: write`; add `contents: write` only to the production finalizer that creates the Git tag and draft GitHub Release | None; do not combine with a Dokploy external-secret job |
| Pair-aware package-retention cleanup | `packages: write`, from a trusted branch/event and with repository admin access to the two packages | None; never combine package deletion authority with a Dokploy or R2 credential |
| Backup freshness sentinel | `contents: read` or none | `backup-monitoring` and its R2 read-only key |

Do not grant `id-token: write`, `attestations: write`, `issues: write`, or other capabilities until a concrete job uses them. GitHub creates a repository-scoped `GITHUB_TOKEN` for each job and expires it when the job ends; it is the correct publisher credential for repository-associated GHCR packages.[^github-token][^github-ghcr]

The sentinel implementation should issue only bucket-list and object-head/metadata requests. Cloudflare's R2 Object Read-only permission nevertheless authorizes reading/listing objects in the selected bucket, so this behavioral restriction is not a provider-enforced list/head-only boundary.[^r2-tokens] Reviewed code on protected `dev` can therefore use the `backup-monitoring` credential to download production backups. This is an accepted residual trust in the current default-branch sentinel design. Moving the sentinel to a separately administered operations repository or an external monitor is optional future hardening, not required for this rollout.

## Dokploy permission model

### Separate projects are required

The current Dokploy version's Compose create handler looks up the requested environment and project, then calls its create authorization check with `project.projectId`.[^dokploy-compose-create] The permission helper authorizes `create` when the member has the relevant project in `accessedProjects`; existing service operations instead use `accessedServices`.[^dokploy-service-access] Consequently, separating production and non-production only as environments inside one project does not prevent a non-production creator from creating a Compose service in the production environment.

Create two projects:

- **Non-production project:** persistent development plus ephemeral previews.
- **Production project:** only persistent production services.

Use two member users, not an owner or administrator, each with API/CLI access and a separate API key. Restrict the development member to the non-production project and services, and the production member to the production project and services. Never give either member organization, server, SSH, or unrelated project access.

The built-in member role in v0.29.13 is not deploy-only: for services it includes deployments, environment-variable access, domains, logs, and monitoring when the service is accessible.[^dokploy-member-role] Exact action-level custom roles are an Enterprise feature.[^dokploy-permissions] Treat each Dokploy API key as an aggregate secret capable of reading or changing the accessible service's runtime configuration, not as a narrow deployment webhook.

| Dokploy member | Necessary scope | Denied scope |
| --- | --- | --- |
| Non-production automation | API/CLI; non-production project; persistent dev and preview services; create/delete services for preview lifecycle | Production project/environment/service; other projects; owner/admin; server/SSH; unrelated registries |
| Production automation | API/CLI; production project and persistent production service; deployment and only the service-management capability required by the chosen Compose endpoint | Non-production project; preview services; delete services unless the release design proves it necessary; owner/admin; server/SSH |

Verify the exact production call sequence against v0.29.13 before assigning permissions. In this version, some Compose mutation endpoints reuse the `service:create` check, so updating the persistent production Compose may require Create Services at the production-project level.[^dokploy-compose-update][^dokploy-service-access] The separate production project contains that unavoidable breadth. It does not justify granting production access to the development member.

API keys are presented in the `x-api-key` header.[^dokploy-api] Configure an expiration and rate limit when creating each key; v0.29.13 exposes both fields.[^dokploy-api-key-schema] Do not place keys in query strings, shell command text, deployment descriptions, or issue comments.

### GHCR pull credential

Keep a single classic PAT owned by a dedicated GitHub machine account in Dokploy's registry configuration, with only `read:packages`. Dokploy needs to pull private images but never publish, delete packages, read source code, or modify workflows. GitHub documents `read:packages` as the package-download scope and recommends Actions use `GITHUB_TOKEN` for publishing.[^github-ghcr] Dokploy's GHCR guide suggests `write:packages`, but that is broader than this pull-only consumer needs and should not be followed here.[^dokploy-ghcr]

The PAT is stored only in Dokploy/on the deployment host and is shared for development and production pulls on that host. It is not copied into GitHub Actions or runtime containers. This is a registry read boundary, not a production/non-production runtime-secret boundary; splitting the token would add rotation surface without creating meaningful host isolation.

The publishing job likewise keeps `GITHUB_TOKEN` out of Docker build arguments, build secrets, labels, and the build context. Registry login exists only on the ephemeral GitHub-hosted runner and is discarded with the job.

## Credential-flow matrix

No credential values, hashes, prefixes, or recoverable fragments belong in this matrix, the repository, issues, or research notes.

| Credential or authority | Authoritative store | Consumer / flow | Minimum capability | Must never reach |
| --- | --- | --- | --- | --- |
| PR CI `GITHUB_TOKEN` | GitHub, job-generated | GitHub → fork/general PR job | `contents: read` | Environments, Dokploy, Clerk, DB, R2 |
| Same-repository publisher `GITHUB_TOKEN` | GitHub, job-generated | GitHub → GHCR | `contents: read`, `packages: write` | Dokploy and runtime secrets |
| Trusted publisher `GITHUB_TOKEN` | GitHub, job-generated | `dev`/`main` job → GHCR | `contents: read`, `packages: write` | Dokploy runtime configuration |
| Preview-orchestrator `GITHUB_TOKEN` | GitHub, job-generated | Trusted `workflow_run` → GitHub metadata/GHCR | `actions: read`, `pull-requests: read`, `packages: read` | Package writes and production |
| Non-production Dokploy API key | GitHub `development` environment | Trusted preview/dev deploy job → Dokploy API | Member/API access to non-production project and services; preview create/delete | PR build job; production project; R2 |
| Production Dokploy API key | GitHub `production` environment | `main` deploy job → Dokploy API | Member/API access to production project/service | PR, preview, development, release-finalization, backup sentinel |
| GHCR pull PAT | Dokploy registry configuration / deployment host | Dokploy → private GHCR | Classic PAT `read:packages` only | GitHub Actions secrets; application containers; package write/delete |
| Non-production Clerk secret key | Non-production Dokploy service/environment variables | Dev/preview API container → Clerk development instance | Clerk server API for non-production instance | Images, browser bundle, Actions, production service |
| Production Clerk secret key | Production Dokploy service/environment variables | Production API container → Clerk production instance | Clerk server API for production instance | Images, browser bundle, Actions, non-production services |
| Clerk publishable keys | GitHub/repository variables or build configuration | Image build → browser bundle | Public client identification | Secret stores are unnecessary; do not confuse with secret key |
| Non-production database app login | Non-production Dokploy service variables | Dev/preview API/migration container → hosted-dev DB | Non-superuser access only to required non-production DB/schema | Actions, logs, production network/DB |
| Production database app login | Production Dokploy service variables | Production API/migration container → production DB | Non-superuser access only to required production DB/schema | Actions, previews, non-production project/network |
| Optional preview provisioning login | Prefer server-side non-production provisioner; otherwise `development` only | Trusted orchestrator/provisioner → non-production Postgres | Separate role limited to preview logical-database lifecycle | PR-run job, app container, production server/DB |
| R2 backup write key | Dokploy backup destination configuration | Dokploy backup process → one private R2 bucket | Bucket-scoped Object Read & Write | Actions, app containers, GitHub environments |
| R2 backup-monitor key | GitHub `backup-monitoring` environment | Default-branch sentinel → R2 | Bucket-scoped Object Read-only; monitor code uses list/head only | Development/production deploy, PR, build, preview, artifacts/logs |
| R2/Cloudflare break-glass authority | External operator-controlled recovery store | Authorized operator → Cloudflare | Recovery and key replacement | GitHub Actions and Dokploy routine automation |

GitHub environment secrets should hold only the external credential needed by that environment's jobs. Runtime Clerk and database credentials stay in Dokploy. Dokploy supports project-, environment-, and service-level variables; use service scope where possible, environment scope only for intentionally shared non-production values, and never place a production secret in a shared project variable.[^dokploy-variables] Compose service variables are materialized into the service's `.env`; reference named variables and do not import the entire file into every container.[^dokploy-compose]

The application images must not contain runtime secrets. Docker build arguments and build-time environment values can persist in image metadata/layers and are unsuitable for secret material.[^dokploy-build] The web image may embed its environment-specific Clerk publishable key because it is public. `CLERK_SECRET_KEY`, `DATABASE_URL`, R2 credentials, and Dokploy keys remain runtime/control-plane-only.

## Provider-specific confinement

### Clerk

Production and non-production Clerk instances have independent keys and user pools; previews and development share only the Clerk development instance.[^clerk-environments] Store each secret key only in its corresponding API service scope. Enforce exact-origin `authorizedParties` for every deployed origin; never use suffix or substring matching for preview hosts.[^clerk-middleware] The intentional consequence is that repository collaborators whose PRs receive previews can execute application code with non-production Clerk access. They cannot reach the production Clerk instance or key.

### PostgreSQL

Use separate non-superuser application roles for production and non-production, scoped to the required database/schema privileges. PostgreSQL superusers bypass all permission checks; application and automation logins must remain `NOSUPERUSER`, without `CREATEDB` or `CREATEROLE` unless a narrowly defined provisioning role demonstrably needs them.[^postgres-create-role]

GitHub Actions should not receive ordinary application connection strings. Migrations execute inside the already confined API/deployment context. If schema-preview provisioning requires an external credential, prefer a server-side non-production provisioner; otherwise create a distinct provisioning role available only to the trusted `development` orchestration job. It must have no production host/network path and must not be reused by the running application.

### R2 backups

Preserve the one-bucket design and two routine credentials established in [Design R2 backup, restore, and full-VPS recovery procedure](https://github.com/rajat2006/unshelf/issues/246):

- Dokploy stores one bucket-scoped Object Read & Write credential for backup creation and retention.
- GitHub's `backup-monitoring` environment stores a separate bucket-scoped Object Read-only credential for the default-branch freshness sentinel.
- Cloudflare account recovery/break-glass authority stays outside CI and Dokploy.

Object Read-only permits reading and listing objects, not just metadata.[^r2-tokens] Because the bucket contains production DB and control-plane archives—and the control-plane archive contains its encryption key—the monitoring key is production-equivalent. R2 cannot express list/head-only or prefix-restricted authority for this use case, so code review and environment isolation enforce the sentinel's narrower behavior. Cloudflare's R2 audit log does not record object-level `GetObject` or `PutObject` activity, which limits after-the-fact detection of misuse.[^r2-audit]

## Rotation and recovery

Maintain a value-free credential register with owner, storage location, scope, provider identifier, creation date, expiry, last rotation, next rotation, and recovery contact. Do not record secret values or screenshots. Configure expiry-backed rotation for long-lived automation tokens and perform a quarterly access/rotation review. Rotate immediately after suspected disclosure, loss of a maintainer's access, unexpected use, or a boundary change.

| Credential | Normal rotation | Safe replacement | Emergency response |
| --- | --- | --- | --- |
| `GITHUB_TOKEN` | Automatic per job | None; job token expires with the job | Cancel run and remove excess workflow permission |
| Dokploy API keys | Shortest expiry compatible with unattended operation; target no more than 90 days | Create successor with same restricted member, update one environment, exercise exact deploy/preview action, then delete old key | Delete old key first, create/restrict replacement through owner recovery, validate both project boundaries |
| GHCR pull PAT | Expiring PAT; target no more than 90 days | Create successor `read:packages` PAT, update Dokploy registry, prove private pulls for both projects, revoke old | Revoke first, then replace and redeploy; inspect package access |
| Clerk secret keys | Calendar rotation and after staff/access changes | Create an additional key, update matching Dokploy services, verify, then delete old key; rotate development and production independently | Delete exposed key and replace only affected environment immediately |
| PostgreSQL application roles | Calendar rotation and after exposure | Prefer a successor login with equivalent narrow grants, update matching Dokploy service, verify/migrate, disable then drop old login | Revoke/disable login, terminate sessions if needed, replace and inspect DB access |
| R2 write/read-only keys | Calendar rotation and after exposure | Create separate successor token, update its one consumer, verify backup or sentinel operation, revoke old token | Revoke affected token first; replace only its consumer; assess backup confidentiality/integrity |

Cloudflare's token “roll” invalidates the previous token immediately; use create-cutover-revoke when overlap is needed rather than the roll operation.[^cloudflare-roll] Clerk supports multiple active secret keys specifically for add-deploy-verify-delete rotation.[^clerk-rotation] GitHub may revoke PATs on expiry or detected leak, so expiry and ownership cannot be implicit.[^github-pat-revocation]

Recovery authority must remain outside the failed automation path: GitHub organization/repository owners with protected 2FA recovery, a Dokploy owner plus controlled VPS access, Cloudflare account owners, Clerk instance owners, and a database administrator. Test recovery without copying secret values into tickets. After restoring a Dokploy control-plane backup, rotate credentials that the restored host can decrypt rather than assuming the historical values remain safe.

For suspected exposure:

1. Revoke or disable the affected credential; do not wait for log cleanup.
2. Replace it only in the authoritative store and redeploy/restart the minimum consumers.
3. Validate package pulls, deployment health, authentication, database access, or backup freshness as appropriate.
4. Remove exposed workflow logs/artifacts after preserving non-secret incident evidence.
5. Review adjacent authority, especially when a Dokploy key or R2 monitoring key was exposed, because each can reveal additional sensitive configuration or backup content.

## Logging and diagnostic rules

Secret masking is a final defense, not the confidentiality boundary. GitHub warns that redaction depends on exact matching and may fail for structured or transformed values; register each dynamic value with `::add-mask::` before it can be printed.[^github-secure-use][^github-workflow-commands]

Workflow and deployment scripts must:

- Never enable `set -x`, shell tracing, HTTP verbose/trace output, `printenv`, or whole-context serialization such as `toJSON(secrets)` or `toJSON(github)`.
- Pass secrets through the runner environment or secret-aware action inputs, never command-line arguments, URLs, issue bodies, deployment descriptions, cache keys, or artifact names.
- Never print `x-api-key`, registry authorization headers, database URLs, Clerk secret keys, R2 request signatures, or the raw response from a Dokploy endpoint that returns service/environment configuration.
- Emit only allowlisted operational fields: workflow/run ID, PR number, commit SHA, immutable image digest, Dokploy deployment/service ID, status code/category, duration, and sanitized error code.
- Avoid uploading raw Dokploy, database, or backup diagnostics as Actions artifacts. If an incident requires diagnostic capture, sanitize it locally, restrict retention/access, and keep secret material out of GitHub issues.
- Treat a masked or deleted leak as a real exposure: revoke/rotate first, then delete the affected run/log. GitHub documents log deletion and secret rotation as the response to an unredacted secret.[^github-secure-use]

The API's existing diagnostic sanitization redacts authorization/cookie headers, password/token/secret fields, database URLs and configured secret values ([`apps/api/src/diagnostics.ts`](../../apps/api/src/diagnostics.ts)). That protects application diagnostics but does not sanitize arbitrary CI shell output or Dokploy control-plane responses; workflow scripts still need strict allowlist logging.

## Acceptance checks

The implementation should be rejected unless all of these are demonstrated without revealing values:

1. A fork PR receives a read-only token, no environments, no secrets, and publishes no package.
2. A same-repository non-draft PR targeting `dev` publishes only with `GITHUB_TOKEN`; its PR-run jobs cannot read `development` secrets.
3. The trusted preview handoff rejects a fork, draft, stale SHA, failed run, malformed digest, or executable PR artifact, and deploys only to the non-production project.
4. The non-production Dokploy key cannot enumerate, create, update, deploy, log-read, or delete production services.
5. The production key cannot access non-production and is usable only from a `main` job referencing `production`.
6. The GHCR pull identity can pull both private packages and cannot publish/delete packages or read repository contents.
7. No GitHub secret contains Clerk server keys, runtime application DB URLs, or the R2 write credential; any preview-provisioning login added by the later database decision is separately named, non-production-only, and confined to `development`.
8. The backup sentinel can run only from trusted default-branch code, references `backup-monitoring`, performs list/head requests by implementation, and never prints or downloads backup content during normal operation.
9. Preview containers can reach only the shared non-production Clerk/Postgres resources; production networks and secrets are unreachable.
10. A staged rotation of each long-lived credential succeeds, and an emergency revoke-first drill has named recovery owners.
11. Debug and failure-path tests show no header, URL, response body, environment dump, or artifact containing secret material.

## Sources

[^github-environments]: GitHub Docs, [Deployments and environments](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments).
[^github-manage-environments]: GitHub Docs, [Managing environments for deployment](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments).
[^github-workflow-syntax]: GitHub Docs, [Workflow syntax: permissions](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#permissions).
[^github-token]: GitHub Docs, [The `GITHUB_TOKEN`](https://docs.github.com/en/actions/concepts/security/github_token).
[^github-ghcr]: GitHub Docs, [Working with the Container registry](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry).
[^github-fork-settings]: GitHub Docs, [Managing GitHub Actions settings for a repository](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository).
[^github-events]: GitHub Docs, [Events that trigger workflows: `workflow_run`](https://docs.github.com/en/enterprise-cloud@latest/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_run).
[^github-secure-use]: GitHub Docs, [Secure use reference](https://docs.github.com/en/actions/reference/security/secure-use).
[^github-workflow-commands]: GitHub Docs, [Workflow commands: masking a value](https://docs.github.com/en/actions/writing-workflows/choosing-what-your-workflow-does/workflow-commands-for-github-actions#masking-a-value-in-a-log).
[^github-pat-revocation]: GitHub Docs, [Token expiration and revocation](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/token-expiration-and-revocation).
[^dokploy-compose-create]: Dokploy v0.29.13 source, [`compose.create`](https://github.com/Dokploy/dokploy/blob/v0.29.13/apps/dokploy/server/api/routers/compose.ts#L82-L123).
[^dokploy-compose-update]: Dokploy v0.29.13 source, [`compose.update`](https://github.com/Dokploy/dokploy/blob/v0.29.13/apps/dokploy/server/api/routers/compose.ts#L206-L234).
[^dokploy-service-access]: Dokploy v0.29.13 source, [`checkServiceAccess`](https://github.com/Dokploy/dokploy/blob/v0.29.13/packages/server/src/services/permission.ts#L263-L291).
[^dokploy-member-role]: Dokploy v0.29.13 source, [member service permissions](https://github.com/Dokploy/dokploy/blob/v0.29.13/packages/server/src/lib/access-control.ts#L155-L195).
[^dokploy-permissions]: Dokploy Docs, [Permissions](https://docs.dokploy.com/docs/core/permissions).
[^dokploy-api]: Dokploy Docs, [API](https://docs.dokploy.com/docs/api).
[^dokploy-api-key-schema]: Dokploy v0.29.13 source, [API-key creation schema](https://github.com/Dokploy/dokploy/blob/v0.29.13/apps/dokploy/server/api/routers/user.ts#L48-L63).
[^dokploy-ghcr]: Dokploy Docs, [GitHub Container Registry](https://docs.dokploy.com/docs/core/registry/ghcr).
[^dokploy-variables]: Dokploy Docs, [Variables](https://docs.dokploy.com/docs/core/variables).
[^dokploy-compose]: Dokploy Docs, [Docker Compose environment variables](https://docs.dokploy.com/docs/core/docker-compose#environment-variables).
[^dokploy-build]: Dokploy Docs, [Build type](https://docs.dokploy.com/docs/core/applications/build-type).
[^clerk-environment-variables]: Clerk Docs, [Clerk environment variables](https://clerk.com/docs/guides/development/clerk-environment-variables).
[^clerk-environments]: Clerk Docs, [Development and production environments](https://clerk.com/docs/guides/development/managing-environments).
[^clerk-middleware]: Clerk Docs, [`clerkMiddleware()` and `authorizedParties`](https://clerk.com/docs/reference/express/clerk-middleware).
[^clerk-rotation]: Clerk Docs, [Rotate API keys](https://clerk.com/docs/guides/secure/rotate-api-keys).
[^postgres-create-role]: PostgreSQL Docs, [`CREATE ROLE`](https://www.postgresql.org/docs/current/sql-createrole.html).
[^r2-tokens]: Cloudflare Docs, [R2 authentication and token permissions](https://developers.cloudflare.com/r2/api/tokens/).
[^r2-audit]: Cloudflare Docs, [R2 audit logs](https://developers.cloudflare.com/r2/platform/audit-logs/).
[^cloudflare-roll]: Cloudflare Docs, [Roll API tokens](https://developers.cloudflare.com/fundamentals/api/how-to/roll-token/).
