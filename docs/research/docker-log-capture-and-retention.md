# Docker log capture and retention for Unshelf

Research date: 2026-07-27

## Question

What Docker logging driver, explicit rotation limits, retention expectations,
and operator workflow should Unshelf commit for `api`, `migrate`, `db`, and
`web` on one Dokploy-managed VPS with no remote log aggregator, while clearly
documenting what is lost when containers are replaced?

## Recommendation

Commit a per-service `local` logging-driver policy in `docker-compose.yml`:

| Service | `max-size` | `max-file` | Nominal retained-log ceiling per container | Rationale |
| --- | ---: | ---: | ---: | --- |
| `api` | `20m` | `5` | 100 MB | The API is expected to become the highest-volume source because the request-logging policy records one completion event per non-health request. It also has the most incident-diagnostic value. |
| `db` | `10m` | `5` | 50 MB | PostgreSQL is normally quieter than request logging, but startup, recovery, and repeated database failures can be verbose and are important when the API is unhealthy. |
| `web` | `5m` | `3` | 15 MB | The current Caddy configuration has no access-log directive, so this service should mainly emit lifecycle and error output rather than one line per request.[^local-web] |
| `migrate` | `5m` | `3` | 15 MB | This is a one-shot service. The budget is intended to preserve the complete output of a normal or failed current migration run, not a long history of deploys.[^local-compose] |

That is a **180 MB nominal ceiling across one current container for each of the
four services**, before accounting for the `local` driver's default compression
of rotated files and small implementation overheads. The limits are per
container, so replicas or temporarily retained additional containers multiply
the total. Docker defines `max-size` as the size at which a file rolls and
`max-file` as the maximum file count; the oldest file is deleted when rotation
would exceed that count.[^docker-local]

Use the default blocking delivery mode. Docker documents blocking as the
default; its alternative non-blocking mode drops new messages when its
per-container buffer fills.[^docker-configure] Unshelf does not currently have
the monitoring needed to detect and reason about that extra silent-loss mode.

The corresponding Compose fragments should be explicit on every service:

```yaml
services:
  db:
    # ...
    logging:
      driver: local
      options:
        max-size: "10m"
        max-file: "5"

  migrate:
    # ...
    logging:
      driver: local
      options:
        max-size: "5m"
        max-file: "3"

  api:
    # ...
    logging:
      driver: local
      options:
        max-size: "20m"
        max-file: "5"

  web:
    # ...
    logging:
      driver: local
      options:
        max-size: "5m"
        max-file: "3"
```

Compose supports setting a logging driver and driver-specific options on each
service.[^compose-logging] Keep the four blocks visible rather than hiding them
behind YAML anchors: the unequal budgets are an operational policy, and an
operator reviewing one service should be able to see its complete limit.

## Why `local`, not the daemon default

Docker's daemon default is `json-file`, with no rotation unless separately
configured. Docker warns that this can exhaust the host disk and recommends the
`local` driver for non-Kubernetes use because it rotates by default and uses a
more efficient format.[^docker-configure] The `local` driver captures container
stdout/stderr, supports `docker logs`, compresses rotated files by default, and
defaults to 20 MB × 5 files when options are omitted.[^docker-local]

Unshelf should nevertheless specify both options. Defaults are not a retention
decision, and the four services do not deserve identical budgets.

The repository's Compose file is the correct ownership boundary:

- it makes the policy versioned, reviewable, and reproducible with the Unshelf
  stack;
- it overrides whatever default the VPS daemon happens to have for these
  containers; and
- it avoids changing logging for Dokploy, Traefik, and unrelated containers on
  the same VPS.

A daemon-wide `daemon.json` policy is still a useful host safety net, but it is
not a substitute for this Compose policy. Docker says daemon logging changes
require a Docker restart and affect only newly created containers; existing
containers keep their old settings until recreated.[^docker-configure]
Per-service settings similarly take effect on newly created/recreated service
containers, so the deployment containing this change must recreate all four
services and then verify them.

## Retention means bytes, not days

