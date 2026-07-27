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
| `LOG_LEVEL` | api + migrate (runtime) | Optional; defaults to `info`. Accepted values: `debug`, `info`, `warn`, `error`, or `fatal`; any other value fails process startup. |
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
5. **Deploy.** Dokploy builds the services and wires Traefik from the labels.
   Postgres data persists in the `unshelf-db` Compose volume. Before `api`
   starts, the one-shot `migrate` service waits for healthy Postgres and applies
   every pending committed migration from `apps/api/drizzle/`.
6. **Verify end to end**:
   - `https://$DOMAIN/api/health` → `{"status":"ok","db":"up",...}`
   - `https://$DOMAIN/` → the SPA loads and Google sign-in works for any Google
     account (first sign-in creates the User).

### Migration failure behaviour

The API process never modifies the schema. A non-zero `migrate` exit prevents
the replacement `api` container from starting and makes the Dokploy deployment
fail. Read the `migrate` service logs, fix or replace the migration, and redeploy;
do not bypass the gate or run `drizzle-kit` manually against production.

Dokploy currently deploys Compose applications in place with `docker compose up
-d --build --remove-orphans`. When the API definition or image changes, Compose
may remove the old API container before the migration finishes. A failed
migration can therefore cause an outage even though it correctly fails the
deploy. The migration must be safe before deployment; the gate is not a
zero-downtime rollout mechanism.

Compose recreates the stopped one-shot service when its image or configuration
changes. A deploy containing a new migration changes the API image, so `migrate`
runs again. Restarting an unchanged API container does not re-run migrations.

The installed Drizzle migrator creates its ledger schema/table first, then wraps
all pending migration statements and ledger inserts in one transaction. Failed
DDL rolls back, but the empty `drizzle.__drizzle_migrations` table can remain.
Postgres operations forbidden inside a transaction, notably `CREATE INDEX
CONCURRENTLY`, cannot be used in these migration files.

## Container logs and incident evidence

The production Compose file sends each service's stdout and stderr to Docker's
`local` logging driver in blocking mode. The limits are deliberately unequal:

| Service | Rotation limit | Nominal current-container budget |
| --- | ---: | ---: |
| `api` | `20m` × `5` files | 100 MB |
| `db` | `10m` × `5` files | 50 MB |
| `web` | `5m` × `3` files | 15 MB |
| `migrate` | `5m` × `3` files | 15 MB |

This is a nominal **180 MB** budget across one current container for each
service. Replicas and additional retained containers multiply it, while the
driver's compression and small implementation overheads affect actual disk use.
Retention is **byte-bounded, not time-bounded**: traffic, message size, and error
bursts determine whether the retained bytes cover hours, days, or longer.

This local history is intentionally short-lived. **Rotation removes** the oldest
entries; **container recreation removes** previous-container history; and **VPS
loss removes** all local history. The stopped `migrate` container retains only
the current deployment attempt until Compose recreates it. A restart of the same
container preserves its history subject to rotation, but a replacement does
not. These logs are **not an audit trail** and **not a cross-deployment archive**.
If those properties or a guaranteed retention duration become necessary, use a
remote log sink rather than increasing local limits.

Failure diagnostics deliberately retain non-secret User-authored and business
values. Treat both container logs and exported incident evidence as **sensitive
User data** requiring restricted access. Do not paste them into public issues or
leave exports in broadly readable locations.

### Inspect current logs

Dokploy's per-service **Logs** view is suitable for a quick bounded look at a
running service, but it is only a viewer over the same container-local history,
not an archive. For precise windows, open a terminal in the Dokploy Compose
application's code directory (where `docker-compose.yml` and the generated
`.env` live) and use the following copyable commands:

```sh
# Include stopped containers, especially the one-shot migration.
docker compose -f docker-compose.yml ps --all

# Recent API context.
docker compose -f docker-compose.yml logs \
  --since=30m --tail=200 --timestamps api

# Correlate a recent incident across the long-running services.
docker compose -f docker-compose.yml logs \
  --since=2h --tail=500 --timestamps api db web

# Read all still-retained output from the stopped current migration attempt.
# Its Compose logging policy bounds this output to 5m × 3 files.
docker compose -f docker-compose.yml logs --timestamps migrate

# Follow new API output; Ctrl+C stops following, not the service.
docker compose -f docker-compose.yml logs \
  --follow --tail=100 --timestamps api
```

