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

## Formatting

The repository-root scripts use the pinned local Prettier installation; no
global formatter or workspace-specific command is required:

```sh
pnpm format
pnpm format:check
```

`pnpm format` writes the canonical layout. If `pnpm format:check` fails, run
`pnpm format` to repair the owned files.

Prettier governs product TypeScript, TSX, JavaScript, JSX, JSON, YAML, CSS, and
HTML in the applications, shared package, and repository-level product
configuration. The authoritative exclusions are in `.prettierignore`: Markdown;
Sandcastle source, skills, and agent workflows; generated Drizzle migrations and
metadata; the dependency lockfile; generated output and installed dependencies;
temporary worktrees; and tool-local configuration. Product CI remains unchanged,
and pre-commit formatting is intentionally delegated to the separate hook
exploration.

### Formatting history

The initial product-tree normalization is recorded in
`.git-blame-ignore-revs`. Configure a local clone once so `git blame` looks
through that mechanical commit to the earlier meaningful history:

```sh
git config blame.ignoreRevsFile .git-blame-ignore-revs
```

The formatter rollout must be merged with a merge commit, not squash-merged or
rebase-merged, so the recorded commit identity remains reachable. If the rollout
branch is rebased before merge, refresh the full commit identity in
`.git-blame-ignore-revs` first.

Older branches and worktrees should rebase onto the merged rollout, resolve
substantive conflicts instead of retaining obsolete whitespace, and then run
`pnpm format` before continuing.

## Pre-commit checks

A normal `pnpm install` enables the Husky pre-commit hook automatically. The
hook runs only against staged files: product TypeScript and TSX are fixed by the
typed ESLint policy and then formatted by Prettier, while other supported staged
files are formatted by Prettier. Unstaged tracked changes are hidden and restored
while those checks run. Git's staged-diff check runs last against the final
snapshot.

CI installations skip hook activation. If a worktree has an installed Husky
launcher but not the hook dependencies, the hook warns, skips linting and
formatting, and still runs the Git-native staged check. A worktree with neither
the generated launcher nor dependencies remains commit-capable.

The hook is fast local feedback, not the merge gate: required CI remains
authoritative. `git commit --no-verify` is an intentional escape hatch when a
contributor or autonomous agent needs to bypass the local hook. Builds,
typechecks, and tests do not run at commit time.

Implementation validation on Node 24 and pnpm 11 measured the isolated
real-commit fixture at 1.31 seconds for one staged TypeScript file and 1.49
seconds for staged API, web, and shared TypeScript files together. The complete
focused Vitest commands, including test-runner startup, took 2.29 and 2.47
seconds respectively. These are recorded benchmarks, not CI timing assertions.

## Deployment

Production runs on a Hostinger VPS via Dokploy (ADR-0009). The Dockerfiles,
`docker-compose.yml` (Dokploy), and the operator runbook live in
[docs/deploy.md](docs/deploy.md).
