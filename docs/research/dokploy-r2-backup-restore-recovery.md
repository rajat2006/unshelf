# Dokploy R2 backup, restore, and full-VPS recovery

Research date: 2026-08-01

## Question

Using the installed Dokploy version and current primary documentation, what is
the simplest safe procedure for this agreed policy?

- production PostgreSQL: hourly, latest 24 retained;
- hosted-development PostgreSQL: daily, latest seven retained;
- Dokploy control-plane state: daily, latest seven retained;
- one restore into a temporary database during setup;
- visible backup failures and independently detected missing backups; and
- manual, best-effort reconstruction after total VPS loss.

This memo resolves the planning question in [Design R2 backup, restore, and
full-VPS recovery procedure][issue-246]. It does not configure Dokploy, R2, the
VPS, DNS, secrets, or databases.

## Recommendation

Use one private Cloudflare R2 bucket as one Dokploy S3 destination, with one
bucket-scoped **Object Read & Write** credential for Dokploy and separate,
descriptive prefixes for production, development, and control-plane backups.
Cloudflare permits an R2 S3 credential to be restricted to selected buckets;
read/write access is required because Dokploy uploads, lists, reads during
restore, and deletes old objects during retention cleanup.[^r2-auth][^r2-s3]
Keep a separate bucket-scoped **Object Read only** credential in the GitHub
Actions environment used by the independent freshness check.[^r2-auth][^github-env]

Create these three enabled schedules after the production and development
databases have moved to the separate Dokploy-managed PostgreSQL services chosen
by the Wayfinder map:

| Backup | Dokploy surface | Cron (UTC) | Keep latest | Configured prefix |
| --- | --- | ---: | ---: | --- |
| Production PostgreSQL | Production PostgreSQL → Backups | `5 * * * *` | 24 | `unshelf/production-postgres` |
| Hosted development PostgreSQL | Development PostgreSQL → Backups | `20 0 * * *` | 7 | `unshelf/development-postgres` |
| Dokploy control plane | Web Server → Backups | `40 0 * * *` | 7 | `unshelf/dokploy-control-plane` |

The five-, twenty-, and forty-minute offsets avoid running all three jobs at
once on the current two-vCPU host. The table assumes Dokploy's `TZ` is explicitly
set to and documented as UTC; the installed inventory did not record an
effective timezone. Dokploy's installation guide exposes `TZ`, and its installed
backup scheduler passes each cron expression to `node-schedule`.[^dokploy-install][^source-schedule]

Enable **Include encryption key** on the control-plane schedule. In v0.29.13 it
is enabled by default, and the UI explains that it is what allows environment
variables to be decrypted after restore on another server. It also means that
anyone who can read that archive can decrypt the stored values, so the R2 bucket
and recovery access are highly sensitive.[^source-backup-form][^source-web-backup]

Do not add R2 lifecycle expiry to these three active prefixes. The agreed
retention is a count, not an age: a delayed or failed hourly run must not cause
the last viable copy to expire merely because it is old. R2 lifecycle rules are
age-based and deletion can occur up to roughly 24 hours after expiration, so
they cannot enforce exactly 24/7/7 objects anyway.[^r2-lifecycle] Dokploy's
`keepLatestCount` is the count owner; the external check described below catches
both stale backups and retention drift.

Do not apply an R2 bucket-lock rule to these active prefixes either. A lock
prevents deletion or overwriting for its retention period and takes precedence
over lifecycle rules; it would therefore block Dokploy from deleting object N+1
and turn exact count retention into silent over-retention.[^r2-locks] This is a
small operational backup policy, not a regulatory write-once archive.

### Minimum credential and recovery boundary

[Define CI/CD secrets and permission boundaries][issue-248] owns the complete
credential-flow matrix and final secret names. This backup procedure needs only
these minimum guarantees from it:

- Dokploy receives one long-lived, bucket-scoped Object Read & Write S3
  credential so backup, restore, list, and retention deletion all work;
- the external freshness workflow receives a different bucket-scoped Object
  Read only credential through its GitHub Actions environment;
- a human break-glass path outside the VPS can access the Cloudflare account,
  locate the bucket, and issue a replacement recovery credential on a clean
  server; and
- neither credentials nor endpoint-bearing connection material is committed,
  pasted into issues, or copied into incident notes.

The control-plane archive contains the key needed to decrypt Dokploy's restored
settings, but it does **not** remove the need for the external Cloudflare account
recovery path: a fresh Dokploy instance still needs independent access to R2 to
download that archive.

