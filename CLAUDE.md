# unshelf

## Agent skills

### Issue tracker

Issues and PRDs are tracked in **GitHub Issues** (`rajat2006/unshelf`), via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Wayfinder tickets

If a ticket is a wayfinder ticket (labelled `wayfinder:*`), consult the `/wayfinder` skill for how to resolve it — even when you were invoked via another skill such as `/grill-with-docs`.

### Triage labels

Default five canonical labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Sandcastle agent platform

Autonomous coding agents via Sandcastle on the Actions runner (spec #52). Label taxonomy (`agent:*`) and secrets provisioning: `docs/agents/sandcastle.md`. Runner seam: `.sandcastle/README.md`.

### Domain docs

Single-context: one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
