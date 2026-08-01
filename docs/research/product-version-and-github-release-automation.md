# Product version and GitHub Release automation

Research date: 2026-08-01

## Question

What exact automation should implement Unshelf's single SemVer product version:
release-label validation, version calculation, direct `main` hotfixes, production
image version tags, post-health Git tags, complete generated notes, draft GitHub
Releases, retry without lost versions, and retention of the current plus five
previous production releases?[^ticket]

## Recommendation

Use immutable `vMAJOR.MINOR.PATCH` Git tags as the authoritative product-version
ledger, with GitHub Releases as the permanent changelog ledger. Automation creates
each Release as a verified draft for human review and later publication. Do not
derive the product version from any `package.json`: the root, API, web, and shared
packages are private and currently say `0.0.0`; that value should remain package
metadata, not release state.[^local-packages] The repository currently has no
product tags or GitHub Releases, so use `0.0.0` only as the calculation sentinel
before the first release.

The production workflow must be one serialized, idempotent transaction for an
exact `main` commit and its API/web digest pair. A version is consumed only when
the workflow explicitly creates `refs/tags/vX.Y.Z` **after** the deployed pair has
passed production health. Draft-release behavior is therefore not trusted to
create the tag implicitly.

## Main pull-request contract

Make one stable release-policy check required on every pull request whose base is
`main`. Run it on `opened`, `reopened`, `synchronize`, `ready_for_review`,
`labeled`, and `unlabeled`, so changing a release label reruns the required check.
GitHub supports label activity types on `pull_request` and required checks prevent
merge while failing.[^actions-events][^required-checks]

The check accepts exactly two paths:

| Pull request | Required validation | Bump contribution |
| --- | --- | --- |
| `dev` -> `main` | Same repository; exact base/head pair; current `main` is an ancestor of `dev`; exactly one label from `release:patch`, `release:minor`, `release:major`. | The one label. |
| hotfix branch -> `main` | Same repository; head is not `dev`; branch was cut from and is up to date with current `main`; **zero** `release:*` labels. | Inferred `patch`. |

Reject every other route to `main`, and let repository rules reject direct pushes.
The hotfix rule deliberately has no bump choice: a non-patch change belongs in
`dev`. Immediately after a hotfix merges, open a `main` -> `dev` carry-back pull
request. The next `dev` -> `main` check must fail until `dev` contains current
`main`; this prevents a later release from losing or reverting the hotfix.

At production-run time, revalidate the merged pull requests instead of trusting
only the earlier check. Pull-request labels remain mutable after merge, so replay
the paginated issue/timeline `labeled` and `unlabeled` events up to each PR's
`merged_at` timestamp and reconstruct the label set that actually passed the merge
gate. GitHub exposes the label and timestamp on those events.[^timeline][^issue-events]
Post-merge label edits must not alter a candidate version. Treat the three label
names as permanent automation vocabulary; fail closed if event history is
incomplete, a PR cannot be attributed, or its at-merge intent is not reconstructible.

## Stateless SemVer calculation

Run production after a pull request merges into `main`, under one repository-wide
production concurrency group that does not cancel an in-progress deployment.
GitHub Actions concurrency can serialize deployments; replacing an older pending
run with the newest is safe here because every run recomputes the complete
unreleased range.[^concurrency]

For target commit `T`:

1. Find the highest Git tag reachable from `T` whose name exactly matches
   `vMAJOR.MINOR.PATCH`; verify any GitHub Release for it targets the same tag. Its
   version is the base. With no product tag, use the untagged sentinel `0.0.0`.
2. Enumerate, with pagination, every merged PR based on `main` whose merge commit
   is in `(previous-tag, T]`. GitHub's compare endpoint supplies the commit range,
   and the commit/pull endpoint identifies the merged PR that introduced a commit;
   filter and deduplicate by PR number.[^compare-commits][^commit-pulls]
3. Reconstruct each `dev` -> `main` PR's release label at merge time. Give each
   valid hotfix PR an inferred patch contribution. Fail rather than guess if any
   `main`-range PR violates the contract.
4. Take the single highest contribution: `major > minor > patch`, and apply it
   **once** to the base. SemVer requires a minor bump to reset patch to zero and a
   major bump to reset minor and patch to zero.[^semver]

Thus two patches after `1.2.3` produce `1.2.4`, minor plus patch produces `1.3.0`,
and any major contribution produces `2.0.0`. Initially, patch/minor/major produce
`v0.0.1`, `v0.1.0`, and `v1.0.0` respectively.

This range calculation is the retry mechanism. If a `release:minor` deployment
fails and a patch fix-forward then merges, both PRs are still unreleased, so the
next candidate remains the same minor version. No draft Release, prerelease tag,
or incrementing file is needed to reserve a number.

