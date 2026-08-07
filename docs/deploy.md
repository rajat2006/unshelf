# Deploy Unshelf through Dokploy

This is the operator runbook for the architecture recorded by
[ADR-0017](adr/0017-ci-images-and-managed-postgresql.md). GitHub Actions builds
private API and web images; Dokploy deploys one immutable digest pair and owns
same-origin HTTPS routing. PostgreSQL 18 is managed outside application Compose.

## Deployment contract

[`docker-compose.yml`](../docker-compose.yml) is one parameterized contract for
preview, development, and production. It contains only:

```text
migrate (API digest) ──completed──▶ api (same API digest) ──started──▶ web
          │                           │
          └──── private DB network ───┘
```

Dokploy isolated deployment adds all three services to the resource-specific
ingress network. Only `migrate` and `api` additionally join the external
`DATABASE_NETWORK`; `web` has no database path. No service publishes a host
port. Dokploy Domains creates the routers, redirect, TLS, and certificate
labels. The repository retains only
`traefik.docker.network=${APP_NAME}` so the installed Dokploy version routes a
multihomed API over the isolated ingress network rather than the database
network.

The required resource environment is:

| Variable | Consumer | Rule |
| --- | --- | --- |
| `API_IMAGE` | migrate, api | Full `ghcr.io/rajat2006/unshelf-api@sha256:…` reference. |
| `WEB_IMAGE` | web | Full `ghcr.io/rajat2006/unshelf-web@sha256:…` reference. |
| `DATABASE_URL` | migrate, api | Opaque internal connection URL; never assemble or print it in Compose or automation. |
| `DATABASE_NETWORK` | migrate, api | Private attachable overlay used by non-production PostgreSQL. |
| `APP_NAME` | routed services | Written by Dokploy; selects the isolated ingress network. |
| `APPLICATION_NAME` | migrate, api | Non-secret stable deployment identifier. |
| `PUBLIC_ORIGIN` | api | Exact canonical HTTPS origin with no trailing slash, path, query, fragment, or credentials. |
| `CLERK_SECRET_KEY` | api | Matching Clerk instance secret. |
| `CLERK_PUBLISHABLE_KEY` | api | Matching Clerk publishable key. |
| `MIGRATION_MODE` | migrate | `apply` for development/production/schema previews; `verify` for ordinary previews. |
| `LOG_LEVEL` | migrate, api | Optional; defaults to `info`. |

The web publishable key is compiled into each environment-specific web image.
There is no frontend build argument at runtime and no artifact promotion between
channels.

## Installed-version gate

The last redacted inventory was recorded on 2026-08-01 against Dokploy v0.29.13,
Traefik v3.6.7, Docker 28.5.0, and a 2-vCPU/8-GB Ubuntu 24.04 VPS. Before any
live mutation, revalidate all of the following and stop for review on meaningful
drift:

- Dokploy, Traefik, Docker, host capacity, and Swarm state;
- raw Compose create/update/deploy semantics and project-scoped authorization;
- isolated deployment creates an external network named by `APP_NAME`, adds all
  services, and connects Traefik;
- Dokploy Domains can create two records on one generated host;
- managed PostgreSQL accepts a custom attachable overlay and no external port;
- private registry credentials are pull-only; and
- generated hosts still receive trusted HTTPS certificates and HTTP redirects.

Never capture raw Dokploy responses, environment dumps, connection strings, API
keys, cookies, or bearer tokens as evidence.

## Non-production foundation and hosted-development cutover

Perform the cutover with a non-owner Dokploy identity that can access only the
non-production project. Production resources, credentials, database networks,
and data are out of scope.

1. Inventory the exact existing non-production project, `DB-dev`, legacy Compose
   resource, its Compose-local database volume, domains, registry entries, and
   backup schedule. Record only stable redacted identifiers.
2. Create or verify a separate non-production project and non-owner API identity.
   Prove the identity cannot access the production project.
3. Reconfigure `DB-dev` to PostgreSQL 18. Attach it to a dedicated private,
   attachable overlay network and leave the external port unset. Create distinct
   owner/migration, application, and verification roles. The application role
   must not create schemas or roles; the verification role needs only connection,
   schema usage, and migration-ledger reads.
