# Deploy (Dokploy on a Hostinger VPS)

The stack and hosting decision is [ADR-0009](adr/0009-v1-stack-and-hosting.md):
a Hostinger VPS, deploys managed by **Dokploy**, each `apps/*` its own Docker
service behind Dokploy's **Traefik** proxy, with **Postgres** running as a
service on the same box.

This doc is the operator runbook. The repo ships the artifacts; standing up the
VPS and running the deploy needs VPS credentials and is a human step (this is why
issue #23 is `ready-for-human`).

## What the repo ships

| Artifact | Purpose |
| --- | --- |
| `apps/api/Dockerfile` | Builds the Express API image (multi-stage; `pnpm deploy` → prod-only tree). |
| `apps/web/Dockerfile` | Builds the SPA and serves it via Caddy. |
| `apps/web/Caddyfile` | Static serving + SPA history fallback (does **not** proxy `/api`). |
| `.dockerignore` | Keeps the (repo-root) build context small and reproducible. |
| `docker-compose.yml` | **The Dokploy production stack** — db + api + web with Traefik labels. |
| `docker-compose.local.yml` | Local end-to-end verification harness (throwaway Traefik, no VPS). |

Both images build from the **repo root** as context (they need the pnpm
workspace lockfile and `packages/shared`), so the compose services set
`context: .` with `dockerfile: apps/<app>/Dockerfile`.

## Routing model

One domain, path-based — the same shape as the dev Vite proxy, so the browser
always talks to a single origin:

- `PathPrefix(`/api`)` → **api** service (Traefik router priority 10)
- everything else → **web** service (priority 1; the SPA + its history fallback)

Caddy in the web image therefore never proxies `/api`; Traefik owns that split.

## Environment (set in Dokploy → the Compose service's Environment)

`docker-compose.yml` reads these and hardcodes no secrets:

| Var | Used by | Notes |
| --- | --- | --- |
| `DOMAIN` | Traefik router rules | e.g. `unshelf.example.com`. |
| `POSTGRES_PASSWORD` | db + api `DATABASE_URL` | Generate a strong value; Dokploy stores it. |
| `CLERK_SECRET_KEY` | api (runtime) | Server-side only. From the Clerk dashboard. |
| `CLERK_PUBLISHABLE_KEY` | api (runtime) | Browser-public key. |
| `VITE_CLERK_PUBLISHABLE_KEY` | web (**build arg**) | Same publishable key; Vite inlines it at build. |

The Clerk dashboard must be in the state `docs/clerk-setup.md` describes
(Google-only, invite-restricted) or the invite gate silently breaks.

## First deploy (operator steps)

1. **Provision** a Hostinger VPS (root Docker access) and install Dokploy per its
   docs. Dokploy creates the shared `dokploy-network` that `docker-compose.yml`
   attaches to as `external`.
2. **DNS**: point `DOMAIN` at the VPS IP (A record). Traefik will request a
   Let's Encrypt cert for it (`certresolver=letsencrypt`, the Dokploy default —
   adjust the label if your resolver is named differently).
3. **Create a Compose application** in Dokploy pointing at this repo, compose
   path `docker-compose.yml`.
4. **Set the environment** variables from the table above.
5. **Deploy.** Dokploy builds the three services and wires Traefik from the
   labels. Postgres data persists in the `unshelf-db` named volume.
6. **Verify end to end**:
   - `https://$DOMAIN/api/health` → `{"status":"ok","db":"up",...}`
   - `https://$DOMAIN/` → the SPA loads and Google sign-in works for an invited
     identity.

The API applies its schema on boot (`applySchema`, idempotent), so there is no
separate migration step for v1.

## Verifying locally without the VPS

`docker-compose.local.yml` builds the **same** production images behind a
throwaway Traefik on `:8080` (plain HTTP, no external network, no real secrets)
to prove containers + routing before trusting the VPS:

```sh
CLERK_SECRET_KEY=sk_test_... \
CLERK_PUBLISHABLE_KEY=pk_test_... \
VITE_CLERK_PUBLISHABLE_KEY=pk_test_... \
docker compose -f docker-compose.local.yml up --build
# → http://localhost:8080          (SPA)
# → http://localhost:8080/api/health (API through the same origin)
```

This is a verification harness, not a dev loop. **Everyday local development is
`pnpm dev`** (see the README) — Vite + `tsx watch` with hot reload; Docker gives
none of that inner-loop speed.

## Backups — a tracked, time-boxed risk

v1 ships **no scheduled Postgres backups** — a conscious, time-boxed risk with a
firm trigger to close it (stand up off-box backups before invite-only opens to
public self-serve). The decision and its rationale are
[ADR-0009 → "Data portability & backups"](adr/0009-v1-stack-and-hosting.md);
the fast-follow that closes it is
**[#40](https://github.com/rajat2006/unshelf/issues/40)**.
