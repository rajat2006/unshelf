# Source inspection release qualification

Source inspection is qualified with a private corpus because real Sources and
accepted titles may be sensitive and do not belong in the repository, CI
artifacts, images, or logs. Live third-party Sources are never exercised in CI.
The evaluator writes only aggregate results and never writes an Item or opens a
database.

Keep the manifest outside the checkout and deployment image. Review every case
as public and non-secret before a run; the evaluator's validation is only an
additional safety boundary. The manifest schema, source classes, distribution,
and fixed gates are authoritative in the release evaluator and its tests.

## Qualify

At the exact commit being qualified, first run:

```sh
turbo run typecheck
turbo run test
```

Then run the private corpus from the intended deployment region:

```sh
pnpm source-inspection:evaluate -- \
  --manifest /secure/unshelf/source-inspection-corpus.json \
  --report /secure/unshelf/source-inspection-release-report.json \
  --region production-primary \
  --commit 0123456789abcdef0123456789abcdef01234567 \
  --deterministic-corpus-passed \
  --client-lifecycle-passed \
  --invariants-passed
```

Set the evidence flags only when their corresponding suites passed without
skips. The manifest and report paths must be absolute; the evaluator refuses a
manifest inside the checkout. Retain only its aggregate report.

The current command invokes the production inspection service in-process. Its
timings therefore do not include authenticated HTTP or browser/API transit and
must not be treated as deployed caller-visible latency until that topology and
authentication design is completed.

## Interpret the recommendation

- `release` means every fixed gate passed.
- `release_without_oembed_titles` means every non-oEmbed gate passed; rollout
  is allowed only while `SOURCE_INSPECTION_YOUTUBE_OEMBED_DISABLED=true`.
- `blocked` or a nonzero exit stops rollout. Classify the failure before changing
  implementation or corpus; changing a threshold requires a separate decision.

## Roll out and recover

1. Deploy with both inspection switches disabled and confirm manual/offline
   Capture still persists only the User-confirmed Title, Type, and exact Source.
2. Run the deterministic suites and private qualification from the intended
   region. Stop on `blocked`.
3. Enable global inspection while leaving oEmbed disabled. Enable oEmbed only
   after `release` and explicit acceptance of its title-retention risk.
4. For 48 hours, review only strategy-separated durations, terminal-code rates,
   and suggested-field rates. Never join them to request payloads or add a
   Source-derived dimension.
5. Disable oEmbed for an isolated title-policy/origin regression. Disable Source
   inspection globally for privacy, safety, deadline, incorrect-Type, or
   uncertain-scope incidents. Use the exact-host deny list only when one origin
   is conclusively the complete scope.

Deployment controls and the incident recovery procedure live in
[Deploy Unshelf through Dokploy](deploy.md#source-inspection-controls-and-recovery).