These limits make disk use predictable; they do **not** promise a number of
days. Retention time is approximately:

```text
retention duration = retained byte budget / actual log byte rate
```

Compression, message size, bursts, and application verbosity all move that
number. At low v1 traffic the API's 100 MB may represent days or weeks; during
an error loop it may represent much less. The policy should therefore promise
only:

- the most recent output up to each container's byte/file limit;
- enough headroom for ordinary low-volume operation and a near-term incident;
  and
- no durable, compliance, audit, or cross-deployment archive.

The limits should be revisited from observed production volume after request
logging has run for a while. If operators need a guaranteed time window,
cross-host survival, or search across deploys, that is the trigger for a remote
log sink; increasing local file counts cannot provide those properties.

## Exactly what is lost

The `local` driver is container-local operational history:

1. **Rotation deletes old entries.** When a service exceeds its configured
   file count, Docker removes the oldest file.[^docker-local]
2. **A deployment can delete the entire previous container's history.** Docker
   documents that updating a Compose service removes the old container and
   creates a new one; production redeployment likewise stops, destroys, and
   recreates the service container.[^compose-update][^compose-production]
   Because `docker logs` fetches logs for a container and the `local` files are
   Docker-daemon internal storage, the replacement starts a fresh log history;
   the removed container's history is no longer available through
   `docker compose logs` or Dokploy.[^docker-logs][^docker-local]
3. **`migrate` history is especially short-lived.** Its stopped container can
   be inspected after the current deploy, but the next deploy that recreates
   it removes that old container. Its 15 MB budget is for the current attempt,
   not the last N migrations.
4. **Restart is not replacement.** Restarting the same container keeps its
   current driver history, subject to rotation. Recreating or removing it does
   not. The database's named data volume survives normal container replacement,
   but that volume contains database data, not Docker driver logs.[^local-compose]
5. **Host loss remains log loss.** With no remote copy, loss of the VPS or its
   Docker data directory loses all four services' logs.
6. **Only stdout/stderr is captured.** Docker shows the container process's
   stdout and stderr; anything an application writes only to an internal file
   is outside this policy.[^docker-view-logs]

This is an explicit v1 trade-off, not accidental retention. Incident evidence
that must survive a planned redeploy has to be exported before the redeploy.

## Operator workflow

Run the CLI commands from the Dokploy Compose application's code directory,
where its generated `.env` and `docker-compose.yml` live.[^local-deploy]
Dokploy's per-service Logs view is appropriate for a quick look, but it is a
viewer over container logs, not an archive. Dokploy's documented read-logs API
is container-ID based, defaults to 100 lines, and caps `tail` at 10,000
lines.[^dokploy-compose][^dokploy-api]

### Routine triage

```sh
# Include the stopped one-shot migrate container.
docker compose -f docker-compose.yml ps --all

# Recent API context.
docker compose -f docker-compose.yml logs \
  --since=30m --tail=200 --timestamps api

# Correlate API, database, and web output over the same window.
docker compose -f docker-compose.yml logs \
  --since=2h --timestamps api db web

# Read all still-retained output from the current migration attempt.
docker compose -f docker-compose.yml logs --timestamps migrate

# Follow new API output; Ctrl+C stops following, not the container.
docker compose -f docker-compose.yml logs \
  --follow --tail=100 --timestamps api
```

Docker Compose supports selecting services plus `--follow`, `--since`,
`--tail`, and `--timestamps` on `logs`.[^compose-logs] Prefer bounded
`--since`/`--tail` reads during routine triage: reading compressed rotated logs
temporarily costs disk and CPU while Docker decompresses them.[^docker-configure]
Do not read or manipulate the `local` driver's files under Docker's data
directory; Docker explicitly reserves those files for daemon access.[^docker-local]

### Verify the deployed policy

After the first deployment containing the logging blocks, confirm each service
was recreated and inspect its effective Docker setting:

