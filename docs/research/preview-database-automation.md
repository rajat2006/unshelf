# Preview database automation for ordinary and schema-changing PRs

Research date: 2026-08-01

## Question

How should the chosen Dokploy topology automate the agreed preview database
policy: shared hosted-development data for ordinary PRs, but an isolated clone for
PRs that change the Drizzle schema or migration history? The design also needs to
cover detection, roles, cloning, migrations, connection injection, recreation,
concurrency, failure handling, immediate teardown, and hard boundaries around
production and reverse data flow.

## Recommendation

Use a single trusted preview reconciler, serialized across all preview events. It
classifies the current PR head without secrets, revalidates the result in a
privileged workflow, and then converges one Dokploy Compose resource per admitted
PR:

| PR mode | Database | Migration behavior | Teardown |
| --- | --- | --- | --- |
| Ordinary | Shared hosted-development database, through a dedicated low-privilege preview role | Verify the deployed development migration ledger; never run DDL | Delete the PR Compose resource only |
| Schema-changing | Fresh logical database cloned from hosted development, with one unique owner/login role per generation | Run the candidate's appended migrations on the clone before starting the API | Delete Compose first, force-drop the logical database, then drop its role |

The missing platform primitive is logical-database lifecycle management. Dokploy
v0.29.13 can manage a PostgreSQL *service* and can execute a command inside a
Compose service, but it cannot create, clone, migrate, or destroy logical
databases and roles inside an existing service.[^dokploy-postgres-api]
[^dokploy-schedule-api] Bridge that gap with one persistent, private
`preview-db-operator` Compose service on the non-production database network. A
trusted GitHub workflow invokes a fixed script in that container through a
short-lived disabled Dokploy schedule. The operator contains compatible
PostgreSQL clients and has the only preview-provisioner credential. It has no
ingress, published port, Docker socket, production network, or application
source checkout.

This is custom automation, but it stays inside the chosen Dokploy and Compose
topology. It does not require SSH access to the host or exposure of PostgreSQL to
the internet.

## Fixed constraints

This design assumes the decisions already made by the parent deployment map:

- `dev` is the default branch. Only open, non-draft, same-repository PRs targeting
  `dev` are eligible for deployed previews. Fork PRs get secret-free CI only.
- Preview, hosted development, and production build independently. A preview is
  identified by an immutable API digest and web digest; migrate and API use the
  exact same API image.
- Dokploy runs all three environments as Compose resources. Production and
  non-production PostgreSQL are distinct Dokploy services outside application
  Compose.
- One preview exists per admitted PR, with at most three live previews.
- The deployment dependency chain remains `migrate -> API -> web`, followed by
  health checks. Failed preview changes are fixed forward.
- GitHub and Dokploy production credentials are separate from non-production
  credentials. PR-triggered code never receives either.

## Exact schema and migration change detection

Detection must compare the candidate to the *current `dev` migration history*,
not merely look for changed filenames in a pull request.

Drizzle Kit `generate` compares the declared schema to its latest snapshot and
writes migration artifacts.[^drizzle-generate] `drizzle-kit check` detects
migration-history inconsistencies and collisions; it is not a substitute for
checking whether generated artifacts are current with schema source.[^drizzle-check]
The repository must therefore use all of the following checks in unprivileged PR
CI:

1. Fetch the current `dev` migration directory and compare it with the candidate.
   Every current `dev` journal entry, referenced SQL file, and snapshot must be a
   byte-identical ordered prefix of the candidate history. Reject deletion,
   editing, renaming, or reordering of applied/base history. New journal entries
   must only append, with monotonic timestamps.
2. At the repository root, run `pnpm db:generate`, because the schema imports the
   built shared package. Require `apps/api/drizzle/**` to remain completely clean,
   including untracked files. This proves the committed artifacts match the
   candidate schema source.
3. Run Drizzle Kit's migration-history check as an additional collision and
   consistency check.
4. Classify the PR as schema-changing if the validated candidate adds any
   migration journal entry or artifact after the `dev` prefix. This includes a
   manually authored appended migration. Otherwise classify it as ordinary.
5. Hash the sorted canonical paths and bytes of the entire validated
   `apps/api/drizzle/**` tree. Record the SHA-256 result as `migrationRevision`.

