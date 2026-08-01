# Dokploy topology and Compose contract for persistent and preview environments

Research date: 2026-08-01

## Question

Given the installed Dokploy v0.29.13 behavior, official documentation, and the
live VPS inventory, what service topology and repository Compose contract are
simplest to maintain for persistent development, production, and multi-service
PR previews? In particular: should Unshelf use Applications, Compose services,
or both; should deployment use one parameterized Compose file or explicit
environment variants; and who should own routing labels, networks, image
references, and managed-Postgres connections?

## Recommendation

Use **one Dokploy Docker Compose resource per deployed Unshelf environment**:

| Environment | Dokploy application tier | Database tier | Lifecycle owner |
| --- | --- | --- | --- |
| Production | One persistent Compose resource containing `migrate`, `api`, and `web` | One production Dokploy-managed PostgreSQL service, outside Compose | CI updates and deploys the existing resource |
| Hosted development | One persistent Compose resource with the same three services | One non-production Dokploy-managed PostgreSQL service, outside Compose | CI updates and deploys the existing resource |
| PR preview | One API-created, isolated Compose resource per eligible PR, with the same three services | A logical database on non-production PostgreSQL: shared development DB for ordinary PRs, isolated clone for schema-changing PRs | CI creates/updates/deploys/deletes the resource |

Commit **one parameterized deployment Compose file** for all three rows. The
service graph does not vary by environment, so separate production,
development, and preview files would duplicate the part most important to keep
identical: `migrate -> api -> web`. Environment resources should supply values,
not alternate topology.

The deployment file should:

- contain `migrate`, `api`, and `web`, but no PostgreSQL service;
- define the required `${API_IMAGE}` reference once in a YAML anchor inherited
  unchanged by `migrate` and `api`, and use required `${WEB_IMAGE}` for `web`;
- receive immutable, digest-qualified image references, not moving tags;
- pass an opaque `${DATABASE_URL}` only to `migrate` and `api`;
- pass the exact `${PUBLIC_ORIGIN}` to `api` so Clerk can restrict bearer-token
  authorization to that deployment's browser origin;
- attach `migrate` and `api` to one external `${DATABASE_NETWORK}`, while
  leaving `web` off the database network;
- retain `depends_on: migrate: condition: service_completed_successfully` for
  the API and the existing API-before-web ordering;
- contain no Host, path, port, TLS, certificate-resolver, or
  `traefik.enable` labels; and
- put `traefik.docker.network=${APP_NAME}` on the two routed services as the one
  installed-version-specific Traefik hint that must remain in the repository.

Dokploy v0.29.13 writes `APP_NAME` and `COMPOSE_PROJECT_NAME` into the generated
`.env` before running Compose, so `${APP_NAME}` resolves to the exact isolated
network name Dokploy creates for that resource.[^v029-compose-builder]

Use Dokploy native **Domains** to own the generated router, service, redirect,
TLS, and certificate labels. For every resource, create two domain records with
the **same bare hostname** (never a URL):

| Service | Public path | Container port | Strip path |
| --- | --- | ---: | --- |
| `api` | `/api` | 3001 | false |
| `web` | `/` | 80 | false |

Enable isolated deployment on every application Compose resource. Give the two
managed PostgreSQL services separate, pre-provisioned attachable overlay
networks—one production and one non-production—and configure each database
service to join only its network. Compose declares the selected network as
external. Do not publish a PostgreSQL external port.

This is an **all-Compose application topology with Dokploy-managed databases**,
not a hybrid Application/Compose topology.

## Why Applications and native previews do not fit

Dokploy Applications are single-container entities. Current Dokploy docs call
native previews an Applications feature, and say a preview creates one dynamic
domain for an Application.[^dokploy-applications][^dokploy-preview-docs]
The installed v0.29.13 model is even more explicit:

- preview settings (`previewEnv`, wildcard, port, limit, HTTPS, and enablement)
  are columns on `application`;[^v029-application-schema]
- every `preview_deployments` row has a required `applicationId` foreign key
  and no `composeId`;[^v029-preview-schema] and
- the GitHub pull-request webhook queries only Applications in its PR branch
  and enqueues `application-preview` jobs. Compose resources are queried only
  in the push and tag branches.[^v029-github-webhook]

