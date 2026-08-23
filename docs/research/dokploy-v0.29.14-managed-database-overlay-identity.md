# Dokploy v0.29.14 managed-database overlay identity

Research date: 2026-08-23

## Question

In Dokploy v0.29.14, what network identity does a managed PostgreSQL
service use; can Dokploy's supported configuration or API attach it to an
operator-selected stable attachable overlay; what survives updates,
redeployments, and recreation; and what direct GitHub Actions Compose contract
can join it without runtime discovery or other hidden state?

## Evidence boundary: source tag versus installed image

The pinned `v0.29.14` source tag contains network-management schemas,
services, API routes, and UI components. That proves what commit
`75448f358e8dc8d15f88d6b0112b1e186ada668d` implements; it does **not** prove
that every published image tagged `v0.29.14` contains the same built UI and
routes.

Unshelf's redacted installed-version evidence records that the deployed
`dokploy/dokploy:v0.29.14` image has no `/dashboard/networks` page even though
the source tag contains one.[^local-installed-gate] No raw host or API response
is reproduced here. Therefore:

- do not plan around the Networks page on the installed image;
- gate the installed `network.create` and `postgres.update` API capabilities in
  non-production, recording only supported/unsupported and sanitized stable
  identifiers—not response bodies or credentials; and
- if those installed API routes support the pinned request schemas, prefer
  them so Dokploy persists and reapplies the network attachment. If they do
  not, the source-tag capability is not available to this installation.

The existing direct `docker network create` / `docker service update` fallback
is an operator workaround, not Dokploy-owned configuration. Dokploy can replace
that manual service-spec change on a later rebuild or deploy, so it is not the
stable answer this ticket is looking for.[^local-installed-gate][^dokploy-network-resolver]

Read-only live inspection on 2026-08-23 found the retained PostgreSQL 18 service
attached to exactly one network: `dokploy-network`. It is an attachable overlay,
but three Swarm services use it. That makes it Dokploy's shared platform network,
not the environment-specific private database overlay required by Unshelf's
accepted deployment boundary. Changing `DATABASE_NETWORK` to `dokploy-network`
would likely clear the immediate missing-network error, but it would make the
shared platform network part of the application contract.

## Verdict

Use one operator-owned, non-secret network name as the contract:
`unshelf-nonprod-db`.

If the installed API gate passes, create `unshelf-nonprod-db` through Dokploy
as an `overlay` network with `attachable: true`, then configure the managed
PostgreSQL Swarm service with an absolute `networkSwarm` list containing only
that target. This removes PostgreSQL from the shared `dokploy-network`. The
v0.29.14 source supports the network name, `overlay` driver, `attachable` flag,
and persisted PostgreSQL Swarm attachment in its checked-in API schemas and
source UI.[^dokploy-network-schema][^dokploy-network-create][^dokploy-network-ui][^dokploy-postgres-alias]
Docker permits standalone containers to join an attachable overlay, and
Compose can join an existing network by exact, unscoped name with
`external: true` plus `name:`.[^docker-overlay][^docker-compose-network]

Do **not** make any of these the consumer contract:

- a Docker network ID;
- Dokploy's internal `networkId`;
- a task/container name or IP address; or
- the shared `dokploy-network` platform network.

Continue using Dokploy's generated PostgreSQL `appName` as the host inside the
opaque `DATABASE_URL`. It is stable for the lifetime of the retained PostgreSQL
record, and replacing that stateful resource already requires deliberate
credential and connection reconfiguration. A second hostname alias adds no
useful guarantee to this cutover.

## What identity Dokploy actually creates

Dokploy's displayed **Internal Host** for managed PostgreSQL is the record's
`appName`, and its displayed internal URL uses that host on port 5432.[^dokploy-internal-host]
That value is not the caller's requested base name. At create time Dokploy
calls `buildAppName("postgres", input.appName)`: a supplied base is cleaned and
given a random six-character suffix; with no base, Dokploy generates a
`postgres-<verb>-<adjective>-<noun>-<six characters>` name.[^dokploy-create-postgres][^dokploy-app-name]

