# unshelf

## Local development

```sh
pnpm install
pnpm --filter @unshelf/web exec playwright install chromium
cp apps/api/.env.example apps/api/.env   # fill in Clerk keys — see docs/clerk-setup.md
cp apps/web/.env.example apps/web/.env   # same publishable key as the api
pnpm dev
```

The api expects Postgres at `DATABASE_URL`. Tests need no `.env` at all —
`pnpm test` spins up a throwaway Postgres via testcontainers (Docker required)
and runs the web smoke suite in headless Chromium.