Two native Application previews—one API and one web—would therefore receive two
independently generated preview identities and domains. They would not be a
single same-origin deployment, and a third migration Application would still
need custom cross-resource ordering. Combining all processes in one Application
image would instead violate the standing separate API/web artifact contract and
hide the one-shot migration gate.

A hybrid—Applications for persistent API/web plus custom Compose previews—would
also make previews exercise a different lifecycle, network model, routing
provider, and migration contract from development and production. It saves no
meaningful custom automation because multi-service preview creation and cleanup
still need orchestration. One Compose abstraction across all environments is
the smaller operational surface.

## Installed v0.29.13 Compose lifecycle is sufficient

Compose does not have native PR previews, but the installed API exposes the
primitives required to build them:

- create, update, save environment, delete, and deploy a Compose resource; and
- generate a hostname and create/update/delete Domain records attached to a
  Compose resource and service name.[^v029-compose-router][^v029-domain-router]

The Compose schema stores one encrypted environment string, one Compose file,
one path, one isolated-deployment flag, and the usual provider/branch settings.
It has no preview-specific state.[^v029-compose-schema] That is the right
boundary: GitHub Actions owns the PR policy and calls ordinary Dokploy resource
operations, while Dokploy owns execution and container state.

For the least branch ambiguity, CI should manage preview resources as **raw
Compose** resources. The Compose text must come from the trusted target `dev`
revision used by the workflow, not the PR head: otherwise a PR could replace
ordinary application changes with host mounts, privileged options, or other
infrastructure instructions that execute on the VPS. The PR contributes only
the already-built API/web digest pair. A change to the deployment contract is
therefore exercised by hosted development after review and merge to `dev`, then
by production after promotion to `main`.

The v0.29.13 create schema accepts `composeFile` but not `sourceType`, whereas
the subsequent update schema can set `sourceType: raw`, the file, environment,
and isolation flag.[^v029-compose-schema] The safe creation sequence is thus:

1. create the Compose resource;
2. update it to raw source, the exact trusted target-branch Compose text, its
   opaque environment values, and isolated deployment;
3. generate one hostname, then create both same-host Domain records;
4. deploy only after those records exist.

The ordering matters because v0.29.13 reads stored Domain rows and injects their
labels while constructing the deployment command.[^v029-domain-transform]
Persistent development and production may be provisioned once using the same
raw-resource contract; each CI deployment then updates the Compose text from
the exact authorized `dev` or `main` commit and its digest pair before enqueueing
deploy. This avoids a second, moving-branch checkout inside Dokploy after CI has
already verified a specific commit.

On PR close or merge, CI deletes the Compose resource. Database deletion is a
separate lifecycle action: ordinary-preview writes remain in the shared
development database, while the later database-orchestration decision must
drop a schema-preview logical database explicitly. Dokploy resource deletion
does not own that logical database.

Because built-in Application preview authorization is not involved, CI must
enforce the map's same-repository, non-draft, base-`dev`, maximum-three policy
before it creates a resource. Fork PRs must never receive Dokploy or runtime
secrets.

## One parameterized deployment file

Docker Compose supports interpolation in image names and other values, including
the fail-fast `${VAR:?message}` form. It also accepts image references by
digest.[^docker-interpolation][^docker-compose-services] Dokploy writes the
resource environment to the `.env` beside the Compose file; it does **not**
automatically inject every value into every container, so the repository should
continue to enumerate each container's environment explicitly.[^dokploy-compose]

The contract should have this shape (illustrative, not an implementation):

```yaml
x-api-image: &api-image
  image: ${API_IMAGE:?API_IMAGE is required}
  pull_policy: always

services:
  migrate:
    <<: *api-image
    command: ["node", "dist/migrate.js"]
    restart: "no"
    environment:
      DATABASE_URL: ${DATABASE_URL:?DATABASE_URL is required}
      LOG_LEVEL: ${LOG_LEVEL:-info}
    networks: [database]

  api:
    <<: *api-image
    environment:
      DATABASE_URL: ${DATABASE_URL:?DATABASE_URL is required}
      PORT: "3001"
      LOG_LEVEL: ${LOG_LEVEL:-info}
      CLERK_SECRET_KEY: ${CLERK_SECRET_KEY:?CLERK_SECRET_KEY is required}
      CLERK_PUBLISHABLE_KEY: ${CLERK_PUBLISHABLE_KEY:?CLERK_PUBLISHABLE_KEY is required}
      PUBLIC_ORIGIN: ${PUBLIC_ORIGIN:?PUBLIC_ORIGIN is required}
    depends_on:
      migrate:
        condition: service_completed_successfully
    networks: [database]
    labels:
      - traefik.docker.network=${APP_NAME}

  web:
    image: ${WEB_IMAGE:?WEB_IMAGE is required}
    pull_policy: always
    depends_on: [api]
    labels:
      - traefik.docker.network=${APP_NAME}

networks:
  database:
    name: ${DATABASE_NETWORK:?DATABASE_NETWORK is required}
    external: true
```

