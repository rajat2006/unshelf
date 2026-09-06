# Book chapter discovery: implementation recommendation

Status: agreed planning decision, 2026-09-06. This document specifies the intended
feature; it does not describe an implemented or deployed capability.

Decision: [Choose the book chapter acquisition architecture and acceptance criteria](https://github.com/rajat2006/unshelf/issues/606).
Parent: [Wayfinder: find book chapters with AI-assisted web research](https://github.com/rajat2006/unshelf/issues/602).

## Selected approach

Use one server-side OpenAI Responses request with `gpt-5.6-luna` and `web_search`.
The model searches, reads contents evidence, identifies the book/edition, and
extracts chapter headings. Unshelf validates the response and presents an editable
preview. Only the User's explicit **Add chapters** action creates ordinary Parts.

Do not build an application crawler, source-specific parsers, a second extraction
pipeline, automatic model fallback, or a generic interchangeable-provider framework.
The User selected model-led retrieval and explicitly deferred model-quality
evaluation. No measured accuracy, coverage, latency, or cost claim accompanies
this recommendation. The model's source claims remain fallible: structural
validation and citation checks cannot independently prove every heading correct.

Luna documents Responses, web-search, and structured-output support. Use a strict
structured output contract and include `web_search_call.action.sources`. Request
`store: false`, no conversation or previous-response state, and only the web-search
tool. Send the saved title and the extraction instructions, never unrelated Item
notes, labels, plans, credentials, or User identity. The API key stays on the server.
Model/version and request configuration are explicit implementation settings.

## Product behavior

**Find chapters** appears on a saved book's detail page when the book has no Parts.
Capture remains independent. The server checks ownership and initial eligibility
before paying for research; it reads the title from the owned Item rather than
accepting a client-supplied book title or User identifier.

The preview is temporary, one chapter per editable line. Above or adjacent to it,
show the matched title, author, edition when known, coverage label, and clearly
associated clickable evidence. Label unknown edition explicitly. Citations describe
the original suggestions; editing a heading does not make the edit source-verified.
Keep attribution outside the editable text, with enough association to show which
original suggestions each source supports. No separate chapter-selection workflow.

Apply the agreed identity and evidence rules:

- Title-only lookup; no author, edition, ISBN, or source-link input fields.
- Abstain when the title remains ambiguous between different books/authors.
- A supported edition of the same book is acceptable when identified explicitly;
  never silently substitute or mix editions.
- Suggest only headings the model finds in retrieved contents evidence. Model
  recall cannot fill gaps. Numbered-only chapters remain numbered-only.
- Offer evidenced partial lists as **Partial chapter list**. If completeness is
  unestablished, show **Completeness unknown**, not a complete-list claim.
- Prefer the book's contents page, then publisher/distributor listings, then other
  sources. Within an edition, prefer a clearly dated correction over obsolete
  evidence. A newer webpage alone does not override stronger evidence. Abstain
  when credible conflicts remain unresolved; do not merge competing lists.
- Preserve chapter-level headings in source order, including numbering, duplicate
  headings, and apparent source typos. Remove formatting, whitespace artifacts,
  and page numbers only. Exclude grouping headings, subchapters, front matter,
  appendices, references, and indexes by default.

The original product resolutions are
[Decide book matching and chapter evidence for the preview](https://github.com/rajat2006/unshelf/issues/604#issuecomment-5561150962)
and
[Decide the Find chapters preview and Part creation lifecycle](https://github.com/rajat2006/unshelf/issues/605#issuecomment-5561180990).

## Module and execution

Put chapter discovery behind a feature module in the existing Express API. Its
interface takes the authenticated User, Item identity, and cancellation signal,
and returns a tagged result. It owns admission, the model call, response validation,
safe failure mapping, and usage recording. Routes use the existing auth and
`validateRequest` helpers and delegate business logic. Tests cross the same
interface with a supplied model-call dependency; no speculative provider registry.

Use an ordinary request/response interaction, not a durable background job or
polling workflow. Never hold a database transaction open during provider I/O.
Before deployment, configure and verify the actual ingress response timeout to
allow the 60-second attempt plus response overhead. The repository does not prove
the deployed Traefik timeout; this is an integration check, not a new evaluation
project or a reason to add a queue.

### Request and result contract

The research request identifies only the Item. The authenticated API derives the
User and title. Admission issues an opaque attempt identity for usage and
correlation. Return one of these application outcomes:

| Outcome | Required meaning |
| --- | --- |
| Suggestions | Matched title; author/edition or explicit unknown values; coverage (`complete`, `partial`, `unknown`); ordered headings with evidence references; attributed HTTP(S) evidence links. |
| Inconclusive | Safe reason such as ambiguous identity, conflicting evidence, or no usable contents. No proposed Parts; manual entry remains available. |
| Failure | Safe code distinguishing timeout, provider failure/refusal, malformed/incomplete response, missing configuration, or usage limit. Explicit retry where appropriate; do not misreport an outage as no chapters found. |

Use the repository's `{ ok: true, ... }` / `{ ok: false, error: ... }` service
convention; suggestions and inconclusive are completed research outcomes.
Transport auth/not-found errors follow existing API conventions and must not
disclose another User's Item.

The model result has a bounded schema: identity, coverage, headings, and evidence
references, not arbitrary prose rendered as HTML. Validate all enums, array/string
bounds, nonblank headings, reference integrity, and safe link schemes. A
suggestion must include evidence references that correspond to provider-reported
consulted sources; invented or missing references fail validation. Require actual
web-search activity rather than accepting a recall-only response. These checks
establish provenance shape, not independent verification of source text.

Treat retrieved instructions as untrusted data. The prompt confines the model to
contents extraction; it has no application-write tools, arbitrary HTTP tool,
secrets, or authenticated source access. Render text as text and links safely.
Do not follow returned URLs server-side as a hidden verification step, bypass
source access controls, fetch full commercial books, or retain source documents.

### Bounds and usage

- One application attempt has a 60-second deadline. One active research attempt
  per User; the UI also disables concurrent submission.
- Admit at most 10 attempts per User per UTC calendar day. Reserve admission
  atomically in Postgres before paid I/O so restarts or multiple API instances
  cannot reset or race the daily count. A dispatched attempt counts even when
  failed, canceled, or inconclusive. Auth/eligibility/configuration rejection
  before dispatch does not consume a paid attempt.
- Keep only an opaque expiring admission claim and quota counters in this state,
  not the preview. A late completion may release only its own claim. Expiry must
  recover claims after crashes without allowing an earlier response to replace a
  later attempt's state.
- Make one Responses request, with no automatic retries or second model call.
  Set finite `max_tool_calls` and `max_output_tokens`; keep the default bounded
  web-search result budget, not `unlimited`. Initial engineering defaults are
  four built-in tool calls and 8,000 output tokens including reasoning. Reaching
  an incomplete response is a failure, not permission to display truncated JSON.
- Treat **$0.10 per attempt as a monitored budget target**, not a guaranteed bill
  ceiling. The User explicitly accepted this clarification. Token/tool controls
  bound work but do not enforce an exact dollar amount. Log an over-target event
  without discarding an otherwise valid result or automatically retrying it.

Use the API's existing structured logger for a terminal attempt event: opaque
attempt/request IDs, requested and returned model IDs, input/cached/output token
counts, observed search-call count, elapsed time, outcome, estimated USD cost,
and the pricing version used. Calculate estimates from the applicable documented
rates without double-counting reported token usage. Missing usage/cost remains
explicitly unknown, particularly after a timeout, disconnect, or crash; it is
never assumed free. An aborted client request does not guarantee provider billing
has stopped. Keep admission/quota state durable for enforcement; stdout logs are
basic operational visibility, not a durable billing ledger or audit dashboard.

No prompt, saved title, chapter list, source URL/text, or raw provider response is
logged. The existing central failed-request snapshots can capture request bodies:
omit chapter-flow content on validation, error, and aborted-request paths too.
Use safe provider error codes instead of logging raw provider error bodies.
Existing Docker log rotation applies; no new guaranteed time-based log retention
or external observability platform is part of this decision.

## Preview and confirmation lifecycle

The browser owns preview text and evidence only for the open flow. Cancel,
navigation, or a new attempt invalidates the current UI attempt identity and
aborts the request where possible. Late results cannot update the preview. Returning
starts fresh. Warn before discarding User-edited text. Research failures require
explicit Retry; retry starts a new admitted attempt.

**Add chapters** submits the User's current titles and an opaque confirmation key,
separately from research. Trim each line, ignore blank lines, preserve order and
duplicate titles, and require at least one nonblank title. Apply finite transport
and field/list validation bounds with a visible error, never silent truncation.
No model call or evidence revalidation occurs during saving; edits are User-owned.

Extend the existing atomic Part creation operation with a confirmation receipt.
Scope the key to the authenticated User and Item and bind it to a digest of the
normalized ordered titles. In the same transaction and Item advisory lock:

1. Check Item ownership and look up the receipt.
2. If the key was already committed with the same payload, report success without
   inserting or altering Parts. A different payload under that key is a conflict.
3. Otherwise insert the full Part list and receipt atomically, using the existing
   ordering, initial-list Status preservation, and Daily Focus snapshot behavior.

Return the current Item detail after successful creation or replay. The receipt
records commit identity and payload digest, not evidence or a retained preview.
Keep it for the Item's lifetime so a delayed replay cannot recreate Parts even
after those Parts have subsequently been removed. Existing Item/User deletion
rules govern cleanup and must never expose a foreign receipt.

Disable repeated clicks while saving. Freeze the submitted payload and key for an
ambiguous-failure retry: the UI must not silently attach edited titles to an
already possibly committed key or switch to a fresh key. Retain the visible text
and resolve that save by replay first. After a definite non-commit failure, edits
can be submitted as a new confirmation. Saving cannot be canceled once started;
navigation may still leave committed Parts. Show the ordinary Part list on
confirmed success.

Parts are unchecked and editable. Creating an initial list preserves the Item's
current Status, including done; later membership/completion changes follow the
existing rules. The User explicitly deferred special concurrent Item changes
during research/preview (rename, Type change, deletion, another tab adding Parts).
Do not introduce stale-preview version checks, conflict recovery, or automatic
re-research for those scenarios. Existing authorization/integrity and the
separately agreed confirmation replay rules still apply. “Ignore stale results”
here means canceled/superseded attempts, not reopening that deferral.

## Implementation acceptance checks

These are ordinary deterministic implementation tests and integration checks,
not a live-model benchmark or a promised accuracy threshold.

| Area | Required check |
| --- | --- |
| Model request | Uses Luna with web search, strict output, source metadata, finite bounds, and no automatic retries. Sends only the owned saved title plus instructions; no write tools or unrelated User data. |
| Identity and evidence contract | Fixtures cover different editions, ambiguous authors, unknown edition, conflicting evidence, missing/invented source references, and a recall-only response. Preserve explicit edition/coverage labels and reject structurally unsupported suggestions. |
| Heading fidelity | Fixtures preserve Unicode, numbered-only chapters, source wording, order, and duplicates. Render partial/unknown coverage distinctly. Prompt/configuration expresses chapter-level selection and excludes front/back matter; tests do not claim to prove live model compliance. |
| Incomplete/absent results | Inconclusive differs from timeout/refusal/provider or malformed-output failure. Incomplete JSON is never a partial chapter preview. Manual entry remains usable. |
| User isolation | Foreign/missing Items cause no paid call or writes. Client User/title spoofing cannot override server-derived values; confirmation receipts and quotas are User-scoped. |
| Bounds | Daily admission is atomic across concurrent requests; active claims expire safely; canceled/dispatched failures count; deadline terminates the UI attempt; late completions cannot overwrite a newer attempt. Verify deployed ingress duration. |
| Editing and cancellation | Edits survive save failure. Cancel/navigation/new search warns before discarding edits; returning has no stored preview. Evidence remains separate and edits do not appear newly verified. |
| Atomic save/replay | A transaction failure creates neither partial Parts nor receipt. Double submission and a committed response lost in transit produce one list. Changed payload under a used key conflicts; replay after later Part removal does not recreate it. |
| Existing Part semantics | Empty lines, whitespace, duplicates, order, unchecked state, initial done Status, ordinary subsequent editing, and Daily Focus snapshots retain existing behavior. |
| Untrusted content and logs | Retrieved markup/instructions render inertly and cannot invoke writes. Success, validation, exception, abort, and provider-error paths record only allowed usage fields. Unknown usage is not zero; estimates are labeled and versioned. |

Implementation should run the repository's relevant typecheck/lint/service/API
and frontend tests. No production implementation, paid model calls, provisioning,
or model-quality evaluation was performed while recording this decision.

## Deferred work and evidence

The User accepts proceeding without a quality benchmark. The following remain
independent open backlog issues, outside the map and not handoff blockers:

- [Consider future evaluation of AI-assisted book chapter discovery](https://github.com/rajat2006/unshelf/issues/608): whether/when to evaluate remains undecided; no previously suggested corpus size or numerical pass threshold is adopted.
- [Decide whether to adopt an AI usage and cost observability platform](https://github.com/rajat2006/unshelf/issues/609): basic usage recording ships with the feature; platform selection/provisioning is deferred.

No new BookDetails entity, persistent evidence relationship, Part subtype, or
recurring-discovery Provider identity is introduced. The glossary clarification
only allows a Structured Item's User-confirmed snapshot to start from suggestions.
The Item spine and ordinary Part ownership remain intact.

Primary API documentation checked on 2026-09-06:

- [Luna model](https://developers.openai.com/api/docs/models/gpt-5.6-luna): documented tool/structured-output support; no claim of a chapter benchmark.
- [Responses request controls](https://developers.openai.com/api/reference/cli/resources/responses/methods/create): output/tool limits and source inclusion.
- [Web search](https://developers.openai.com/api/docs/guides/tools-web-search): sources, visible clickable attribution, and default versus unlimited returned-content budget.
- [Initial research memo](https://github.com/rajat2006/unshelf/blob/dcdc7152d1209c856aef507893d82e5b0cb357e1/docs/research/book-chapter-discovery.md), on the [research-and-prototype PR](https://github.com/rajat2006/unshelf/pull/607): observed public sources and provider constraints. Its benchmark recommendation was subsequently deferred by the User. Its note that `store: false` is not a universal provider no-retention guarantee remains applicable.

The decision-document PR is mergeable documentation. The research-and-prototype
PR stays draft and unmerged; its eventual closure is a manual User action.
