# GHCR retention and production release identity

Research for [Research minimal GHCR retention and production release identity mechanisms](https://github.com/rajat2006/unshelf/issues/496), under [Wayfinder: redesign deployment for simplicity](https://github.com/rajat2006/unshelf/issues/495).

Researched 2026-08-21 against GitHub's current primary documentation, the official `actions/delete-package-versions` action, the OCI image/distribution specifications, and Unshelf commit [`9e20a6f`](https://github.com/rajat2006/unshelf/tree/9e20a6fded06842a3d37648511c9f9fa41b2e9e1).

## Executive finding

GitHub already supplies the registry metadata, workflow history, deletion API, and release-ref primitives needed by the replacement deployment flow. No retention service, release branch, automatic SemVer calculator, or cross-environment image promotion mechanism is required.

There are two materially different cleanup problems:

1. **Keeping ten versions independently in each package is nearly configuration-only.** GitHub's official `actions/delete-package-versions@v5` action accepts `min-versions-to-keep: 10`.
2. **Keeping ten coherent API/web deployment pairs while protecting every digest still configured in Dokploy is not configuration-only.** The stock action operates on one package at a time and does not understand channels, deployments, two-package pairs, or external consumers. A small trusted selector must enumerate both packages, derive pair identities from tags, compute a protected set from successful deployment runs and live Dokploy digest references, and delete only explicit package-version IDs outside that set.

That selector is bounded workflow logic, not a new control plane: it needs no daemon, database, custom package, or candidate state machine. It should run after deployment/preview teardown and on a schedule or manual dispatch to repair cleanup missed by cancellation.

For production, the full current `main` SHA is sufficient as the deployment identity. If a human-facing release name is wanted, accept an operator-supplied version, deploy and retry by the unchanged SHA, then create an annotated Git tag and optionally a GitHub Release **after success**. A release branch adds no identity or safety to a workflow that is required to deploy the exact current `main`; it adds another mutable ref whose equality with `main` must be policed.

## Facts from primary sources

### GHCR versions expose the fields cleanup needs—and no pair semantics

GitHub Container Registry stores Docker and OCI images and supports both Docker Image Manifest V2 Schema 2 and OCI formats. GitHub recommends digest pulls when the caller must always receive the same image. A digest is therefore the correct value for Dokploy's `API_IMAGE` and `WEB_IMAGE`; a moving tag is only an operator convenience, never the deployment identity. ([Container registry formats and digest pulls](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry#about-container-registry-support))

The Packages REST API lists active container package versions with pagination of at most 100 per page. A container version record includes:

- a numeric package-version `id`, which deletion addresses;
- `name`, shown by GitHub's container example as the `sha256:...` manifest digest;
- `created_at` and `updated_at`; and
- `metadata.container.tags`, which can be a non-empty array or `[]` for an untagged version.

The response has no channel, deployment result, API/web pair key, manifest media type, child-manifest graph, byte-size total, or “currently deployed” field. Those meanings must come from a deliberate tag convention and the deployment systems. ([List package versions](https://docs.github.com/en/rest/packages/packages?apiVersion=2026-03-10#list-package-versions-for-a-package-owned-by-the-authenticated-user))

Unshelf currently publishes API and web separately under one predictable `<channel>-<source SHA>` tag, with `preview` selected for eligible pull-request CI. Both image jobs target only `linux/amd64`. ([Current candidate channel and trace](https://github.com/rajat2006/unshelf/blob/9e20a6fded06842a3d37648511c9f9fa41b2e9e1/.github/workflows/publish-candidate.yml#L14-L29), [current image jobs](https://github.com/rajat2006/unshelf/blob/9e20a6fded06842a3d37648511c9f9fa41b2e9e1/.github/workflows/publish-candidate.yml#L79-L161)) The repository contains only a development deployment consumer; no workflow deploys or tears down previews. ([Current development consumer](https://github.com/rajat2006/unshelf/blob/9e20a6fded06842a3d37648511c9f9fa41b2e9e1/.github/workflows/deploy-development.yml#L1-L97)) Thus current `preview-<SHA>` versions have no repository-owned lifecycle consumer or cleanup path.

This research session could not count the live private versions because its local GitHub credential lacks `read:packages`; both version-list requests correctly returned `403`. Exact current counts and tags therefore remain an authorized rollout inventory, not an inferred fact.

### Deletion is one version and one package at a time

The REST deletion endpoint takes one package-version ID and returns `204` on success. For a personal-account-scoped package such as `rajat2006/unshelf-api`, the endpoint is `DELETE /users/{username}/packages/container/{package_name}/versions/{package_version_id}`. GitHub documents no transaction spanning versions or packages. ([Delete a package version for a user](https://docs.github.com/en/rest/packages/packages?apiVersion=2026-03-10#delete-package-version-for-a-user))

Consequences that follow directly from that API shape:

- API/web pair deletion requires at least two calls.
- A network or permission failure can leave one half of an obsolete pair. That is safe if and only if the pair was outside the protected set; the next reconciliation can retry the remaining half.
- Deletion must never start from “oldest ten in each package” independently, because partial builds and prior partial deletions can make the two orderings diverge.
- The selector should fail closed before the first delete if either package inventory or the live-consumer inventory is unavailable.

Deleted package versions can be restored for 30 days only while the namespace/version has not been reused. Restoration is useful operator recovery, not a substitute for a protected-set check. ([Deletion and 30-day restoration](https://docs.github.com/en/packages/learn-github-packages/deleting-and-restoring-a-package#package-deletion-and-restoration-support-on-github))

### The official retention action is useful as a deleter, not as the pair selector

The official [`actions/delete-package-versions`](https://github.com/actions/delete-package-versions/blob/main/README.md) action can:

- keep the newest `N` package versions with `min-versions-to-keep`;
- restrict deletion to untagged container versions;
- ignore version **names** matching a regular expression; or
- delete an explicit comma-separated set of package-version IDs.

Its inputs describe one `package-name` and one `package-type`. It has no input for a second package, tag-prefix selection, channel, successful workflow run, external digest consumer, or atomic pair. For containers, the Packages API example shows the version name is a digest while channel information lives in `metadata.container.tags`; therefore `ignore-versions` is not a channel-tag filter. ([Action inputs](https://github.com/actions/delete-package-versions/blob/main/README.md#usage), [explicit version-ID deletion](https://github.com/actions/delete-package-versions/blob/main/README.md#delete-multiple-specific-versions-of-a-package))

Accordingly:

- **Naive last-ten setup:** two action steps, one for `unshelf-api` and one for `unshelf-web`, plus package deletion access. This is easy but does not meet the ticket's pair/live-consumer safety requirement.
- **Safe last-ten setup:** one trusted selection step plus either direct REST `DELETE` calls or two explicit-ID invocations of the official action. Selection is the extra work; deletion remains an ordinary Actions job.

### Permissions can remain on `GITHUB_TOKEN`, with one package-access check

Container packages support granular permissions. GitHub says a workflow may delete or restore through the REST API using `GITHUB_TOKEN` when the workflow repository has `admin` permission on the package. A repository that publishes the package through its workflow is automatically granted that package admin role; an existing package not linked that way needs a one-time **Package settings → Manage Actions access → Admin** grant. GitHub still labels workflow deletion/restoration with `GITHUB_TOKEN` as public preview. ([Container-registry Actions authentication](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry#authenticating-in-a-github-actions-workflow), [package deletion access](https://docs.github.com/en/packages/learn-github-packages/deleting-and-restoring-a-package#packages-api-support))

The narrow trusted cleanup job needs:

- `packages: write` on its `GITHUB_TOKEN`, plus package-level Admin access;
- `actions: read` if it reads successful workflow runs;
- `contents: read`; and
- the non-production or production Dokploy read credential only when computing live digest references for that environment.

It does not need `contents: write`. A separate post-success release step needs `contents: write` to create a tag or GitHub Release. GitHub's Releases API documents Contents-write as the required repository permission. ([Create-release permissions](https://docs.github.com/en/rest/releases/releases?apiVersion=2026-03-10#create-a-release))

If `GITHUB_TOKEN` package admin cannot be established, the fallback is a classic PAT. GitHub documents `read:packages` for metadata and `read:packages` plus `delete:packages` for deletion; no `repo` scope is required for granular package registries. This fallback is a stored long-lived credential and is less minimal than linking the packages to this repository. ([Packages REST authentication](https://docs.github.com/en/rest/packages/packages?apiVersion=2026-03-10))

No package-deletion authority should be available to pull-request code. The selector and delete calls belong in the trusted deployment/cleanup workflow definition and must not execute a PR checkout.

### Tags, untagged versions, and multi-architecture manifests are distinct concepts

A tag is a name resolving to a manifest; a digest is the content identity. GitHub's API can show several tags on one version and can show a version with an empty tag array. Moving a `current` tag to a new digest therefore does not by itself say whether the old version is disposable: it may retain an immutable attempt tag, become untagged, or be a child referenced by an image index. The version inventory immediately before cleanup is authoritative, not an assumed result of prior tag operations. ([Container version metadata example](https://docs.github.com/en/rest/packages/packages?apiVersion=2026-03-10#list-package-versions-for-a-package-owned-by-the-authenticated-user))

OCI defines a multi-architecture image index as a higher-level manifest containing descriptors for platform-specific manifests. GitHub describes the same structure: one manifest holds a list of images for different architectures. ([OCI image-index model](https://github.com/opencontainers/image-spec/blob/main/spec.md#overview), [GitHub multi-architecture description](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry#adding-a-description-to-multi-arch-images))

GitHub's Packages version response does **not** expose the index-to-child reference graph or media type. Its official cleanup action offers “delete untagged versions” but does not document that every untagged container version is unreferenced by a tagged image index. Therefore blanket untagged deletion is not a justified safety rule for a multi-architecture or attested Buildx output.

The safe rollout rule is:

1. Inspect the actual manifest media type and descriptors for both current packages.
2. If an image index is present, protect its referenced child manifest digests together with the top-level digest, or delete only the selected top-level package version and let GHCR manage implementation-specific child retention.
3. Do not add a broad “delete every untagged version” pass until a disposable multi-architecture/attested image has been deleted and the retained digest has been pulled successfully for every required platform.

Unshelf currently requests one `linux/amd64` platform, but platform count alone does not prove the registry has one version record per build. The live inventory and manifest inspection are required before the first untagged cleanup.

### Storage and deduplication are not measurable from the Packages version API

GitHub currently states that Container registry storage and bandwidth are free and promises at least one month's notice before changing that policy. ([GitHub Packages billing](https://docs.github.com/en/billing/concepts/product-billing/github-packages#free-use-of-github-packages)) Cleanup is therefore lifecycle hygiene and pull/recovery correctness today, not a demonstrated billing-saving requirement.

OCI images are content-addressed graphs, so identical digests identify identical bytes and image indexes/manifests can reference shared content. The Packages version API, however, supplies neither layer descriptors nor storage bytes, and GitHub's billing documentation does not specify how GHCR deduplicates layers across tags, versions, or the two packages. ([OCI content descriptors](https://github.com/opencontainers/image-spec/blob/main/descriptor.md), [Packages version response](https://docs.github.com/en/rest/packages/packages?apiVersion=2026-03-10#list-package-versions-for-a-package-owned-by-the-authenticated-user))

Therefore the following are unknown from supported GitHub metadata and must not be promised:

- bytes reclaimed by deleting a tag or version;
- whether shared layers are accounted once or once per package/version;
- when unreachable blobs are garbage-collected; and
- whether version count is proportional to storage.

## Recommended minimal image-lifecycle mechanism

This section is recommendation, not a statement of GitHub platform behavior.

### 1. Build only inside an authorized deployment workflow

After exact-revision Product CI and channel authorization pass, build the API and web images in that same trusted development, preview, or production workflow. Give both builds one shared **attempt identity** containing at least:

- channel;
- full source SHA;
- Actions run ID and run attempt; and
- PR number for preview.

Example shapes, not prescribed spellings:

```text
development-run-<run id>-attempt-<attempt>-<full SHA>
production-run-<run id>-attempt-<attempt>-<full SHA>
preview-pr-<number>-run-<run id>-attempt-<attempt>-<full SHA>
```

Run ID/attempt distinguishes same-revision rebuilds and partial retry recovery; source SHA proves code identity; channel prevents cross-environment promotion; PR number makes preview teardown addressable. Resolve both pushed tags to digests and pass only the two digest references to Dokploy.

### 2. Make workflow success the success ledger

The deployment workflow should report success only after Dokploy completion and basic health. GitHub's workflow-runs API can filter runs by workflow, `head_sha`, branch, event, and a status/conclusion such as `success`, and returns run ID, attempt, head SHA, timestamps, and conclusion. ([Workflow-runs API](https://docs.github.com/en/rest/actions/workflow-runs?apiVersion=2026-03-10#list-workflow-runs-for-a-workflow))

Because the pair tags include run ID/attempt and SHA, the janitor can join successful workflow runs to registry versions without a new database. A post-success marker tag may improve operator readability but is not required for correctness. If used, it should be additive: retain the immutable attempt tag and move only a `*-current` convenience tag.

### 3. Compute one protected set, then delete explicit IDs

For each cleanup run:

1. List every active version of `unshelf-api` and `unshelf-web`, following pagination.
2. Parse only tags in the deployment-owned grammar; leave unknown/manual tags untouched.
3. Join API and web versions by the shared attempt identity. A key present on only one side is an orphan, not a successful pair.
4. Read every live Dokploy Compose resource in scope and collect its configured API/web digest references. If this read fails or any value is malformed, stop before deletion.
5. Add to the protected set:
   - every digest currently configured in Dokploy, regardless of age;
   - the current successful pair for every active preview;
   - the newest approximately ten **successful paired attempt identities** for development; and
   - the newest approximately ten **successful paired attempt identities** for production.
6. Mark failed, canceled, superseded, preview-torn-down, partial, and excess successful pairs outside that set as deletion candidates.
7. Re-read live Dokploy digest references immediately before mutation and abort if the snapshot changed.
8. Delete explicit version IDs package by package. Treat a half-completed obsolete-pair deletion as a visible failed cleanup to reconcile later, never as a deployment failure.
9. Emit a dry-run inventory and sanitized counts/identities; never print registry or Dokploy credentials.

“Roughly ten” means live safety wins over the count. If Dokploy is deliberately pinned to an older pair, that pair remains protected in addition to the ten-history window.

Run this reconciliation after a successful deployment and preview teardown, plus scheduled/manual. The scheduled/manual path is necessary because a canceled runner may never execute its `always()` cleanup step.

### 4. Keep one current preview pair

For an active labelled PR, protect the exact pair configured in its stable Dokploy preview resource. After a successful update and health check, re-read the resource, then delete every older attempt pair for that PR unless a live resource still references it. On label removal or PR close, tear down the Dokploy preview first, prove no live resource references its digests, and then delete every deployment-owned pair for that PR.

This order protects restart/pull behavior. A container that is currently running may continue after its registry version is deleted, but a later reschedule or `pull_policy: always` deployment would fail to retrieve it. “Consumed” therefore means configured by a live resource, not merely present in a running container. Unshelf's Compose contract deliberately uses digest references and `pull_policy: always`. ([Current Compose image contract](https://github.com/rajat2006/unshelf/blob/9e20a6fded06842a3d37648511c9f9fa41b2e9e1/docker-compose.yml#L7-L9), [web digest contract](https://github.com/rajat2006/unshelf/blob/9e20a6fded06842a3d37648511c9f9fa41b2e9e1/docker-compose.yml#L55-L57))

### 5. One-time cleanup of today's preview candidates

The current system's tags lack a PR number and no repository workflow records a live preview resource. The safe one-time cleanup is therefore inventory-first:

1. Grant this repository's trusted cleanup workflow Admin access to both packages, then list all pages and select versions carrying `preview-<40-hex-SHA>` tags in each package.
2. Inventory live Dokploy resources outside the repository and collect all configured image digests. This is mandatory because the repository cannot prove that no preview was created manually.
3. Join current API/web preview versions by the SHA tag and protect any digest seen in Dokploy.
4. Dry-run the explicit version IDs and tags. If no live preview resource consumes them, all paired and partial `preview-<SHA>` versions are cleanup candidates; there is no requirement to retain ten historical previews.
5. Delete explicit version IDs. Defer a generic untagged-version sweep until the manifest/index verification described above passes.

The exact number of candidates is deliberately left blank until an Actions token with `read:packages` performs the inventory.

## Production release identity comparison

### Platform facts

GitHub defines a Git reference as a human-readable name containing a commit SHA and states that references can be rewritten. Branches and tags occupy different namespaces but are both refs; Git describes branches as expected to move and tags as usually stable, with annotated tags intended for releases. ([GitHub Git-reference model](https://docs.github.com/en/rest/git/refs#about-git-references), [Git data model](https://git-scm.com/docs/gitdatamodel), [annotated tags](https://git-scm.com/docs/git-tag#_description))

GitHub Releases are records based on a required `tag_name`. If that tag does not exist, `target_commitish` may be a branch or exact commit SHA and determines the new tag; if the tag already exists, `target_commitish` is ignored. A Release adds title/body, generated notes, assets, timestamps, and a visible/API release feed. ([Create a release](https://docs.github.com/en/rest/releases/releases?apiVersion=2026-03-10#create-a-release), [managing releases](https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository))

If immutable releases are enabled, publishing locks the associated tag to its commit and locks release assets; GitHub recommends assembling the release as a draft and then publishing it. ([Immutable releases](https://docs.github.com/en/code-security/concepts/supply-chain-security/immutable-releases)) Tag or branch rulesets can separately restrict who may update or delete matching refs. ([Branch and tag rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets#branch-and-tag-rulesets))

A manual `workflow_dispatch` run accepts typed inputs and an explicit ref; its `GITHUB_SHA` is the last commit on the dispatched branch or tag. The production workflow must still re-read `refs/heads/main` and bind the deployment to that full SHA because the agreed policy is “exact current main,” not “whatever ref the operator selected earlier.” ([Manual workflow dispatch](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_dispatch))

### Comparison

| Mechanism | Persistent identity | Added behavior | Failure/retry implication | Fit for exact-current-`main` production |
| --- | --- | --- | --- | --- |
| Full current `main` SHA | The commit object itself | Exact technical identity; no new ref or release record | Same SHA can be retried without allocating anything | Sufficient for build, deploy, health, and audit correlation; weak human-facing name |
| Operator-supplied version only | None unless written somewhere durable | Friendly input and possible validation | A failed attempt can reuse the same input, but uniqueness/history are unenforced | Incomplete by itself; bind it to a tag/release after success |
| Git tag at the verified SHA | Named Git ref | Durable lookup and normal release boundary; annotated tag carries tagger/date/message | Create after success so failure does not burn a version; retry remains keyed by SHA | Minimal durable human release identity |
| GitHub Release for that tag | Tag plus a GitHub release record | Visible release feed, notes/assets/API; optional immutable-release locking/attestation | Draft/publish or create after success; no SemVer calculation required | Useful if the project wants release notes/operator ledger; optional for deployment correctness |
| `release` branch | Another mutable branch ref | A place for commits to diverge, stabilize, backport, or receive separate branch policy | Requires proving it has not drifted from current `main`; moving it does not create a historical release identity | Adds no value under the agreed exact-current-`main`, no-stabilization-branch workflow |

### Recommendation

Use the verified full `main` SHA as the canonical production deployment and retry identity. If human release identity is desired:

1. Require an operator-supplied version string at dispatch and validate that the corresponding tag/release does not already exist.
2. Re-read current `main`, require successful Product CI for that exact SHA, and build the production-only pair.
3. Deploy and health-check by digest pair, correlated by SHA and Actions run/attempt.
4. Only after success, create an annotated tag at that already-verified SHA and optionally publish a GitHub Release for it.
5. Protect the tag pattern with a tag ruleset, or enable immutable releases if the additional release lock/attestation is wanted.

This avoids failure-stable SemVer machinery: automation does not calculate the next version, a failed deployment creates no release ref, and an operator retries the same version input and SHA. It also avoids cross-environment promotion: production images are built by the authorized production run and merely share source identity with the tag.

Do not create a release branch unless a future decision explicitly introduces code stabilization, release-only commits, or maintained backport lines. Those are the only capabilities a moving branch adds here, and all are outside the agreed current-main manual flow.

## Rollout gates and remaining unknowns

Before enabling destructive cleanup:

- establish and test package Admin access for this repository's `GITHUB_TOKEN`; deletion through `GITHUB_TOKEN` remains a GitHub public-preview capability;
- inventory all live private API/web versions and current Dokploy digest consumers;
- verify actual manifest/index/attestation structure and a retained-image pull after a disposable deletion;
- decide which Actions workflows/runs constitute the authoritative successful development and production ledgers;
- run pair selection in dry-run mode and manually inspect the first deletion set; and
- make cleanup failure visible without failing or rolling back an already healthy deployment.

GitHub's supported documentation does not answer GHCR layer deduplication, byte reclamation, garbage-collection timing, or whether an untagged package version is an unreferenced child. Those remain explicit unknowns rather than assumptions in the design.