Do not classify from a path filter alone. GitHub's pull-request-files endpoint is
limited to 3,000 files, so an incomplete or uncertain file list must fail closed
instead of silently classifying a PR as ordinary.[^github-pr-files]

The privileged preview reconciler must independently fetch trusted metadata and
revalidate that the PR is still open, same-repository, non-draft, based on `dev`,
and at the exact head SHA whose full CI and images succeeded. It must never
checkout or execute PR-controlled code, scripts, workflow artifacts, Compose
text, or commands. `workflow_run` and `pull_request_target` are privileged
contexts whose use with untrusted checkout is a known security hazard.[^github-actions-security]
It fetches the candidate migration journal, SQL, and snapshots through GitHub's
contents API strictly as data, repeats the prefix/classification/hash checks, and
uses the required CI conclusion as the evidence that generation was clean; it
does not accept a PR-supplied `mode` or `migrationRevision` at face value.

Before cloning, the reconciler also verifies that the hosted-development Drizzle
ledger is exactly the successfully deployed `dev` ledger: its ordered
`(created_at, hash)` values must equal hashes calculated from the expected SQL
files. A schema PR whose base is behind the deployed `dev` migration prefix must
rebase or merge `dev` before it can receive a preview.

This extra ledger check matters because Drizzle ORM 0.45.2 calculates and stores
migration hashes but its PostgreSQL migrator selects only the newest
`created_at`, then applies journal migrations with a later timestamp. It does not
recompare hashes for already-applied rows.[^drizzle-migrator-source]
[^drizzle-pg-dialect-source] Without the repository's immutable-prefix rule, an
edited historical SQL file could appear valid to the runtime migrator while the
database still contains the old effects.

## Database and role model

### Ordinary previews

All ordinary previews use the hosted-development logical database through one
dedicated role such as `unshelf_dev_preview_app`. The role has the application
DML and sequence privileges it needs, but is not the development database owner
and cannot create databases or roles. Ordinary preview containers receive only
this application's `DATABASE_URL`.

The ordinary preview's migrate dependency is a **verification-only** execution
of the same API image. It checks that the hosted-development ledger equals the
expected deployed `dev` ledger and exits successfully without DDL. If it sees a
pending or divergent migration, deployment fails; it must not mutate the shared
database and must not fall back to another mode.

Sharing development data means ordinary preview writes are intentionally visible
to hosted development. There is no later “merge” operation; teardown leaves the
shared database untouched.

### Isolated schema previews

For each isolated generation derive bounded identifiers from the validated
decimal PR number and first 12 hexadecimal characters of `migrationRevision`,
for example:

- database: `unshelf_pr_245_a1b2c3d4e5f6`
- owner/login role: `unshelf_pr_245_a1b2c3d4e5f6`

Validate every input before invoking the operator, keep identifiers under
PostgreSQL's 63-byte limit, and pass identifiers and literals to `psql` as
variables rather than concatenating untrusted SQL.

The unique role owns the disposable database and all restored objects. Both the
migrate container and API use it. It is `NOSUPERUSER NOCREATEDB NOCREATEROLE
NOREPLICATION NOBYPASSRLS` and receives `CONNECT` only to its own preview
database. Revoke `PUBLIC CONNECT, TEMP` on non-production databases, including
hosted development, every preview, and the maintenance database. PostgreSQL
roles are cluster-wide, and databases otherwise grant `PUBLIC` connection and
temporary-table privileges by default.[^postgres-privileges] Using one role lets
the PR's migration create and alter its own objects without granting the role any
cluster-wide administrative capability. Because the database is disposable and
never promoted, a separate application/migration split adds lifecycle and grant
complexity without establishing another required trust boundary.

The operator uses one non-production-only provisioner role with the minimum
cluster privileges needed to create and drop logical databases and roles. In a
standard PostgreSQL service that means `LOGIN CREATEDB CREATEROLE`, but still
`NOSUPERUSER NOREPLICATION NOBYPASSRLS`.[^postgres-role-attributes] Its power is
contained by the physically separate non-production cluster, private network,
fixed operator script, and lack of production credentials.

Grant that provisioner `CONNECT` plus read access to the hosted-development
application schemas, tables, and sequences (including matching default
privileges for new objects), because `CREATEDB` and `CREATEROLE` do not authorize
the source-data reads required by `pg_dump`. When it creates a generation role,
the provisioner retains `SET` membership in that role so it can restore objects
as their intended owner and later drop the database as that owner. The membership
direction never gives the generation role any provisioner privilege.

