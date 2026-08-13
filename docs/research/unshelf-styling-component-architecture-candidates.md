# Viable styling and component architectures for Unshelf

Researched 2026-08-13 against the Unshelf source tree, accepted product issues,
and current first-party project documentation and repositories.

## Question

Which maintained styling foundations, styled component systems, headless
primitive libraries, source-owned component approaches, and selective hybrids
are credible for a coordinated rewrite of Unshelf's React/Vite interface?

This memo maps the viable architecture space. It deliberately **does not select
a winner or assign evaluation weights**. Those are downstream decisions. A
candidate is credible here when it can plausibly cover the whole accepted
interface while preserving the reviewed warm-editorial composition, peer Light
and Dark appearances, accessible interactions, and an authoring surface that
both people and AI agents can apply consistently.

## Synthesis

Six complete architecture families merit a later, contract-driven comparison:

1. **Local semantic components + CSS Modules/custom-property tokens + selective
   Base UI or Radix Primitives.** This is the smallest dependency and runtime
   change from the current app, with full control over the reviewed design.
2. **Source-owned shadcn/ui components + Tailwind CSS v4 + one shadcn-supported
   primitive base (Base UI, Radix, or React Aria).** This supplies a particularly
   agent-visible registry and composition workflow while keeping component code
   editable in the repository.
3. **Source-owned Park UI components + Ark UI + strict Panda CSS.** This is a
   cohesive open-code, state-machine, typed-token stack with unusually strong
   enforcement potential.
4. **Local semantic components + React Aria Components + vanilla-extract.** This
   couples broad accessible interaction coverage to typed, build-time themes and
   variants without adopting another product's styled component suite.
5. **Mantine v8 + local Unshelf domain/layout components and CSS.** This offers a
   broad stable styled suite and static CSS, while isolating the plan studio and
   other normative compositions from suite-specific layout abstractions.
6. **Chakra UI v3 + a custom Unshelf system/recipes + local domain/layout
   components.** This offers a broad styled suite built on the same Ark/Panda
   lineage, with semantic tokens, recipes, type generation, and documented agent
   support.

These are architecture families, not six interchangeable packages. In every
family, the **Unshelf-owned semantic component layer**—for example `ItemStatus`,
`PartChecklist`, `DailyFocusEntry`, and `LearningPlanCanvas`—is what can make
product terminology, allowed variants, and interaction semantics uniform. A
token foundation alone cannot do that. A headless library supplies behavior,
not Unshelf's visual language. A styled suite supplies defaults, but its defaults
are not automatically the reviewed Unshelf design.

No surveyed library owns Unshelf's graph authoring. The plan canvas must remain a
local domain interaction: topology-derived layout, pointer pan/drag/connect,
fork/rejoin/unlink, small-screen read-only behavior, an ordered structural path,
explicit keyboard controls, and status announcements. Headless primitives can
cover its surrounding drawers, dialogs, menus, checkboxes, tabs, and popovers;
they should not be mistaken for a graph-accessibility solution.

## The interface the architecture must cover

### Baseline and constraints

