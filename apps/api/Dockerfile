# The Express API (ADR-0009), built from the monorepo root as its build context.
# Each apps/* is its own Docker service behind Dokploy's Traefik proxy; this image
# is that service for apps/api.
#
# Build context is the REPO ROOT, not apps/api — the build needs the pnpm
# workspace (lockfile, packages/shared) to install and bundle. Dokploy/compose
# sets `context: .` with `dockerfile: apps/api/Dockerfile`.

# ── base ──────────────────────────────────────────────────────────────────────
FROM node:22-slim AS base
RUN corepack enable
WORKDIR /app

# ── build ─────────────────────────────────────────────────────────────────────
# Install against the full workspace so the workspace-linked @unshelf/shared
# resolves, then build (tsup bundles shared into dist/server.js) and use
# `pnpm deploy` to emit a self-contained, prod-only tree (dist + flat
# node_modules with just express/pg/@clerk) for the runtime stage to copy.
FROM base AS build

# Manifests first, so `pnpm install` re-runs only when dependencies change.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile

# Sources, then build the api (and its ^build dep, @unshelf/shared).
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @unshelf/api... build
RUN pnpm --filter @unshelf/api deploy --prod --legacy /app/deploy

# ── runtime ───────────────────────────────────────────────────────────────────
FROM base AS runtime
ENV NODE_ENV=production
# No-op (inherited from `base`); restated to document where the COPYs land.
WORKDIR /app
# Run as the unprivileged user that ships with the node image.
USER node

COPY --from=build --chown=node:node /app/deploy/package.json ./package.json
COPY --from=build --chown=node:node /app/deploy/node_modules ./node_modules
COPY --from=build --chown=node:node /app/deploy/dist ./dist

# The app reads PORT (default 3001); DATABASE_URL and the Clerk keys come from
# the environment (Dokploy service env). This image does *not* touch the schema:
# migrations are a separate gated step in the deploy path (ADR-0015, #104).
#
# TODO(#116): the migrate step runs from this same image, so it needs both a
# `COPY --from=build /app/deploy/drizzle ./drizzle` above and a `dist/migrate.js`
# entrypoint. `tsup` bundles JavaScript, not the `.sql` files, and
# `pnpm deploy --prod` will not carry the folder on its own — if this is missed
# the migrate container finds nothing to apply and exits 0 silently.
EXPOSE 3001
CMD ["node", "dist/server.js"]
