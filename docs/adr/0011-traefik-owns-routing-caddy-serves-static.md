# Traefik owns cross-service routing; Caddy serves only the SPA's static files

On Dokploy (ADR-0009), Traefik is the platform ingress — it owns 80/443 and the
Let's Encrypt TLS and routes one domain across services. The SPA (ADR-0008) still
needs a static server inside its own container. So the `/api`-vs-static split can
live in two places: at Traefik (routing to two independent services), or inside
the web container's Caddy (with the api sealed behind it). **We keep the split at
Traefik; Caddy only serves the SPA's static files and never proxies `/api`.**
Routing is the job you adopt a PaaS to own: leaving it with Traefik keeps the api
independently routable (its own subdomain or middleware later) and lets Dokploy
load-balance api replicas automatically from the same labels — whereas pushing the
split into Caddy re-implements all of that as app config, and adds a
Traefik → Caddy → api hop, for no gain on this single-box v1. (Routing diagram:
`docs/deploy.md`.)

## Considered options

- **Caddy owns the split, api fully private (rejected).** The canonical "single
  Caddy at the edge" pattern, and genuinely viable off a PaaS: it seals the api on
  the private network and moves the routing rule into the version-controlled
  Caddyfile. Rejected because it hides the api from Dokploy's router — forfeiting
  platform routing, per-service domains/middleware, and automatic replica
  load-balancing — while adding a proxy hop. Note Dokploy still builds, deploys, and
  manages the api's lifecycle either way; only *routing* moves. Cheap to adopt later
  (a Caddyfile `reverse_proxy` block plus dropping the api's Traefik labels) if a
  hostile multi-tenant box ever makes full api privacy worth it.
