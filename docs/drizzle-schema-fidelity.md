# Can Drizzle express the current Postgres schema faithfully?

Research memo for [#103](https://github.com/rajat2006/unshelf/issues/103), on the
[Drizzle migration map (#102)](https://github.com/rajat2006/unshelf/issues/102). This is the
check that could have falsified the Drizzle decision, so it was run **by doing**: the whole of
`apps/api/src/schema.ts`'s `SCHEMA_SQL` was rewritten as Drizzle table definitions in a
throwaway pnpm workspace, `drizzle-kit generate` was run, the result applied to a disposable
Postgres 16, and the resulting DDL diffed against what `SCHEMA_SQL` produces today.

## Verdict

**Drizzle can express the schema faithfully. Nothing is lost — but the naively-generated
migration does not apply, and that failure is silent until you run it.**

Every feature the ticket named round-trips: composite unique indexes, composite foreign keys
with `ON DELETE CASCADE`, table-level `CHECK`s, composite primary keys, `gen_random_uuid()` /
`now()` defaults, and plain and composite indexes. All are declarable in TypeScript *and*
emitted into the generated SQL. A structural diff of the two databases shows **zero constraints
and zero indexes present today but missing from Drizzle's output**, and the column list —
all 34 columns, with types, nullability and defaults — is byte-identical.

The one real defect is **statement ordering**, described below. It is a hard, loud failure at
apply time, not a silent drop, and it has a one-line fix. Nothing here reopens the ORM choice.

## The one defect: FKs are emitted before the indexes they target

`drizzle-kit generate` emits in three blocks: all `CREATE TABLE`, then all
`ALTER TABLE … ADD CONSTRAINT … FOREIGN KEY`, then all `CREATE INDEX` / `CREATE UNIQUE INDEX`.

Our composite tenancy foreign keys target composite **unique indexes** —
`items (id, user_id)`, `stops (id, user_id)`, `stops (id, trail_id)`, `labels (id, user_id)`,
`trails (id, user_id)`. Transcribed literally with `uniqueIndex()`, the generated `0000` puts
the foreign keys at lines 70–85 and the unique indexes they reference at lines 89–96. Postgres
rejects it on the first composite FK:

```
ERROR:  there is no unique constraint matching given keys for referenced table "items"
```

`psql` exits 3. The migration **cannot be applied at all** — so this is not the dangerous
failure mode the ticket was worried about (declared in TypeScript, silently dropped from the
SQL). It cannot reach a database in a wrong state; it simply refuses to run.

This is a known upstream bug, not a misuse of the API:
[drizzle-orm#4638](https://github.com/drizzle-team/drizzle-orm/issues/4638) is an exact match
(a composite `foreignKey()` targeting a composite `uniqueIndex()`), filed 2025-06-12 and closed
2026-01-03 as `bug/fixed-in-beta`;
[#3260](https://github.com/drizzle-team/drizzle-orm/issues/3260) reports the same ordering
inversion more broadly. There is **no config option or schema-level API that controls emitted
statement order** — the [config file
docs](https://orm.drizzle.team/docs/drizzle-config-file) expose nothing of the kind, and
`breakpoints` only inserts `--> statement-breakpoint` markers. Nor do the [indexes &
constraints docs](https://orm.drizzle.team/docs/indexes-constraints) warn that a composite FK
target must be a `unique()` constraint. The fix landed only in the **v1 line** (from the
`alternation-engine` rewrite, [PR
#4439](https://github.com/drizzle-team/drizzle-orm/pull/4439)) and will not be backported to
0.31.x — see [Which version line](#which-version-line) below.

### Fix: declare the FK targets as `unique()`, not `uniqueIndex()`

A composite **unique constraint** is emitted *inline in `CREATE TABLE`*, which is necessarily
before the foreign-key `ALTER`s. Changing five declarations from `uniqueIndex(…)` to
`unique(…)` makes the generated migration apply as-is, with no hand editing, now or ever.

```ts
// before — generates SQL that will not apply
uniqueIndex("items_id_user_id_idx").on(table.id, table.userId),

// after — emitted inside CREATE TABLE, so the FK that targets it can be added afterwards
unique("items_id_user_id_idx").on(table.id, table.userId),
```

**This costs nothing.** In Postgres a `UNIQUE` constraint *is* implemented as a unique index —
with the same name, on the same columns, equally usable as a foreign-key target and equally
usable by the planner. The only observable difference is one extra row in `pg_constraint` per
target. Verified: `CREATE UNIQUE INDEX items_id_user_id_idx ON public.items USING btree (id,
user_id)` appears identically in both databases.

### The alternative, and why it is worse

Keeping `uniqueIndex()` and hand-editing `0000` to hoist the five `CREATE UNIQUE INDEX`
statements above the first FK `ALTER` also works — it was tested, it applies cleanly, and it
reproduces today's DDL *exactly* (no extra `pg_constraint` rows at all). Crucially, the hand
edit is **safe for future diffs**: `drizzle-kit check` reports "Everything's fine", and a
subsequent schema change generated a correct, minimal `0001` (`ALTER TABLE "stops" ADD COLUMN
"notes" text;`). The snapshot in `meta/` is derived from the TypeScript, not from the SQL text,
so reordering statements cannot desynchronise it.

It is still the worse option: it is a trap that rearms. Any *future* migration introducing a new
composite-FK-target index needs the same hand edit, and the person writing it will not know
that. Prefer `unique()` and let the tool stay correct on its own.

## Which version line

Because the ordering fix exists only in the v1 release candidate, the version choice is now a
real decision rather than "take latest". All three configurations below were run end to end
against our actual schema; all three produce a database semantically identical to today's.

| | Applies unedited | DDL vs today | Cost |
| --- | --- | --- | --- |
| **A. `drizzle-kit@0.31.10` + `unique()`** | yes | +5 `pg_constraint` rows, same indexes | none material |
| B. `drizzle-kit@0.31.10` + `uniqueIndex()` + hand edit | no — needs the edit | exact | a trap that rearms on every future composite-FK-target index |
| C. `drizzle-kit@1.0.0-rc.4` + `uniqueIndex()` | yes | exact | it is a release candidate |

**Recommendation: A.** Pin the stable line and declare composite FK targets with `unique()`.

Option C was verified, not assumed: on `drizzle-kit@1.0.0-rc.4` / `drizzle-orm@1.0.0-rc.4` the
five `CREATE UNIQUE INDEX` statements are emitted at lines 70–81, *before* the composite foreign
keys at lines 83–98, and the migration applies to an empty database with no hand editing and no
`unique()` substitution. Its resulting schema diffs clean against today's.

It is still the wrong bet right now. `npm dist-tags` for `drizzle-kit` are `latest: 0.31.10`,
`beta: 1.0.0-beta.22`, `rc: 1.0.0-rc.4` — v1 is not released. More to the point, v1 **changes
the migration folder layout** from `drizzle/0000_name.sql` to
`drizzle/<timestamp>_<name>/migration.sql` (+ a per-migration `snapshot.json`), which is exactly
the surface [#104](https://github.com/rajat2006/unshelf/issues/104) is deciding about. Adopting
a release candidate whose output layout is still moving, in the same change that retires
`applySchema`-on-boot, stacks two unsettled things. Option A costs five rows in a catalogue
table; that is a much smaller price than a moving target.

Worth revisiting once v1 ships — at which point `unique()` can stay as-is anyway, since it is
correct on both lines.

> One incidental finding while testing C: putting two `drizzle-orm` versions in one pnpm
> workspace breaks `drizzle-kit`, which resolved `drizzle-orm/_relations` against the hoisted
> `node_modules/.pnpm/node_modules/drizzle-orm` copy rather than its own. Not a problem for a
> single-version workspace, but it rules out side-by-side evaluation in place — the two lines
> had to be tested in separate workspaces.

## Feature-by-feature results

| Feature | Declarable | In generated SQL | Applies | Notes |
| --- | --- | --- | --- | --- |
| Composite unique index as FK target | yes | yes | **no — see above** | Use `unique()` instead of `uniqueIndex()` |
| Composite FK `(stop_id, user_id) → stops (id, user_id)` | yes | yes | yes | `ON DELETE CASCADE` preserved |
| Composite FK `(item_id, user_id) → items (id, user_id)` | yes | yes | yes | |
| `trail_edges` `(from_stop_id, user_id)` / `(to_stop_id, user_id)` | yes | yes | yes | |
| `trail_edges` `(from_stop_id, trail_id)` / `(to_stop_id, trail_id)` | yes | yes | yes | Not in the ticket; landed with #94 |
| `stops_trail_owner_fk (trail_id, user_id) → trails` | yes | yes | yes | Not in the ticket; landed with #94 |
| `CHECK (type IN (…))` / `CHECK (status IN (…))` | yes | yes | yes | `check()` + `sql` template |
| `CHECK (from_stop_id <> to_stop_id)` | yes | yes | yes | |
| Composite PK `(stop_id, item_id)`, `(user_id, from_stop_id, to_stop_id)` | yes | yes | yes | |
| `DEFAULT gen_random_uuid()` | yes | yes | yes | `.defaultRandom()` |
| `DEFAULT now()` on `timestamptz` | yes | yes | yes | `.defaultNow()` |
| Plain index `items_user_id_idx` | yes | yes | yes | |
| Composite index `trail_edges_to_stop_id_idx (user_id, to_stop_id)` | yes | yes | yes | |
| `date`, `timestamptz`, `uuid`, `text`, `integer` columns | yes | yes | yes | Column diff is byte-identical |

The constraints were also proven to **bite at runtime**, not merely to exist, by writing through
a Drizzle handle against the migrated database:

| Attempted write | Rejected by |
| --- | --- |
| `stop_items`: Bob's Stop + Alice's Item | `stop_items_item_owner_fk` (23503) |
| `stop_items`: Alice's Stop claimed under Bob's `user_id` | `stop_items_stop_owner_fk` (23503) |
| `trail_edges`: edge spanning two Users' Stops | `trail_edges_to_owner_fk` (23503) |
| `trail_edges`: self-loop | `trail_edges_no_self_loop` (23514) |
| `items`: `type = 'podcast'` | `items_type_check` (23514) |
| `items`: `status = 'halfway'` | `items_status_check` (23514) |

Deleting a Stop cascaded its `stop_items` and `trail_edges` rows to zero, as today.

## Constraint naming differs, and mostly does not matter

Drizzle names anything you do not name yourself, and its conventions differ from Postgres's
defaults. **Every constraint we name explicitly keeps its exact current name** — the
composite tenancy keys (`stop_items_stop_owner_fk`, `item_labels_item_owner_fk`,
`stops_trail_owner_fk`, `trail_edges_from_trail_fk`, …), both `items` CHECKs, and every
single-column `*_pkey`. What changes:

| Today (Postgres default) | Drizzle |
| --- | --- |
| `stop_items_pkey` (composite PK) | `stop_items_stop_id_item_id_pk` |
| `trail_edges_pkey` (composite PK) | `trail_edges_user_id_from_stop_id_to_stop_id_pk` |
| `items_user_id_fkey` (single-col FK) | `items_user_id_users_id_fk` |
| `users_clerk_user_id_key` (unique) | `users_clerk_user_id_unique` |
| `trail_edges_check` (anonymous CHECK) | whatever you name it — named `trail_edges_no_self_loop` here |

Since existing data is disposable and `0000` is generated against an empty database, these are
free — nothing has to match anything. Worth knowing only because error messages and any test
asserting on `err.constraint` will change. The anonymous `CHECK (from_stop_id <> to_stop_id)`
becoming a *named* constraint is a small improvement: `trail_edges_check` tells you nothing.

## Surrounding fit: ESM, pnpm workspace, tsx, tsup

Verified in a scratch workspace mirroring this repo's setup — root `pnpm-workspace.yaml` with
`apps/*` + `packages/*`, `"type": "module"` everywhere, the same `tsconfig.base.json`
(`moduleResolution: "Bundler"`, `verbatimModuleSyntax`), a `workspace:*` dependency on
`@unshelf/shared`, `tsx` for dev and `tsup --format esm` for the build.

Everything works, with **one fit problem worth knowing before the conversion ticket starts**:

### `drizzle-kit` cannot import `@unshelf/shared` as it is currently exported

Importing `ITEM_TYPES` / `ITEM_STATUSES` into the Drizzle schema — the obvious way to stop the
`CHECK`s from duplicating the shared enums — fails:

```
Error [ERR_PACKAGE_PATH_NOT_EXPORTED]: No "exports" main defined in …/@unshelf/shared/package.json
    at packageExportsResolve (node:internal/modules/esm/resolve)
    at resolveExports (node:internal/modules/cjs/loader)
```

`drizzle-kit` bundles the schema file through a **CJS** resolver, and `packages/shared`'s
`exports` map declares only `types` and `import` conditions — no `require`, no `default` — so
resolution finds nothing. This is a property of `drizzle-kit`'s loader, not of ESM or of pnpm.

Fix: add a `default` condition alongside `import` in `packages/shared/package.json`.

```jsonc
"exports": {
  ".": {
    "types": "./dist/index.d.ts",
    "import": "./dist/index.js",
    "default": "./dist/index.js"   // drizzle-kit resolves the schema's imports as CJS
  }
}
```

It points at the same ESM file, so nothing about how `apps/web` or `apps/api` consume the
package changes. The alternative — not importing `@unshelf/shared` from the schema and inlining
the enum literals — works too but throws away the main reason to want the import.

**Consequence for the build graph:** `drizzle-kit generate` reads `packages/shared/dist`, so it
requires the shared package to be **built first**. Confirmed by deleting `dist` and re-running:
`Error: Cannot find module …/@unshelf/shared/dist/index.js`. In Turborepo terms the generate
task needs `dependsOn: ["^build"]`.

The payoff is real. With the import in place, adding a value to `ITEM_TYPES` in
`packages/shared` and re-running `generate` produces the migration on its own:

```sql
ALTER TABLE "items" DROP CONSTRAINT "items_type_check";--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_type_check" CHECK ("items"."type" in ('article', 'video', 'playlist', 'course', 'book', 'podcast', 'other'));
```

Today that is a hand edit to a 337-line string that re-runs on every boot.

### The rest of the toolchain

- **`tsx`** runs the schema, the config, and `drizzle-kit generate` with no loader flags.
- **`tsup --format esm`** bundles a server that imports `drizzle-orm`, the schema, and the
  migrator into a 10.5 KB ESM file; `node dist/server.js` runs it and migrates a fresh database.
  Note the `drizzle/` SQL folder is a **runtime asset** the bundler does not inline — it has to
  ship with the build. That is a deployment detail for the migration-execution ticket.
- **`drizzle-kit check`** passes; a second `generate` with no schema change correctly reports
  "No schema changes, nothing to migrate".
- **`drizzle-orm/node-postgres/migrator`** applies the folder in journal order and records into
  `drizzle.__drizzle_migrations` — the path a testcontainers fixture would use in place of
  `applySchema(pool)`.
- **The load-bearing raw SQL still works** through the Drizzle handle:
  `db.execute(sql\`WITH RECURSIVE …\`)` for the DAG walk, and
  `pg_advisory_xact_lock` inside `db.transaction(async (tx) => …)`.

### One thing to carry into the conversion: `text()` does not narrow

`text("type")` types as `string`, so `type: "podcast"` compiles fine and only fails at runtime
against the CHECK. Use the enum option to narrow it:

```ts
type: text("type", { enum: ITEM_TYPES }).notNull(),
```

Verified: this narrows the TypeScript type to the union **and leaves the generated DDL
byte-identical** — still a plain `text` column plus the explicit `CHECK`, not a Postgres enum
type. Both are worth having; they catch different mistakes at different times.

## Method and environment

- `drizzle-orm@0.45.2`, `drizzle-kit@0.31.10`, `pg@8.22.0`, `tsx@4.23.1`, `tsup@8.5.1`,
  `typescript@5.9.3`, Node 23.10.0, pnpm 11.12.0, PostgreSQL 16.14 in Docker. The v1 comparison
  used `drizzle-orm@1.0.0-rc.4` / `drizzle-kit@1.0.0-rc.4` in a separate workspace.
- Reference database `today` built by applying the real `SCHEMA_SQL` (imported directly from
  `apps/api/src/schema.ts`, unmodified) to an empty database.
- Candidate databases built by applying `drizzle-kit generate`'s output to empty databases.
- Compared by querying `pg_attribute`, `pg_constraint` (via `pg_get_constraintdef`) and
  `pg_indexes` in both and diffing the sorted results — both with and without constraint names,
  so naming differences could be separated from structural ones.
- No production code was changed. All scratch work lived outside the repository.

## What this means for the map

Nothing here reopens the ORM choice. The composite tenancy foreign keys — the load-bearing
thing the ticket flagged as a potential deal-breaker — are expressible, generated, applied, and
enforced.

[#106](https://github.com/rajat2006/unshelf/issues/106) (replace `SCHEMA_SQL` with a TypeScript
schema and migration `0000`) should carry forward four concrete decisions:

1. Pin `drizzle-kit@0.31.10`, not the v1 release candidate.
2. Declare composite FK targets with `unique()`, never `uniqueIndex()`.
3. Add a `default` export condition to `packages/shared`, and make the generate task depend on
   `^build`.
4. Use `text(…, { enum: … })` for `type` and `status`, keeping the explicit `check()` alongside.

[#104](https://github.com/rajat2006/unshelf/issues/104) (where migrations run) gains one input:
the generated `drizzle/` folder is a **runtime asset**. `tsup` bundles the TypeScript but not
the `.sql` files, so whatever runs the migrations needs that directory present on the Dokploy
VPS. It also gains one constraint from the recommendation above — pinning 0.31.10 keeps the
folder layout fixed at `drizzle/0000_name.sql` while that decision is being made.
