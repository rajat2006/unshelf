# Drizzle owns the API's schema and migrations; `SCHEMA_SQL`-on-boot is retired

`apps/api/src/schema.ts` exports one template literal, `SCHEMA_SQL`, applied by
`applySchema(pool)` on **every boot** (`apps/api/src/server.ts:21`). It began as
"the v1 schema, idempotent so it is safe to run on every boot" and has since
become a **hand-rolled migration runner** — without any of the things a migration
runner exists to provide. We adopt **Drizzle** (`drizzle-orm` + `drizzle-kit`) for
the API's data layer: the schema is defined as TypeScript, `drizzle-kit` generates
versioned, ordered, recorded migrations, and `SCHEMA_SQL` is deleted. This sits
alongside ADR-0009's stack choice (TypeScript / Postgres / pnpm + Turborepo) and
supersedes nothing.

## The pain, concretely

`SCHEMA_SQL` is 337 lines and growing. It is no longer a schema — it is every
schema this database has ever had, replayed from the start on each process start:

- **13 `ALTER TABLE` statements**, including
  `ALTER TABLE items DROP COLUMN IF EXISTS created_at` — a column dropped long ago
  that we re-drop forever.
- **Three backfill `UPDATE`s** that rewrite user data at boot:
  `UPDATE stop_items SET user_id = stops.user_id`, and the two that adopted
  orphaned Stops and edges into their Trail (`#93`).
- **Three `DO $$ … END $$` blocks** containing **six** `SELECT 1 FROM pg_constraint`
  existence checks, hand-rolling the `ADD CONSTRAINT IF NOT EXISTS` that Postgres
  does not offer.

Every one of these is a migration wearing a disguise. What is missing is exactly
what makes them migrations:

- **No version.** Nothing identifies a state of the schema.
- **No ordering.** Correctness rests on the literal top-to-bottom order of one
  string, which every future edit must reason about in full.
- **No record.** Nothing anywhere says what any given database has actually had
  applied. The only way to know is to inspect the database.

The cost is already visible in the test suite: `apps/api/test/trail-migration.test.ts`
exists solely to call `applySchema` repeatedly and assert that re-running it
changes nothing — a test for a property a real migration runner makes
unnecessary. And because the file re-runs in full, adding a value to `ITEM_TYPES`
means hand-editing a `CHECK` constraint inside a 337-line string that then
re-executes on every boot of every environment.

`drizzle-kit` supplies version, order, and a `__drizzle_migrations` record. **That
is the decision.**

## Drizzle is a means, not a goal

The prize is `drizzle-kit`'s migrations. The typed query builder is a **secondary
benefit**, and this ADR deliberately does not oversell it.

The repositories' SQL is **not** the problem being solved. The load-bearing
queries are domain logic, not ceremony, and they will stay `sql` templates through
Drizzle's connection:

- `WITH RECURSIVE` for the Trail DAG check (`apps/api/src/trail/repository.ts:237`)
- `pg_advisory_xact_lock` guarding Trail rewiring (`trail/repository.ts:166`)
- `count(…) FILTER (WHERE …)` for Stop and Trail progress rollups
  (`trail/repository.ts:91`, `trails/repository.ts:50`)

A future reader finding raw SQL in the repositories after this ADR is looking at
the **intended** outcome, not at an unfinished migration. Drizzle earns its place
at `drizzle-kit generate`; the query builder is welcome where it fits and not
forced where it does not.

## Considered options

- **Prisma.** Rejected. It introduces a separate schema DSL (`schema.prisma`) plus
  a generated client, which fights ADR-0009's "one language end to end" and the
  `packages/shared` single source of truth — the domain would be described in two
  places, one of them not TypeScript. Its migration story is strong, but it is
  bought with the exact architectural seam ADR-0009 chose to avoid.
- **Kysely.** Rejected. It is the closest fit to the current hand-written SQL style
  and would sit comfortably in the repositories — but its migrations are
  hand-authored `up`/`down` functions. Every `ALTER` stays hand-written, which is
  the precise pain being solved.
- **Status quo (`SCHEMA_SQL` on boot, disciplined).** Rejected for the same reason,
  more sharply: no amount of discipline gives one idempotent string a version, an
  order, or a record of what has been applied.

## What this decision does not settle

Two live questions are deliberately **left out**, and a future reader should not
read this ADR as having answered them:

- **Schema design — which constraints belong in the database.** Whether the
  `CHECK (type IN …)` / `CHECK (status IN …)` enums (which duplicate `ITEM_TYPES` /
  `ITEM_STATUSES` in `packages/shared`) should exist at all, whether the composite
  owner foreign keys `(item_id, user_id) REFERENCES items (id, user_id)` earn their
  keep, and whether the DAG check belongs in Postgres or in application code. All
  genuinely open — but they are schema design, not migration tooling. Settling the
  tooling first is what makes each answer one generated migration instead of an
  edit to a string that runs on every boot.