The isolated preview Compose environment gets one generated `DATABASE_URL` for
this unique role. Both migrate and API consume it, as the current image already
expects. API and migrate still run from the exact same image.

## Online clone and migration procedure

Do not use `CREATE DATABASE ... TEMPLATE hosted_dev`. PostgreSQL requires that no
other session be connected to the source template, which is incompatible with a
live development API and connection pool.[^postgres-create-database]

The operator should instead perform this transaction-like sequence:

1. Verify the requested PR and revision, exact allowlisted non-production host,
   expected development ledger, and absence of conflicting live resources.
2. Create a fresh random, URI-safe password for the generation role. The
   controller may generate it, but it must never appear in a schedule command or
   logs.
3. Run `pg_dump --format=custom` against hosted development into a memory-backed
   temporary location. A PostgreSQL dump is consistent even while other clients
   read and write and does not block normal access.[^postgres-pgdump] Use a client
   major version compatible with and not older than the server.
4. Create the target database from `template0`, owned by the generation role.
   Restore using `pg_restore --no-owner --no-acl --single-transaction` while
   authenticated as that role, or with `--role=<generation-role>` from the
   provisioner.[^postgres-pgrestore] `--single-transaction` prevents a partially
   restored clone and implies exit on restore error. Delete the archive
   immediately in a `finally` path.
5. Inject the generated `DATABASE_URL` into the trusted PR Compose resource and
   deploy it. Its fixed dependency graph runs the candidate migrate image first;
   only a successful migration allows API and then web to start. Complete the
   health checks before treating the generation as current.

`pg_dump` archives contain SQL derived from the source database and should only
be restored from a trusted source. Here the source is the controlled hosted-
development database, not a preview database or PR-provided archive.

An application-only update to an already isolated PR reuses its database if
`migrationRevision` is unchanged. Any change to migration artifacts creates a
fresh generation from the latest verified hosted-development database; never
apply edited migration history over the previous generation. The reconciler
deletes the stopped old generation after the replacement is healthy. If the new
generation fails, it is cleaned up and the PR remains visibly failed; this is
not an automatic rollback or promotion of the older build.

## Dokploy operator invocation without leaking secrets

Dokploy's schedule API can create a disabled Compose schedule, run it manually,
report a deployment result, and delete it.[^dokploy-schedule-api]
In v0.29.13, a Compose schedule executes a shell command inside a named service
container. However, the implementation logs a literal command of the form
`docker exec … sh -c <command>` before execution.[^dokploy-schedule-source]
Therefore **no generated password, connection URL, or other secret may be passed
in `schedule.command`**, even with shell quoting.

Use this constrained bridge instead:

1. Acquire the global preview-controller lock.
2. Generate passwords from an unreserved, shell- and URI-safe alphabet.
3. Temporarily update and redeploy the operator Compose service with the
   per-operation secret in its environment. Its long-lived provisioner URL is an
   environment-level Dokploy secret available only to this service.
4. Create a disabled schedule whose command contains only a fixed script path,
   fixed action, validated decimal PR number, and lowercase 64-character hex
   revision. No free-form command is accepted.
5. Run it manually, await and verify the associated deployment result, then
   delete the schedule in `finally`.
6. Clear the per-operation environment secret and redeploy the operator in the
   same `finally` path. The script uses `set +x` and never prints secrets.

All controller mutations are serialized because the operator temporarily holds
one operation's secret. The simpler and preferable later improvement is a
dedicated authenticated job API or first-class Dokploy exec secret input; until
one exists, this schedule bridge must be treated as security-sensitive custom
automation.

## Reconciler lifecycle

### 1. Observe and classify

Unprivileged `pull_request` CI validates migration history, runs root generation
and Drizzle checks, and publishes only non-secret facts for the exact head SHA.
After full CI and image publication, a trusted `workflow_run` reconciler fetches
the facts independently and repeats eligibility and SHA/digest validation.

PR closure uses a minimal base-branch `pull_request_target` `closed` workflow, or
an equivalent trusted repository event, which only passes the PR number to the
reconciler and never checks out PR code.

### 2. Admit up to three