The same value is used as the Docker Swarm service `Name`. The managed service
is attached to resolved Swarm networks and, absent a custom endpoint setting,
uses `dnsrr` service discovery.[^dokploy-postgres-builder] Docker gives each
Swarm service an internal DNS entry, and in DNSRR mode a query for the service
name returns task addresses rather than a VIP.[^docker-swarm-dns] Therefore the
baseline identity visible to a client on a shared overlay is:

```text
host = <Dokploy appName>
port = 5432
```

It is the **service** name, not a current task/container name or address.

Dokploy's first-class network resolver keeps `dokploy-network` by default and
adds every selected, stored `networkId` whose referenced network has the
`overlay` driver. It emits Docker attachment targets by the rows' network
**names**.[^dokploy-network-resolver] The ordinary Networks UI exposes exactly
that path, filters the choices to overlays, and tells the operator to redeploy
after saving.[^dokploy-assign-networks]

## Supported stable overlay and optional alias

The pinned v0.29.14 source OpenAPI document exposes `POST /network.create` with
`name`, `driver: "overlay"`, and `attachable`; `POST /postgres.update` accepts
both `networkIds` and the advanced `networkSwarm` attachment objects, including
`Target` and `Aliases`.[^dokploy-openapi-network][^dokploy-openapi-postgres]
The service implementation passes the requested network name, driver, and
attachable flag to Docker.[^dokploy-network-create]

There are two supported attachment shapes:

1. **Simple attachment:** save the created network's Dokploy `networkId` in
   PostgreSQL's `networkIds`, redeploy, and use the generated `appName` as
   `PGHOST`.
2. **Absolute attachment, optionally with an alias:** save explicit
   `networkSwarm` attachments containing the operator-selected overlay target
   and alias, then redeploy. Docker's service network syntax supports aliases,
   and Dokploy's PostgreSQL-capable advanced database UI describes them as
   aliases for service discovery.[^docker-service-alias][^dokploy-postgres-alias]

The accepted dedicated-network configuration should be equivalent to this
placeholder-only API body:

```json
{
  "postgresId": "<managed-postgresql-id>",
  "networkSwarm": [
    {
      "Target": "unshelf-nonprod-db"
    }
  ]
}
```

Then redeploy the PostgreSQL service. `networkSwarm` is an **absolute list**:
when it is non-null, Dokploy returns it immediately and does not merge
`networkIds` or the default `dokploy-network` into it.[^dokploy-network-resolver]
Consequently, include every desired attachment explicitly. Omitting
`dokploy-network` is deliberate: PostgreSQL keeps its intentional published
TCP 5432 endpoint for local development, while hosted development and previews
reach it only through `unshelf-nonprod-db`. Do not configure both attachment
paths and assume they merge.

Aliases remain a supported future option. If one is ever added, it must be
environment-qualified because a shared alias makes service discovery
ambiguous. This effort does not add one.

## Identity lifecycle

These persistence claims apply when `networkSwarm` is saved in Dokploy through
the supported source-tag configuration. A manual `docker service update` is
not stored in the PostgreSQL row and remains subject to the installed-image
drift warning above.

### Normal update or redeploy

The generated `appName` remains unchanged. Dokploy persists it in a unique
column, deliberately strips `appName` from database updates, and builds the
service again from the stored record.[^dokploy-postgres-schema][^dokploy-update-postgres]
Although the generated OpenAPI schema currently lists `appName` as an optional
update field, the update service discards it; callers must not treat renaming
as supported behavior.[^dokploy-openapi-postgres][^dokploy-update-postgres]

On deploy, Dokploy inspects the service under that same name, updates it, and
increments `ForceUpdate`. Docker documents that a forced service update
recreates tasks; it does not rename the service.[^dokploy-postgres-builder][^docker-service-update]
The network target is rebuilt from the same stored configuration, so both the
generated `appName` and dedicated attachment survive. Task IDs, container
names, and addresses can change and must not be cached.

### Missing Docker service, but retained Dokploy record