4. Configure Dokploy with one machine-account classic PAT carrying
   `read:packages` only. Prove authenticated pulls of both private packages,
   anonymous denial, and inability to publish.
5. Create one raw Compose resource with isolated deployment enabled. Load the
   committed Compose text and set the required environment without printing it.
   Before any Compose update, validate the pair through the trusted control
   plane: `pnpm deployment:control validate-image-pair --api-image "$API_IMAGE" --web-image "$WEB_IMAGE"`.
6. Generate one hostname. Reuse the bare hostname for two native Domain records:
   `api`, path `/api`, port 3001, no strip; and `web`, path `/`, port 80, no
   strip. Enable HTTPS and the installed certificate resolver. Set
   `PUBLIC_ORIGIN` to the exact `https://<generated-host>` origin.
7. Set a Product-CI-approved development API/web digest pair and
   `MIGRATION_MODE=apply`, then deploy. The migration must exit successfully
   before API and web start.
8. Complete every acceptance check below. **Do not remove the legacy resource**
   or its database volume before all checks pass and the replacement target is
   resolved exactly.
9. After explicit irreversible confirmation, stop and remove only the legacy
   Compose resource and its application-local database volume. Recheck the exact
   target immediately before deletion. Do not delete `DB-dev`, the replacement
   Compose resource, shared Dokploy/Traefik state, or unrelated volumes.

The discarded application-local database contains no data requiring migration.
That authorization applies only to this one proven cutover; it is not a general
database-deletion procedure.

## Migration modes

The same API image owns both modes:

- `apply` runs committed Drizzle migrations transactionally. A failure prevents
  API startup and is fixed forward; there are no down-migrations.
- `verify` compares every committed migration timestamp and SHA-256 hash with
  `drizzle.__drizzle_migrations` using SELECT only. Missing, extra, rewritten,
  or unapplied history fails closed and performs no DDL.

The PostgreSQL 18 integration test executes `apply`, verifies API/database
health, then executes `verify` as a role without DDL permission and confirms the
schema shape is unchanged.

## Routing, authentication, and cutover acceptance

All checks must pass against the generated development host:

| Check | Required result |
| --- | --- |
| HTTPS | A normal client trusts the certificate for `/` and `/api/health`. |
| Cleartext | HTTP redirects to the same HTTPS host; no application response is served over cleartext. |
| Same origin | `/` serves the Unshelf HTML shell and `/api/health` returns `status: ok` and `db: up`. |
| Topology | Only API/migrate join the non-production DB overlay; all services join isolated ingress; no ports are published. |
| Migration gate | `migrate` exits 0 before API/web; API and migrate report the exact same image digest. |
| Clerk positive | Google sign-in returns to the configured origin and a protected API call succeeds. |
| Clerk negative | A token minted for another generated origin is rejected with 401 and no token detail is logged. |
| Refresh | Token refresh plus hard reload retains a usable session without a redirect loop. |
| Changed host | Changing the generated host fails closed until `PUBLIC_ORIGIN` and Clerk configuration are deliberately updated. |
| Cookie/URL hygiene | Cookies are Secure; callback/final URLs and history contain no session token. |
| Credential hygiene | Deployment output and bounded app/Traefik logs contain no bearer token, cookie, database URL, Clerk secret, or GHCR credential. |
| Authority | Non-production automation cannot access production; Dokploy can pull but cannot publish packages. |

Record only pass/fail, source SHA, API/web digests, sanitized states, and
durations. A real deployment record is required before the ticket's live
acceptance can be closed.

## Continuous hosted-development reconciliation

`Deploy development` is a trusted `workflow_run` consumer of `Publish candidate
images`. It accepts only a successful same-repository `dev` candidate run and
then independently verifies that the requested SHA is still the current `dev`
head and has an exact successful push run of Product CI. The deployment job uses
only the `development` GitHub environment.

Configure that environment with these values. The non-production Dokploy API
key must be the restricted identity proven during the hosted-development
cutover; do not reuse an owner or production key.