The web package is a client-side React 19, React Router 7, and Vite 6 application
with no current styling or component dependency
([package manifest](../../apps/web/package.json),
[routing shell](../../apps/web/src/App.tsx)). Its visual implementation is one
large global stylesheet—3,214 lines at the research date—plus semantic custom
properties and some runtime CSS variables
([current stylesheet](../../apps/web/src/theme.css),
[plan canvas](../../apps/web/src/learning-plan/LearningPlanCanvas.tsx)). Vite has
built-in CSS Modules support, so a local-module architecture would not add a CSS
runtime or require a separate plugin
([Vite CSS documentation](https://vite.dev/guide/features.html#css-modules)).

The current target is not the older cool-grey “Quiet Focus” prose. ADR-0012's
2026-08-12 update makes the reviewed Rooms + plan studio composition normative:
warm neutral surfaces, forest-green primary accent, serif display type,
system-ui body type, quiet non-red past-target treatment, visible focus,
reduced-motion support, and peer Light/Dark appearances. The workspace defaults
to Light independently of the operating system, with persistent Light, Dark, and
System choices
([ADR-0012](../adr/0012-quiet-focus-theme-and-token-layer.md)). The rewrite may
adapt for data, accessibility, responsiveness, and dark mode, but not silently
replace the reviewed hierarchy, density, surface treatment, or layout
relationships.

### Shipped interaction inventory

| Area | Evidence-backed interaction need | Architectural consequence |
| --- | --- | --- |
| Global shell | Today, disabled Discover, Library, and Plans rooms; global Capture; account control; persistent Light/Dark/System control; active-route semantics and private-route restoration ([TopBar](../../apps/web/src/shell/TopBar.tsx), [ThemeControl](../../apps/web/src/shell/ThemeControl.tsx), [routes](../../apps/web/src/App.tsx)). | Navigation, button, tooltip/help, theme, and authentication states need one visual vocabulary. “Discover” must remain visibly unavailable without becoming an interactive route today. |
| Capture | A global overlay with required Title and Type, optional Source, native form validation, busy state, contained error, focus movement, dismissal, and keyboard shortcuts ([CaptureOverlay](../../apps/web/src/shell/CaptureOverlay.tsx), [shortcut hook](../../apps/web/src/shell/useCaptureShortcuts.ts)). | A dialog primitive is useful only if focus return, escape/outside behavior, labels, errors, and native fields remain explicit and testable. |
| Library and Item | URL-restorable search, Label filter, pressed view controls, list selection and preview, Item detail overlay/page, Status, Target date, Label editing, Source link, loading skeleton, empty/filter-empty/error/Retry states ([LibrarySurface](../../apps/web/src/surfaces/LibrarySurface.tsx), [ItemSurface](../../apps/web/src/surfaces/ItemSurface.tsx)). | Needs search fields, disclosure/popover-like filters, pressed/toggle groups, list selection, panels, forms, date input, and local asynchronous state patterns. |
| Structured Item | A flat ordered Part checklist with completion checkbox, multiline Part intake, rename, reorder, remove, percentage, and error announcement ([PartChecklist](../../apps/web/src/items/PartChecklist.tsx)). | Form and checkbox primitives cannot erase the Item/Part distinction; reorder must stay keyboard-operable and announced, whether or not richer drag-and-drop is later added. |
| Today and history | Date navigation, exact Item search, temporary Learning Plan lens and intention, deterministic suggestions with explanations, add/remove/Not today, shared Status editing, progress, and read-only historical snapshots ([TodaySurface](../../apps/web/src/surfaces/TodaySurface.tsx), [DailyFocusHistorySurface](../../apps/web/src/surfaces/DailyFocusHistorySurface.tsx)). | Needs tabs/pressed filters, search/combobox-like intake, repeatable Item rows, local mutations and announcements, and clear disabled/read-only states. |
| Plans index and studio | Plan create/archive/restore; continuous Library placement drawer–canvas–Today sidecar composition; Stage detail; responsive panels; URLs own open Item/Stage/Library state ([LearningPlansIndex](../../apps/web/src/learning-plans/LearningPlansIndex.tsx), [LearningPlanSurface](../../apps/web/src/surfaces/LearningPlanSurface.tsx), [PlanLibraryDrawer](../../apps/web/src/learning-plan/PlanLibraryDrawer.tsx), [StageSidebar](../../apps/web/src/stages/StageSidebar.tsx)). | Drawers/dialogs, scroll containment, skeleton/error/Retry patterns, and responsive composition need consistent primitives, but the geometry must remain local. |
| Plan graph | Desktop pointer pan, node drag, connect, unlink, fork, and rejoin; topology-derived dynamic positions; a structural ordered representation and explicit controls for non-pointer use; phone viewing without graph-authoring gestures ([LearningPlanCanvas](../../apps/web/src/learning-plan/LearningPlanCanvas.tsx), [topology module](../../apps/web/src/topology.ts)). | Generated-class systems must support runtime CSS custom properties for coordinates and progress. The local component must retain native controls, keyboard order, focus, and live/status text; no shortlisted primitive library replaces this work. |
| Cross-cutting states | Meaningful headings/landmarks, accessible names, pressed/current states, loading/status announcements, alert/Retry, empty and skeleton treatments, focus-visible, reduced motion, and no page-level phone overflow are accepted requirements ([implementation PRD #302](https://github.com/rajat2006/unshelf/issues/302), [browser tests](../../apps/web/test/browser), [theme CSS](../../apps/web/src/theme.css)). | Accessibility is jointly owned by primitive behavior, semantic HTML, application copy/state, visual focus/contrast, and end-to-end checks. A library's “accessible” claim covers only part of the contract. |

This inventory uses the project's domain language: a User Captures an Item into
the Library; a Structured Item owns Parts; a Learning Plan contains direct or
Stage-grouped Item placements; Daily Focus selects whole Items; Provider,
Follow, Candidate, Discovery, Keep, and Dismiss belong to recurring discovery
([domain glossary](../../CONTEXT.md)). Component names and APIs that encode this
language are more enforceable than generic visual names scattered through route
components.

### Accepted horizon, not current implementation

Issue #301 accepts the next Discover workflow but does not make it shipped UI.
It adds Follow query/filter configuration and pause/remove lifecycle; Discovery
and Candidate intake with Keep/Dismiss; and loading, empty, quota-exhausted,
authentication-expired, Retry, prior-dismissal, and already-in-Library states
([accepted Discover specification](https://github.com/rajat2006/unshelf/issues/301)).
Those needs justify evaluating dialog, form, combobox/select, menu, toggle,
disclosure, toast/status, and collection behavior now. They do **not** justify a
dashboard, data-grid, visual workflow builder, notification system, or provider-
specific component architecture.

Likewise, mobile graph authoring, nested Parts, reminders, PWA/native clients,
collaboration, dashboards, and a functional Discover route are outside the
current implementation PRD
([PRD #302](https://github.com/rajat2006/unshelf/issues/302)). They should not
inflate this architecture choice.

## Candidate building blocks

### Styling foundations

| Foundation | What the primary sources establish | Fit and cost for Unshelf |
| --- | --- | --- |
| Native CSS + CSS Modules + custom properties | CSS Modules locally scope class and animation names and export a mapping to JavaScript ([CSS Modules repository](https://github.com/css-modules/css-modules)); Vite recognizes `.module.css` files without an added styling runtime ([Vite](https://vite.dev/guide/features.html#css-modules)). | Maximum fidelity and minimum dependency/runtime cost. Native custom properties suit Light/Dark semantic tokens and dynamic canvas geometry. Uniformity and agent correctness depend on a carefully bounded token vocabulary, semantic local components, lint/review rules, and examples; TypeScript does not itself reject a raw CSS value or an invented variant. |
| Tailwind CSS v4 | Tailwind's official Vite plugin generates static CSS; v4 defines theme variables in CSS, supports custom data-attribute dark selectors, and scans source as plain text rather than evaluating dynamic class interpolation ([Vite install](https://tailwindcss.com/docs/installation/using-vite), [theme variables](https://tailwindcss.com/docs/theme), [dark mode](https://tailwindcss.com/docs/dark-mode), [source detection](https://tailwindcss.com/docs/detecting-classes-in-source-files)). It offers arbitrary values/properties as an escape hatch and official IntelliSense plus class-sorting tooling ([custom styles](https://tailwindcss.com/docs/adding-custom-styles), [editor setup](https://tailwindcss.com/docs/editor-setup)). | Zero style runtime, broad familiarity, and strong shadcn tooling. Complete static class maps work well for variants; interpolated class fragments do not. Arbitrary values and long local class lists make pixel fidelity easy but can also let visual decisions drift unless repository policy limits them. Runtime graph coordinates should stay CSS variables or inline custom properties. |
| Panda CSS | Panda statically extracts styles for React/Vite, produces typed tokens and recipes, supports semantic tokens/conditions, and can enable `strictTokens` and `strictPropertyValues` ([getting started](https://panda-css.com/docs/overview/getting-started), [configuration](https://panda-css.com/docs/references/config), [recipes](https://panda-css.com/docs/concepts/recipes), [tokens](https://panda-css.com/docs/theming/tokens)). Its docs explicitly say dynamic style values cannot be statically extracted and prescribe enumerated values, tokens, data attributes, or CSS variables ([dynamic styling](https://panda-css.com/docs/guides/dynamic-styling)). Panda also publishes machine-readable AI docs and can generate token/recipe documentation ([AI docs](https://panda-css.com/docs/ai/llms-txt), [Studio](https://panda-css.com/docs/theming/studio)). | The strongest built-in candidate for rejecting unapproved tokens and invalid recipe variants at authoring time. It adds code generation, generated-source lifecycle, configuration, and CI drift checks. Strict tokens cover token-bearing properties, not every legal CSS value or unique layout decision. Canvas coordinates still need runtime variables. |
| vanilla-extract + recipes/sprinkles | vanilla-extract writes typed styles in `.css.ts` and emits static CSS through its Vite integration. `createThemeContract` requires every theme value and exposes CSS variables; recipes provide typed variants; sprinkles can constrain atomic values ([setup](https://vanilla-extract.style/documentation/setup), [Vite integration](https://vanilla-extract.style/documentation/integrations/vite/), [theme contracts](https://vanilla-extract.style/documentation/api/create-theme-contract/), [recipes](https://vanilla-extract.style/documentation/packages/recipes/), [sprinkles](https://vanilla-extract.style/documentation/sprinkles-api/)). Its optional dynamic package assigns CSS variables at runtime and is documented as under 1 kB compressed ([dynamic](https://vanilla-extract.style/documentation/packages/dynamic/)). | Strong typed Light/Dark completeness and component variants with native CSS output. It preserves exact CSS expressiveness, including local geometry. The extra `.css.ts` authoring model and Vite integration are more machinery than CSS Modules, and raw values remain possible outside a governed recipe/sprinkles layer. |

### Headless interaction primitives

All five libraries below are compatible with React 19 either through documented
React ranges or active React 19 support. None supplies the warm-editorial visual
system; all require local styles and application-level accessible names, errors,
status copy, and validation.

| Library | First-party evidence | Relative fit for Unshelf |
| --- | --- | --- |
| Base UI | Base UI is unstyled, works with any styling method, supports React 17+, and documents WAI-ARIA behavior plus testing across assistive technologies and devices. It ships one tree-shakable package and machine-readable `llms.txt`/Markdown docs ([about](https://base-ui.com/react/overview/about), [quick start](https://base-ui.com/react/overview/quick-start), [accessibility](https://base-ui.com/react/overview/accessibility)). It reached stable 1.0 in December 2025 and has continued releases with accessibility and interaction fixes ([releases](https://base-ui.com/react/overview/releases)). | Broad modern coverage including Dialog, Drawer, Combobox, Menu, Tabs, Toast, and form controls; low visual lock-in and good agent-readable docs. It is younger as a stable major than Radix or React Aria, so upgrade behavior deserves verification in the later evaluation. |
| Radix Primitives | Radix is accessible, unstyled, typed, incrementally adoptable, and tree-shakeable. It handles much of the WAI-ARIA, focus, and keyboard behavior and exposes state for styling; its guide also makes clear that consumers still own functional styles such as the dialog overlay ([introduction](https://www.radix-ui.com/primitives/docs/overview/introduction), [accessibility](https://www.radix-ui.com/primitives/docs/overview/accessibility), [styling](https://www.radix-ui.com/primitives/docs/guides/styling)). Current releases include React 19 and tree-shaking work ([releases](https://www.radix-ui.com/primitives/docs/overview/releases)). | Mature, well-understood, and easy to adopt selectively for overlays, popovers, menus, tabs, and controls. Its set is narrower than React Aria's collection/drag-and-drop surface and Base UI's newer breadth. The application still owns labeling, visual focus, composition, and graph behavior. |
| React Aria Components | React Aria provides unstyled components and lower-level hooks for accessible, internationalized interactions, with broad device and assistive-technology testing and data attributes for styling ([getting started](https://react-spectrum.adobe.com/react-aria/getting-started.html), [repository](https://github.com/adobe/react-spectrum)). Its collection drag-and-drop supports mouse, touch, keyboard, and screen-reader interaction ([drag and drop](https://react-spectrum.adobe.com/react-aria/dnd.html)); its starter set demonstrates dialogs, comboboxes, search, tabs, tag groups, grid lists, trees, and complete interaction states ([starter](https://react-spectrum.adobe.com/react-aria-starter/)). | Deepest surveyed coverage for collection, selection, focus, internationalization, and accessible drag/reorder. That is valuable for Discover intake and possible richer Part reordering, but its abstractions and package surface are more than Unshelf needs for simple controls. It still does not solve arbitrary DAG authoring. |
| Ark UI | Ark offers unstyled accessible components across React and other frameworks, driven by Zag finite-state machines. It exposes predictable state and `data-scope`/`data-part`/`data-state` styling hooks and explicitly recommends Panda slot recipes ([about](https://ark-ui.com/docs/overview/about), [styling](https://ark-ui.com/docs/guides/styling), [forms](https://ark-ui.com/docs/guides/forms)). | A coherent primitive layer under Panda/Park or Chakra, with broad complex-control coverage and predictable state. The price is a larger runtime/state-machine architecture than selective native elements or Radix/Base. Multi-framework support has no direct Unshelf value. |
| Ariakit | Ariakit supports React 17+, exports unstyled accessible components and hooks, accepts native `className`, `style`, and refs, and documents stable styling selectors ([getting started](https://ariakit.org/guide/getting-started), [styling](https://ariakit.org/guide/styling)). Its component set covers Button, Checkbox, Combobox, Dialog, Disclosure, Form, Menu, Popover, Select, Tab, Toolbar, and lower-level Composite/Focusable behavior ([components](https://ariakit.org/components)); its first-party repository remained active in 2026 ([repository](https://github.com/ariakit/ariakit)). | Credible and maintained, especially when lower-level composite/focus hooks are desired. It is lower priority for this bounded comparison because it neither supplies the collection/drag-and-drop depth that distinguishes React Aria nor the source-owned/tooling ecosystem of Base/Radix through shadcn or Ark through Park/Panda. That is a relative ecosystem fit, not an accessibility rejection. |

Mixing several primitive libraries across similar controls would expose different
composition APIs, state attributes, focus assumptions, portals, and upgrade
cadences to agents. Selective adoption means one default primitive family plus
native elements or documented exceptions—not choosing a different library for
every component.

### Source-owned component systems

| System | First-party evidence | Fit and cost for Unshelf |
| --- | --- | --- |
| shadcn/ui | shadcn describes itself as open, editable component code rather than a conventional installed component library, with a consistent composable interface and registry-based distribution ([introduction](https://ui.shadcn.com/docs)). It documents Vite/monorepo and Light/Dark/System setup, an MCP server for agents, and private registries that can distribute components and rules ([Vite](https://ui.shadcn.com/docs/installation/vite), [dark mode](https://ui.shadcn.com/docs/dark-mode/vite), [MCP](https://ui.shadcn.com/docs/mcp), [registry](https://ui.shadcn.com/docs/registry)). Its 2026 changelog adds composition guidance aimed at reliable agent output and supports Base UI, Radix, and React Aria bases ([changelog](https://ui.shadcn.com/docs/changelog)). | Strongest surveyed off-the-shelf agent discovery/install path and full local source visibility. Local ownership allows exact Unshelf composition, but it also means Unshelf owns upgrades, divergence, and tests. The default visual recipes are starting code, not the warm-editorial contract. Tailwind's arbitrary-value escape remains unless governed. A single primitive base should be selected rather than mixed casually. |
| Park UI | Park provides accessible open component code and recipes built on Ark UI and Panda CSS, copied into the application and exposed through a consistent API ([introduction](https://park-ui.com/docs/introduction), [installation](https://park-ui.com/docs/installation)). Installation includes Panda code generation plus Ark and icon dependencies. The project joined the Chakra organization in November 2025 ([first-party announcement](https://park-ui.com/blog/park-ui-joins-the-chakra-ui-organization)). | Cohesive source ownership plus typed recipes and state-machine behavior. It adds the most layers and generated artifacts of the source-owned candidates—Park source, Ark/Zag runtime, Panda extraction/typegen—and its bundled colors/recipes must be replaced or mapped to Unshelf semantics. Its history as a unified system is shorter than shadcn's. |

“Source-owned” is not maintenance-free. It changes the upgrade model from
updating a single package to reviewing upstream changes and deliberately
reconciling locally owned code. That can improve correctness because all behavior
is inspectable, but only if provenance, local modifications, and refresh policy
are documented.

### Full styled suites

| Suite | First-party evidence | Fit and cost for Unshelf |
| --- | --- | --- |
| Mantine v8 | Mantine v8 advertises more than 120 customizable components and 70 hooks, modern React/Vite/React Router support, and native CSS without a CSS-in-JS runtime ([v8 site](https://v8.mantine.dev/), [getting started](https://v8.mantine.dev/getting-started)). Its theme object centralizes fonts, headings, colors, spacing, radius, and focus-ring behavior; `MantineProvider` manages color schemes and CSS variables ([theme object](https://v8.mantine.dev/theming/theme-object), [provider](https://v8.mantine.dev/theming/mantine-provider)). Components ship CSS Modules, with whole-library or per-component CSS imports and a Styles API; style props also accept responsive and direct values ([styles](https://v8.mantine.dev/styles/mantine-styles), [style props](https://v8.mantine.dev/styles/style-props)). | Broad coverage and static styles make a coordinated rewrite plausible with relatively few local primitives. The suite's component anatomy, default metrics, and permissive style props exert visual/API gravity; exact prototype fidelity requires a custom theme, deliberate Styles API work, and local components for the room compositions and plan studio. Raw style props can bypass the intended vocabulary. Stable v8 is the candidate here, not the v9 alpha. |
| Chakra UI v3 | Chakra's Vite guide supports React/Vite and installs `@chakra-ui/react` with Emotion; its provider setup uses a color-mode helper ([Vite guide](https://chakra-ui.com/docs/get-started/frameworks/vite)). Semantic tokens support conditional Light/Dark values, recipes express component variants, and the CLI generates types ([semantic tokens](https://chakra-ui.com/docs/theming/semantic-tokens), [recipes](https://chakra-ui.com/docs/theming/recipes)). Current component docs expose source/recipe/Ark links and agent-skill hints ([Dialog](https://chakra-ui.com/docs/components/dialog), [conditional styles](https://chakra-ui.com/docs/styling/conditional-styles)). | A coherent styled suite with broad accessible behavior and better token/recipe typing than unconstrained CSS-in-JS. It still carries an Emotion style runtime and broad style-prop escape surface. Exact Unshelf fidelity requires replacing the default system and isolating distinctive layouts/domain interactions behind local components. Chakra v3's compound APIs and migration history make an upgrade proof worthwhile. |

## Complete combinations worth shortlisting

The following comparison is deliberately qualitative and unweighted. “High”
fidelity or enforcement means the architecture exposes the necessary mechanism;
it does not claim the implementation will use it correctly.

| Complete architecture | React/Vite and maturity | Warm-editorial Light/Dark fidelity | Accessibility and interaction coverage | Uniformity and AI-agent correctness | Whole-rewrite suitability | Maintenance, runtime, and dependency cost |
| --- | --- | --- | --- | --- | --- | --- |
| Local semantic components + CSS Modules/custom-property tokens + selective Base UI or Radix | Native Vite path; React 19-compatible primitives; Radix is more mature, Base UI newer stable and actively released. | Highest direct CSS control; semantic variables naturally preserve peer themes and dynamic geometry. | Good overlay/menu/tab/form foundations; application owns collections, announcements, Part reorder, and graph. | Potentially strong through a small local public API, but weakest built-in prevention of raw CSS/class invention. Requires explicit token/component docs, lint boundaries, examples, and tests. | Close to current implementation and easy to tailor across every surface; rewrite must split the global stylesheet and replace route-level class conventions coherently. | Lowest framework and runtime cost; local design-system behavior/tests become Unshelf's maintenance burden. |
| shadcn source + Tailwind v4 + one Base/Radix/React Aria base | Current Vite flow and active 2026 registry/tooling; maturity varies with chosen primitive base. | High; all source is editable and data-attribute theming works. Default recipes must be fully re-authored to avoid a generic shadcn appearance. | Good to very broad depending on base; React Aria offers the deepest collection behavior. Graph remains local. | Strong agent discovery, registry, composition docs, and source visibility. Static complete classes are reliable; arbitrary utilities and registry additions require policy and review. | Good for a coordinated source rewrite and a private Unshelf registry; requires deliberate inventory so generated/downloaded components do not define the product vocabulary. | Static CSS; per-component source plus primitive and utility dependencies. Unshelf owns copied-code upgrades and local divergence. |
| Park source + Ark + strict Panda | Current React/Vite build-time path; active Chakra-backed ecosystem, but younger unified source stack. | High; semantic tokens, slot recipes, and CSS variables can encode both themes and the reviewed composition. | Broad Ark/Zag state-machine primitives; graph and bespoke reorder still local. | Strongest mechanical token/recipe enforcement, generated types/docs, and predictable `data-part` anatomy. Dynamic extraction rules must be understood by agents. | Good if the rewrite accepts a codegen-first system across all components; unique geometry stays in local recipes/CSS variables. | Static styling but Ark/Zag runtime, Panda build/codegen, Park-owned source, icons, and generated tree. Highest tooling/layer count. |
| Local semantic components + React Aria + vanilla-extract | React/Vite-compatible, long-running Adobe accessibility project plus stable build-time styling tools. | High; typed theme contracts guarantee theme shape and native CSS supports distinctive editorial/layout work. | Broadest surveyed accessible interaction, collection, selection, i18n, and drag/reorder support; graph remains local. | Typed themes/recipes constrain component APIs; no first-party Unshelf registry, so local documentation/examples must guide agents. Raw values remain possible outside the governed layer. | Strong for a full local system where interaction correctness matters more than acquiring pre-styled breadth. More initial component authoring than suites/source catalogs. | Static CSS; React Aria and vanilla-extract/build plugin dependencies. Local component volume and abstraction learning are the main costs. |
| Mantine v8 + local domain/layout CSS | Stable broad suite with official Vite/React Router support and static CSS. | Medium-high: extensive theme/Styles APIs can reach the target, but suite anatomy/default metrics increase override work and visual drift risk. | Broad routine component/hook coverage; bespoke graph and product state semantics stay local. | Central theme and consistent suite APIs help uniformity; permissive style props and a large API surface weaken strict enforcement unless wrapped. AI-specific workflows are less explicit than shadcn/Panda/Chakra. | Fastest broad inventory coverage, but the rewrite must prevent Mantine layout primitives from replacing normative Rooms/studio composition. | No CSS-in-JS runtime in v8; substantial component/hooks packages and CSS. Fewer local primitives, more suite upgrade/theming exposure. |
| Chakra UI v3 + custom system/recipes + local domain/layout components | Official Vite setup, current v3 compound APIs, and active Ark/Panda-aligned ecosystem. | Medium-high: semantic tokens/recipes support peer themes, while default recipes and style props need firm replacement/boundaries for exact fidelity. | Broad accessible components backed by Ark patterns; graph remains local. | Generated token/recipe types and agent guidance are strong; unrestricted JSX style props can still bypass the system unless local wrappers are the supported API. | Broad enough for the coordinated rewrite if all route code targets Unshelf wrappers rather than raw Chakra primitives. | Emotion runtime plus Chakra/Ark-related dependencies and color-mode provider; custom system/typegen and major-version upgrades add maintenance. |

There are meaningful variants *inside* two rows: Base UI versus Radix for the
local-CSS family, and Base/Radix/React Aria for shadcn. The downstream evaluation
should pick one representative base per prototype or proof rather than counting
every permutation as an independent architecture.

## Material candidates not carried into the six families

### Runtime CSS-in-JS as the styling foundation

The `styled-components` package and Emotion are maintained, React-capable
technologies—not synonyms for “styled component systems” as a category.
`styled-components` generates scoped CSS and injects only rendered component
styles; it supports props, themes, TypeScript, Vite, and dynamic rules
([basics](https://styled-components.com/docs/basics),
[Vite tooling](https://styled-components.com/docs/tooling)). Its first-party
repository describes a sub-13 kB gzipped runtime and also states that the project
is largely maintained by one person
([repository](https://github.com/styled-components/styled-components)). Emotion
offers React `css` and `styled` APIs, theme functions, composition, and a cache
that inserts style tags at runtime
([introduction](https://emotion.sh/docs/introduction),
[cache](https://emotion.sh/docs/%40emotion/cache),
[package relationships](https://emotion.sh/docs/package-summary)).

Either can render Unshelf faithfully, but neither alone provides accessible
behavior, a governed component catalog, or stricter token/variant enforcement
than the static candidates. Both add a client style runtime to a Vite SPA whose
dynamic needs can already be expressed with CSS variables. They are therefore
not separate complete shortlist families. Emotion remains an indirect cost in
the Chakra candidate, where the broader component system—not Emotion by
itself—is the reason to accept it.

### Ariakit as the default primitive layer

Ariakit is not excluded for immaturity or accessibility. It is a credible,
actively maintained React headless library with the controls Unshelf routinely
needs. It is lower priority only because the bounded set already contains:

- Base/Radix, with stronger direct source-owned ecosystem paths through shadcn;
- Ark, with the coherent Panda/Park/Chakra path; and
- React Aria, with differentiated collection, drag-and-drop, internationalization,
  and assistive-technology depth.

If the later evaluation finds Ariakit's Composite/Focusable hooks uniquely
better for an Unshelf proof, it can substitute into the local-CSS family without
changing that family's ownership model.

### Other obvious architectures

- **The current global stylesheet, unchanged:** native CSS remains credible, but
  one shared 3,214-line selector namespace is not the credible architecture.
  Local modules/components and a governed semantic-token surface are what make
  the native option maintainable and agent-readable.
- **A headless library without a styling and ownership layer:** it can improve
  behavior but cannot produce theme fidelity, visual uniformity, or product-
  semantic component APIs by itself.
- **MUI Material as the default suite:** MUI is mature and supports React 17–19,
  Emotion, theming, and CSS theme variables
  ([installation](https://mui.com/material-ui/getting-started/installation/),
  [supported platforms](https://mui.com/material-ui/getting-started/supported-platforms/),
  [theming](https://mui.com/material-ui/customization/theming/)). It is lower fit
  because Material's visual semantics and component anatomy are a more
  opinionated starting point than the reviewed warm-editorial workspace; a full
  retheme would pay suite and Emotion costs while overriding much of the reason
  to choose Material.
- **Radix Themes as the whole visual system:** Radix Themes provides pre-styled
  components and theme configuration for accent, gray, radius, and scaling
  ([getting started](https://www.radix-ui.com/themes/docs/overview/getting-started)).
  That configuration is convenient but too coarse to own the normative room and
  plan-studio compositions. Radix Primitives remains credible underneath a local
  system.
- **Multiple peer primitive or visual systems:** apparent per-control freedom
  becomes several focus models, state attributes, portals, spacing APIs, and
  upgrade paths. A documented exception is reasonable; routine mixing works
  against the ticket's uniformity and agent-correctness goals.
- **A graph/canvas framework as the overall component architecture:** the plan
  canvas is distinctive but only one surface. Bringing in a graph dependency
  could be evaluated separately if local pointer/layout work proves inadequate;
  it should not decide buttons, forms, themes, Discover intake, or route panels.

## Architecture seams the downstream decision must make explicit

This research does not decide these contracts, but it shows that every viable
combination needs answers to them:

1. **One semantic token source:** which names are public, how Light/Dark/System
   resolve, and which values are stable design decisions versus unique layout
   geometry.
2. **One supported component-authoring surface:** which Unshelf components route
   code may import, which raw foundation/primitive imports are private, and how a
   justified escape is represented.
3. **Primitive ownership:** native HTML first where sufficient; one default
   headless family for complex controls; explicit local ownership of labels,
   announcements, async state, and plan graph accessibility.
4. **Variant and raw-value policy:** whether type generation, lint rules, package
   boundaries, CI codegen checks, or review conventions prevent invented colors,
   spacing, radii, and component variants.
5. **Source/generated-code lifecycle:** for shadcn/Park, how copied code records
   provenance and receives fixes; for Panda/Chakra/vanilla-extract, how generated
   artifacts are reproduced and verified.
6. **Agent-readable examples:** canonical compositions for overlays, fields,
   errors, empty states, status announcements, responsive panels, and domain
   rows—not only a palette list. A registry, Storybook, generated docs, or local
   examples can fill this role, but the choice must be maintained.
7. **Rewrite boundary and verification:** because the destination is a coordinated
   whole-interface rewrite, the chosen stack must cover the full inventory above
   before old selectors and components are removed. Visual regression across
   both themes and responsive sizes, keyboard/screen-reader checks, and the
   existing browser/axe seam are part of architecture validation, not polish.

## Limitations

- Official project documentation describes intended APIs and accessibility work;
  it does not prove that every component, browser, assistive-technology pair, or
  edge case is defect-free. Representative Unshelf interaction proofs are still
  necessary.
- Bundle and runtime costs are architectural comparisons, not measured Unshelf
  bundles. Tree shaking and per-component imports depend on the exact components
  and build configuration selected later.
- Maintenance signals are current as of 2026-08-13. Release cadence alone does not
  establish long-term stewardship.
- This memo did not prototype visual fidelity, measure migration effort, or assign
  scores. It narrows the credible space so the separate evaluation and visual-
  system contracts can do that work without prematurely selecting a winner.