If inspection fails, Dokploy creates a service again with `Name: appName` and
the same resolved network attachment list.[^dokploy-postgres-builder] Thus a
service-level remove/recreate that retains the Dokploy PostgreSQL row retains
both the generated hostname and the configured dedicated attachment.

Dokploy's database **Rebuild** operation is a destructive special case: it
removes the service, deletes its volume, and redeploys the same database row.
It therefore retains the network names while destroying database data; it is
not a routine way to refresh networking.[^dokploy-rebuild]

### Delete and recreate the Dokploy PostgreSQL resource

Deleting the resource removes the Swarm service and the PostgreSQL database
row.[^dokploy-delete-postgres] Creating another resource runs the random
`buildAppName` path again, so the new `appName` is different even if the same
base `appName` is supplied.[^dokploy-create-postgres][^dokploy-app-name]
The operator-selected overlay is independent and can remain, but the new
PostgreSQL record must be attached to it and the opaque `DATABASE_URL` must use
the new generated service name before consumers run.

### Recreate the overlay

Treat the network **name** as the contract, not either system's ID. Dokploy's
network recreate operation creates from the retained row and therefore uses
the retained name; if an operator instead removes the Dokploy network row and
creates a new one, the new Dokploy `networkId` must be reassigned to services
using the simple `networkIds` path.[^dokploy-network-recreate] Compose using
`external: true` and the same exact name can join again once that network
exists, regardless of a changed Docker network ID.[^docker-compose-network]

## Direct GitHub Actions Compose contract

The Actions runner does **not** run this Compose project or join the overlay.
Unshelf's hosted workflow checks out the trusted control plane on
`ubuntu-24.04`, passes a Dokploy Compose identifier, API credential, and
trusted Compose environment, and invokes the deployment-control-plane
reconciler.[^local-development-workflow] The adapter submits the repository's
Compose text to Dokploy as `sourceType: "raw"` and then calls Dokploy's Compose
deploy operation.[^local-deployment-adapter] Dokploy runs Compose on the VPS,
where its containers can join the existing overlay. No self-hosted runner or
host Docker socket is part of this contract.

The repository already has the correct raw Compose network boundary:

```yaml
services:
  migrate:
    environment:
      DATABASE_URL: ${DATABASE_URL:?DATABASE_URL is required}
    networks: [database]

  api:
    environment:
      DATABASE_URL: ${DATABASE_URL:?DATABASE_URL is required}
    networks: [database]

networks:
  database:
    name: ${DATABASE_NETWORK:?DATABASE_NETWORK is required}
    external: true
```

`migrate` and `api` join the exact external database network; `web` does not.
The actual contract is versioned in `docker-compose.yml`.[^local-compose]
Compose's `name` is used as-is rather than prefixed with the Compose project;
`external: true` says Compose does not own or create the network and causes an
error when it is absent. The `${VAR:?message}` form fails interpolation if an
explicit value is missing.[^docker-compose-network][^docker-interpolation]

Bind the topology without runtime discovery:

| Value | Required contract |
| --- | --- |
| `DATABASE_NETWORK` | Exact operator-owned name `unshelf-nonprod-db`. |
| PostgreSQL host inside `DATABASE_URL` | Existing generated `appName` of the retained PostgreSQL record. |
| `DATABASE_URL` | Opaque GitHub Environment secret; never assemble or print it in Compose or automation. |

The trusted development and preview workflows should bind the non-secret
`DATABASE_NETWORK=unshelf-nonprod-db` literal directly when constructing the
complete Compose environment. Do not hide it in the aggregate environment
secret or duplicate it in GitHub Environment variables. The fixed topology is
reviewable repository policy; renaming it requires an intentional code and
infrastructure cutover. The current workflow sends its runtime environment as
`DOKPLOY_DEVELOPMENT_COMPOSE_ENV`, while the adapter appends approved
workflow-bound values.[^local-development-workflow][^local-deployment-environment]
The replacement direct workflows should additionally override the network name
with the trusted literal while keeping `DATABASE_URL` opaque.

GitHub defines variables for reusable non-sensitive configuration and warns
that their values are unmasked; sensitive values belong in secrets.[^github-variables][^github-secrets]
Environment variables and secrets are available only to jobs that reference
that GitHub Environment.[^github-environments] Never print the trusted Compose
environment, connection URL, API credential, Docker inspection output, or raw
Dokploy response.

