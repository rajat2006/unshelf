# Clerk setup

The code consumes whatever session Clerk authenticates; *who* ever gets a
session is Clerk-dashboard configuration. The repo cannot test that half of
issue #16 (stories 1–3), so this file records the dashboard state the app
assumes. If the dashboard drifts from this, the admission policy and Google-only
sign-in silently break with no failing test.

## Required dashboard state

1. **Google is the only enabled sign-in method** (ADR-0001: no password is ever
   created or managed). Under *User & authentication*: enable the Google social
   connection; disable password, email codes/links, and every other method.
2. **Sign-up is open** (ADR-0001, revised in #77: sign-up *is* sign-in). Under
   *Restrictions*: set sign-up mode to **Public**, so any Google account that
   authenticates is admitted and its first sign-in creates the account. Leave
   the allowlist and invitations unused — nothing in the repo depends on them.
3. **Keys** — copy from *API keys* into each app's `.env` (templates:
   `apps/api/.env.example`, `apps/web/.env.example`): `CLERK_SECRET_KEY` (api,
   server-side only), `CLERK_PUBLISHABLE_KEY` (api), and
   `VITE_CLERK_PUBLISHABLE_KEY` (web build — the same publishable key).
