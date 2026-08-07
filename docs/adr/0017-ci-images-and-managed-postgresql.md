# CI-built images and managed PostgreSQL define the deployment boundary

## Status

Accepted

## Context

ADR-0009 selected Dokploy and managed PostgreSQL, but the first live stack drifted
into source builds and PostgreSQL inside application Compose. That shape has no
registry-backed release identity, couples application teardown to database data,
and makes one reusable preview/development/production contract impossible.

## Decision

GitHub Actions is the only publisher of private Unshelf API and web images.
Dokploy consumes immutable digest references with read-only package authority.
Every environment builds its own pair; images are not promoted across channels.

One parameterized Compose file contains only `migrate`, `api`, and `web`.
`migrate` and `api` inherit the exact same API digest, and API starts only after
the one-shot migration succeeds. Web uses its separate digest. Compose contains
no PostgreSQL service, database volume, local build, or host port publication.

Dokploy owns isolated ingress and same-origin Domains. API and migrate also join
an environment-specific private attachable overlay connected to a separately
managed PostgreSQL 18 service. Production and non-production have distinct
projects, networks, roles, and credentials.

Clerk accepts only the deployment's exact HTTPS `PUBLIC_ORIGIN`. The API image's
migration entrypoint supports transactional `apply` and read-only `verify` modes
so ordinary previews can prove compatibility without changing shared
development schema.

## Consequences

- A deployable unit is an exact API/web digest pair, not a branch checkout or
  moving tag.
- Database lifetime and backup ownership no longer follow application Compose.
- Preview, development, and production exercise the same service graph while
  varying only validated configuration and image identity.
- Dokploy version-sensitive isolation, Domain, and network behavior is a rollout
  gate and must be revalidated on upgrade.
- Failed migrations stop deployment and are fixed forward; this does not add
  rollback or zero-downtime guarantees.
- The old Compose-local database may be removed only after the managed
  replacement passes live acceptance.