This contract eliminates runtime network discovery, `docker inspect`, label
queries, and container-name parsing. The generated PostgreSQL service name
remains secret runtime configuration rather than network identity.
`attachable: true` remains necessary because Dokploy's
raw Compose deployment creates standalone Compose containers on a
Swarm-participating Docker host and joins them to the pre-existing overlay.[^docker-overlay]

## Decision-ready answer

The Dokploy v0.29.14 source can support a direct, dedicated non-production
database path without runtime discovery if the installed API gate confirms the
pinned routes and schemas:

1. create one explicitly named attachable overlay;
2. persist an absolute PostgreSQL attachment containing only that overlay,
   removing the shared `dokploy-network` attachment;
3. preserve the intentional published TCP 5432 endpoint for local development;
4. use the retained PostgreSQL record's generated service name inside the
   opaque `DATABASE_URL`, with no additional alias;
5. bind `DATABASE_NETWORK=unshelf-nonprod-db` visibly in both trusted workflows;
6. keep credentials in GitHub Environment secrets; and
7. have Dokploy deploy the raw Compose contract on the VPS, where `migrate` and
   `api` join the exact external network.

The overlay name is the durable network contract. Dokploy's `appName` is a
generated, persisted database-service identity that survives normal redeploy
and service recreation but changes when the Dokploy PostgreSQL resource itself
is deleted and recreated. If the installed API cannot persist and reapply the
accepted attachment, verification must stop rather than fall back to a manual
Docker mutation.

## Sources

The Dokploy findings are pinned to tag `v0.29.14`, commit
`75448f358e8dc8d15f88d6b0112b1e186ada668d`.[^dokploy-tag]