Use one global GitHub Actions concurrency group with `cancel-in-progress: false`.
GitHub retains at most one running and one pending member of a concurrency group;
a newly queued run replaces the older pending run.[^github-concurrency] Do not
depend on receiving every lifecycle event. Every surviving run performs a full
reconciliation from current GitHub and Dokploy state, so coalesced events still
converge, and the periodic watchdog repairs a missed final run. The reconciler
first removes invalid previews, retains valid existing ones, then fills available
slots up to three with the oldest eligible waiting PRs. A closed or merged PR
frees its slot on the next reconciliation, normally the run triggered by that
close event, and the same reconciliation admits the next waiter.

Each Compose resource records non-secret metadata: PR number, head SHA, API and
web digests, mode, and `migrationRevision`. Names are deterministic by PR; no
password is stored in labels or controller logs.

### 3. Provision and deploy

For an ordinary PR, inject the shared low-privilege hosted-development URL, run
the verification-only migration gate, deploy the digest-pinned API and web, and
health-check the generated HTTPS origin.

For a schema PR, invoke the operator to create its role, clone, and grant access;
inject the owner URL into the trusted Compose resource; deploy its fixed real
`migrate -> API -> web` graph; and health-check. A classification, prefix,
ledger, clone, restore, migration, or injection uncertainty fails closed. A
schema PR must never be downgraded to the shared database.

### 4. Update

For any new head SHA, revalidate eligibility, CI, digests, and classification.
Ordinary resources redeploy against the same shared URL. Isolated resources
reuse their current database only when `migrationRevision` is identical;
otherwise they receive a new clone generation.

### 5. Tear down immediately

On close, merge, loss of eligibility, or explicit replacement, first stop and
delete the PR Compose resource so no connection can be recreated. Ordinary mode
ends there. For isolated mode, connect through a maintenance database and run
`DROP DATABASE ... WITH (FORCE)`, then drop the generation role.[^postgres-drop-database]
Force-drop can still fail for conditions such as prepared transactions or
replication objects, so cleanup is idempotent and retried by reconciliation.
Never reuse an orphaned database.

### 6. Reconcile drift

Run the reconciler both on lifecycle events and on a periodic schedule. The
watchdog inventories open eligible PRs, Dokploy Compose resources, temporary
schedules, logical preview databases, and preview roles. It deletes orphaned
application resources before data resources, retries failed cleanup, clears
stale operator secrets, and fills newly free preview slots. Desired state comes
from current GitHub PR and check state, not from an untrusted PR artifact.

## Failure policy

- **Classification or ledger failure:** no deployment and no shared-database
  fallback. Report the exact validation category without database credentials.
- **Role, dump, restore, or grant failure:** do not deploy application Compose.
  Delete the temporary archive, target database, and generation role in reverse
  order. Reconciliation retries any incomplete cleanup.
- **Migration, deployment, or health failure:** preserve sanitized Dokploy status
  and log pointers, stop/delete the failed preview, and destroy the new isolated
  generation. The next commit fixes forward.
- **Teardown failure:** application Compose remains stopped/deleted, so it cannot
  reconnect. Mark teardown incomplete, retain only non-secret resource identity,
  and retry. The failed orphan does not count as reusable state, though it should
  continue to consume capacity until cleanup succeeds so leaks cannot accumulate.
- **Lost or duplicated event:** deterministic naming and idempotent operations
  converge safely. The periodic reconciler repairs missed events.
- **Operator secret-clear failure:** quarantine the operator, block further
  provisioning, and alert. Do not run another operation until the temporary
  environment value has been removed and the service redeployed.

## Production and reverse-flow safeguards

Production isolation is structural, not a naming convention:

- Production and non-production use physically separate PostgreSQL services,
  external Docker networks, Dokploy projects/API keys, GitHub environments, and
  credentials.
- Preview Compose and the database operator attach only to the non-production
  database overlay. The production database hostname is not resolvable or
  routable from them, and no production URL or secret exists in the
  non-production GitHub/Dokploy scopes.
- The operator validates the exact non-production database host and TLS policy
  before any action. It refuses unexpected URLs, databases outside the preview
  naming grammar, and roles outside its derived naming grammar.
- Trusted Compose text comes from `dev`; PR-controlled data is limited to verified
  image digests and tightly validated scalar identifiers.