## Notes, deployment, and finalization sequence

For a candidate `vX.Y.Z`, execute these steps in order:

1. Resolve the related build/CD handoff to the exact
   `ghcr.io/rajat2006/unshelf-api@sha256:...` and
   `ghcr.io/rajat2006/unshelf-web@sha256:...` pair. The API and one-shot migrate
   service use the same API digest. Deploy by digest, not by a moving tag. This is
   the established image/CD decision.[^image-cd]
2. Run the production health gate against that exact pair. Unshelf's current
   runbook includes `/api/health` plus SPA and sign-in checks; a migration failure
   must fail deployment rather than be bypassed.[^local-deploy]
3. Only after health succeeds, call `POST /releases/generate-notes` with
   `tag_name=vX.Y.Z`, `target_commitish=T`, and the previous finalized tag as
   `previous_tag_name`. Omit `previous_tag_name` for the first release. GitHub says
   the explicit previous tag controls the change range and generated notes include
   merged PRs, contributors, and a full-changelog link.[^generate-notes][^auto-notes]
4. Verify coverage before mutating version state. Compare PR links in the generated
   body with the deduplicated PRs associated with commits in the same tag-to-`T`
   range. If GitHub's generator omits an integration-branch PR, append a generated
   `Other merged pull requests` list from that API-derived set. The GitHub UI itself
   tells maintainers to check that generated notes contain all and only the desired
   information; GitHub does not document how nested `dev` merges are expanded.[^auto-notes]
5. Add the write-once `vX.Y.Z` tag to **both** healthy image digests and read them
   back. If either tag already exists, it must resolve to the expected digest;
   never move it. Keep the full-SHA trace tags and moving `production` tag behavior from
   the image/CD decision. GHCR supports version tags, while a digest is the stable
   content identity.[^ghcr][^docker-digests]
6. Create the lightweight Git reference `refs/tags/vX.Y.Z` at exact commit `T`
   through the Git references API, then read it back and verify the SHA. If the ref
   already exists, accept it only when it points to `T`; never update or force it.
   GitHub documents that a lightweight tag needs only this reference and that
   reference creation accepts a fully qualified ref plus commit SHA.[^git-refs][^git-tags]
7. Create a GitHub Release **as a draft** against that existing tag. Store the
   generated notes and a small provenance block containing `T`, the API digest, and
   the web digest. Read the draft back and verify all four identities. Leave it as
   a draft for human review and later publication; publication is not part of this
   automation.[^releases-api]

The explicit Git reference in step 6 is the commit point: it is the first durable
statement that `vX.Y.Z` is a real product version, and it happens only after the
versioned image pair is healthy and verified. Creating the draft against an
existing tag avoids relying on the underspecified timing of GitHub's automatic
tag creation for missing tags.

## Failure and retry contract

| Failure point | Required retry behavior |
| --- | --- |
| Validation, calculation, build, deploy, health, or note generation | No candidate version tags, Git tag, or Release exist. Recompute from the last product Git tag and all still-unreleased `main` PRs. |
| One or both GHCR `vX.Y.Z` tags exist, but no Git tag | Treat the transaction as frozen, not abandoned. Recover `T` from the immutable full-SHA/OCI revision and the two digests, verify the successful health record, finish the missing image tag, then continue with the same `vX.Y.Z`. Do not retarget the existing image tag or release newer `main` first. |
| Git tag exists, but draft creation failed | The healthy release is versioned. Verify the tag SHA and image digests, then create the missing draft for the same version; never calculate another bump first. |
| Draft-creation response was ambiguous | Query the Git ref and the paginated Releases API (which includes drafts), verify SHA/digests/body, and idempotently create or accept the existing draft. |
| Draft verification succeeded but cleanup failed | The release remains final. Retry cleanup only; do not delete or recreate the Git tag/Release and do not assign a new version. |

“Failure without consuming a version” therefore applies through the production
health gate. A post-health partial finalization is not a skipped version: image
tags freeze the intended transaction, and the explicit Git tag consumes it only
after both versioned images are healthy. Every run must repair such a transaction
before considering a newer `main` target.

## Retention: six image pairs, permanent release history

After the draft Release is created and verified, retain the GHCR API/web pairs for the
current production version plus the five preceding finalized SemVer releases
(six pairs total). Keep **all** Git tags and GitHub Releases indefinitely: they are
the authoritative version and changelog ledger, not disposable deployment blobs.

Cleanup must be pair-aware and post-health:

1. Read the permanent Git-tag ledger, SemVer-sort its product tags, and protect
   the newest six.
2. Paginate both user-owned GHCR packages. The Packages REST response exposes each
   container version's digest-like name, version id, and
   `metadata.container.tags`.[^packages-api]
