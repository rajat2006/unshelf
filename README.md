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

## Deployment

Production runs on a Hostinger VPS via Dokploy (ADR-0009). The Dockerfiles,
`docker-compose.yml` (Dokploy), and the operator runbook live in
[docs/deploy.md](docs/deploy.md).
