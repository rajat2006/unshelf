# Safe migration behavior for previews sharing development data

Research date: 2026-08-21

## Question

Can as many as three concurrent, label-gated preview deployments share the
hosted-development PostgreSQL database, let a pull request apply its own
migrations, and later reverse those migrations without separate preview
databases or schemas? What can PostgreSQL, Drizzle, and Unshelf's current
migration code guarantee, and what is the simplest safe policy?

## Verdict

**No: a schema-changing pull request cannot safely apply and later reverse its
migrations on the shared development database while development or other
previews remain live.** PostgreSQL transactions make a *failed, uncommitted*
migration attempt atomic. They do not provide a rewind after a successful
commit. Drizzle 0.45.2 and Unshelf have a forward-only migration ledger, no down
migration protocol, and no isolation between the one shared `public` schema and
the applications using it.

The simplest safe policy is:

1. Allow up to three ordinary previews to share development data only when
   their committed migration history is byte-for-byte identical to the live
   database's history. Run the existing `MIGRATION_MODE=verify`; never run
   `apply` for a preview.
2. Refuse a hosted preview when the pull request changes the Drizzle schema,
   migration SQL, migration journal, or migration machinery relative to the
   current `dev` authority. Test its migrations in Product CI against a
   disposable PostgreSQL database instead.
3. When development successfully applies a new migration, stop every active
   preview first. A preview may be recreated only after its branch contains the
   new canonical migration history and verification passes again.
4. If a hosted review of a schema-dependent feature is essential, prefer a
   backward-compatible precursor migration merged and deployed to `dev` first;
   the later application pull request can then be an ordinary verify-only
   preview. Treat any direct trial of an unmerged migration as an exclusive,
   manual maintenance operation, not as one of the three concurrent previews.
5. Never automate a down migration or selective restore. After an exceptional
   manual trial, either keep the migration and merge/fix forward, or stop all
   users of the database and reset/restore the *whole* disposable
   non-production database, explicitly accepting loss of every write after the
   restore point.

The limit of three previews is therefore a capacity and lifecycle limit, not a
schema-safety mechanism. The unsafe interaction already exists with one preview
and hosted development.

## Facts

### PostgreSQL transactions protect an attempt, not a later reversal

PostgreSQL defines a transaction as an all-or-nothing operation: intermediate
states are not visible to other transactions, and a failure followed by
rollback leaves none of that transaction's updates in the database.[^pg-tx]
Locks taken by a transaction are normally held until the transaction ends.[^pg-locks]

That gives a strong guarantee for ordinary DDL and DML executed in one
transaction. It does **not** create a durable undo record after `COMMIT`. Once a
preview migration commits, development and all previews observe that one new
global schema. A later `ROLLBACK` cannot target an earlier completed
transaction; it only discards changes in the current transaction.[^pg-rollback]

Nor can every PostgreSQL maintenance command be placed in this transaction.
For example, `CREATE INDEX CONCURRENTLY` and `CREATE DATABASE` cannot run inside
a transaction block.[^pg-create-index][^pg-create-database] Unshelf's current
migration corpus uses ordinary transactional DDL/DML and contains none of
those commands, but that remains a review constraint on future migration SQL.

Schema changes can also disrupt the applications sharing the database even
when they succeed. PostgreSQL documents that many forms of `ALTER TABLE` take
`ACCESS EXCLUSIVE`, which conflicts with every table lock mode, including a
normal reader's `ACCESS SHARE`; regular `CREATE INDEX` blocks writers via a
`SHARE` lock.[^pg-locks] A long backfill plus DDL in one migration transaction
can therefore block hosted development and all three previews until it commits
or rolls back.

### Unshelf runs every pending migration and ledger insert in one transaction

Unshelf currently resolves `drizzle-orm` to 0.45.2 and uses its node-postgres
runtime migrator.[^local-package] `MIGRATION_MODE=apply` calls that migrator,
while `verify` calls Unshelf's read-only history verifier.[^local-migrate]

The 0.45.2 PostgreSQL dialect:

- creates the `drizzle` schema and `__drizzle_migrations` table before the
  migration transaction;