Prefer `--since` and `--tail` for routine investigation. Do not read or
manipulate Docker's internal `local` driver files directly.

### Verify the effective policy

The logging policy applies when containers are created. After deploying this
change, confirm all four services were recreated, then inspect the effective
per-container configuration rather than relying on the daemon-wide default:

```sh
docker compose -f docker-compose.yml ps --all

docker inspect \
  --format '{{.Name}} {{json .HostConfig.LogConfig}}' \
  "$(docker compose -f docker-compose.yml ps --quiet api)"

docker inspect \
  --format '{{.Name}} {{json .HostConfig.LogConfig}}' \
  "$(docker compose -f docker-compose.yml ps --quiet db)"

docker inspect \
  --format '{{.Name}} {{json .HostConfig.LogConfig}}' \
  "$(docker compose -f docker-compose.yml ps --quiet web)"

docker inspect \
  --format '{{.Name}} {{json .HostConfig.LogConfig}}' \
  "$(docker compose -f docker-compose.yml ps --all --quiet migrate)"
```

Each result must show type `local`, mode `blocking`, and the service's
`max-size` / `max-file` pair from the table. `docker info` only reports the
daemon default and does not verify these per-container overrides.

### Export before planned replacement

If an incident overlaps a planned deploy or other container replacement, export
a point-in-time copy first:

```sh
umask 077
docker compose -f docker-compose.yml logs \
  --since=24h --timestamps --no-color api db web migrate \
  > unshelf-predeploy.log
```

The `umask` restricts the new file to its owner. Move the export off the VPS if
it must survive host loss, grant access only to incident responders, and delete
it when the investigation no longer needs it. Unlike the container policy, this
manual file has no automatic rotation.

### One-time Drizzle cutover from the pre-migration schema

This is a destructive **human VPS step**, performed once and only while the
existing deployed data is confirmed disposable. It must finish before Dokploy
can deploy the commit containing the `migrate` service:

1. If merging to the tracked branch triggers a Dokploy deployment, pause
   automatic deployments before merging this cutover. Do not let the new
   `migrate` service start against the old schema.
2. In Dokploy, stop the Unshelf Compose application so the API cannot reconnect
   while its database is removed.
3. Open a VPS terminal in that Compose application's code directory (the one
   containing `docker-compose.yml` and Dokploy's generated `.env`) and run:

   ```sh
   docker compose -f docker-compose.yml down --volumes
   ```

   This removes the Compose stack and its project-scoped `unshelf-db` volume.
   It permanently deletes all deployed Unshelf database data.
4. Merge if necessary, then deploy the commit that introduces the `migrate`
   service (and re-enable automatic deployments). Compose creates a
   fresh volume; Postgres creates an empty database; migration `0000` applies;
   only then does the API start.
5. Verify `/api/health`, the SPA, and sign-in as described above.

Do not deploy the migration service against the old pre-Drizzle schema first.
Applying `0000` to that schema was tested with `drizzle-kit`: it failed with an
empty error and left an orphaned ledger table. The old schema is not a supported
migration baseline. No separate cleanup of `drizzle.__drizzle_migrations` is
needed after the volume is deleted. Never repeat this volume-deletion procedure
after the cutover; subsequent schema changes use ordinary committed migrations.

## Local development and verification

**Everyday local development is `pnpm dev`** (see the README) — Vite + `tsx watch`
with hot reload, and Vite's dev proxy already gives the single-origin `/api`
routing the browser sees in production.

Applying local migrations is deliberately explicit: run `pnpm --filter
@unshelf/api db:migrate` after pulling a migration. It is not chained into
`pnpm dev`, so starting the development server never writes to whichever
database `DATABASE_URL` names.

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
