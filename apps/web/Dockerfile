# The React SPA (ADR-0008/0009), built from the monorepo root as its build
# context and served as static files by nginx. This is the Dokploy service for
# apps/web; Traefik routes everything except /api to it.
#
# Build context is the REPO ROOT (workspace lockfile + packages/shared). Vite
# inlines VITE_* env at BUILD time, so the Clerk publishable key must be passed
# as a build arg — it is not a runtime secret (it is the browser-public key).

# ── base ──────────────────────────────────────────────────────────────────────
FROM node:22-slim AS base
ENV CI=true
RUN corepack enable
WORKDIR /app

# ── build ─────────────────────────────────────────────────────────────────────
FROM base AS build

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile

COPY packages/shared packages/shared
COPY apps/web apps/web

# Baked into the bundle at build time (see ADR-0009 auth guardrails / clerk-setup).
ARG VITE_CLERK_PUBLISHABLE_KEY
ENV VITE_CLERK_PUBLISHABLE_KEY=$VITE_CLERK_PUBLISHABLE_KEY
RUN pnpm --filter @unshelf/web... build

# ── runtime ───────────────────────────────────────────────────────────────────
FROM nginx:1.27-alpine AS runtime
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