The existing logging blocks should remain on their respective services; they
are omitted above only to expose the topology. The deployment contract removes
the current `db` service, local `build` sections, named database volume, manual
router labels, and hardcoded `dokploy-network` attachment.[^local-compose]
`WEB_IMAGE` is already built separately for preview, development, and production
with that environment's Vite/Clerk public configuration, so the deployment file
does not accept a frontend build argument or promote one web digest between
environments.

If local development still needs a Compose-managed PostgreSQL and local image
builds, keep that structurally different local concern in a separate local file.
Do not turn production, hosted development, and previews into three deployment
files merely because their values differ.

## Routing ownership and same-origin behavior

Dokploy recommends native Domains for Compose and injects Traefik labels and
network configuration at deploy time.[^dokploy-compose-domains] In v0.29.13 a
Domain row for Compose records `host`, `path`, `port`, `serviceName`, HTTPS, and
certificate settings.[^v029-domain-schema] Its transformer emits:

- `Host(<host>) && PathPrefix(<path>)` for a non-root path; and
- only `Host(<host>)` for `/`.[^v029-domain-transform]

Therefore the two same-host Domain records generate an API-specific rule and a
web fallback rule. Traefik v3.6 uses rule length as default priority, so the
longer Host-plus-`/api` rule wins for `/api` requests without an explicit
priority or a repository-owned `!PathPrefix` rule.[^traefik-priority] With
`stripPath: false`, Express receives `/api` unchanged.

The live deployment's malformed `Host` rule came from putting `http://` into
`DOMAIN`; native Domain records remove that free-form label interpolation seam,
but automation must still submit a bare hostname.[^live-inventory]

### The one repository-owned Traefik label

Isolated Compose transformation in v0.29.13:

1. creates an external network named after the Compose `appName`;
2. preserves each service's existing networks and adds that isolated network
   to every service; and
3. creates the network, runs Compose, then connects the standalone Dokploy
   Traefik container to it.[^v029-isolation-transform][^v029-compose-builder]

When isolation is enabled, the Domain transformer deliberately does **not** add
`traefik.docker.network=dokploy-network`.[^v029-domain-transform] The API is on
both the isolated ingress network and a database overlay. Traefik documents
`traefik.docker.network` as the per-container way to choose the network it
should use.[^traefik-docker-network] Setting it to `${APP_NAME}` prevents
Traefik from selecting the database network, which it does not join. Apply the
same label to web for an explicit, uniform routed-service contract.

This label does not take routing ownership away from Dokploy: it selects the
transport network only. Dokploy still generates `traefik.enable`, router rules,
ports, redirects, TLS, and certificate configuration. Re-test this seam on a
Dokploy upgrade; if a future release reliably injects the isolated-network hint,
the repository label can be removed then.

## External managed-Postgres connection

Dokploy-managed PostgreSQL is a Swarm service. In v0.29.13 its Docker service
receives `Networks` from the configurable `networkSwarm` value, defaulting to
`dokploy-network` when none is supplied. It publishes port 5432 only when an
`externalPort` is configured.[^v029-postgres-builder][^v029-network-default]

Do not use that shared default for the target topology. Provision two named,
external, **attachable overlay** networks and set the production and
non-production database services' network controls accordingly. Docker's
`--attachable` overlay is specifically what allows both Swarm services and
standalone Compose containers to join the same network.[^docker-overlay]

The resulting boundary is:

```text
production Compose api/migrate ── production DB overlay ── production Postgres

development + preview api/migrate ── non-production DB overlay ── non-production Postgres

each Compose api/web/migrate ── its own isolated bridge ── Dokploy Traefik
```