## What v0.29.13 actually supports

The read-only live inventory recorded Dokploy `v0.29.13`, a healthy Dokploy
PostgreSQL 16 control database, and no working backup of the active application
database. The one existing daily schedule targets an idle managed database,
keeps five objects, and its only execution failed.[^inventory] This proposal
must therefore replace that false-positive configuration after the planned
database topology exists; it must not treat it as coverage.

The installed version has the needed native features:

- A database backup schedule accepts a destination, database name, cron,
  prefix, enabled flag, and `keepLatestCount`; the current public API documents
  those fields and manual backup endpoints.[^dokploy-db-backup][^dokploy-api]
- PostgreSQL backup uses `pg_dump -Fc --no-acl --no-owner`, gzips the stream,
  and uploads a timestamped `.sql.gz` object. It records a backup deployment as
  `done` or `error` and sends a success/error database-backup notification.[^source-postgres-backup][^source-backup-command]
- Restore reads a selected object from S3, decompresses it, and pipes it to
  `pg_restore -O --clean --if-exists` against the database name supplied by the
  operator.[^source-postgres-restore][^source-restore-command] PostgreSQL
  documents the custom archive as portable and shows that restoring under a new
  name requires creating the empty target database first.[^postgres-restore]
- A Web Server backup archives the `dokploy-postgres` database and
  `/etc/dokploy` into one `.zip` and uploads it to the destination. In v0.29.13
  it can include the encryption-key export, records `done`/`error`, and emits a
  dedicated Dokploy-backup notification.[^dokploy-control-backup][^source-web-backup][^source-control-notification]
- `keepLatestCount` runs after a successful backup, lists only Dokploy backup
  file extensions under that schedule's generated app-name and configured
  prefix, sorts timestamped names newest-first, and deletes everything beyond
  N.[^source-schedule][^source-retention] This makes three schedules in one
  bucket safe from one another when their full observed object paths are
  distinct.

One important limitation follows directly from the installed source:
`keepLatestNBackups` catches deletion errors and only logs them; it does not
rethrow or change the already-successful backup deployment.[^source-retention]
Therefore a success email proves that a new archive was created, but not that
the bucket is still at 24/7/7. The independent object-count check is required.

## Setup procedure

This is the acceptance sequence for [Stand up scheduled off-box Postgres
backups before public self-serve][issue-40], not a second implementation scope.
Do it only after the Wayfinder topology has created distinct managed production
and development PostgreSQL services and moved the applications to them.

### 1. Create the destination safely

1. Create one private R2 bucket. Do not attach a public bucket URL or custom
   domain.
2. Create a bucket-scoped Object Read & Write R2 API token for Dokploy. Record
   its access-key pair and the account-specific S3 endpoint only in the approved
   secret stores; never in Git, issues, logs, or this runbook. R2 exposes an S3
   endpoint and says the secret cannot be viewed again after token creation.[^r2-auth]
3. Add one S3 destination in Dokploy. After configuring the first schedule,
   use its Test/manual-backup action; accept the destination only after the run
   is `done` and a non-empty object is visible in R2. Dokploy documents that
   Test initiates a backup to the selected S3 bucket.[^dokploy-db-backup]
4. Record the full object-key prefix observed after the test for each schedule.
   Dokploy prepends an internal service/app name before the configured prefix;
   R2's apparent folders are only key-prefix groupings.[^source-postgres-backup][^r2-prefixes]

Do not reuse the currently failing schedule. Remove or disable it only after
the new development schedule has completed, its destination object has been
seen, and the temporary restore below has succeeded for production.

### 2. Create and prove each schedule

Create the three rows in the recommendation table with `Enabled` on and the
exact keep-latest count. For each row:

1. trigger a manual backup immediately rather than waiting for cron;
2. require a `done` execution and inspect its redacted log for dump/archive and
   upload completion;
3. list the corresponding R2 prefix and require one non-empty object with the
   expected suffix (`.sql.gz` for PostgreSQL, `.zip` for control plane); and
4. wait for the first scheduled execution and verify it fires at the documented
   UTC time before declaring the schedule operational.

Dokploy's documentation calls the Test action a configuration test, not a
restore test.[^dokploy-db-backup] It proves that a dump can be uploaded; the
next step proves that the dump can actually be consumed.

### 3. Perform the one setup restore

