# Agent-run prototype-fidelity toolchain

Research date: 2026-08-14

## Question

Which browser-automation, screenshot/diff, and AI image-inspection toolchain best
gives local and Sandcastle implementation agents reproducible eyes for comparing
an approved prototype with its implementation?

This is a candidate recommendation for
[Give implementation agents reliable visual fidelity to approved prototypes](https://github.com/rajat2006/unshelf/issues/330),
not an approval or implementation plan. The map reserves new dependencies,
canonical artifacts, and mandatory gates for owner approval and requires the
representative headless proof before the toolchain is settled.

## Recommendation

Use **Playwright Test** as the candidate capture, interaction, comparison, and
diagnostic spine. Run each approved scenario against the exact prototype Git
reference and the implementation in the **same invocation environment**, using
the Playwright-managed Chromium revision rather than the runner's installed
Google Chrome. Feed each scenario's reference, implementation, and diff PNGs to
the implementation agent for semantic classification. Keep the comparison an
implementation-agent evidence step, not a pixel-diff CI gate.

Do **not** add a separate screenshot library, direct `pixelmatch` dependency,
SSIM comparator, visual-review SaaS, or vision API in the baseline candidate.
Playwright Test already provides screenshot capture, a Pixelmatch-backed
comparison, expected/actual/diff reporting, web-first interactions, traces, and
the test runner Unshelf already uses. Codex CLI and Claude Code already accept
image inputs, so provider-native inspection is sufficient if Sandcastle
explicitly delivers the images to the selected agent.[^pw-visual][^pw-assertion][^codex-images][^claude-images]

The candidate has five boundaries:

1. **Recapture both sides together.** The durable prototype record remains the
   approved manifest plus exact Git reference. At evidence time, check out that
   reference, capture it, stage its PNG as the ephemeral expectation, then
   capture the implementation and compare. Do not create a permanent golden
   screenshot corpus: Playwright itself warns that rendering varies by OS,
   browser version, settings, hardware, power state, and headless mode, and says
   baseline and comparison must use the same environment.[^pw-visual]
2. **Use a managed renderer.** Replace the candidate's dependency on
   `channel: "chrome"` with Playwright-managed Chromium for the proof. Every
   Playwright release expects specific browser binaries; the official CI path is
   `playwright install --with-deps`, and branded Chrome is whatever is installed
   globally on the machine. Pin the package through `pnpm-lock.yaml`, install its
   matching Chromium, and use an explicit Ubuntu release for the Sandcastle
   proof. A matching versioned Noble Playwright image is the stronger rendering
   pin, but it should be adopted only if the proof shows it coexists cleanly
   with Unshelf's Docker-backed Testcontainers harness.[^pw-browsers][^pw-ci][^pw-docker]
3. **Make page state deterministic before capture.** Drive scenarios with
   locators and web-first assertions; use controlled fixtures, a fixed viewport,
   color scheme, locale/timezone, reduced-motion setting, and fixed browser
   clock where the scenario displays time. Wait on a meaningful application
   state, not a delay. Playwright actions wait for visibility, stability,
   event-receivability, and enabled state; assertions retry; browser contexts
   isolate cookies and storage; and its Clock API fixes `Date` and related
   timers.[^pw-actionability][^pw-isolation][^pw-clock]
4. **Treat the diff as evidence, not judgment.** `toHaveScreenshot()` waits for
   two consecutive matching captures, disables animations, hides carets, uses
   one bitmap pixel per CSS pixel, and can mask or style genuinely volatile
   regions. Any mask, stylesheet, or non-default tolerance must be scenario-level
   and explained; broad thresholds can hide real fidelity losses. The agent must
   inspect every approved scenario even when the numeric comparator passes, and
   intentional adaptations, alleged prototype defects, unresolved differences,
   and low-confidence calls still go to the owner.[^pw-assertion]
5. **Keep visual and behavioral evidence adjacent but distinct.** The same
   scripted journey may capture checkpoints, assert behavior through roles and
   URLs, produce an accessibility-tree snapshot, and run Axe. A screenshot does
   not prove interaction or accessibility; Axe explicitly catches only some
   common issues and must be complemented by manual/inclusive assessment.
   Whether behavioral journeys become a CI gate remains a separate decision.[^pw-aria][^pw-a11y]

## Why this fits Unshelf

Unshelf already carries `@playwright/test@1.61.1` and
`@axe-core/playwright@4.12.1` in the locked workspace. Its browser harness starts
the real Vite/React application and API against an ephemeral migrated Postgres,
uses role-based interactions, covers desktop and phone layouts, and already runs
Axe in meaningful application states.[^local-web-package][^local-browser-tests]
That is valuable prior art, not a reason to trust every current setting.

The current configuration is deliberately serial (`workers: 1`,
`fullyParallel: false`), retains traces on failure, and defines 1440×900 desktop
and iPhone 13 projects. Its weak point for fidelity work is
`channel: "chrome"`: that selects branded Chrome installed on the host rather
than the browser revision managed with Playwright. Neither Product CI nor the
Sandcastle workflows install Playwright browsers. Product CI also calls scripts
that explicitly exclude `test/browser/**`, so browser evidence is not presently
a merge gate.[^local-pw-config][^local-ci][^local-agent-workflows]

That makes Playwright Test the lowest-maintenance candidate, but **not** an
approval of the current config or entire browser suite. The proof should use a
small fidelity-specific scenario set and one canonical renderer first. Running
all existing journeys across desktop and phone would multiply runtime and mix
the map's prototype comparison question with the separately undecided
behavioral-suite policy.

## Criteria assessment

| Criterion | Playwright Test candidate | Material limitation / proof obligation |
| --- | --- | --- |
| Headless Ubuntu | Headless by default; official Ubuntu CI install and versioned Noble image paths exist. | Current Sandcastle jobs use `ubuntu-latest`, install no browser, and need Docker for Testcontainers. Prove the exact topology rather than assuming an image/container fits.[^pw-ci][^pw-docker] |
| Deterministic state | Isolated contexts, auto-waiting, retrying assertions, Clock, fixed projects, animation/caret control, masks/styles. | Fonts, OS rasterization, application data, network completion, canvas, and nondeterministic layout remain the harness's responsibility. Same-run paired capture reduces, but does not erase, these risks.[^pw-actionability][^pw-isolation][^pw-clock][^pw-assertion] |
| Prototype + implementation capture | Page/locator screenshots and `toHaveScreenshot()` are first-party; a prototype capture can be staged as the invocation's ephemeral expected image. | The exact two-checkout/two-server workflow is not present today and must be proven against a real approved prototype ref. Screenshot assertions only work in Playwright Test.[^pw-visual][^pw-assertion] |
| Interaction setup | Role locators, projects, web server, request routing, and API access already match Unshelf's harness style. | Prototype and implementation may expose different server commands or test hooks; the manifest must name observable scenarios without embedding tool-specific steps. |
| Agent access to images | PNG expected/actual/diff files are ordinary workspace artifacts; Codex accepts one or more `--image` files and Claude Code can analyze a filesystem path.[^codex-images][^claude-images] | Current Sandcastle `run()` has no image-input option. Claude can be prompted with paths, but reliable Codex delivery needs an attachment/resume seam rather than assuming a path in prose becomes image input.[^sandcastle-api] |
| Diagnostics | HTML report plus trace timeline, DOM snapshots, action/source/log/console/network views; retain-on-failure avoids always-on trace cost.[^pw-trace] | Traces and reports can be large and may contain user or request data. Keep them ephemeral and sanitize test fixtures. Official guidance calls always-on tracing performance-heavy.[^pw-best-practices] |
| Accessibility | Existing Axe integration, role locators, and ARIA snapshots complement images.[^pw-a11y][^pw-aria] | Axe is partial; an ARIA tree verifies structure, not visual fidelity, keyboard usability, or complete WCAG conformance. |
| Behavioral journeys | The same test can drive the approved scenario and assert state before each visual checkpoint. | Do not turn all fidelity scenarios or current browser tests into mandatory CI here; reliability/scope approval is outstanding. |
| CI / Sandcastle | TypeScript/pnpm-native, official GitHub Actions recipe, current agent runners already install workspace dependencies on Ubuntu. | Browser download/system dependencies add setup time; current jobs do not upload a Playwright report or attach images to agents. |
| Runtime | One existing framework, one canonical browser, targeted scenarios, failure-only traces; no extra model/API round trip is required. | Paired reference/implementation capture roughly duplicates rendering work, and Unshelf's server boots/migrates Testcontainers. No representative runtime has been measured yet. Do not set a timeout budget until the proof does. |
| Flakiness | Same-run pairs, managed browser, two-consecutive-image settling, auto-waits, isolated contexts, fixed time/data, and scoped checkpoints address common causes. | Pixel comparison remains sensitive to fonts, GPU/canvas, dynamic content, and poor stabilization. Retries must diagnose a flaky scenario, not turn it green silently. |
| Maintenance cost | Reuses one installed test runner, its comparator/reporter/traces, the current harness, and current Axe package. | Browser binaries must track the Playwright version. The prototype serving seam, manifest adapter, evidence retention, and agent attachment still need ownership. |

## AI inspection contract

The agent should receive, per approved scenario, clearly named **reference**,
**implementation**, and **diff** PNGs plus the scenario name, viewport/theme, and
machine-readable diff counts. The prompt should identify each image and ask for
a structured classification against the map's categories. OpenAI's current
image-input guidance specifically supports multiple CLI images and recommends
identifying each image and explaining how to compare them; Anthropic likewise
supports multiple images and analysis by filesystem path.[^codex-images][^claude-images]

AI vision is a semantic reviewer, not the source of pixel truth or a merge gate.
It can spot hierarchy, spacing, typography, cropping, responsive reflow, or an
intentional adaptation that a pixel count cannot interpret. It can also miss
small differences, vary between runs/models, and over-explain rendering noise.
Therefore:

- always preserve the deterministic reference/actual/diff facts for the current
  review, even if the model says they match;
- require a confidence and concise rationale, not only `pass` / `fail`;
- route low confidence and every exception class to the owner;
- do not add an OpenAI/Anthropic API key or separate vision service merely for
  this workflow; and
- keep images ephemeral, with only the compact outcome and exact refs durable.

### Current Sandcastle gap

Unshelf pins `@ai-hero/sandcastle@0.12.0` and calls `sandcastle.run()` with a
prompt file. Sandcastle's documented `RunOptions` accepts prompt/model/sandbox
options but no image attachments; its Codex provider invokes `codex exec` or
`codex exec resume` with the prompt over stdin.[^local-sandcastle-package][^sandcastle-api]
Codex CLI supports one or more `--image` inputs, but Unshelf's current provider
invocation does not forward them.[^codex-images] Whether the resumed turn needed
by this workflow preserves that capability is part of the proof rather than an
assumption.

That is a real integration gap, not a reason to buy a vision service. The
headless proof should establish one explicit provider-neutral evidence-delivery
seam. Candidate shapes are: teach Sandcastle's provider interface to attach the
generated images on a resumed inspection turn, or have each provider inspect
the named files using a capability its official CLI documents. Do not claim the
Codex Sandcastle path works until the proof demonstrates that the model actually
received the pixels.

## Playwright Test versus Playwright CLI and MCP

These are different products and should not be conflated:

- **Playwright Test** is the recommended deterministic runner. Its checked-in
  TypeScript scenarios, fixtures, assertions, screenshot comparator, projects,
  reports, and traces make runs reproducible and reviewable.
- **Playwright CLI** is an optional agent ergonomics layer, not the comparison
  spine. Official docs position it for coding agents: headless by default,
  token-efficient, shell-driven, and backed by persistent browser sessions plus
  accessibility-tree refs. It may help an agent explore a failure or discover a
  locator, but adding `@playwright/cli` is a new dependency and ad hoc command
  history is not the approved scenario.[^pw-cli]
- **Playwright MCP** is not recommended for the baseline. Its own comparison
  calls MCP the higher-token option for specialized exploratory loops, headed
  by default, with structured accessibility snapshots. That is useful browser
  control, not image interpretation or a substitute for a deterministic Test
  scenario.[^pw-mcp]

If the representative proof shows scripted scenarios cannot express a required
interaction, Playwright CLI is the first complement to evaluate. MCP should be
revisited only if a genuinely exploratory, stateful agent loop is required and
the added tool/schema/context cost is justified.

## Alternatives assessed

### Puppeteer plus a test runner and comparator — viable, secondary

Puppeteer is technically capable on headless Ubuntu. It downloads version-mapped
Chrome for Testing and stable Firefox, launches headless by default, takes page
and element screenshots, and its recommended Locators wait for visibility,
enabled state, viewport placement, and a stable bounding box. Its debugging
guide exposes console/browser/protocol logs, and a versioned Docker image is
available.[^puppeteer-browsers][^puppeteer-headless][^puppeteer-screenshots][^puppeteer-locators][^puppeteer-debug][^puppeteer-docker]

It is not the best Unshelf candidate because those official surfaces provide
the automation library, not an equivalent integrated screenshot assertion,
expected/actual/diff reporter, trace-viewer workflow, test projects, or Axe
setup. Unshelf would have to select and maintain a test runner, comparator,
reporter/artifact convention, isolation fixtures, and accessibility integration
while discarding a richer installed harness. Puppeteer is worth reconsidering
only if the proof finds a Playwright-specific blocker in browser launch or
capture.

### Selenium/WebDriver BiDi plus a runner and comparator — standards-first, poor fit

WebDriver and WebDriver BiDi are the strongest standards-based route when broad
browser-vendor or remote-grid portability is the goal. The W3C BiDi draft
defines viewport control, Base64 screenshot capture, navigation events,
network interception/events, logs, and screencast commands. Selenium drives
browsers locally or remotely and supports explicit waits and per-test driver
isolation.[^webdriver-bidi][^selenium-webdriver][^selenium-waits][^selenium-isolation]

That strength does not answer this map's main problem. Screenshot capture is a
primitive, not a prototype-baseline workflow; Selenium's own guidance says it
provides functional-interaction tools but not a well-architected suite, and its
wait documentation calls state races a primary source of flakiness. Unshelf
would still need to assemble the JavaScript runner, comparison/reporting,
tracing convention, accessibility layer, and app harness.[^selenium-practices][^selenium-waits]
Choose it only if future requirements make standards-native remote browser
breadth more important than agent workflow integration.

### Cypress plus a visual plugin or service — capable, unnecessary replacement

Cypress provides a strong interactive runner, retryability, test isolation, CI
screenshots/videos, and a familiar drive-then-capture workflow. Its official
visual-testing guide is unusually explicit, however: `cy.screenshot()` captures
images but Cypress does **not** compare them. Visual comparison requires an
open-source plugin or commercial service, and self-hosted plugins leave baseline
storage, rendering consistency, diff review, and CI artifacts to the team.[^cypress-visual]

Adopting Cypress would therefore replace Unshelf's existing Playwright/Axe
harness and add another comparator/integration without a unique benefit for the
destination. Its own guide recommends same-environment baselines, fixed
viewports, controlled time/data, stabilization, and a small set of deliberate
checkpoints—the same constraints this recommendation already applies.[^cypress-visual]

### Direct Pixelmatch — useful escape hatch, no initial dependency

Pixelmatch is a focused, current, low-level comparator. It accepts equal-size
image buffers, returns differing-pixel counts, writes a diff, detects
anti-aliasing, and exposes threshold and windowed diff-density controls.[^pixelmatch]
Playwright Test already uses Pixelmatch and exposes the relevant tolerance
options.[^pw-visual] Adding it directly would duplicate comparator ownership.

Revisit a direct dependency only if the headless proof demonstrates that
Playwright's public snapshot workflow cannot compare same-run prototype and
implementation captures while keeping golden files ephemeral. That would need
explicit owner approval and a small wrapper owning image decoding, dimensions,
diff output, thresholds, and report attachment.

### SSIM.js — reject

SSIM can be useful when perceptual similarity is more important than locating
pixel differences, and `ssim.js` returns a 0–1 structural-similarity score. Its
repository was archived in December 2023 and is read-only.[^ssim] A similarity
score also does not capture, stabilize, drive, report, or classify scenarios.
It adds an unmaintained second metric without addressing any missing baseline
capability.

### Commercial visual services or a separate vision API — defer

Cloud visual services can own stable rendering, baseline approval, browser
matrices, and PR dashboards; Cypress's official survey describes that trade in
exchange for a paid subscription and upload workflow.[^cypress-visual] The map
instead makes detailed screenshots ephemeral, keeps prototype comparison out of
the initial CI gate, and requires agent/owner classification. A SaaS would add
credentials, external retention/privacy policy, cost, and a second approval
surface before those needs exist. Reconsider only after measured volume or
cross-browser demand exceeds the local artifact workflow.

## Proof obligations before approval

The representative headless proof should answer these facts, without broadening
into implementation:

1. Can one exact approved prototype ref and one implementation ref be served and
   captured in one Ubuntu run with identical managed Chromium, viewport, fonts,
   theme, time, and test data?
2. Can Playwright Test's public APIs stage the prototype capture as an ephemeral
   expectation and emit reference/actual/diff artifacts without committing a
   golden PNG?
3. Does managed Chromium (`channel: "chromium"` or the selected bundled mode)
   reproduce the relevant responsive and typography behavior, and is a pinned
   host install sufficient or is a version-matched Noble image necessary?
4. Can the current Testcontainers-based API harness coexist with that renderer
   topology on GitHub Actions/Sandcastle?
5. What are cold setup, application boot, per-scenario, diff, trace-on-failure,
   and image-inspection times? What artifact sizes result?
6. Does each Sandcastle provider demonstrably receive and distinguish the
   reference, implementation, and diff pixels in a resumed inspection turn?
7. Across repeated unchanged runs, are the raw captures and diff classifications
   stable? If not, is the cause fixture/time/font/browser/GPU state, and can it be
   removed without masking product UI?
8. Does an intentionally introduced spacing, typography, overflow, theme, and
   responsive regression produce useful deterministic and agent-readable
   evidence?

Failure of the Sandcastle image-delivery proof would graduate a runner/image
attachment decision; failure of same-run capture would graduate a renderer or
two-checkout topology decision. Neither justifies silently committing goldens,
loosening thresholds, or adding a cloud service.

## Decision-ready resolution summary

Recommend **Playwright Test + Playwright-managed Chromium + provider-native AI
image inspection** as the candidate toolchain for the representative proof.
Capture the approved prototype and implementation from exact Git refs in the
same controlled environment; use Playwright's built-in Pixelmatch-backed
expected/actual/diff diagnostics, role-based journey assertions, traces, ARIA
snapshots, and the existing Axe integration; then make the implementation agent
inspect every scenario's PNG triplet. Keep images/reports/traces ephemeral and
the visual comparison outside CI gating. Do not add Puppeteer, Selenium,
Cypress, direct Pixelmatch, SSIM, MCP, visual SaaS, or a separate vision API now.
The two unresolved proof risks are the same-run two-ref renderer topology and
explicit Sandcastle image delivery—especially Codex, because pinned Sandcastle
0.12.0 does not expose image attachments even though Codex CLI accepts image
inputs directly.

## Sources

[^local-web-package]: Unshelf source, [`apps/web/package.json`](../../apps/web/package.json) and [`pnpm-lock.yaml`](../../pnpm-lock.yaml).
[^local-pw-config]: Unshelf source, [`apps/web/playwright.config.ts`](../../apps/web/playwright.config.ts).
[^local-browser-tests]: Unshelf source, [`apps/web/test/browser`](../../apps/web/test/browser) including [`quiet-focus.spec.ts`](../../apps/web/test/browser/quiet-focus.spec.ts), [`server.ts`](../../apps/web/test/browser/server.ts), and [`test-helpers.ts`](../../apps/web/test/browser/test-helpers.ts).
[^local-ci]: Unshelf source, [`package.json`](../../package.json) and [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml).
[^local-agent-workflows]: Unshelf source, [`.github/workflows/agent-implement.yml`](../../.github/workflows/agent-implement.yml) and [`.github/workflows/agent-implement-prd.yml`](../../.github/workflows/agent-implement-prd.yml).
[^local-sandcastle-package]: Unshelf source, [`.sandcastle/package.json`](../../.sandcastle/package.json), [`.sandcastle/implement/implement.ts`](../../.sandcastle/implement/implement.ts), and [`pnpm-lock.yaml`](../../pnpm-lock.yaml).
[^pw-visual]: Playwright, [Visual comparisons](https://playwright.dev/docs/test-snapshots).
[^pw-assertion]: Playwright, [`PageAssertions.toHaveScreenshot`](https://playwright.dev/docs/api/class-pageassertions#page-assertions-to-have-screenshot-2).
[^pw-browsers]: Playwright, [Browsers](https://playwright.dev/docs/browsers).
[^pw-ci]: Playwright, [Continuous Integration](https://playwright.dev/docs/ci).
[^pw-docker]: Playwright, [Docker](https://playwright.dev/docs/docker).
[^pw-actionability]: Playwright, [Auto-waiting](https://playwright.dev/docs/actionability).
[^pw-isolation]: Playwright, [Isolation](https://playwright.dev/docs/browser-contexts).
[^pw-clock]: Playwright, [Clock](https://playwright.dev/docs/clock).
[^pw-trace]: Playwright, [Trace viewer](https://playwright.dev/docs/trace-viewer-intro).
[^pw-best-practices]: Playwright, [Best Practices — Debugging on CI](https://playwright.dev/docs/best-practices#debugging-on-ci).
[^pw-aria]: Playwright, [ARIA snapshots](https://playwright.dev/docs/aria-snapshots).
[^pw-a11y]: Playwright, [Accessibility testing](https://playwright.dev/docs/accessibility-testing).
[^pw-cli]: Playwright, [Playwright CLI introduction](https://playwright.dev/agent-cli/introduction).
[^pw-mcp]: Playwright, [Playwright MCP introduction](https://playwright.dev/mcp/introduction).
[^codex-images]: Official OpenAI documentation, [Image inputs](https://learn.chatgpt.com/docs/image-inputs).
[^claude-images]: Anthropic, [Claude Code common workflows — Work with images](https://code.claude.com/docs/en/tutorials#work-with-images).
[^sandcastle-api]: Sandcastle 0.12.0, [release](https://github.com/mattpocock/sandcastle/releases/tag/%40ai-hero%2Fsandcastle%400.12.0) and [public API/README](https://github.com/mattpocock/sandcastle/tree/%40ai-hero%2Fsandcastle%400.12.0).
[^puppeteer-browsers]: Puppeteer, [Supported browsers](https://pptr.dev/supported-browsers).
[^puppeteer-headless]: Puppeteer, [Headless mode](https://pptr.dev/guides/headless-modes).
[^puppeteer-screenshots]: Puppeteer, [Screenshots](https://pptr.dev/guides/screenshots).
[^puppeteer-locators]: Puppeteer, [Page interactions](https://pptr.dev/guides/page-interactions).
[^puppeteer-debug]: Puppeteer, [Debugging](https://pptr.dev/guides/debugging).
[^puppeteer-docker]: Puppeteer, [Docker](https://pptr.dev/guides/docker).
[^webdriver-bidi]: W3C, [WebDriver BiDi](https://www.w3.org/TR/webdriver-bidi/).
[^selenium-webdriver]: Selenium, [WebDriver](https://www.selenium.dev/documentation/webdriver/).
[^selenium-waits]: Selenium, [Waiting strategies](https://www.selenium.dev/documentation/webdriver/waits/).
[^selenium-isolation]: Selenium, [Avoid sharing state](https://www.selenium.dev/documentation/test_practices/encouraged/avoid_sharing_state/).
[^selenium-practices]: Selenium, [Test practices](https://www.selenium.dev/documentation/test_practices/).
[^cypress-visual]: Cypress, [Visual testing in Cypress](https://docs.cypress.io/app/tooling/visual-testing).
[^pixelmatch]: Mapbox, [`pixelmatch`](https://github.com/mapbox/pixelmatch).
[^ssim]: `ssim.js`, [archived repository](https://github.com/obartra/ssim).
