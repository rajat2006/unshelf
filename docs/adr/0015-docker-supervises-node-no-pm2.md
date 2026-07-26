# Docker supervises the Node process; we do not adopt pm2

On Dokploy (ADR-0009) the api runs as one `node dist/server.js` per container with
`restart: unless-stopped` behind Traefik (ADR-0011), so the container runtime
already provides everything pm2 is classically adopted for — restart on crash,
start on boot, resource limits, log capture — and provides them visibly, where pm2
restarting a worker in-place would keep the container green while the app is
failing. **We keep that shape: one Node process per container, supervised by
Docker, with no pm2 layer**, in dev or in production. This would only be worth
revisiting if the api became CPU-bound on a multi-core box, and even then the
first move is Dokploy replicas rather than pm2 cluster mode.

## Considered options

- **`pm2-runtime` in the container (rejected).** The Docker-friendly form pm2
  itself recommends — foreground, no daemon, logs to stdout. At a single instance
  it wraps what Docker is already doing; at cluster mode it puts N processes in a
  container the orchestrator believes holds one, so health and restart signals stop
  describing the workload. Recorded because pm2's ubiquity makes "why isn't this
  here?" a recurring question.