- reads only the latest ledger row by `created_at`;
- starts one transaction;
- executes every migration newer than that timestamp and inserts each ledger
  row inside the same transaction; and
- commits only after the whole pending sequence succeeds.[^drizzle-dialect]

The node-postgres session issues `BEGIN`, then `COMMIT` on success or `ROLLBACK`
on an exception.[^drizzle-session] Migration files are split into ordered SQL
statements, and each file's SHA-256 hash and journal timestamp become its
ledger identity.[^drizzle-files] Drizzle's own user documentation describes
`migrate` as reading migration files, fetching the log, selecting unapplied
migrations, applying them, and recording them.[^drizzle-migrate]

For the SQL Unshelf uses today, a failure after migration execution begins
therefore rolls back all newly run business-schema DDL/DML and their ledger
rows. On a database's first failed run, the separately created empty `drizzle`
schema and ledger table may remain; that is bootstrap metadata, not a partially
applied application migration. A connection loss also aborts the open
PostgreSQL transaction.

The current PostgreSQL 18 integration test proves the complete committed
history applies to a fresh database, the API becomes healthy, `verify` makes no
schema changes, and a missing ledger row makes verification fail.[^local-test]
This is useful evidence for the current history. It does not prove that a new
migration is compatible with real existing development data, old application
code, or a different branch's migration.

### A successful migration is forward-only in both Drizzle and Unshelf

Drizzle 0.45.2's migration model contains ordered SQL, a timestamp, and a hash;
its runtime code has no down-file field or reverse operation.[^drizzle-files]
Unshelf's accepted migration ADR explicitly says there are no down migrations,
and its deployment runbook says failures are fixed forward.[^local-adr-15][^local-deploy]

Unshelf's verifier is stricter than Drizzle's apply path: it compares the
database's *entire* ordered ledger to all committed local migrations by row
count, timestamp, and SHA-256 hash, and fails on any missing, extra, reordered,
or rewritten history.[^local-verifier] That strictness is exactly what makes
`verify` suitable for an ordinary preview. It also makes branch-specific
migrations intentionally incompatible with one shared ledger.

Deleting a ledger row does not reverse its SQL. Running hand-authored inverse
SQL and then deleting the row would make the database *look* older to Drizzle,
but it is not a reliable down protocol:

- no unique constraint on ledger hash or timestamp represents an applied/down
  state;
- the next apply uses only the latest timestamp, not the full set of hashes;
- every other live application may depend on the schema being removed; and
- the next `verify` rejects any ledger that differs from that branch's complete
  committed history.

A new committed forward migration may intentionally undo an earlier schema
choice. That is a normal fix-forward change applied to every environment; it is
not temporary preview teardown and it still has to define what happens to data
written under the intervening schema.

### Real Unshelf migrations demonstrate why generic down migrations lose data

The committed history is not a sequence of harmless table additions. It
contains data backfills, table and column renames, constraint and index drops,
trigger/function removal, and a current migration that drops
`items.activity_at` outright.[^local-migrations]

PostgreSQL can transactionally roll back `DROP COLUMN` *before the transaction
commits*. After commit, an inverse `ADD COLUMN activity_at ...` can recreate a
column name and type, but it cannot reconstruct the values that were dropped.
The same problem applies to destructive `UPDATE`, `DELETE`, `TRUNCATE`, lossy
type conversion, or data written by preview code into a new representation.
Even an apparently additive migration becomes destructive to reverse once any
preview or development request writes meaningful values into the new column or
table.

Therefore no general automation can infer a correct down migration from the up
SQL. Reversibility is a data-semantic decision specific to one change, and in a
shared database it additionally requires knowing which writes came from which
of four concurrently running application revisions. The database has no such
provenance.

### Concurrent preview migrators have no safe ordering

Drizzle 0.45.2 reads the latest ledger row *before* opening its migration
transaction and takes no advisory lock or migration-table lock around that
read/apply sequence.[^drizzle-dialect] PostgreSQL's ordinary DDL locks can make
individual statements wait, but they do not turn two divergent migration
histories into one canonical order.