`web` never joins a database network. Production never joins the non-production
database network, and non-production never joins the production network. Each
Compose resource receives the managed database's internal connection URL as one
opaque `DATABASE_URL`; no host, user, password, or database name is assembled in
the Compose file. Dokploy's own guidance prefers internal credentials for
same-network applications and reserves external ports for truly external
clients.[^dokploy-database-connection]

Ordinary previews sharing development data necessarily have network reachability
to non-production PostgreSQL. Schema-changing previews use different logical
database credentials/URLs on that same non-production service; they do not need
a different container network. Credentials and PostgreSQL grants remain the
logical-database boundary.

## Generated preview hostname caveat

There is a first-party version mismatch worth making explicit. Current Dokploy
docs describe generated preview names as `traefik.me` and HTTP by default, with
certificate configuration required for HTTPS.[^dokploy-preview-docs][^dokploy-domains]
The installed v0.29.13 `domain.generateDomain` implementation actually returns
a random `<project>-<hash>-<ip>.sslip.io` hostname.[^v029-domain-service]

Preview automation should call the installed generator **once** per Compose
resource and reuse its returned host for both Domain rows; it must not construct
or assume either suffix. It sets `PUBLIC_ORIGIN` to the normalized HTTPS origin
formed from that returned bare host. The map's separate generated-HTTPS prototype
remains a real gate: prove certificate issuance, exact-origin Clerk behavior,
both routes, and cleanup on the installed instance before productionizing the
orchestration.
This uncertainty does not invalidate the topology, but it does prevent treating
the current documentation's hostname example as an installed-version contract.

## Decision and implementation consequences

1. **Choose Compose for every app environment.** Applications and native
   previews cannot represent the multi-service same-origin unit.
2. **Keep PostgreSQL Dokploy-managed and outside Compose.** This restores
   ADR-0009 and makes Dokploy database backups target the database actually in
   use.[^adr-hosting]
3. **Commit one deployment Compose file.** Environment resources vary only
   digest references, secrets/config, hostname records, and database network/URL.
4. **Let Dokploy Domains own routing.** The repository owns only the
   `${APP_NAME}` network-selection label required by v0.29.13.
5. **Use isolated Compose ingress plus two DB overlays.** This supports repeated
   preview service names without putting production and non-production databases
   on one shared application network.
6. **Make CI the preview control plane.** It enforces eligibility and cap,
   creates/updates/deploys/deletes ordinary Compose resources through the API,
   supplies only trusted target-branch Compose text, and treats logical database
   lifecycle as a separate operation.
7. **Prototype generated HTTPS before implementation.** Also capture the
   generated/converted Compose and inspect effective labels/networks as the
   acceptance evidence.

No installed-source evidence invalidates this topology. The two non-obvious
requirements are the attachable overlay database networks and the explicit
`${APP_NAME}` Traefik network hint; omitting either can make an isolated API
unable to reach PostgreSQL or make Traefik choose a network it cannot reach.

## Sources