Use the newest successful **production** `.sql.gz` object. Do not target the
production database name.

1. Create an empty, non-application temporary logical database in the same
   production PostgreSQL service, preferably from `template0`; give it a name
   that clearly marks it as temporary and includes the test date.
2. In Production PostgreSQL → Backups → Restore, select the R2 destination and
   exact tested object, then enter the temporary database name. The database
   must already exist because v0.29.13 invokes `pg_restore -d` without
   `--create`.[^source-postgres-restore][^source-restore-command][^postgres-restore]
3. Require the streamed restore log to end in `Restore completed successfully!`.
4. Connect read-only to the temporary database and verify only non-sensitive
   facts: the expected schemas/tables exist, the Drizzle migration ledger is at
   the expected revision, representative read queries succeed, and aggregate
   row counts are internally consistent. If setup uses a brief write freeze,
   compare them with counts recorded immediately before the manual backup. Do
   not print rows, user content, credentials, or connection strings into the
   record.
5. Drop the temporary database immediately after verification. Record the UTC
   test time, the non-secret object key, pass/fail, schema revision, and aggregate
   counts in the private operations log.

This test deliberately does not exercise control-plane restore: that operation
clears `/etc/dokploy`, drops the live `dokploy` database, and restores both from
the archive, so it is destructive to the active controller.[^dokploy-control-backup][^source-web-restore]
A disposable-VPS control-plane drill is useful later but is beyond the agreed
one-temporary-database setup test.

## Monitoring and failure visibility

Use two layers because each covers the other's blind spot.

### Native Dokploy notification and history

Configure one external email notification provider for **Database Backup** and
**Dokploy Backup**, and send a test notification. v0.29.13 emits both success
and error notifications for database and control-plane jobs; the general docs
list email among supported providers, and the installed UI exposes both event
switches.[^dokploy-notifications][^source-notification-form][^source-db-notification][^source-control-notification]
Treat an error, a missed expected success, or a run stuck in `running` as an
incident. The operator's first inspection point is that backup's deployment
history and redacted execution log, which v0.29.13 records as
`running`/`done`/`error`.[^source-postgres-backup][^source-web-backup]

Success mail alone is insufficient: the whole VPS can disappear before Dokploy
sends anything, and retention deletion can fail without changing backup
status.[^source-retention]

### Independent R2 freshness check

Add one default-branch GitHub Actions scheduled workflow at `37 * * * *` UTC
that uses a separate bucket-scoped Object Read only R2 token from the
backup-monitoring Actions environment selected by [Define CI/CD
secrets and permission boundaries][issue-248]. It must list only the three
recorded full prefixes and fail without downloading contents when any of these
is true:

- no non-empty production `.sql.gz` object is newer than two hours;
- no non-empty development `.sql.gz` object is newer than 30 hours;
- no non-empty control-plane `.zip` object is newer than 30 hours; or
- an active prefix contains more than its 24/7/7 limit.

After the initial warm-up window, also report fewer than the expected count as
a warning so gaps are visible. A failed workflow is visible in the Actions tab
and GitHub can email the scheduled workflow owner.[^github-notifications]

This check is a backstop, not an availability guarantee. GitHub says scheduled
workflows can be delayed or dropped under load, run only from the default
branch, and are disabled after 60 days without activity in a public repository;
schedule away from the top of the hour and include the workflow's own last-run
status in the monthly operations review.[^github-schedule]

Do not replace the freshness check with R2 event notifications. R2 can publish
object-create/delete events to a Queue, but that requires a Queue consumer and
still does not detect an upload that never happened without a separate clock.[^r2-events]

## Manual best-effort recovery after total VPS loss

This is a reconstruction runbook, not automated disaster recovery and not a
recovery-time or recovery-point guarantee. Under healthy scheduling, the
nominal data-loss window is approximately one schedule interval **plus** the
backup's run/upload duration and any scheduler delay: about an hour for
production and a day for development/control plane, not strictly less than
those intervals. Failures can make all three windows larger. Retention gives
roughly a day of production restore points and seven daily development and
control-plane restore points, but it does not guarantee those ages when runs
have failed.

Keep the runbook, Dokploy version, full non-secret R2 prefixes, DNS record
inventory, and external-service inventory in Git rather than only on the VPS.
Keep the R2 account recovery path and credentials outside the VPS. A
control-plane archive is not an application-data backup: official Dokploy docs
say it contains `dokploy-postgres` plus `/etc/dokploy`, while production and
development data live in their separate `.sql.gz` objects.[^dokploy-control-backup]