[^dokploy-tag]: Dokploy, [`v0.29.14` source tree](https://github.com/Dokploy/dokploy/tree/75448f358e8dc8d15f88d6b0112b1e186ada668d).
[^dokploy-internal-host]: Dokploy v0.29.14, [`show-internal-postgres-credentials.tsx`](https://github.com/Dokploy/dokploy/blob/75448f358e8dc8d15f88d6b0112b1e186ada668d/apps/dokploy/components/dashboard/postgres/general/show-internal-postgres-credentials.tsx#L53-L68).
[^dokploy-app-name]: Dokploy v0.29.14, [`db/schema/utils.ts`](https://github.com/Dokploy/dokploy/blob/75448f358e8dc8d15f88d6b0112b1e186ada668d/packages/server/src/db/schema/utils.ts#L57-L78).
[^dokploy-create-postgres]: Dokploy v0.29.14, [`services/postgres.ts`](https://github.com/Dokploy/dokploy/blob/75448f358e8dc8d15f88d6b0112b1e186ada668d/packages/server/src/services/postgres.ts#L33-L65).
[^dokploy-postgres-schema]: Dokploy v0.29.14, [`db/schema/postgres.ts`](https://github.com/Dokploy/dokploy/blob/75448f358e8dc8d15f88d6b0112b1e186ada668d/packages/server/src/db/schema/postgres.ts#L47-L100).
[^dokploy-update-postgres]: Dokploy v0.29.14, [`services/postgres.ts` update path](https://github.com/Dokploy/dokploy/blob/75448f358e8dc8d15f88d6b0112b1e186ada668d/packages/server/src/services/postgres.ts#L119-L133).
[^dokploy-postgres-builder]: Dokploy v0.29.14, [`utils/databases/postgres.ts`](https://github.com/Dokploy/dokploy/blob/75448f358e8dc8d15f88d6b0112b1e186ada668d/packages/server/src/utils/databases/postgres.ts#L18-L134).
[^dokploy-network-schema]: Dokploy v0.29.14, [`db/schema/network.ts`](https://github.com/Dokploy/dokploy/blob/75448f358e8dc8d15f88d6b0112b1e186ada668d/packages/server/src/db/schema/network.ts#L16-L45) and [its create schema](https://github.com/Dokploy/dokploy/blob/75448f358e8dc8d15f88d6b0112b1e186ada668d/packages/server/src/db/schema/network.ts#L58-L127).
[^dokploy-network-create]: Dokploy v0.29.14, [`services/network.ts` creation path](https://github.com/Dokploy/dokploy/blob/75448f358e8dc8d15f88d6b0112b1e186ada668d/packages/server/src/services/network.ts#L204-L283).
[^dokploy-network-resolver]: Dokploy v0.29.14, [`services/network.ts` service-network resolver](https://github.com/Dokploy/dokploy/blob/75448f358e8dc8d15f88d6b0112b1e186ada668d/packages/server/src/services/network.ts#L291-L316).
[^dokploy-network-recreate]: Dokploy v0.29.14, [`services/network.ts` recreate path](https://github.com/Dokploy/dokploy/blob/75448f358e8dc8d15f88d6b0112b1e186ada668d/packages/server/src/services/network.ts#L241-L289) and [`network` router](https://github.com/Dokploy/dokploy/blob/75448f358e8dc8d15f88d6b0112b1e186ada668d/apps/dokploy/server/api/routers/network.ts#L112-L145).
[^dokploy-network-ui]: Dokploy v0.29.14, [`handle-network.tsx`](https://github.com/Dokploy/dokploy/blob/75448f358e8dc8d15f88d6b0112b1e186ada668d/apps/dokploy/components/dashboard/networks/handle-network.tsx#L39-L123) and [network-create submission](https://github.com/Dokploy/dokploy/blob/75448f358e8dc8d15f88d6b0112b1e186ada668d/apps/dokploy/components/dashboard/networks/handle-network.tsx#L125-L175).
[^dokploy-assign-networks]: Dokploy v0.29.14, [`assign-networks.tsx`](https://github.com/Dokploy/dokploy/blob/75448f358e8dc8d15f88d6b0112b1e186ada668d/apps/dokploy/components/dashboard/networks/assign-networks.tsx#L46-L119).
[^dokploy-postgres-alias]: Dokploy v0.29.14, PostgreSQL stores `networkSwarm`, validates `Target`/`Aliases`, and includes that field in its update schema in [`db/schema/postgres.ts`](https://github.com/Dokploy/dokploy/blob/75448f358e8dc8d15f88d6b0112b1e186ada668d/packages/server/src/db/schema/postgres.ts#L74-L100), [the shared network schema](https://github.com/Dokploy/dokploy/blob/75448f358e8dc8d15f88d6b0112b1e186ada668d/packages/server/src/db/schema/shared.ts#L175-L183), and [the PostgreSQL create-schema fields](https://github.com/Dokploy/dokploy/blob/75448f358e8dc8d15f88d6b0112b1e186ada668d/packages/server/src/db/schema/postgres.ts#L143-L155). [`apiUpdatePostgres` derives from the whole create schema](https://github.com/Dokploy/dokploy/blob/75448f358e8dc8d15f88d6b0112b1e186ada668d/packages/server/src/db/schema/postgres.ts#L208-L214). The database Advanced page includes Cluster Settings for PostgreSQL in [`show-database-advanced-settings.tsx`](https://github.com/Dokploy/dokploy/blob/75448f358e8dc8d15f88d6b0112b1e186ada668d/apps/dokploy/components/dashboard/shared/show-database-advanced-settings.tsx#L13-L27); Cluster Settings passes its PostgreSQL type into Swarm Settings in [`show-cluster-settings.tsx`](https://github.com/Dokploy/dokploy/blob/75448f358e8dc8d15f88d6b0112b1e186ada668d/apps/dokploy/components/dashboard/application/advanced/cluster/show-cluster-settings.tsx#L38-L79); and the network form routes PostgreSQL through `api.postgres.update`, serializing `Target` and `Aliases`, in [`network-form.tsx`](https://github.com/Dokploy/dokploy/blob/75448f358e8dc8d15f88d6b0112b1e186ada668d/apps/dokploy/components/dashboard/application/advanced/cluster/swarm-forms/network-form.tsx#L36-L79) and [its submit/form fields](https://github.com/Dokploy/dokploy/blob/75448f358e8dc8d15f88d6b0112b1e186ada668d/apps/dokploy/components/dashboard/application/advanced/cluster/swarm-forms/network-form.tsx#L109-L201).
[^dokploy-openapi-network]: Dokploy v0.29.14, [`openapi.json` network-create operation](https://github.com/Dokploy/dokploy/blob/75448f358e8dc8d15f88d6b0112b1e186ada668d/openapi.json#L7125-L7220).
[^dokploy-openapi-postgres]: Dokploy v0.29.14, [`openapi.json` PostgreSQL update operation](https://github.com/Dokploy/dokploy/blob/75448f358e8dc8d15f88d6b0112b1e186ada668d/openapi.json#L33285-L33317), [advanced network attachments](https://github.com/Dokploy/dokploy/blob/75448f358e8dc8d15f88d6b0112b1e186ada668d/openapi.json#L33732-L33772), and [`networkIds`](https://github.com/Dokploy/dokploy/blob/75448f358e8dc8d15f88d6b0112b1e186ada668d/openapi.json#L33876-L33905).
[^dokploy-rebuild]: Dokploy v0.29.14, [`utils/databases/rebuild.ts`](https://github.com/Dokploy/dokploy/blob/75448f358e8dc8d15f88d6b0112b1e186ada668d/packages/server/src/utils/databases/rebuild.ts#L29-L65).
[^dokploy-delete-postgres]: Dokploy v0.29.14, [`postgres` router delete path](https://github.com/Dokploy/dokploy/blob/75448f358e8dc8d15f88d6b0112b1e186ada668d/apps/dokploy/server/api/routers/postgres.ts#L301-L337).
[^docker-overlay]: Docker, [Overlay network driver: create an attachable overlay](https://docs.docker.com/engine/network/drivers/overlay/#create-an-overlay-network) and [attach a standalone container](https://docs.docker.com/engine/network/drivers/overlay/#attach-a-container-to-an-overlay-network).
[^docker-compose-network]: Docker Compose, [network `external`](https://docs.docker.com/reference/compose-file/networks/#external) and [`name`](https://docs.docker.com/reference/compose-file/networks/#name).
[^docker-swarm-dns]: Docker, [Swarm service discovery](https://docs.docker.com/engine/swarm/networking/#configure-service-discovery) and [Swarm internal DNS](https://docs.docker.com/engine/swarm/key-concepts/#load-balancing).
[^docker-service-alias]: Docker, [`docker service create --network`](https://docs.docker.com/reference/cli/docker/service/create/#network) and [`docker service update --network-add`](https://docs.docker.com/reference/cli/docker/service/update/#network-add).
[^docker-service-update]: Docker, [`docker service update`](https://docs.docker.com/reference/cli/docker/service/update/#description).
[^docker-interpolation]: Docker Compose, [required-value interpolation](https://docs.docker.com/reference/compose-file/interpolation/).
[^github-variables]: GitHub, [Variables](https://docs.github.com/en/actions/concepts/workflows-and-actions/variables).
[^github-secrets]: GitHub, [Using secrets in GitHub Actions](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets).
[^github-environments]: GitHub, [Deployments and environments](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments).
[^local-installed-gate]: Unshelf source, [`docs/deploy.md`](../deploy.md#non-production-foundation), especially the redacted v0.29.14 installed-image note and manual-network drift warning.
[^local-compose]: Unshelf source, [`docker-compose.yml`](../../docker-compose.yml).
[^local-development-workflow]: Unshelf source, [`.github/workflows/deploy-development.yml`](../../.github/workflows/deploy-development.yml).
[^local-deployment-adapter]: Unshelf source, [`packages/deployment-control-plane/src/deployment-adapters.ts`](../../packages/deployment-control-plane/src/deployment-adapters.ts), `convergeCompose` and `startDeployment`.
[^local-deployment-environment]: Unshelf source, [`packages/deployment-control-plane/src/deployment-adapters.ts`](../../packages/deployment-control-plane/src/deployment-adapters.ts), `deploymentEnvironment`.
