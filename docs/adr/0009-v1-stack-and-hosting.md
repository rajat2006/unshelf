# The v1 stack: a TypeScript monorepo (React + Express + Postgres), Clerk for auth, self-hosted on a Hostinger VPS via Dokploy

Unshelf v1 is built as a **TypeScript monorepo** — a React SPA (`apps/web`) and a
Node/Express API (`apps/api`) over **Postgres**, sharing one domain package
(`packages/shared`) — **self-hosted on a Hostinger VPS**, deploys managed by
**Dokploy**, with **Clerk** for authentication. This is the last decision on the
v1-spec map (ADR-0008 already fixed a responsive web client off a hosted backend;
ADR-0001 fixed always-on multi-tenant with Google social-login). The stack is
sized to a **solo founder** shipping a small, plainly-relational, single-purpose app
and to the founder's own tastes — one language end to end, a boring relational
core, and infrastructure the founder owns.

## The stack

- **`apps/web`** — React + TypeScript, a single-page app. The responsive web
  client of ADR-0008; desktop-primary, online-only.
- **`apps/api`** — Node.js + Express + TypeScript, the always-on multi-tenant
  backend (ADR-0001).
- **`packages/shared`** — the domain model and API contract as TypeScript types,
  imported by both sides so there is **one source of truth** for `Item`, `Stop`,
  the `StopItem` join, and the `Type` / `Status` enums (ADR-0003, ADR-0004). Both
  ends being TypeScript is the point: no client/server type drift.
- **Postgres** — the store. The v1 model is small and relational (User → Item,
  Stop, StopItem, plus the two soft-date columns of ADR-0005); nothing here wants
  a document or graph store.

## Monorepo — pnpm workspaces + Turborepo, from day one

One repo, one service per app. **pnpm workspaces** does package linking;
**Turborepo** runs and caches tasks on top (they compose — Turborepo does not
replace pnpm workspaces). Turborepo is adopted **from day one** at the founder's
call; it is a thin task/cache layer, so this is a low-cost convenience, not an
architectural commitment — the migration-risky decision is the *workspace layout*,
which is fixed now regardless:

```
apps/web        → React SPA        (Dokploy service)
apps/api        → Express API      (Dokploy service)
packages/shared → domain types + API contract, shared by both
apps/agent      → an AI-agent app; seam left open, built in v1: none
```

The `apps/agent` slot is a **seam, not a feature** — the AI / "suggestions"
direction is Out of scope for v1 (see the map), so the layout accommodates a
future agent app while v1 builds none of it. Turborepo is a build/dev/CI tool
only; it does **not** change deployment — Dokploy builds each `apps/*` as its own
Docker service.

## Auth: Clerk (managed), behind guardrails that keep it reversible