- **API database dependency ownership** ([#32](https://github.com/rajat2006/unshelf/issues/32)).
  Downstream, not folded in. The cutover changes the *type* travelling
  `createApp(pool) → createXRouter(pool) → repository(pool, …)`, not its *shape*.
  More decisively, `db.transaction(tx => …)` deletes the manual `BEGIN`/`COMMIT`/
  `release` that is today's strongest argument *for* explicit pool parameters — so
  researching that trade-off now would evaluate something about to change.

## Known rough edges

Verified by doing, on
[#103](https://github.com/rajat2006/unshelf/issues/103) — the whole of `SCHEMA_SQL`
rewritten as Drizzle tables, `drizzle-kit generate` run, the output applied to a
disposable Postgres 16 and diffed against today's DDL via `pg_attribute` /
`pg_constraint` / `pg_indexes`. Zero constraints and zero indexes were lost and the
34-column list came back byte-identical. Memo: `docs/drizzle-schema-fidelity.md`
(draft [PR #113](https://github.com/rajat2006/unshelf/pull/113), branch
`research/issue-103-drizzle-schema-fidelity`). The rough edges it found, named here
so this ADR is not read as claiming a clean bill of health:

- **`drizzle-kit` emits composite foreign keys before the unique indexes they
  target**, so a literal transcription generates SQL that fails on the first FK
  (`there is no unique constraint matching given keys`). Upstream
  [drizzle-orm#4638](https://github.com/drizzle-team/drizzle-orm/issues/4638),
  closed `bug/fixed-in-beta`; no config option controls statement order. It is a
  hard failure at apply time, not a silent drop, so it cannot leave a database in a
  wrong state. **Workaround:** declare the five FK targets with `unique()` rather
  than `uniqueIndex()` — in Postgres a `UNIQUE` constraint *is* a unique index, so
  the cost is five rows in `pg_constraint`.
- **The fix for that ordering bug ships only in the v1 release candidate** and will
  not be backported to 0.31.x. We nonetheless pin stable **`drizzle-kit@0.31.10`**:
  v1 also moves the migration folder layout, and taking an RC whose output layout is
  still moving, in the same change that retires `applySchema`-on-boot, stacks two
  unsettled things.
- **`drizzle-kit` cannot import `@unshelf/shared` as currently exported** — it
  resolves through CJS, and shared's `exports` map declares only `types` and
  `import`, giving `ERR_PACKAGE_PATH_NOT_EXPORTED`. Adding a `default` condition
  pointing at the same ESM file fixes it and changes nothing for `apps/web` or
  `apps/api`; `generate` then reads `packages/shared/dist` and needs
  `dependsOn: ["^build"]`.
- **Constraint names change** for composite primary keys, single-column foreign
  keys, and the one anonymous `CHECK` (`stop_items_pkey` →
  `stop_items_stop_id_item_id_pk`, `items_user_id_fkey` →
  `items_user_id_users_id_fk`). Every explicitly-named constraint keeps its name.
  Free here only because existing data is disposable — it matters to error messages
  and to any test asserting on `err.constraint`.

## Consequences

- **`SCHEMA_SQL` and `applySchema` are deleted outright, not translated.** Existing
  data is disposable (confirmed), so migration `0000` is generated from the new
  TypeScript schema against an empty database — no baseline forgery of
  `__drizzle_migrations`, no hand-transcription of production DDL. The three
  callers (`server.ts`, `test/harness.ts`, `test/trail-migration.test.ts`) all
  change; the last of those tests a property that ceases to exist.
- **Migrations run in the deploy path, not at boot**
  ([#104](https://github.com/rajat2006/unshelf/issues/104)): a one-shot `migrate`
  container must exit 0 before `api` starts, so a failed migration fails the
  *deploy* rather than the running service. `generate` + committed `.sql`, never
  `push`. The generated `drizzle/` folder is a **runtime asset** — `tsup` bundles
  TypeScript, not `.sql` — so it must be present on the VPS.
- **No down-migrations exist.** Off-box backups
  ([#40](https://github.com/rajat2006/unshelf/issues/40), the risk ADR-0009 deferred
  with a trigger) gate automatic production migrations.
- **ADR-0009's tenancy guardrail is unaffected and must stay so**: every domain
  table still foreign-keys to *our* `users.id`, and the composite tenancy keys were
  proven under Drizzle to *bite*, not merely to exist — a Stop and an Item belonging
  to different Users is rejected by the database, not by application code.
- **No `CONTEXT.md` change.** An ORM and a migration tool are implementation
  choices, not domain vocabulary; the glossary stays implementation-free (same call
  as ADR-0008 and ADR-0009).
- **Closes the ORM research asked for in
  [#35](https://github.com/rajat2006/unshelf/issues/35).** The remaining work on
  wayfinder map [#102](https://github.com/rajat2006/unshelf/issues/102) is execution
  — defining the schema, generating `0000`, and moving the repositories onto a
  Drizzle handle.
