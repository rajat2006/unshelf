# Source inspection operations

Source inspection is an authenticated, best-effort Capture aid. It may suggest
ordinary editable Title and Type values, but it never writes an Item, changes the
exact captured Source, or makes Capture depend on a remote origin. Every refusal
returns the same public `unavailable` response so manual Capture remains intact.

## Sensitive-request handling

Treat the complete Source as a secret. It can contain a credential in its query
even when the page itself is public. The Source-inspection route is marked
sensitive before JSON parsing, so retained failure snapshots omit the request
body and query for validation errors, unexpected failures, and aborted requests.
Success records do not retain request payloads either.

Do not add Source, hostname, query, redirect location, response headers or body,
resolved address, extracted value, suggested value, or a reversible hostname
fingerprint to logs, metrics, traces, alerts, or incident notes. Public failures
must not expose the internal terminal code or origin detail.

The route emits one `unshelf.source_inspection.completed` record for each
application-service completion. Its allowlisted inspection fields are:

- `strategy`: `generic` or `youtube`;
- `terminalCode`: `suggested`, `unsupported`, `unsafe`, `refused`, `timeout`,
  `limit`, `overload`, `origin`, `no_metadata`, `cancelled`, or `unexpected`;
- `suggestedTitle` and `suggestedType`: booleans only;
- `durationMs`: monotonic total duration, with bounded DNS,
  connection, response-header, and body phase timings in `phaseTimingsMs`; and
- `redirectCountBucket` and `byteCountBucket`: bounded categories, including
  `unknown` where the adapter cannot safely or reliably report a count.

The existing restricted request logger supplies `requestId` and authenticated
internal `userId`. Access and retention therefore follow the API's restricted
production-log policy. Operators can group these records by `strategy` and
`terminalCode`, calculate p50/p95/p99 from `durationMs`, and average the two
suggestion-presence booleans. Keep generic and YouTube reports separate. Never
join these records to request payloads or introduce a Source-derived dimension.

## Runtime policy controls

The API reads these controls when the process starts:

| Variable | Safe behavior |
| --- | --- |
| `SOURCE_INSPECTION_DISABLED=true` | Globally returns manual fallback without calling an inspection adapter. Any other or absent value leaves the kill switch off. |
| `SOURCE_INSPECTION_YOUTUBE_OEMBED_DISABLED=true` | Keeps local YouTube Type classification but skips fixed-origin title acquisition. Generic inspection is unchanged. |
| `SOURCE_INSPECTION_DENIED_HOSTNAMES` | Comma-separated exact hostnames. Matching is case-insensitive and ignores one terminal DNS dot. There are no wildcard or suffix rules. A match returns manual fallback before any adapter call. |

Apply a control by changing the API environment and restarting/redeploying the
single API process. Do not place a full Source or query string in the deny list.
Prefer the independent oEmbed switch for a YouTube title-policy incident; use the
global switch when the affected acquisition boundary is uncertain.

## Resource and admission defaults

One server attempt has a 2.5-second end-to-end deadline inside the browser's
three-second deadline. DNS, connection, and response-header phase ceilings are
300 ms, 500 ms, and 1.5 seconds. One generic request allows five redirects,
32 KiB response headers, 512 KiB transferred bytes, and 256 KiB decompressed
HTML. oEmbed JSON is capped at 64 KiB. JSON-LD allows 16 blocks, 64 KiB total,
16 nesting levels, and 2,000 visited nodes. A working Source is capped at 8 KiB
and each suggestion at 512 Unicode code points.

Admission allows at most two active attempts for one User, two for one normalized
destination hostname, and sixteen for the API process. Each User has a five-token
bucket refilled continuously at twenty starts per minute. Saturation and rate
refusal return immediately; there is no application queue. Permits are released
idempotently after success, refusal inside an admitted attempt, cancellation,
timeout, and unexpected failure.

All counters and buckets are in-memory and process-local. This matches the current
single-process container. Before running multiple API replicas or workers, replace
them with an explicitly designed distributed admission boundary; do not describe
replica-local limits as global protection.

## Safety or policy incident

1. Set the narrowest safe switch. Disable oEmbed for a title-policy incident;
   otherwise set `SOURCE_INSPECTION_DISABLED=true`. Add an exact hostname only
   when one origin is conclusively the whole affected scope.
2. Restart/redeploy the API and verify authenticated inspection returns
   `unavailable` while manual Item Capture still succeeds. Do not probe the
   incident Source from CI or paste it into logs or tickets.
3. Restrict access to retained diagnostics. If Source-derived data escaped,
   treat it as secret exposure: stop further retention, follow the log-system
   deletion and credential-response procedures, and record only redacted scope.
4. Review strategy-separated duration percentiles, suggestion rates, and
   terminal-code rates. A safety-boundary failure, privacy leak, deadline escape,
   incorrect Type, or systematic overload keeps the affected strategy disabled.
5. Re-enable only after deterministic tests and the private release evaluation
   pass with the original thresholds. Threshold or policy changes require a
   follow-up decision; do not weaken them during incident recovery.