| Kind | Name | Value |
| --- | --- | --- |
| Variable | `DOKPLOY_NONPRODUCTION_URL` | Exact HTTPS base URL of the Dokploy instance. |
| Variable | `DOKPLOY_DEVELOPMENT_COMPOSE_ID` | Stable identifier of the proven hosted-development Compose resource. |
| Variable | `DEVELOPMENT_PUBLIC_ORIGIN` | Exact generated HTTPS origin, with no trailing slash. |
| Secret | `DOKPLOY_NONPRODUCTION_API_KEY` | Non-owner identity restricted to the non-production project. |
| Secret | `DOKPLOY_DEVELOPMENT_COMPOSE_ENV` | Complete newline-delimited runtime environment except `API_IMAGE`, `WEB_IMAGE`, and `PUBLIC_ORIGIN`; those are bound by the control plane. |

The workflow has one `development-deployment` concurrency group with
`cancel-in-progress: false`. GitHub replaces an obsolete pending run with the
newest pending `dev` SHA, while an active run continues following its already
started Dokploy attempt. Candidate publication remains independently
cancelable.

Under that lock, the control plane:

1. revalidates current `dev`, Product CI, the private GHCR trace pair, and both
   immutable digests;
2. converges the trusted raw Compose text and the exact environment-specific
   digest pair;
3. submits `development:<full source SHA>:run-<Actions run id>` as both the safe
   correlation key and Dokploy deployment title;
4. follows matching queue and deployment records, failing closed when either
   source contains more than one match or no record appears within ten minutes;
5. treats `error` and `cancelled` as terminal fix-forward failures and never
   calls a Dokploy cancellation endpoint;
6. independently requires `/api/health` to return `status: ok` and `db: up` and
   `/` to return the Unshelf HTML shell; and
7. moves both `development` GHCR tags to the healthy immutable pair only after
   those checks pass, verifies both resolved digests, and retries the pair up to
   three times to repair a transient single-tag failure.

The CLI prints one allowlisted JSON result containing only channel, SHA,
digests, deployment identifier, state, and duration. Adapter failures are
generic and never include raw Dokploy, database, registry, or health response
data. Keep Dokploy's built-in deployment-failure email enabled for the Compose
resource; GitHub Actions is the record for stale intent, registry, control-plane,
and external-health failures. Recovery is a corrected commit or configuration
followed by a normal retry—never rollback or down-migration.

Before enabling the workflow, prove with the restricted key that a production
project/resource request returns `403`, and confirm the environment contains no
production variable or secret. Then push one harmless commit to `dev` and record
only the Actions run, source SHA, API/web digests, correlated deployment ID,
migration-before-API ordering, external health results, final moving-tag
digests, and durations. Do not close the rollout ticket without that live
evidence.

## Logs and incident evidence

Application containers use Docker's blocking `local` driver:

| Service | Rotation | Nominal budget |
| --- | ---: | ---: |
| api | `20m` × 5 | 100 MB |
| web | `5m` × 3 | 15 MB |
| migrate | `5m` × 3 | 15 MB |

The **130 MB** total is byte-bounded, not time-bounded. Rotation removes old
entries, container recreation removes previous-container history, and VPS loss
removes all local history. It is not an audit trail and not a cross-deployment
archive. Logs may include sensitive User data and require restricted access.

From the Dokploy Compose resource directory:

```sh
docker compose -f docker-compose.yml ps --all
docker compose -f docker-compose.yml logs --since=30m --tail=200 --timestamps api
docker compose -f docker-compose.yml logs --timestamps migrate
docker compose -f docker-compose.yml logs --since=2h --tail=500 --timestamps api web

docker inspect --format '{{.Name}} {{json .HostConfig.LogConfig}}' \
  "$(docker compose -f docker-compose.yml ps --quiet api)"
docker inspect --format '{{.Name}} {{json .HostConfig.LogConfig}}' \
  "$(docker compose -f docker-compose.yml ps --all --quiet migrate)"

docker compose -f docker-compose.yml logs \
  --since=24h --timestamps --no-color api web migrate > unshelf-predeploy.log
```

Treat `unshelf-predeploy.log` as sensitive incident evidence: restrict access,
inspect it for credentials before sharing, and remove it when no longer needed.
