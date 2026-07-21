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

Both images build from the **repo root** as context (they need the pnpm
workspace lockfile and `packages/shared`), so the compose services set
`context: .` with `dockerfile: apps/<app>/Dockerfile`.

## Routing model

One domain, path-based — the same shape as the dev Vite proxy, so the browser
always talks to a single origin:

- `PathPrefix(`/api`)` → **api** service (rule `Host && PathPrefix(`/api`)`)
- everything else → **web** service (rule `Host && !PathPrefix(`/api`)`; the SPA + its history fallback)

The two router rules are **mutually exclusive** — the web router explicitly
excludes `/api` — so the split is stated in the rules themselves rather than
resolved by Traefik priority. No `priority` labels are needed.

```
              Internet
                 │ HTTPS
                 ▼
     ┌───────────────────────┐
     │   Traefik (Dokploy)   │  TLS terminates + path split here
     └─────┬───────────┬─────┘
   /api    │           │  everything else
           ▼           ▼
   ┌────────────┐  ┌────────────┐
   │ api :3001  │  │ web :80    │  Caddy: static files only
   │ Express    │  │ Caddy      │
   └─────┬──────┘  └────────────┘
         │ internal network (private)
         ▼
   ┌────────────┐
   │ db  (PG)   │
   └────────────┘

  dokploy-network (shared): api ✅  web ✅  db ❌
  internal        (private): api ✅  web ❌  db ✅
```

**Traefik owns the split, not Caddy.** Caddy in the web image only serves the
SPA's static files and its history fallback; it never proxies `/api`. Why the
split lives at the platform's Traefik (and not inside Caddy, with the api sealed
behind it) — platform-native routing, independently-routable services, and free
horizontal scaling — is [ADR-0011](adr/0011-traefik-owns-routing-caddy-serves-static.md).

## Environment (set in Dokploy → the Compose service's Environment)

`docker-compose.yml` reads these and hardcodes no secrets:

| Var | Used by | Notes |
| --- | --- | --- |
| `DOMAIN` | Traefik router rules | e.g. `unshelf.example.com`. |
| `POSTGRES_PASSWORD` | db + api `DATABASE_URL` | Generate a strong value; Dokploy stores it. |
| `POSTGRES_USER` | db + api `DATABASE_URL` | Optional; defaults to `unshelf`. Applied only on first DB init. |
| `POSTGRES_DB` | db + api `DATABASE_URL` | Optional; defaults to `unshelf`. Applied only on first DB init. |
| `CLERK_SECRET_KEY` | api (runtime) | Server-side only. From the Clerk dashboard. |
| `CLERK_PUBLISHABLE_KEY` | api (runtime) | Browser-public key. |
| `VITE_CLERK_PUBLISHABLE_KEY` | web (**build arg**) | Same publishable key; Vite inlines it at build. |

The Clerk dashboard must be in the state `docs/clerk-setup.md` describes
(Google-only, sign-up open) or admission silently drifts from ADR-0001.

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
   - `https://$DOMAIN/` → the SPA loads and Google sign-in works for any Google
     account (first sign-in creates the User).

> **The API no longer applies its schema on boot.** `applySchema` is gone; the
> schema is owned by the versioned migrations in `apps/api/drizzle/`, applied by
> `pnpm --filter @unshelf/api db:migrate`.
>
> The gated `migrate` service that runs this automatically on every deploy is
> **not wired yet** — that is
> [#116](https://github.com/rajat2006/unshelf/issues/116), which also covers
> recreating the deployed database at cutover and rewrites this section properly.
> Until it lands, a deploy applies no migrations: run `db:migrate` against
> `DATABASE_URL` yourself before the new image serves traffic.

## Local development and verification

**Everyday local development is `pnpm dev`** (see the README) — Vite + `tsx watch`
with hot reload, and Vite's dev proxy already gives the single-origin `/api`
routing the browser sees in production.

There is intentionally **no local Docker harness** that simulates the Dokploy
stack. A hand-rolled local Traefik can only ever *approximate* the platform's
proxy (its TLS, entrypoints, and network are Dokploy's, not ours), so it adds
maintenance and drift without proving the thing that actually matters. The
production images and their routing are verified where they run: on **deploy**,
via the end-to-end check in "First deploy" step 6 (and, once a hosted dev/staging
environment exists, there first).

## Backups — a tracked, time-boxed risk

v1 ships **no scheduled Postgres backups** — a conscious, time-boxed risk with a
firm trigger to close it (stand up off-box backups before anyone but the founder
holds data here — see the ADR: #77 removed the invite gate that used to define
that milestone). The decision and its rationale are
[ADR-0009 → "Data portability & backups"](adr/0009-v1-stack-and-hosting.md);
the fast-follow that closes it is
**[#40](https://github.com/rajat2006/unshelf/issues/40)**.
