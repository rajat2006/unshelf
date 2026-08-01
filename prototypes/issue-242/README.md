# Prototype multi-service Dokploy development and preview routing

> PROTOTYPE ONLY — this branch is a disposable primary-source artifact for
> [Prototype multi-service Dokploy development and preview routing](https://github.com/rajat2006/unshelf/issues/242).
> Do not merge its workflow, Compose file, or temporary auth wiring into `dev`.

## Question

Can Dokploy v0.29.13 run one hosted-development Compose resource and one
same-repository preview as isolated `migrate -> api -> web` stacks while both
use generated HTTPS, same-origin `/api`, private GHCR images, Clerk Development
with exact-origin token checks, and the external non-production PostgreSQL
service?

## Local preflight

Run from the repository root:

```sh
pnpm prototype:dokploy-routing
```

This validates the parameterized Compose contract with inert placeholders. It
does not pull images, connect to a database, or contact Dokploy.

## Non-secret setup

Use only throwaway/non-production resources and values. Do not paste credentials
into this file, GitHub issues, commands, screenshots, or captured logs.

1. Add a repository Actions secret named `PROTOTYPE_CLERK_PUBLISHABLE_KEY`.
   Although publishable, keeping it in the temporary workflow prevents an
   accidental mismatch with the selected Clerk Development instance.
2. Push this branch. The prototype image workflow publishes the API and web
   images to private GHCR packages and reports their immutable digests.
3. Give Dokploy read-only GHCR credentials. Confirm a pull succeeds while an
   anonymous pull fails; never capture the credential itself.
4. On the VPS, create one attachable overlay network for non-production
   PostgreSQL. Attach only the existing non-production Dokploy PostgreSQL
   service. Do not publish port 5432.
5. Create two raw, isolated Dokploy Compose resources: `unshelf-prototype-dev`
   and `unshelf-prototype-pr`. Paste `compose.yml` from this exact branch into
   each. Use the same API/web digest pair initially.
6. Give each resource its own database/user on non-production PostgreSQL. This
   prototype uses separate logical databases so isolation can be observed; it
   must not use production data or credentials.
7. Generate one hostname per resource. Reuse that bare hostname for two native
   Domain rows: `api`, path `/api`, port 3001, no strip; and `web`, path `/`,
   port 80, no strip. Enable HTTPS and the installed certificate resolver.
8. Set `PUBLIC_ORIGIN` to the exact `https://<generated-host>` origin. Supply
   runtime Clerk Development keys, opaque `DATABASE_URL`, database-network
   name, and digest-qualified images through each resource environment.

## Acceptance record

Record pass/fail and redacted evidence in the table. Never record tokens,
cookies, credentials, connection strings, private host/IP details, or raw logs.

| Check | Expected |
| --- | --- |
| Generated HTTPS | A normal TLS client trusts both generated hosts; HTTP redirects to the same HTTPS host. |
| Same-origin split | `/` serves web and `/api/health` reports healthy database connectivity on both hosts. |
| Effective topology | Each resource has its own isolated ingress network; only API/migrate join the non-production DB overlay; Traefik selects `${APP_NAME}`. |
| Private pull | Dokploy pulls both digest-qualified images with read-only GHCR access; anonymous pull is denied. |
| Clerk sign-in | Google sign-in returns to the initiating generated host and the signed-in app can call a protected API route. |
| Session refresh | After token refresh and a hard reload, the session remains usable without a redirect loop. |
| Exact-origin positive | A token minted on each host succeeds against that same host. |
| Exact-origin negative | A token minted on preview receives 401 against development, and vice versa. |
| Changing preview | Redeploying new image digests keeps the preview hostname and session working while visibly changing the build. |
| Cookie/URL hygiene | Clerk cookies are Secure on HTTPS; callback/final URLs and browser history contain no lingering `__clerk_db_jwt` or session token. |
| Credential-leak check | Dokploy deploy output and bounded app/Traefik logs contain no bearer token, cookie, database URL, Clerk secret, or GHCR credential. |
| Environment isolation | A marker written in one prototype database is absent from the other; neither resource can reach production PostgreSQL. |

For token-origin controls, copy a short-lived token from the browser without
printing it, then use the stdin-only helper. The token does not appear in the
process argument list:

```sh
read -rs token
printf '%s' "$token" | node prototypes/issue-242/token-probe.mjs \
  https://TARGET-GENERATED-HOST/api/items
unset token
```

Run once against the token's own host (expect an authenticated response) and
once against the other host (expect 401). Do not save the terminal transcript.

## Capture and teardown

Capture only:

- the redacted effective Compose and service/domain/network facts;
- image repository names plus immutable digests;
- generated hostnames if they are safe to publish, otherwise stable aliases;
- the acceptance table with concise observations; and
- the exact create/update/deploy/delete sequence that worked.

Then delete both prototype Compose resources and logical databases, revoke the
temporary GHCR credential, remove the temporary repository secret, and verify
that both generated hosts stop routing. Do not delete or reconfigure the shared
non-production PostgreSQL service.