3. Map every protected `vX.Y.Z` to both package version ids and verify the current
   `prod` digests are protected. If either side is missing or a candidate still
   carries a protected moving tag, stop rather than delete.
4. Delete an older API version and its matching web version as one logical unit.
   A network failure can make the two REST deletes physically partial, so retries
   must finish the missing side from the ledger rather than selecting a different
   victim. Never delete an old pair until its healthy replacement has finalized.

GitHub permits Actions to delete GHCR versions with `GITHUB_TOKEN` only when the
repository has package-admin access; that capability is currently documented as
public preview. Package access must therefore be provisioned and tested before
turning cleanup on.[^delete-packages]

## Implementation uncertainties to test once

- GitHub does not document whether generated notes traverse Unshelf's nested
  `dev`-PR history exactly as desired. The explicit PR-set coverage check and
  generated fallback list above make the draft contents deterministic without assuming it.
- Reconstructing at-merge labels depends on paginated timeline history and stable
  release-label names. Rename none of the three labels; fail closed on a gap.
- GHCR version deletion is version-id based and removes that registry version, not
  merely one selected tag. Exercise cleanup against test images first and verify
  that no full-SHA or moving tag still needed by another environment shares the
  deletion target.[^packages-api]
- Package deletion by `GITHUB_TOKEN` is preview behavior and requires package-admin
  access; alert and leave excess versions in place on authorization failure.

## Sources

[^ticket]: Unshelf, [Define product version and GitHub Release automation](https://github.com/rajat2006/unshelf/issues/247).
[^local-packages]: Unshelf source, [`package.json`](../../package.json), [`apps/api/package.json`](../../apps/api/package.json), [`apps/web/package.json`](../../apps/web/package.json), and [`packages/shared/package.json`](../../packages/shared/package.json).
[^actions-events]: GitHub Docs, [Events that trigger workflows](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows), including `pull_request` label activity types and head/base filtering.
[^required-checks]: GitHub Docs, [Status checks](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/merging-a-pull-request-with-required-checks).
[^timeline]: GitHub Docs, [REST API endpoints for timeline events](https://docs.github.com/en/rest/issues/timeline).
[^issue-events]: GitHub Docs, [Issue event types](https://docs.github.com/en/rest/using-the-rest-api/issue-event-types), including `labeled`, `unlabeled`, label data, and `created_at`.
[^concurrency]: GitHub Docs, [Control the concurrency of workflows and jobs](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency).
[^compare-commits]: GitHub Docs, [Compare two commits](https://docs.github.com/en/rest/commits/commits#compare-two-commits), equivalent to the `BASE..HEAD` commit range and paginated for large comparisons.
[^commit-pulls]: GitHub Docs, [List pull requests associated with a commit](https://docs.github.com/en/rest/commits/commits#list-pull-requests-associated-with-a-commit).
[^semver]: Semantic Versioning, [Semantic Versioning 2.0.0](https://semver.org/), especially rules 4 and 6-8.
[^image-cd]: Unshelf, [environment-specific image build, tag, and CD handoff research in pull request 252](https://github.com/rajat2006/unshelf/pull/252).
[^local-deploy]: Unshelf operator runbook, [`docs/deploy.md`](../deploy.md), especially first-deploy health checks and the migration gate.
[^generate-notes]: GitHub Docs, [Generate release notes content for a release](https://docs.github.com/en/rest/releases/releases#generate-release-notes-content-for-a-release).
[^auto-notes]: GitHub Docs, [Automatically generated release notes](https://docs.github.com/en/repositories/releasing-projects-on-github/automatically-generated-release-notes).
[^ghcr]: GitHub Docs, [Working with the Container registry](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry), including version tags, digest pulls, and `GITHUB_TOKEN` publishing.
[^docker-digests]: Docker Docs, [Image digests](https://docs.docker.com/dhi/core-concepts/digests/).
[^git-refs]: GitHub Docs, [REST API endpoints for Git references](https://docs.github.com/en/rest/git/refs), including create/get reference and required `contents: write` permission.
[^git-tags]: GitHub Docs, [REST API endpoints for Git tags](https://docs.github.com/en/rest/git/tags), which distinguishes annotated tag objects from lightweight tag references.
[^releases-api]: GitHub Docs, [REST API endpoints for releases](https://docs.github.com/en/rest/releases/releases), including draft creation, `tag_name`, and `target_commitish`.
[^packages-api]: GitHub Docs, [REST API endpoints for packages](https://docs.github.com/en/rest/packages/packages), including paginated user-owned container versions, tag metadata, and version deletion.
[^delete-packages]: GitHub Docs, [Deleting and restoring a package](https://docs.github.com/en/packages/learn-github-packages/deleting-and-restoring-a-package), including package-admin requirements and the `GITHUB_TOKEN` public preview.