```sh
docker compose -f docker-compose.yml ps --all

docker inspect \
  --format '{{.Name}} {{json .HostConfig.LogConfig}}' \
  "$(docker compose -f docker-compose.yml ps --quiet api)"

docker inspect \
  --format '{{.Name}} {{json .HostConfig.LogConfig}}' \
  "$(docker compose -f docker-compose.yml ps --quiet db)"

docker inspect \
  --format '{{.Name}} {{json .HostConfig.LogConfig}}' \
  "$(docker compose -f docker-compose.yml ps --quiet web)"

docker inspect \
  --format '{{.Name}} {{json .HostConfig.LogConfig}}' \
  "$(docker compose -f docker-compose.yml ps --all --quiet migrate)"
```

Each result should report type `local` and the expected `max-size` /
`max-file` pair. Checking `docker info --format '{{.LoggingDriver}}'` alone is
insufficient: it reports the daemon default, while Unshelf deliberately uses
per-container overrides.[^docker-configure]

### Preserve evidence before planned replacement

If an active incident overlaps a planned deploy, capture a point-in-time copy
first:

```sh
docker compose -f docker-compose.yml logs \
  --since=24h --timestamps --no-color > unshelf-predeploy.log
```

Treat that export as potentially sensitive operational data: restrict access,
copy it off the VPS if it must survive host loss, and delete it when the
incident no longer requires it. This manual exception has no automatic
rotation. If it becomes routine, Unshelf has outgrown the no-aggregator policy.

## Local configuration assessed

The production stack currently defines `db`, one-shot `migrate`, `api`, and
`web`, but no service has a `logging` block.[^local-compose] The API currently
emits a startup message to stdout; the migration runner has no explicit success
log; and Caddy serves the SPA without an access-log directive.[^local-api][^local-migrate][^local-web]
The existing request-logging research already recommends keeping application
logs on stdout/stderr and giving Docker explicit rotation limits.[^local-request-logging]
This memo supplies those missing limits and their lifecycle contract.

## Sources

[^local-compose]: Unshelf source, [`docker-compose.yml`](../../docker-compose.yml).
[^local-web]: Unshelf source, [`apps/web/Caddyfile`](../../apps/web/Caddyfile) and [`apps/web/Dockerfile`](../../apps/web/Dockerfile).
[^local-api]: Unshelf source, [`apps/api/src/server.ts`](../../apps/api/src/server.ts).
[^local-migrate]: Unshelf source, [`apps/api/src/migrate.ts`](../../apps/api/src/migrate.ts).
[^local-deploy]: Unshelf operator runbook, [`docs/deploy.md`](../deploy.md), especially the production Compose application directory.
[^local-request-logging]: Unshelf research, [`docs/research/request-logging-policy.md`](request-logging-policy.md), “Docker retention must be configured separately.”
[^docker-configure]: Docker, [Configure logging drivers](https://docs.docker.com/engine/logging/configure/), including the default driver, `local` recommendation, delivery modes, and new-container-only configuration behavior.
[^docker-local]: Docker, [Local file logging driver](https://docs.docker.com/engine/logging/drivers/local/), including capture, rotation options, compression, and the warning against direct file access.
[^compose-logging]: Docker, [Compose service `logging` reference](https://docs.docker.com/reference/compose-file/services/#logging).
[^compose-logs]: Docker, [`docker compose logs`](https://docs.docker.com/reference/cli/docker/compose/logs/).
[^docker-logs]: Docker, [`docker container logs`](https://docs.docker.com/reference/cli/docker/container/logs/).
[^docker-view-logs]: Docker, [View container logs](https://docs.docker.com/engine/logging/).
[^compose-update]: Docker, [Networking in Compose — updating containers](https://docs.docker.com/compose/how-tos/networking/#update-containers-on-the-network).
[^compose-production]: Docker, [Use Compose in production — deploying changes](https://docs.docker.com/compose/how-tos/production/#deploying-changes).
[^dokploy-compose]: Dokploy, [Docker Compose — Logs](https://docs.dokploy.com/docs/core/docker-compose#logs).
[^dokploy-api]: Dokploy, [Compose API — read logs](https://docs.dokploy.com/docs/api/compose#compose-read-logs).