Two illustrative races follow directly from the source:

1. Two runners can both read the same old ledger tip. One applies pull request
   A's migration while the other waits and then applies pull request B's
   different migration. If the SQL happens not to conflict, the shared database
   can commit a union of histories that belongs to neither branch; if it does
   conflict, one deployment fails. Either result is unsuitable for automatic
   previews.
2. If A commits a higher journal timestamp before B starts, B can treat its own
   lower-timestamp migration as already passed and skip it, because 0.45.2 asks
   only whether the latest database timestamp is lower than the local
   migration's timestamp. `apply` does not then perform Unshelf's full hash
   verification. B can report migration success while its required SQL never
   ran.

Even two concurrent runs of the *same* migration are not a supported
coordination primitive: both can read the old tip, and the ledger schema has no
uniqueness constraint on hash or timestamp. Strict DDL will usually make the
loser fail after the winner commits; permissive SQL can instead record duplicate
history. A GitHub Actions concurrency group could serialize migrators, but
serialization cannot make migrations from unrelated branches mutually
compatible and cannot reverse the winning branch later.

### A verify-only preview can still become stale after it starts

At deployment time, Unshelf's verifier reliably proves one narrow fact: the
preview image contains exactly the same committed migration files as the
database ledger at that instant. It uses only `SELECT`, and the PostgreSQL 18
test confirms it leaves schema shape unchanged.[^local-verifier][^local-test]

There are two time-of-check issues to handle outside the verifier:

- If development commits a migration while preview verification is running,
  verification can read the old ledger and pass immediately before the new
  schema commits.
- A preview that was valid yesterday remains running after a later development
  migration; nothing continuously re-verifies or proves that its older code is
  compatible with the new schema.

Serializing development apply and preview verify in one non-production database
concurrency group closes the first race. It does not close the second. The
simplest deterministic rule is to tear down all active previews before any
development deployment that advances the migration ledger. Labelled previews
must update to the new `dev` migration history before they can be recreated.

An expand/contract compatibility discipline could keep old revisions alive
across some additive migrations, but PostgreSQL and Drizzle cannot prove that
application-level compatibility automatically. Making that the baseline would
replace a simple teardown rule with a versioned compatibility policy and is not
justified for this redesign.

### Backup or reset is whole-database recovery, not preview cleanup

`pg_dump` can capture an internally consistent snapshot while normal readers
and writers continue, although it conflicts with operations that need exclusive
locks such as many `ALTER TABLE` forms.[^pg-dump] A restore can be wrapped in
one transaction, and `pg_restore --clean` explicitly drops the objects it will
restore; with `--create --clean`, it drops and recreates the target database.[^pg-restore]

Those tools can recover a disposable non-production database, but they cannot
selectively rewind one preview. Restoring a snapshot from before preview A also
removes every legitimate development write and every write from previews B and
C after that snapshot. A provider point-in-time restore has the same global
timeline problem. Restoring selected tables is not a generic answer either:
PostgreSQL warns that a selected-table restore does not restore all dependent
objects and is not guaranteed to succeed into a clean database.[^pg-restore]

Automatic reset is therefore unsafe while any application remains live. A full
reset/recreate can be the simplest *manual* recovery only when non-production
data is explicitly disposable, all writers are stopped, the target is checked,
and the operator accepts the loss boundary. A backup is still valuable before
an exceptional migration trial, but its presence does not make automatic down
migration safe.

### Shared data has a separate interference risk

Even with identical schema history, development and three preview APIs can read
and write the same User-owned rows. Migration verification does not isolate test
data, attribute writes to a preview, or stop a feature bug from modifying shared
development data. Separate roles would not solve branch-specific schema
divergence unless they were paired with separate schemas/databases; a common
read-only preview application role would change what product behavior can be
tested.

This memo accepts the map's decision to share non-production data and no
per-preview database. The remaining data-interference risk should be stated in
the preview contract rather than mistaken for a guarantee supplied by
`MIGRATION_MODE=verify`.

## Recommendation in operational form

### Ordinary hosted preview

A labelled pull request is eligible only when all of these hold:

- Product CI passed for the exact revision.
- A trusted workflow check finds no change relative to current `dev` in
  `apps/api/src/schema.ts`, `apps/api/drizzle/**`, `apps/api/drizzle.config.ts`,
  `apps/api/src/migrate.ts`, or `apps/api/src/migration-verifier.ts`. A Drizzle
  runtime dependency change also requires explicit migration review. Treat this
  as an early, understandable refusal, not the final authority.
- The one-shot `migrate` service runs `MIGRATION_MODE=verify` and its exact
  full-history comparison succeeds immediately before API startup.
- No development schema migration can start concurrently with verification.

The exact ledger verification remains authoritative because path checks cannot
prove database state. Conversely, ledger verification alone does not detect a
changed TypeScript schema with no generated migration; Product CI currently
runs build, type-check, lint, and tests but does not regenerate migrations and
fail on a dirty diff.[^local-ci] The conservative path refusal closes that gap
for hosted previews without adding a new schema-diff engine.

### Development migration

Before a scheduled or manual development deployment whose migration manifest
differs from the live ledger:

1. acquire the same non-production database deployment concurrency group used
   by preview verification;
2. stop all active previews;
3. apply the canonical `dev` history once;
4. start and health-check development; and
5. allow previews to be recreated only from revisions whose verifier now
   matches that history.

This can be expressed in GitHub Actions and Dokploy lifecycle steps. It does not
require a custom control plane. What it cannot do reliably is decide that an
old preview is compatible enough to leave running.

### Schema-changing pull request

The default response should be a clear hosted-preview refusal with Product CI
as the migration test surface. The existing integration test already applies
the complete history on PostgreSQL 18; a schema change that transforms existing
rows should add a targeted migration test that seeds the pre-migration shape
and representative data before applying the new file.[^local-test]

For visual or behavioral hosted review, split the work where practical:

1. merge a backward-compatible schema expansion to `dev`;
2. let scheduled/manual development apply it;
3. update the feature branch to that canonical history; and
4. create an ordinary verify-only preview for the application change.

Destructive contraction follows later, after no deployed revision needs the
old shape. This is deliberate forward evolution, not automatic rollback.

### Exceptional manual trial

If an unmerged schema must be exercised on the shared hosted database, use a
human-approved maintenance procedure:

1. stop development and every preview; disable scheduled/manual non-production
   deployment starts;
2. verify the exact database and establish a tested backup/reset point;
3. apply the exact pull-request migration once and run the trial exclusively;
4. if accepted, merge/fix forward promptly so `dev` owns the same history;
5. if rejected, stop the trial and restore/recreate the whole database, stating
   exactly which post-snapshot writes are lost; and
6. redeploy development, then re-enable verify-only previews.

Do not expose this as a routine label action. It suspends the shared environment
and has a whole-database loss boundary, so calling it an automatic preview would
hide the material operator decision.

## Automation boundary

| Reliably automatable | Not reliably automatable |
| --- | --- |
| Compare complete local migration timestamps/hashes to the ledger and fail closed. | Infer that arbitrary up SQL has a data-preserving inverse. |
| Refuse changed migration/schema paths before provisioning a hosted preview. | Attribute or undo only the rows written by one preview in a shared database. |
| Run committed migrations and targeted data transformations in disposable PostgreSQL during CI. | Combine or order migrations from concurrent branches into a canonical history. |
| Serialize development apply and preview verify operations. | Prove old application code remains compatible after an arbitrary new migration. |
| Tear down all previews before canonical development history advances. | Restore a pre-preview snapshot without losing other post-snapshot writes. |
| Reset the whole database after explicit human confirmation that the data is disposable. | Treat a backup, ledger-row deletion, or generated down file as safe routine preview cleanup. |

## Sources