When the host is unrecoverable:

1. Freeze CD and DNS changes. Preserve the failed host or provider snapshot if
   available; do not trust it as the only recovery source.
2. Provision a replacement VPS with the required ports and at least the planned
   capacity. Install the **same Dokploy release that created the selected
   control-plane archive** using that release's version-specific installer.
   Dokploy documents release-specific installers as the recommended way to
   install an older version.[^dokploy-install] Upgrade only after recovery is
   complete and a fresh backup exists.
3. Create a temporary fresh-instance administrator and add the existing R2
   bucket as a destination using a newly issued recovery credential. Select the
   newest independently verified control-plane `.zip` and restore it through
   Web Server → Backups. Expect the fresh `/etc/dokploy` and control database to
   be replaced and expect to sign in again.[^dokploy-control-backup][^source-web-restore]
4. If the server address changed, update Dokploy's server IP, Git-provider
   callback/configuration where necessary, DNS, and generated domains as the
   official restore guide requires.[^dokploy-control-backup] Do not route user
   traffic yet.
5. Audit the restored controller before deploying: projects/environments,
   domains, registry definitions, runtime variables, backup destinations and
   schedules, notification provider, server/network configuration, and the
   chosen production release. The included encryption key should make restored
   encrypted values usable; any missing external secret must be reissued from
   its owning service, not guessed.
6. Recreate/deploy the managed production and development PostgreSQL services
   with empty storage. Restore the newest verified production and development
   `.sql.gz` objects into their intended database names. Validate migration
   revision and aggregate counts without emitting user data.
7. Restore read-only GHCR access and redeploy the last known-good immutable
   production API/web digest pair. Preserve the release gate
   `migrate → api → web`; then reconstruct hosted development. Code, images,
   GitHub settings, Clerk, Cloudflare DNS, and GitHub Actions secrets remain
   external systems of record and are not recovered from the PostgreSQL dumps.
8. Run the normal database-aware API health check and web-root check, inspect
   migration/application logs, and only then repoint or unfreeze DNS and CD.
9. Reissue credentials that were present on or readable by the lost host,
   update Dokploy and GitHub environments, manually trigger all three backups,
   verify new R2 objects plus notification delivery, and confirm the external
   freshness workflow is green.
10. Record which restore points were used, actual data loss, validation results,
    rotations performed, and unresolved gaps without copying credentials,
    connection strings, raw rows, or private incident data into the issue.

If the control-plane archive is unusable but either PostgreSQL dump is viable,
fall back to a clean Dokploy installation and manually recreate projects,
environments, managed databases, domains, registry access, secrets, and backup
schedules from the Git-tracked specification and external inventories before
restoring the logical dumps. That is why the destination is explicitly
"best-effort reconstruction": the control-plane archive accelerates recovery,
but the durable specification must not depend on it.

## Scope relationship to the existing backup issue

[Stand up scheduled off-box Postgres backups before public self-serve][issue-40]
should remain the **single implementation owner**. Sharpen its acceptance scope
to require:

- the one bucket-scoped R2 destination and three schedules in this memo;
- production 24, development seven, and control-plane seven count retention;
- the completed temporary-production-database restore record;
- native email notifications plus the independent R2 freshness/count check;
- the setup and total-loss runbooks in `docs/deploy.md`; and
- removal of the obsolete failing idle-database schedule after replacement is
  proven.

Do not create a parallel implementation issue from this research ticket.
Preview databases remain disposable. Application Docker volumes, local logs,
R2 replication, automated failover, automated disaster recovery, periodic
control-plane restore drills, and a recovery-time SLA remain outside this
effort unless the Wayfinder destination is redrawn.

## Sources

