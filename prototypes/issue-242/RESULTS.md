# Dokploy routing prototype results

Issue: [Prototype multi-service Dokploy development and preview routing](https://github.com/rajat2006/unshelf/issues/242)

Run on 2026-08-01 against the non-production Dokploy development environment.
All runtime resources described below were removed after the test.

## Result

The proposed topology works on the current Dokploy host:

- two independent raw Compose resources were deployed from the same repository
  commit;
- each resource used a Dokploy-generated `sslip.io` hostname with a valid
  Let's Encrypt certificate;
- Traefik routed `/api/*` to the API service and `/` to the web service on the
  same browser origin;
- HTTP redirected to HTTPS with `301` for both hosts;
- the web root and database-backed `/api/health` returned `200` for both hosts;
- unauthenticated `/api/me` returned `401` for both hosts;
- the human successfully signed in through Clerk on the deployed application;
- Dokploy pulled private API and web images from GHCR using read-only package
  credentials and immutable image digests;
- the two stacks used separate logical databases on an external, non-public
  PostgreSQL overlay network.

The deployed image pair was:

- API: `ghcr.io/rajat2006/unshelf-api@sha256:6b7ddf096779d2a5f033afe7730b299d2f84d2de499a4f88c33fee4b8c121b20`
- Web: `ghcr.io/rajat2006/unshelf-web@sha256:e9311b9a1dc98de728df036229abe2b7c21f53b79b3fdfa96002471723c418de`

The effective Compose contract and repeatable procedure are captured in
[README.md](README.md) and [compose.yml](compose.yml).

## Conclusions

1. Dokploy-generated HTTPS hosts are viable for non-production Unshelf
   deployments; a custom preview domain is not required.
2. One isolated Compose resource per environment or preview can implement the
   same-origin web/API contract without publishing application ports directly.
3. Private GHCR delivery works when Dokploy holds a read-only `read:packages`
   credential, while deployments remain reproducible by pinning digests.
4. An external Dokploy-managed PostgreSQL service can be shared at the network
   layer while logical databases keep development and schema-preview data
   isolated.
5. `PUBLIC_ORIGIN` must be set to each resource's exact generated HTTPS origin;
   the prototype confirmed successful Clerk sign-in and unauthenticated
   rejection under that configuration.

The human concluded that the working login and routing behavior supplied enough
evidence and requested teardown. Consequently, cross-origin token misuse,
session refresh, changing-preview redeployment, and detailed browser cookie/URL
inspection were not exercised in this run; no positive conclusion is claimed
for those checks beyond the earlier Clerk research ticket.

## Teardown

After the human confirmed the result:

- both Compose resources, generated routes, and temporary volumes were deleted;
- both prototype logical databases were dropped;
- the existing `DB-dev` service was restored to its original stopped state with
  no custom network;
- the temporary overlay network was removed;
- the temporary Dokploy GHCR registry entry and Dokploy API key were removed;
- the temporary GitHub Actions Clerk secret was removed;
- all GHCR image versions tagged for issue 242 were deleted using a one-time,
  repository-scoped Actions cleanup job; and
- local Dokploy, GHCR, and SSH credential material was deleted.
