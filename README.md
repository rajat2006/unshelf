# unshelf

## Local development

```sh
pnpm install
cp apps/api/.env.example apps/api/.env   # fill in Clerk keys — see docs/clerk-setup.md
cp apps/web/.env.example apps/web/.env   # same publishable key as the api
pnpm dev
```

The api expects Postgres at `DATABASE_URL`. Tests need no `.env` at all —
`pnpm test` spins up a throwaway Postgres via testcontainers (Docker required).
API logs remain structured NDJSON by default. For human-friendly local output,
run `pnpm --filter @unshelf/api dev:pretty`; that local-only command pipes the
same NDJSON events through `pino-pretty` without changing the production bundle.

**Run the migrations before the first `pnpm dev`, and again after any pull that
adds one:**

```bash
pnpm --filter @unshelf/api db:migrate
```

Nothing applies the schema on boot any more (ADR-0015, #104) — the api reads
`DATABASE_URL` and assumes the schema is already there, so an unmigrated
database means every route 500s. This is deliberately manual: chaining it into
`pnpm dev` would make a schema write an unrequested side effect of starting the
server, against whatever `DATABASE_URL` happened to be loaded.

## Deployment

Production runs on a Hostinger VPS via Dokploy (ADR-0009). The Dockerfiles,
`docker-compose.yml` (Dokploy), and the operator runbook live in
[docs/deploy.md](docs/deploy.md).