[issue-246]: https://github.com/rajat2006/unshelf/issues/246
[issue-40]: https://github.com/rajat2006/unshelf/issues/40
[issue-248]: https://github.com/rajat2006/unshelf/issues/248
[^inventory]: GitHub, [Inventory the live Dokploy and VPS deployment state — resolution](https://github.com/rajat2006/unshelf/issues/240#issuecomment-5151271335).
[^r2-auth]: Cloudflare, [R2 API token authentication and permissions](https://developers.cloudflare.com/r2/api/tokens/).
[^r2-s3]: Cloudflare, [R2 S3 API compatibility](https://developers.cloudflare.com/r2/api/s3/api/).
[^r2-lifecycle]: Cloudflare, [R2 object lifecycles](https://developers.cloudflare.com/r2/buckets/object-lifecycles/).
[^r2-locks]: Cloudflare, [R2 bucket locks](https://developers.cloudflare.com/r2/buckets/bucket-locks/).
[^r2-prefixes]: Cloudflare, [R2 objects: prefixes and folders](https://developers.cloudflare.com/r2/objects/#prefixes-and-folders).
[^r2-events]: Cloudflare, [R2 event notifications](https://developers.cloudflare.com/r2/buckets/event-notifications/).
[^dokploy-install]: Dokploy, [Manual installation, timezone, and version-specific installation](https://docs.dokploy.com/docs/core/manual-installation).
[^dokploy-db-backup]: Dokploy, [Database backups](https://docs.dokploy.com/docs/core/databases/backups).
[^dokploy-api]: Dokploy, [Backup API reference](https://docs.dokploy.com/docs/api/reference-backup).
[^dokploy-control-backup]: Dokploy, [Web Server backups and restore](https://docs.dokploy.com/docs/core/backups).
[^dokploy-notifications]: Dokploy, [Notifications overview](https://docs.dokploy.com/docs/core/overview).
[^source-backup-form]: Dokploy v0.29.13 source, [backup form and keep-latest/encryption-key fields](https://github.com/Dokploy/dokploy/blob/v0.29.13/apps/dokploy/components/dashboard/database/backups/handle-backup.tsx).
[^source-schedule]: Dokploy v0.29.13 source, [backup scheduling and timestamp generation](https://github.com/Dokploy/dokploy/blob/v0.29.13/packages/server/src/utils/backups/utils.ts).
[^source-retention]: Dokploy v0.29.13 source, [`keepLatestNBackups`](https://github.com/Dokploy/dokploy/blob/v0.29.13/packages/server/src/utils/backups/index.ts).
[^source-backup-command]: Dokploy v0.29.13 source, [PostgreSQL dump and upload command construction](https://github.com/Dokploy/dokploy/blob/v0.29.13/packages/server/src/utils/backups/utils.ts).
[^source-postgres-backup]: Dokploy v0.29.13 source, [PostgreSQL backup execution, status, and notifications](https://github.com/Dokploy/dokploy/blob/v0.29.13/packages/server/src/utils/backups/postgres.ts).
[^source-postgres-restore]: Dokploy v0.29.13 source, [PostgreSQL restore from S3](https://github.com/Dokploy/dokploy/blob/v0.29.13/packages/server/src/utils/restore/postgres.ts).
[^source-restore-command]: Dokploy v0.29.13 source, [PostgreSQL `pg_restore` command](https://github.com/Dokploy/dokploy/blob/v0.29.13/packages/server/src/utils/restore/utils.ts).
[^source-web-backup]: Dokploy v0.29.13 source, [control-plane archive creation](https://github.com/Dokploy/dokploy/blob/v0.29.13/packages/server/src/utils/backups/web-server.ts).
[^source-web-restore]: Dokploy v0.29.13 source, [destructive control-plane restore](https://github.com/Dokploy/dokploy/blob/v0.29.13/packages/server/src/utils/restore/web-server.ts).
[^source-db-notification]: Dokploy v0.29.13 source, [database backup success/error notifications](https://github.com/Dokploy/dokploy/blob/v0.29.13/packages/server/src/utils/notifications/database-backup.ts).
[^source-control-notification]: Dokploy v0.29.13 source, [Dokploy backup success/error notifications](https://github.com/Dokploy/dokploy/blob/v0.29.13/packages/server/src/utils/notifications/dokploy-backup.ts).
[^source-notification-form]: Dokploy v0.29.13 source, [notification event form](https://github.com/Dokploy/dokploy/blob/v0.29.13/apps/dokploy/components/dashboard/settings/notifications/handle-notifications.tsx).
[^postgres-restore]: PostgreSQL 16, [`pg_restore`](https://www.postgresql.org/docs/16/app-pgrestore.html).
[^github-env]: GitHub, [Managing environments for deployment](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments).
[^github-notifications]: GitHub, [Notifications for workflow runs](https://docs.github.com/en/actions/concepts/workflows-and-actions/notifications-for-workflow-runs).
[^github-schedule]: GitHub, [Events that trigger workflows — `schedule`](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).