Authentication is **Clerk** — a managed service providing Google OAuth, where
signing in for the first time creates the account (ADR-0001's open sign-up), and
a native **allowlist + invitations** feature should admission ever need gating
again. Chosen for **speed to a working Google login and offloaded security
surface**, which is the right trade for
a solo founder: auth is the easiest thing to get subtly wrong, and a slip there is
not an ordinary bug but a breach of the per-User isolation that *is* the tenancy
model (ADR-0001).

Clerk is a third-party SaaS in an otherwise self-hosted stack — a deliberate,
conscious inconsistency, and the one part of the stack a future reader will
question. Two **guardrails** (build constraints, not suggestions) keep it from
becoming lock-in:

1. **Our own `users` table is the anchor.** Every domain table (Item, Stop,
   StopItem) has a foreign key to *our* `user_id`. Clerk's user id is only an
   external-reference column on that row — domain data **never** foreign-keys to
   Clerk's id. (This is also just correct multi-tenancy.)
2. **Clerk lives behind a thin wrapper** — one `useCurrentUser()` hook on the web,
   one auth middleware that sets `req.user` on the api. Nothing else imports Clerk.

With those two, plus **Google-only login** (ADR-0001 — no passwords, so there are
no password hashes to migrate), a switch to a self-hosted **Better Auth** (users
in our own Postgres) is a bounded, weekend-sized change: users re-authenticate
with Google and are rematched by their Google identity. The decision is therefore
**reversible at bounded cost** — which is what makes buying auth acceptable here.

## Hosting: a Hostinger VPS, managed by Dokploy

The app is **self-hosted on a Hostinger VPS** (a VPS specifically — Dokploy needs
root Docker access, not shared hosting). **Dokploy** — the open-source,
self-hostable PaaS — manages deploys: each `apps/*` runs as its own Docker service
behind Dokploy's Traefik reverse proxy, and **Postgres runs as a Dokploy-managed
service on the same VPS**. This owns the whole stack (app + database) on one box,
consistent with the founder's lean throughout.

## Data portability & backups — both deferred, backups a tracked risk

v1 ships **no user-facing data export** and **no operational backups**. Both are
named fast-follows.

- **User-facing export** (a User downloads their Items / Stops / Trail) — deferred.
  The clean relational schema makes a JSON export a few-hours add whenever it is
  wanted; it is not core to capture + organise + track (ADR-0002).
- **Operational backups** (scheduled off-box Postgres dumps) — deferred, **but
  recorded here as a conscious, time-boxed risk.** On a single VPS with no backup,
  one hardware failure is irreversible total data loss. This is defensible *only*
  while the repo is greenfield with near-zero data. The trigger to
  close it: **stand up Dokploy's scheduled off-box backups (to S3-compatible
  storage) before anyone but the founder holds data here** — before Unshelf holds
  user data whose loss would betray the "escape your scattered tools into one safe
  place" promise. Deferring past that milestone is not sanctioned by this ADR.

  *(#77 removed the invite gate; this trigger originally read "before the
  invite-only phase opens to public self-serve". With admission open from launch,
  the milestone is now the first non-founder User, not a phase change — so the
  backup fast-follow (#40) is closer than it was, not further.)*

## Considered options

- **A full-stack meta-framework (Next.js) instead of React SPA + Express API.**
  Not chosen: the founder preferred an explicit client/server split, and a plain
  SPA + API in separate Docker containers is *simpler to reason about* on a
  Dokploy/VPS deploy than a server runtime. The shared `packages/shared` recovers
  the main thing a single framework would have given (shared types). Reversible if
  ever wanted.
- **Better Auth / roll-your-own / Auth0 instead of Clerk.** *Better Auth* (auth in
  our own Postgres) was the ideologically-consistent pick given the self-hosting
  lean and is the named reversibility target — but Clerk's faster start and
  offloaded security won for v1. *Roll-your-own* collapses into Better Auth done by
  hand (more security surface, no benefit) and was rejected. *Auth0* is dominated
  for this profile: it is enterprise-weight (SSO/SAML/compliance) with clunkier
  React DX and a smaller free tier, and — being SaaS like Clerk — does nothing for
  the self-host ethos, so it wins neither the "managed" slot (Clerk fits better)
  nor the "owned" slot (Better Auth wins).
- **Managed Postgres (Neon / Supabase / RDS) instead of self-hosted.** Not chosen:
  running Postgres as a Dokploy service on the same VPS keeps the whole stack owned
  on one box, matching the founder's preference. The cost is that backups are the
  founder's responsibility — addressed (and deferred) above.
- **Plain workspaces or Nx instead of Turborepo.** Plain pnpm workspaces would have
  sufficed for v1 and Turborepo can be added later in ~15 minutes (it is not a
  migration); the founder chose it from day one for ergonomics, at low cost. Nx was
  not chosen — heavier than a two/three-app repo needs.

## Consequences

- **Unblocks [Write the v1 PRD & implementation backlog](https://github.com/rajat2006/unshelf/issues/12)** — the map's last open ticket. With the stack decided, nothing remains to decide before the PRD and backlog are written; building v1 follows that.
- **The two auth guardrails are build constraints**, not advice: the own-`users`-table anchor and the thin Clerk wrapper must hold, or the reversibility this ADR relies on evaporates.
- **The deferred backup is a tracked risk with a trigger** (before public self-serve), not an open-ended "later." It belongs on the fast-follow list, not forgotten.
- **`apps/agent` is a seam left open** for a post-v1 AI-agent app; v1 builds none of it.
- **No `CONTEXT.md` change** — framework, database, auth provider, host, and repo layout are implementation choices, not domain vocabulary; the glossary stays implementation-free (same call as ADR-0008).