[^live-inventory]: Unshelf, [Inventory the live Dokploy and VPS deployment state — resolution](https://github.com/rajat2006/unshelf/issues/240#issuecomment-5151271335).
[^local-compose]: Unshelf source, [`docker-compose.yml`](../../docker-compose.yml), and operator guide, [`docs/deploy.md`](../deploy.md).
[^adr-hosting]: Unshelf, [ADR-0009](../adr/0009-v1-stack-and-hosting.md) and [ADR-0011](../adr/0011-traefik-owns-routing-caddy-serves-static.md).
[^dokploy-applications]: Dokploy, [Applications](https://docs.dokploy.com/docs/core/applications).
[^dokploy-preview-docs]: Dokploy, [Preview Deployments](https://docs.dokploy.com/docs/core/applications/preview-deployments).
[^dokploy-compose]: Dokploy, [Docker Compose](https://docs.dokploy.com/docs/core/docker-compose).
[^dokploy-compose-domains]: Dokploy, [Docker Compose Domains](https://docs.dokploy.com/docs/core/docker-compose/domains).
[^dokploy-domains]: Dokploy, [Domains](https://docs.dokploy.com/docs/core/domains).
[^dokploy-database-connection]: Dokploy, [Database connection](https://docs.dokploy.com/docs/core/databases/connection).
[^v029-application-schema]: Dokploy v0.29.13 source, [`application.ts` lines 87–108](https://github.com/Dokploy/dokploy/blob/v0.29.13/packages/server/src/db/schema/application.ts#L87-L108).
[^v029-preview-schema]: Dokploy v0.29.13 source, [`preview-deployments.ts` lines 12–68](https://github.com/Dokploy/dokploy/blob/v0.29.13/packages/server/src/db/schema/preview-deployments.ts#L12-L68).
[^v029-github-webhook]: Dokploy v0.29.13 source, [`github.ts` push/Compose handling at lines 213–326 and PR/Application handling at lines 338–532](https://github.com/Dokploy/dokploy/blob/v0.29.13/apps/dokploy/pages/api/deploy/github.ts#L213-L532).
[^v029-compose-schema]: Dokploy v0.29.13 source, [`compose.ts` lines 37–92 and 179–230](https://github.com/Dokploy/dokploy/blob/v0.29.13/packages/server/src/db/schema/compose.ts#L37-L92).
[^v029-compose-router]: Dokploy v0.29.13 source, [`compose.ts` API router](https://github.com/Dokploy/dokploy/blob/v0.29.13/apps/dokploy/server/api/routers/compose.ts#L82-L464), and current [Compose API reference](https://docs.dokploy.com/docs/api/compose).
[^v029-domain-router]: Dokploy v0.29.13 source, [`domain.ts` API router](https://github.com/Dokploy/dokploy/blob/v0.29.13/apps/dokploy/server/api/routers/domain.ts#L34-L188).
[^v029-domain-schema]: Dokploy v0.29.13 source, [`domain.ts` lines 28–96](https://github.com/Dokploy/dokploy/blob/v0.29.13/packages/server/src/db/schema/domain.ts#L28-L96).
[^v029-domain-transform]: Dokploy v0.29.13 source, [`domain.ts` Compose transformation and label generation](https://github.com/Dokploy/dokploy/blob/v0.29.13/packages/server/src/utils/docker/domain.ts#L134-L348).
[^v029-isolation-transform]: Dokploy v0.29.13 source, [`collision.ts` lines 14–25 and 66–80](https://github.com/Dokploy/dokploy/blob/v0.29.13/packages/server/src/utils/docker/collision.ts#L14-L25) and [`root-network.ts` lines 4–59](https://github.com/Dokploy/dokploy/blob/v0.29.13/packages/server/src/utils/docker/collision/root-network.ts#L4-L59).
[^v029-compose-builder]: Dokploy v0.29.13 source, [`compose.ts` deployment command and generated environment](https://github.com/Dokploy/dokploy/blob/v0.29.13/packages/server/src/utils/builders/compose.ts#L18-L124).
[^v029-postgres-builder]: Dokploy v0.29.13 source, [`postgres.ts` service construction](https://github.com/Dokploy/dokploy/blob/v0.29.13/packages/server/src/utils/databases/postgres.ts#L17-L109).
[^v029-network-default]: Dokploy v0.29.13 source, [`utils.ts` lines 538–620](https://github.com/Dokploy/dokploy/blob/v0.29.13/packages/server/src/utils/docker/utils.ts#L538-L620), and [`postgres.ts` schema network control](https://github.com/Dokploy/dokploy/blob/v0.29.13/packages/server/src/db/schema/postgres.ts).
[^v029-domain-service]: Dokploy v0.29.13 source, [`domain.ts` lines 17–72](https://github.com/Dokploy/dokploy/blob/v0.29.13/packages/server/src/services/domain.ts#L17-L72) and [`templates/index.ts` lines 33–50](https://github.com/Dokploy/dokploy/blob/v0.29.13/packages/server/src/templates/index.ts#L33-L50).
[^docker-interpolation]: Docker, [Compose variable interpolation](https://docs.docker.com/compose/how-tos/environment-variables/variable-interpolation/).
[^docker-compose-services]: Docker, [Compose services reference](https://docs.docker.com/reference/compose-file/services/).
[^docker-overlay]: Docker, [Overlay network driver](https://docs.docker.com/engine/network/drivers/overlay/) and [Swarm service networks](https://docs.docker.com/engine/swarm/networking/).
[^traefik-priority]: Traefik v3.6, [HTTP routing rules and priority](https://doc.traefik.io/traefik/v3.6/reference/routing-configuration/http/routing/rules-and-priority/).
[^traefik-docker-network]: Traefik v3.6, [Docker provider configuration](https://doc.traefik.io/traefik/v3.6/reference/install-configuration/providers/docker/).
