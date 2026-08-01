# Environment-specific image build, tag, and CD handoff

**Status:** decision memo for [Define environment-specific image build, tag, and CD handoff](https://github.com/rajat2006/unshelf/issues/243)
**Date:** 2026-08-01

## Decision

GitHub Actions builds and publishes two private GHCR packages:

- `ghcr.io/rajat2006/unshelf-api`
- `ghcr.io/rajat2006/unshelf-web`

Every preview, development, and production build produces a distinct API image
and web image. The web distinction is required because
`VITE_CLERK_PUBLISHABLE_KEY` is currently compiled into the SPA; the API is also
built per environment so the deployed pair has one auditable identity. Runtime
secrets are never image inputs.

The unit of deployment is a **pair of digest references**, not a tag:

```text
API_IMAGE=ghcr.io/rajat2006/unshelf-api@sha256:<api-digest>
WEB_IMAGE=ghcr.io/rajat2006/unshelf-web@sha256:<web-digest>
```

GitHub documents digest pulls as the way to ensure the exact image is always
used. Tags remain mutable registry references, and the OCI distribution API has
no transaction spanning the two repositories. A workflow can therefore publish
one image and fail on the other; only the paired digests, recorded after both
pushes succeed, are eligible for handoff.[^ghcr][^distribution]

## Image and tag contract

Both packages use the same logical tag vocabulary:

| Channel | Write-once trace tag | Moving tag | Release tag |
| --- | --- | --- | --- |
| PR preview | `preview-pr-<number>-sha-<full-40-char-sha>` | `preview-pr-<number>` | — |
| Hosted development | `development-sha-<full-40-char-sha>` | `development` | — |
| Production candidate | `production-sha-<full-40-char-sha>` | `production` | `v<major>.<minor>.<patch>` |

The full image names are therefore, for example:

```text
ghcr.io/rajat2006/unshelf-api:preview-pr-243-sha-0123456789abcdef0123456789abcdef01234567
ghcr.io/rajat2006/unshelf-web:development-sha-0123456789abcdef0123456789abcdef01234567
ghcr.io/rajat2006/unshelf-api:production-sha-0123456789abcdef0123456789abcdef01234567
ghcr.io/rajat2006/unshelf-web:v1.4.0
```

Rules:

1. A trace tag and a production version tag are write-once by policy. Before
   creating one, automation checks whether it exists; an existing tag may be
   accepted only when it already resolves to the expected digest. It is never
   moved to different content.
2. `preview-pr-<number>`, `development`, and `production` are convenience
   pointers to the most recently **healthy** deployment in that channel. They
   advance only after post-deploy health checks pass for both services.
3. `v<major>.<minor>.<patch>` is applied to both production digests only after
   production is healthy, at the same release-finalization boundary that creates
   the Git tag and finalizes the GitHub Release. The version-calculation workflow
   is owned by [Define product version and GitHub Release automation](https://github.com/rajat2006/unshelf/issues/247).
4. No `latest`, floating major (`v1`), or floating minor (`v1.4`) tags are
   published. Dokploy never consumes a moving or version tag.
5. Both images carry `org.opencontainers.image.source` pointing to this
   repository and revision/created metadata. Publishing from this repository
   with its `GITHUB_TOKEN` links the packages to the repository.[^ghcr]

The phrase “immutable tag” above is an Unshelf policy. The digest is the actual
content-addressed identity.[^distribution]

## GitHub Actions publication contract

Publication is separate from the existing secret-free Product CI job and starts
only after the relevant Product CI result succeeds.

### Eligibility and permissions

- Preview publication runs only for a same-repository, non-draft PR targeting
  `dev`. Fork PRs remain secret-free CI only. GitHub gives fork-triggered
  `pull_request` workflows a read-only token and withholds secrets; the pipeline
  must not switch to `pull_request_target` and execute untrusted PR code.[^pr-security]
- Development publication runs for the accepted `dev` commit.
- Production publication runs only for the authorized `main` commit produced by
  the release or hotfix path.
- Each publisher has only `contents: read` and `packages: write`. It logs in to
  `ghcr.io` with `${{ github.actor }}` and `${{ secrets.GITHUB_TOKEN }}`. GitHub
  explicitly supports `GITHUB_TOKEN` for a workflow publishing packages
  associated with its repository.[^publish]
- The environment-specific Clerk publishable key is supplied only to the web
  build. API and web runtime secrets stay exclusively in Dokploy configuration.

### Jobs and commit point

1. A preparation job derives and validates the channel, full commit SHA, PR
   number where applicable, and trace tags.
2. `push_api` and `push_web` build from the same checked-out commit and push only
   their write-once trace tags. Each returns the registry digest produced by the
   push.
3. `finalize_pair` declares `needs: [push_api, push_web]`. GitHub runs a dependent
   job only after its dependencies succeed, so no handoff occurs after a partial
   publication.[^jobs]
4. `finalize_pair` verifies that both trace tags resolve to their reported
   digests, emits the two full digest references plus channel/SHA/PR metadata,
   and records them in the workflow summary and deployment title. That record is
   the deployable pair.
5. The environment handoff is serialized with a concurrency group shared by
   every workflow capable of deploying that target: one group for development,
   one for production, and one per preview PR. `cancel-in-progress: false` lets
   an already-started remote deployment finish; GitHub keeps at most one running
   and one pending member of a concurrency group, replacing an older pending run
   with the newest one.[^concurrency]
6. After Dokploy reports completion and both the API/database health endpoint and
   web root pass, the workflow advances both moving tags. Production also applies
   the version tag and finalizes the release. These post-health label operations
   are idempotent and retried if only one package was updated.

GHCR cannot make the two image pushes or two tag updates atomic. Safety comes
from withholding the paired digest handoff until both pushes succeed and from
never deploying aliases. A failed first push leaves an unreferenced candidate
for cleanup; it does not change the running environment.[^distribution]

## Dokploy handoff and private pulls

Source-push auto-deploy is disabled for these Compose applications. GitHub
Actions is the only deployment initiator, after CI and publication.

Each hosted target has its own Dokploy Compose application and its own GitHub
Actions environment/credential boundary. The serialized handoff:

1. reads the current Dokploy environment;
2. replaces only the managed `API_IMAGE` and `WEB_IMAGE` values with the paired
   digest references while preserving all other settings;
3. saves the complete environment;
4. asks Dokploy to render/validate the effective Compose configuration; and
5. calls Dokploy's Compose deploy API with a title containing the channel and
   full commit SHA.

Dokploy stores Compose UI variables in the adjacent `.env` file and supports
Compose interpolation. Its API exposes environment save and Compose deploy
operations authenticated by `x-api-key`; a successful deploy request is queue
acceptance, not proof of health, so the caller must observe completion and run
the map's post-deploy checks.[^dokploy-compose][^dokploy-api]

Saving the environment and enqueuing deployment are separate operations. The
shared GitHub concurrency group is therefore the lock. The operation is
idempotent: a retry re-saves the same two digest refs and requests the same
deployment. Operators must not use an unsynchronized manual redeploy while a CD
handoff is active.

Dokploy is configured once with a GHCR registry credential using:

```text
registry: ghcr.io
username: <GitHub account that owns the token>
password: <PAT classic with read:packages only>
```

GitHub says `read:packages` is sufficient to download private images and uses
`docker login ghcr.io -u USERNAME --password-stdin`; write and delete are
separate scopes.[^ghcr] Dokploy documents GHCR username/token configuration and
tests the registry login.[^dokploy-ghcr] Although Dokploy's generic GHCR guide
asks for `write:packages` because Dokploy can also push built images, Unshelf's
Dokploy role is pull-only and must not receive that scope.

The disposable work in [Prototype multi-service Dokploy development and preview
routing](https://github.com/rajat2006/unshelf/issues/242) must verify an actual
private pull, a deliberately invalid credential, and credential rotation before
this contract is accepted for implementation. The public Dokploy material proves
the login mechanism, not Unshelf's complete private-Compose path.

## Compose invariant

Application `build:` sections are removed from the deployment Compose file.
The API image variable appears exactly once:

```yaml
x-api-image: &api-image
  image: ${API_IMAGE:?API_IMAGE is required}
  pull_policy: always

services:
  migrate:
    <<: *api-image
    command: ["node", "dist/migrate.js"]

  api:
    <<: *api-image

  web:
    image: ${WEB_IMAGE:?WEB_IMAGE is required}
    pull_policy: always
```

Compose explicitly supports image references with a tag or digest, required
variable interpolation, `pull_policy`, and reusable extension fields.[^compose-services][^compose-interpolation][^compose-extension]
The single `API_IMAGE` anchor is load-bearing: `migrate` and `api` cannot be
configured independently, so the migration code and server always come from
the exact same environment-specific API digest. This preserves the existing
repository invariant recorded by the registry investigation.[^registry-investigation]

## Cleanup and retention

Cleanup is a pair-aware scheduled workflow over the two packages. GitHub's
package-version response includes the version id, timestamps, and container
tags; deletion is by package-version id. A repository workflow may use its
`GITHUB_TOKEN` when the linked repository has package admin permission, although
that capability is currently public preview. Deleted versions are restorable
for 30 days while the namespace remains available.[^packages-api][^delete]

The workflow first builds a protected set from both packages and refuses to
delete either side of a protected deployed pair:

- every digest currently configured in a live Dokploy deployment;
- every version carrying a channel's current moving tag;
- for production, the six newest healthy `v<major>.<minor>.<patch>` pairs: the
  current release and five previous releases.

It then enforces:

- **Preview:** after a new preview is healthy, retain only that PR's current
  paired version (moving tag plus trace tag). After the PR closes or merges and
  Dokploy teardown succeeds, delete every API and web version belonging to that
  PR.
- **Development:** after a new development deployment is healthy, retain only
  its current paired version (moving tag plus trace tag).
- **Production:** retain the current and five previous versioned pairs. Each
  retained version keeps its version and trace tags; only the current pair also
  carries `production`.
- **Failed/orphaned candidates:** the failing workflow attempts immediate
  pair-aware deletion. A nightly repair deletes any unprotected trace-tagged or
  untagged candidate older than 24 hours, covering canceled runs and partial
  publication failures.

Deletion happens only after a successful replacement deployment or successful
preview teardown. Pagination is mandatory, cleanup is idempotent, and a mismatch
between the API and web candidate sets fails visibly rather than guessing which
side is safe.

## Consequences for later map tickets

- Release automation receives a fixed image version format and a post-health
  tagging boundary; it still owns version calculation, draft-release behavior,
  and retry semantics.
- Secrets design receives two distinct credentials: GitHub's ephemeral
  `GITHUB_TOKEN` publishes, while each Dokploy target has a read-only GHCR PAT
  plus an environment-scoped Dokploy API credential.
- The end-to-end CD state machine receives a precise commit point: the paired
  digest handoff. “Dokploy accepted the request,” “deployment completed,” and
  “health checks passed” remain separate states.
- The topology prototype already contains the remaining private-GHCR evidence
  gate, so this decision creates no new ticket and graduates no map fog.

## Sources

[^ghcr]: GitHub Docs, [Working with the Container registry](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry).
[^publish]: GitHub Docs, [Publishing Docker images](https://docs.github.com/en/actions/tutorials/publish-packages/publish-docker-images).
[^distribution]: Open Container Initiative, [Distribution Specification](https://github.com/opencontainers/distribution-spec/blob/main/spec.md).
[^jobs]: GitHub Docs, [Using jobs in a workflow](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-jobs).
[^concurrency]: GitHub Docs, [Control the concurrency of workflows and jobs](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency).
[^pr-security]: GitHub Docs, [Secure use reference: `pull_request_target`](https://docs.github.com/en/actions/reference/security/secure-use#understanding-the-risk-of-pull_request_target).
[^dokploy-ghcr]: Dokploy Docs, [GHCR registry configuration](https://docs.dokploy.com/docs/core/registry/ghcr).
[^dokploy-compose]: Dokploy Docs, [Docker Compose](https://docs.dokploy.com/docs/core/docker-compose).
[^dokploy-api]: Dokploy Docs, [Compose API](https://docs.dokploy.com/docs/api/compose); Dokploy source, [`compose.deploy` queueing](https://github.com/Dokploy/dokploy/blob/canary/apps/dokploy/server/api/routers/compose.ts#L394-L440).
[^compose-services]: Docker Docs, [Compose services: `image` and `pull_policy`](https://docs.docker.com/reference/compose-file/services/).
[^compose-interpolation]: Docker Docs, [Compose interpolation](https://docs.docker.com/reference/compose-file/interpolation/).
[^compose-extension]: Docker Docs, [Compose extensions](https://docs.docker.com/reference/compose-file/extension/).
[^packages-api]: GitHub Docs, [REST API endpoints for packages](https://docs.github.com/en/rest/packages/packages).
[^delete]: GitHub Docs, [Deleting and restoring a package](https://docs.github.com/en/packages/learn-github-packages/deleting-and-restoring-a-package).
[^registry-investigation]: [Explore: does continuous deployment need an image registry? — findings](https://github.com/rajat2006/unshelf/issues/140#issuecomment-5144487217).
