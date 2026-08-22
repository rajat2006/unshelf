# The React SPA (ADR-0008/0009), built from the monorepo root as its build
# context and served as static files by Caddy. This is the Dokploy service for
# apps/web; Traefik routes everything except /api to it.
#
# Build context is the REPO ROOT (workspace lockfile + packages/shared). Vite
# inlines VITE_* env at BUILD time, so browser-public keys and feature choices
# must be passed as build args rather than runtime container values.

# ── base ──────────────────────────────────────────────────────────────────────
FROM node:24-alpine AS base
RUN corepack enable
WORKDIR /app

# ── build ─────────────────────────────────────────────────────────────────────
FROM base AS build

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY .husky/install.mjs .husky/install.mjs
RUN HUSKY=0 pnpm install --frozen-lockfile

COPY packages/shared packages/shared
COPY apps/web apps/web

# Baked into the bundle at build time (see ADR-0009 auth guardrails / clerk-setup).
ARG VITE_CLERK_PUBLISHABLE_KEY
ENV VITE_CLERK_PUBLISHABLE_KEY=$VITE_CLERK_PUBLISHABLE_KEY
ARG VITE_YOUTUBE_OEMBED_ENABLED
ENV VITE_YOUTUBE_OEMBED_ENABLED=$VITE_YOUTUBE_OEMBED_ENABLED
RUN pnpm --filter @unshelf/web... build

# ── runtime ───────────────────────────────────────────────────────────────────
FROM caddy:2-alpine AS runtime
COPY apps/web/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/apps/web/dist /usr/share/caddy
# Documentation only — advertises the port, does NOT publish it. Traefik routes
# via the loadbalancer.server.port label, so functionally this is a no-op here.
EXPOSE 80