- The operator exposes only `development -> preview` clone and preview-destroy
  actions. It has no preview-dump, preview-to-development restore, database rename,
  or reverse-copy action.
- Isolated generation roles have no `CONNECT` on hosted development. Ordinary
  previews have only the intentionally shared application access and never
  receive a database-owner credential.
- No preview artifact is promoted and no preview writes are merged into
  development. Ordinary preview writes already occur directly in the shared
  development database; isolated preview data is destroyed.

Together, these controls make an accidental production connection impossible
without breaching several independent boundaries, while the controller's
fail-closed classification prevents a schema-changing PR from ever reaching the
shared hosted-development database.

## Implementation boundary

The deployment work can be split cleanly into these deliverables:

1. A secret-free migration classifier/validator producing `mode` and
   `migrationRevision` for an exact PR head.
2. A shared image migration entrypoint supporting real and verification-only
   modes without giving ordinary previews a DDL-capable database URL.
3. PostgreSQL bootstrap SQL for shared preview access, provisioner confinement,
   database defaults, and per-generation roles.
4. The fixed `preview-db-operator` script and private Compose service, including
   dump/restore, grants, teardown, input validation, idempotency, and redacted
   structured results.
5. A trusted GitHub reconciler that manages admission, Dokploy Compose resources,
   the schedule bridge, digest injection, health checks, cleanup, and periodic
   drift repair.
6. Failure-path integration tests against PostgreSQL and a Dokploy v0.29.13 test
   instance, especially migration-history edits, concurrent updates, clone
   interruption, close-during-deploy, schedule log redaction, and cleanup retry.

The platform gap is therefore explicit and bounded: Dokploy remains the desired
state and execution surface for Compose, domains, secrets, and deployment logs;
the repository owns logical PostgreSQL lifecycle automation and reconciliation.

## Sources

[^drizzle-generate]: [Drizzle Kit: `generate`](https://orm.drizzle.team/docs/drizzle-kit-generate)
[^drizzle-check]: [Drizzle Kit: `check`](https://orm.drizzle.team/docs/drizzle-kit-check)
[^drizzle-migrator-source]: [Drizzle ORM 0.45.2 migration reader and hash calculation](https://github.com/drizzle-team/drizzle-orm/blob/0.45.2/drizzle-orm/src/migrator.ts)
[^drizzle-pg-dialect-source]: [Drizzle ORM 0.45.2 PostgreSQL migration application](https://github.com/drizzle-team/drizzle-orm/blob/0.45.2/drizzle-orm/src/pg-core/dialect.ts)
[^github-pr-files]: [GitHub REST API: list pull-request files](https://docs.github.com/en/rest/pulls/pulls#list-pull-requests-files)
[^github-actions-security]: [GitHub Actions secure use reference](https://docs.github.com/en/actions/reference/security/secure-use)
[^github-concurrency]: [GitHub Actions workflow concurrency](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency)
[^postgres-create-database]: [PostgreSQL 16: `CREATE DATABASE`](https://www.postgresql.org/docs/16/sql-createdatabase.html)
[^postgres-pgdump]: [PostgreSQL 16: `pg_dump`](https://www.postgresql.org/docs/16/app-pgdump.html)
[^postgres-pgrestore]: [PostgreSQL 16: `pg_restore`](https://www.postgresql.org/docs/16/app-pgrestore.html)
[^postgres-privileges]: [PostgreSQL 16: privileges](https://www.postgresql.org/docs/16/ddl-priv.html)
[^postgres-role-attributes]: [PostgreSQL 16: role attributes](https://www.postgresql.org/docs/16/role-attributes.html)
[^postgres-drop-database]: [PostgreSQL 16: `DROP DATABASE`](https://www.postgresql.org/docs/16/sql-dropdatabase.html)
[^dokploy-postgres-api]: [Dokploy PostgreSQL API reference](https://docs.dokploy.com/docs/api/reference-postgres)
[^dokploy-schedule-api]: [Dokploy schedule API reference](https://docs.dokploy.com/docs/api/reference-schedule)
[^dokploy-schedule-source]: [Dokploy v0.29.13 schedule command execution](https://github.com/Dokploy/dokploy/blob/8b868c66d6672be40b86315a704ea1b3b09cb2d3/packages/server/src/utils/schedules/utils.ts)
