# Dokploy supported network-management path for issue 540

## Scope

This memo records the primary-source and sanitized live-instance evidence for
the decision in **Choose the supported network-management path for the
installed Dokploy image**. The selected path appears after the findings.

## Findings

### The v0.29.14 source tag exposes the routes, but v0.30.0 is the official feature boundary

Dokploy's immutable `v0.29.14` tag resolves to commit `75448f358e8dc8d15f88d6b0112b1e186ada668d`. At that commit:

- `networkRouter` defines authenticated `all` and `create` procedures; `create` delegates to Dokploy's network service and records an audit event ([tagged router](https://github.com/Dokploy/dokploy/blob/75448f358e8dc8d15f88d6b0112b1e186ada668d/apps/dokploy/server/api/routers/network.ts#L23-L65)).
- The root router mounts that router as `network`, yielding the procedure names `network.all` and `network.create` ([tagged root router](https://github.com/Dokploy/dokploy/blob/75448f358e8dc8d15f88d6b0112b1e186ada668d/apps/dokploy/server/api/root.ts#L24-L65)).
- The committed OpenAPI document contains authenticated `GET /network.all` and `POST /network.create`; with Dokploy's documented `/api` base URL, those are `GET /api/network.all` and `POST /api/network.create` ([`network.all` specification](https://github.com/Dokploy/dokploy/blob/75448f358e8dc8d15f88d6b0112b1e186ada668d/openapi.json#L6951-L7035), [`network.create` specification](https://github.com/Dokploy/dokploy/blob/75448f358e8dc8d15f88d6b0112b1e186ada668d/openapi.json#L7125-L7279), [API authentication and base URL](https://docs.dokploy.com/docs/api)).
- The self-hosted dashboard route renders the Networks screen, prefetches `network.all`, and its creation dialog invokes `network.create` ([dashboard page](https://github.com/Dokploy/dokploy/blob/75448f358e8dc8d15f88d6b0112b1e186ada668d/apps/dokploy/pages/dashboard/networks.tsx#L7-L17), [creation form](https://github.com/Dokploy/dokploy/blob/75448f358e8dc8d15f88d6b0112b1e186ada668d/apps/dokploy/components/dashboard/networks/handle-network.tsx#L125-L175)).
- The server implementation inserts an organization-owned network row and then calls Docker to create a bridge or overlay network on the local or selected remote server, including attachable, IP-family, MTU, and IPAM options ([tagged network service](https://github.com/Dokploy/dokploy/blob/75448f358e8dc8d15f88d6b0112b1e186ada668d/packages/server/src/services/network.ts#L204-L283)).

That source evidence conflicts with Dokploy's release contract. The official v0.29.14 release says it is a patch release with "bug fixes only — no new features," while the official v0.30.0 release explicitly introduces **Network Management**: a full UI for creating, inspecting, and deleting bridge or overlay networks and per-service attachment controls ([v0.29.14 release](https://github.com/Dokploy/dokploy/releases/tag/v0.29.14), [v0.30.0 release](https://github.com/Dokploy/dokploy/releases/tag/v0.30.0)). Therefore:

- The v0.29.14 **tagged repository** contains the routes and UI.
- v0.29.14 was not the release in which Dokploy officially promised the feature; v0.30.0 was.
- An installed image reporting v0.29.14 but returning procedure-not-found for both routes is not disproved by the tagged tree alone. The displayed version is insufficient provenance for the running container contents.

For a supported-version choice, the release notes provide stronger evidence than the accidental or backport-related contents of the v0.29.14 tag. As of this research, GitHub marks v0.30.2 as the latest stable release ([v0.30.2 release](https://github.com/Dokploy/dokploy/releases/tag/v0.30.2)).

### The published v0.30.2 image contains the compiled network feature

The v0.30.2 release evidence was checked against the actual Docker Hub image,
not inferred from the source tag. On 2026-08-23 the official
`dokploy/dokploy:v0.30.2` OCI index resolved to immutable digest
`sha256:98d9471d6152b3fdb2ecd1124b180ec0cb525586ed4186580069fdd3e8f9f482`.
Its Linux/amd64 manifest resolved to
`sha256:a478d8d29b94820f75d9c5ddc2a2b21ead7810e81cd8f7c38b38b048429ebc0c`.
These values came directly from Docker Hub's registry manifest for the
[official image repository](https://hub.docker.com/r/dokploy/dokploy/tags).

The compiled Next.js layer was downloaded by its manifest-pinned blob digest,
`sha256:680d2fcaedbde99d8e163fa2519df1df3bc2e39c9db134a8e112e977dda55d78`,
and its checksum matched the manifest. Inspection of those published bytes
established all of the following:

- the Docker dashboard's compiled browser and server bundles invoke both
  `network.all` and `network.create`;
- the compiled server router contains authenticated `all` and `create`
  procedures, with `create` calling the network-creation service and recording
  a network audit event;
- both the compiled tRPC endpoint and the compiled OpenAPI endpoint include
  that server-router chunk in their traced runtime dependencies; and
- the image contains the unified Docker dashboard route where v0.30 exposes
  network management.

This is the evidence that was missing for v0.29.14: the exact published v0.30.2
container bytes, rather than only a repository tag, contain the required
server procedures and their UI consumer. It does not eliminate the need to
verify the digest and execute a read-only call against the running task after
the upgrade; those checks prove that the host actually started these bytes.

### Post-upgrade installed capability evidence

Sanitized read-only verification on 2026-08-23 established that the upgraded
self-hosted dashboard reports v0.30.2 and serves build and Docker-dashboard
assets byte-for-byte identical to the immutable published image described
above. Both unauthenticated OpenAPI and tRPC requests recognized `network.all`
and stopped at authentication instead of route lookup. In the authenticated
administrator session:

- **Docker → Networks** is present and opens successfully;
- `network.all` returned HTTP 200 and an empty managed-network list;
- **Add network** opens a creation form without changing state;
- the Driver selector contains `bridge` and `overlay`; and
- the form exposes an **Attachable** switch whose description limits it to
  overlay networks.

The dialog was cancelled. No network was created or synchronized, no database
or Compose resource was changed, and no credential, raw response, environment
dump, or terminal transcript was recorded. Together with the exact-image audit,
this closes the v0.29.14 source-versus-runtime uncertainty: the installed
v0.30.2 build exposes the required Dokploy-owned overlay-creation surface.

### There is one general managed-network implementation, exposed through three surfaces

In the tagged source, the dashboard, session-authenticated tRPC transport, and API-key/OpenAPI transport all converge on the same `networkRouter`; they are not independent fallbacks ([tRPC handler](https://github.com/Dokploy/dokploy/blob/75448f358e8dc8d15f88d6b0112b1e186ada668d/apps/dokploy/pages/api/trpc/%5Btrpc%5D.ts#L1-L8), [OpenAPI handler](https://github.com/Dokploy/dokploy/blob/75448f358e8dc8d15f88d6b0112b1e186ada668d/apps/dokploy/pages/api/%5B...trpc%5D.ts#L1-L27)). If `network.all` and `network.create` are absent from the installed router, switching among these transports cannot recover the missing server capability.

The same-version official CLI and MCP repositories contain no `network.create` command/tool in their v0.29.14 OpenAPI snapshots, so no separate generic Dokploy CLI/MCP creation path was found ([CLI snapshot](https://github.com/Dokploy/cli/blob/1393711f0117534492f9b1c2f5ec71c7d990a76d/openapi.json), [MCP snapshot](https://github.com/Dokploy/mcp/blob/3357d66c5536ed7e631a329a0a2a834991662a65/openapi.json)). `network.import` only records an already-existing Docker network, and `network.recreate` requires an existing Dokploy network row; neither creates a fresh managed network from nothing ([tagged router](https://github.com/Dokploy/dokploy/blob/75448f358e8dc8d15f88d6b0112b1e186ada668d/apps/dokploy/server/api/routers/network.ts#L66-L150)).

Two special-purpose Dokploy-owned creation paths also exist, but neither is equivalent to arbitrary managed-network creation:

- The official installer creates the shared `dokploy-network`, which is Dokploy and Traefik infrastructure rather than a workload-specific overlay ([manual installation](https://docs.dokploy.com/docs/core/manual-installation)).
- Compose **Isolated Deployment** creates an app-name network during deployment, attaches every Compose service, and connects Traefik. The v0.29.14 tagged builder performs that creation as part of the Compose deployment command ([tagged builder](https://github.com/Dokploy/dokploy/blob/75448f358e8dc8d15f88d6b0112b1e186ada668d/packages/server/src/utils/builders/compose.ts#L48-L64), [official behavior documentation](https://docs.dokploy.com/docs/core/docker-compose/utilities)). This is lifecycle-coupled to deploying the Compose application; it is not a general API for creating a named overlay before either retained service is changed. v0.30.0 also deprecates this mechanism in favor of declarative per-service network attachment ([v0.30.0 release](https://github.com/Dokploy/dokploy/releases/tag/v0.30.0)).

## Official update path and a no-mutation evidence boundary

Dokploy documents the supported self-hosted update command as:

```sh
curl -sSL https://dokploy.com/install.sh | sh -s update
```

For an exact version, Dokploy says to use that release's own `install.sh` asset with `sh -s update`; it warns that the main installer always targets the latest release and may not match an older version's setup ([installation and update documentation](https://docs.dokploy.com/docs/core/installation#updating-dokploy)). The v0.30.2 asset defaults to `dokploy/dokploy:v0.30.2`, pulls that image, and updates the existing `dokploy` Swarm service. The ordinary installation branch is not a documented in-place repair substitute: it performs installation setup and can reinitialize Swarm, so `update` is the relevant supported mechanism for an existing instance ([versioned v0.30.2 installer asset](https://github.com/Dokploy/dokploy/releases/download/v0.30.2/install.sh), [manual-installation warning for an existing Swarm](https://docs.dokploy.com/docs/core/manual-installation#existing-docker-swarm)).

GitHub's v0.30.2 release API publishes SHA-256
`45a137a8f180e81bce7761771022829dd6ac713c76c5bc57ea30ecdbb05ce8a3`
for that `install.sh` asset. A fresh download matched it. Inspection of the
verified script confirmed that its default version is `v0.30.2` and that its
update branch pulls `dokploy/dokploy:v0.30.2` before updating the existing
`dokploy` service ([v0.30.2 release metadata](https://api.github.com/repos/Dokploy/dokploy/releases/tags/v0.30.2)).

The following is a conservative evidence gate inferred from those official mechanisms and the observed source/runtime mismatch. It should be satisfied before changing the retained PostgreSQL record or disposable Compose fixture:

1. **Release identity:** select a stable release whose notes explicitly promise network management (v0.30.0 or later), and obtain its version-specific installer from that GitHub release rather than an unpinned moving script.
2. **Installer provenance:** record the release asset URL and verify the downloaded asset against the SHA-256 digest published by GitHub's release API before running it ([v0.30.2 release metadata](https://api.github.com/repos/Dokploy/dokploy/releases/tags/v0.30.2)).
3. **Running-image provenance:** after the update, verify that the `dokploy` service specification and its running task resolve to the expected official `dokploy/dokploy` image digest. For Linux/amd64 v0.30.2, the expected manifest digest observed above is `sha256:a478d8d29b94820f75d9c5ddc2a2b21ead7810e81cd8f7c38b38b048429ebc0c`; resolve the correct platform digest again at upgrade time rather than trusting a UI version string or mutable tag.
4. **Read-only live capability:** verify that the running build's own Swagger/OpenAPI surface contains both `GET /api/network.all` and `POST /api/network.create`, that an authenticated `network.all` call succeeds, and that the self-hosted Networks UI is present. Do not probe capability by issuing a create mutation.
5. **Managed-network precondition:** create and inspect the new overlay through the verified Dokploy surface before changing either workload. Confirm both the Dokploy row and Docker overlay exist with the intended name/driver/options.
6. **Preservation boundary:** immediately before any service update, re-read and compare the retained PostgreSQL identity, data-volume attachment, generated service identity, credentials references, and intentional TCP 5432 publication. Only the network field should be in the authorized change set; re-verify the same invariants after deployment.

Re-pulling or reinstalling v0.29.14 could only be treated as a repair experiment if its exact image digest were established and the live capability checks then passed. The source tag by itself is not sufficient evidence, and the v0.29.14 release did not promise network management.

## Tradeoffs to carry into the decision

| Path | Supported facts | Main tradeoff |
| --- | --- | --- |
| Use existing `dokploy-network` | Created and owned by Dokploy's official installation; avoids a control-plane update and a new-network mutation. | It is shared infrastructure for Dokploy, Traefik, and workloads, so it does not provide a dedicated workload boundary. It broadens network-level reachability and revises the dedicated-overlay ownership contract. |
| Use Compose Isolated Deployment | Dokploy creates and attaches an app-name network as part of Compose deployment. | It couples network creation to changing/deploying the fixture, is not a general pre-created-network surface, and v0.30.0 deprecates it in favor of per-service attachments. |
| Update to v0.30.2 (or a later stable release) | v0.30.0 explicitly introduces managed network creation and per-service attachment; v0.30.2 is the current stable release observed during this research. | Preserves the possibility of a Dokploy-owned dedicated overlay, but introduces control-plane upgrade risk and v0.30 behavior changes, including default shared-network attachment, detachable per-service networks, and deprecation of Isolated Deployment. It requires the provenance/capability gate above. |
| Repair/re-pull v0.29.14 | The tagged tree contains the implementation and the versioned release asset targets `dokploy/dokploy:v0.29.14`. | The official v0.29.14 release says no new features and the installed runtime lacks the routes. Without digest-level provenance and successful live checks, repeating the same version does not establish supported capability. |

## Selected path and reverification boundary

The accepted path is the exact installed Dokploy v0.30.2 baseline verified
above. It retains the previously chosen Dokploy-owned, attachable overlay
`unshelf-nonprod-db`; it does not accept the shared installer-owned
`dokploy-network`, Compose's deprecated isolated-deployment lifecycle, or a
manual Docker fallback as the workload boundary.

The completed capability evidence is deliberately narrower than an execution
acceptance test: the official release promises network management, the exact
published image contains the compiled server and UI feature, the running build
serves matching assets, an authenticated `network.all` call succeeds, and the
installed **Docker → Networks → Add network** form exposes both `overlay` and
`Attachable`. The read-only check created nothing.

The next execution must begin at the control-plane boundary rather than resume
after the v0.29.14 failure. It must first create `unshelf-nonprod-db` through
Dokploy and verify both the Dokploy record and Docker overlay. Before changing
the retained PostgreSQL service it must re-read its identity, data-volume
attachment, credential references, generated service identity, and intentional
TCP 5432 publication; only its absolute `networkSwarm` list is authorized to
change. After redeployment it must verify those invariants, the sole network
attachment, and authenticated/invalid-authentication behavior. Only then may a
disposable application fixture use the overlay.

Finally, all eleven installed-version compatibility gates must be rerun from
the beginning on v0.30.2. The prior partial run is stale because v0.30 changes
default and per-service network behavior and deprecates Isolated Deployment.
The execution must stop at the first unsupported field or invariant failure,
without adapting the fixture or applying a manual Docker mutation.