[^pg-tx]: PostgreSQL 18, [Transactions](https://www.postgresql.org/docs/18/tutorial-transactions.html), especially atomicity, visibility, `BEGIN`/`COMMIT`, and rollback.
[^pg-rollback]: PostgreSQL 18, [`ROLLBACK`](https://www.postgresql.org/docs/18/sql-rollback.html), which discards updates made by the current transaction.
[^pg-locks]: PostgreSQL 18, [Explicit locking](https://www.postgresql.org/docs/18/explicit-locking.html), including automatic table lock modes and transaction-duration locks.
[^pg-create-index]: PostgreSQL 18, [`CREATE INDEX`](https://www.postgresql.org/docs/18/sql-createindex.html#SQL-CREATEINDEX-CONCURRENTLY), which states that `CREATE INDEX CONCURRENTLY` cannot run in a transaction block.
[^pg-create-database]: PostgreSQL 18, [`CREATE DATABASE`](https://www.postgresql.org/docs/18/sql-createdatabase.html#SQL-CREATEDATABASE-NOTES), which cannot run in a transaction block.
[^pg-dump]: PostgreSQL 18, [`pg_dump`](https://www.postgresql.org/docs/18/app-pgdump.html) and [SQL Dump](https://www.postgresql.org/docs/18/backup-dump.html), including snapshot consistency and lock interaction.
[^pg-restore]: PostgreSQL 18, [`pg_restore`](https://www.postgresql.org/docs/18/app-pgrestore.html), especially `--clean`, `--create`, selected-table limitations, and `--single-transaction`.
[^drizzle-migrate]: Drizzle, [`drizzle-kit migrate`](https://orm.drizzle.team/docs/drizzle-kit-migrate), including the migration-log workflow.
[^drizzle-dialect]: Drizzle ORM 0.45.2 source, [`PgDialect.migrate`](https://github.com/drizzle-team/drizzle-orm/blob/273c78071d4841b497f5144734b38294df7ec64b/drizzle-orm/src/pg-core/dialect.ts#L48-L87).
[^drizzle-session]: Drizzle ORM 0.45.2 source, [node-postgres transaction implementation](https://github.com/drizzle-team/drizzle-orm/blob/273c78071d4841b497f5144734b38294df7ec64b/drizzle-orm/src/node-postgres/session.ts#L183-L204).
[^drizzle-files]: Drizzle ORM 0.45.2 source, [`MigrationMeta` and `readMigrationFiles`](https://github.com/drizzle-team/drizzle-orm/blob/273c78071d4841b497f5144734b38294df7ec64b/drizzle-orm/src/migrator.ts#L22-L59).
[^local-package]: Unshelf source, [`apps/api/package.json`](../../apps/api/package.json) and [`pnpm-lock.yaml`](../../pnpm-lock.yaml), resolving `drizzle-orm` 0.45.2.
[^local-migrate]: Unshelf source, [`apps/api/src/migrate.ts`](../../apps/api/src/migrate.ts), selecting `apply` or `verify`.
[^local-verifier]: Unshelf source, [`apps/api/src/migration-verifier.ts`](../../apps/api/src/migration-verifier.ts), full ordered timestamp/hash comparison.
[^local-test]: Unshelf source, [`apps/api/test/migrate.test.ts`](../../apps/api/test/migrate.test.ts), PostgreSQL 18 apply/verify coverage.
[^local-migrations]: Unshelf source, [`apps/api/drizzle/`](../../apps/api/drizzle/), particularly [`0002_perpetual_red_ghost.sql`](../../apps/api/drizzle/0002_perpetual_red_ghost.sql), [`0013_oval_kronos.sql`](../../apps/api/drizzle/0013_oval_kronos.sql), and [`0015_dizzy_doctor_doom.sql`](../../apps/api/drizzle/0015_dizzy_doctor_doom.sql).
[^local-adr-15]: Unshelf [ADR-0015](../adr/0015-drizzle-owns-the-api-schema-and-migrations.md), committing to generated forward migrations and no down migrations.
[^local-deploy]: Unshelf [ADR-0017](../adr/0017-ci-images-and-managed-postgresql.md) and [deployment runbook](../deploy.md), defining transactional `apply`, read-only `verify`, and fix-forward failure handling.
[^local-ci]: Unshelf source, [Product CI workflow](../../.github/workflows/ci.yml) and root [`package.json`](../../package.json).
