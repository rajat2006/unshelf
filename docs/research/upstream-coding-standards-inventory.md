# Upstream coding-standards skill inventory

Research date: 2026-07-27

## Question

At an exact pinned commit of `ai-hero-dev/cohort-004-project`, what is the complete progressive-disclosure structure of its coding-standards skill, and what rules does every file contain?

This memo is an inventory only. It does not keep, discard, adapt, merge, consolidate, or otherwise disposition any rule.

## Pinned source

- Repository: [`ai-hero-dev/cohort-004-project`](https://github.com/ai-hero-dev/cohort-004-project)
- Branch inspected: `live-run-through`
- Commit: [`67a9c0d74918497727a0d364d624f552b6573edc`](https://github.com/ai-hero-dev/cohort-004-project/tree/67a9c0d74918497727a0d364d624f552b6573edc)
- Commit timestamp: 2026-06-30T11:21:22+01:00
- Commit subject: `chore: reconcile pnpm-lock.yaml after sandcastle 0.12.0 rebase`
- Skill tree: [`.claude/skills/coding-standards/`](https://github.com/ai-hero-dev/cohort-004-project/tree/67a9c0d74918497727a0d364d624f552b6573edc/.claude/skills/coding-standards)

The repository's default `main` branch was at `b214b5c35523d8119022ea459dab110d36a5f873` when this research was performed and did not contain the coding-standards skill. The inventory is therefore deliberately pinned to the `live-run-through` revision above.

## Inventory method and identifier scheme

The only evidence used is source code in the pinned repository. A **rule occurrence** is an upstream imperative, prohibition, required shape, or prescribed location. Closely related clauses remain separate when the source states them separately. Repeated statements also remain separate occurrences. Descriptive setup, examples, and named reference implementations are recorded as structural context rather than silently promoted into additional rules.

Stable identifiers have the form `CS-<file>-<topic>-<sequence>`. Their meaning is fixed by this memo and the pinned source range beside each identifier; they are not claimed to be identifiers supplied by upstream.

## Progressive-disclosure structure

The skill has exactly two disclosure levels and six Markdown files (156 lines total):

1. [`SKILL.md`](https://github.com/ai-hero-dev/cohort-004-project/blob/67a9c0d74918497727a0d364d624f552b6573edc/.claude/skills/coding-standards/SKILL.md) is the 22-line entry point. Its frontmatter names and triggers the skill; its body tells the agent how much to load and links all five reference files.
2. Five peer reference files hold the layer-specific rules. None links to another standards file, so there is no third disclosure level.

| Order | Entry-point description | Reference file | Lines | Git blob |
|---|---|---|---:|---|
| 1 | Function signatures, `any`, import aliases | [`typescript.md`](https://github.com/ai-hero-dev/cohort-004-project/blob/67a9c0d74918497727a0d364d624f552b6573edc/.claude/skills/coding-standards/typescript.md) | 21 | `aa6940f7362656835fdf3f3da54e4e5535971b0f` |
| 2 | Schema conventions: ids, timestamps, booleans, soft deletes, prices, database instance | [`database.md`](https://github.com/ai-hero-dev/cohort-004-project/blob/67a9c0d74918497727a0d364d624f552b6573edc/.claude/skills/coding-standards/database.md) | 31 | `47585d679d74c023f03e580734ad9f1984e10c64` |
| 3 | Service result pattern, Vitest setup, database mocking | [`services-and-testing.md`](https://github.com/ai-hero-dev/cohort-004-project/blob/67a9c0d74918497727a0d364d624f552b6573edc/.claude/skills/coding-standards/services-and-testing.md) | 33 | `1084394d64d41f6973c3b9c445f8ed7489994b7e` |
| 4 | React Router v7 routes, form validation, discriminated unions, auth | [`routes-and-forms.md`](https://github.com/ai-hero-dev/cohort-004-project/blob/67a9c0d74918497727a0d364d624f552b6573edc/.claude/skills/coding-standards/routes-and-forms.md) | 33 | `d3b1f40a00fa47404c4e6fa1b48d4961373f04c3` |
| 5 | `cn()`, shadcn layout, `formatPrice()` | [`frontend-and-ui.md`](https://github.com/ai-hero-dev/cohort-004-project/blob/67a9c0d74918497727a0d364d624f552b6573edc/.claude/skills/coding-standards/frontend-and-ui.md) | 16 | `f1c6f5ca46efa813eb66384801aef4789d712fda` |

The entry point says to load the reference matching the area being touched, but to load all five for reviews or work spanning the stack. Its “When to use” section restates the writing and review behavior and adds an explicit natural-language trigger.

## Entry-point rules

Source file: [`SKILL.md`](https://github.com/ai-hero-dev/cohort-004-project/blob/67a9c0d74918497727a0d364d624f552b6573edc/.claude/skills/coding-standards/SKILL.md)

| Stable ID | Source | Faithful bounded representation |
|---|---|---|
| `CS-ROOT-TRIGGER-01` | [line 3](https://github.com/ai-hero-dev/cohort-004-project/blob/67a9c0d74918497727a0d364d624f552b6573edc/.claude/skills/coding-standards/SKILL.md#L3) | Use this project-standards skill whenever writing or reviewing code, conducting a code review, or implementing a feature in the repository. |
| `CS-ROOT-LOAD-01` | [line 8](https://github.com/ai-hero-dev/cohort-004-project/blob/67a9c0d74918497727a0d364d624f552b6573edc/.claude/skills/coding-standards/SKILL.md#L8) | Load the reference file or files matching the area being touched. |
| `CS-ROOT-LOAD-02` | [line 8](https://github.com/ai-hero-dev/cohort-004-project/blob/67a9c0d74918497727a0d364d624f552b6573edc/.claude/skills/coding-standards/SKILL.md#L8) | For reviews or anything spanning the stack, load all five references. |
| `CS-ROOT-USE-01` | [line 20](https://github.com/ai-hero-dev/cohort-004-project/blob/67a9c0d74918497727a0d364d624f552b6573edc/.claude/skills/coding-standards/SKILL.md#L20) | Before writing new code, load the reference matching the current layer. |
| `CS-ROOT-USE-02` | [line 21](https://github.com/ai-hero-dev/cohort-004-project/blob/67a9c0d74918497727a0d364d624f552b6573edc/.claude/skills/coding-standards/SKILL.md#L21) | During review, load all references and check the diff against each. |
| `CS-ROOT-USE-03` | [line 22](https://github.com/ai-hero-dev/cohort-004-project/blob/67a9c0d74918497727a0d364d624f552b6573edc/.claude/skills/coding-standards/SKILL.md#L22) | Use the skill when the user asks about “coding standards,” “conventions,” “the rules,” or how something should be done in the repository. |

## Reference-file rule inventory

### `typescript.md`

Structural context: one title and three second-level sections, in this order: “Object parameters for same-typed args,” “No `any`,” and “Import alias.” The first section includes a bad/good TypeScript example at [lines 7–13](https://github.com/ai-hero-dev/cohort-004-project/blob/67a9c0d74918497727a0d364d624f552b6573edc/.claude/skills/coding-standards/typescript.md#L7-L13).

| Stable ID | Source | Faithful bounded representation |
|---|---|---|
| `CS-TS-PARAMS-01` | [lines 3–5](https://github.com/ai-hero-dev/cohort-004-project/blob/67a9c0d74918497727a0d364d624f552b6573edc/.claude/skills/coding-standards/typescript.md#L3-L5) | When a function has more than one parameter of the same type, use one object parameter rather than positional parameters. |
| `CS-TS-ANY-01` | [lines 15–17](https://github.com/ai-hero-dev/cohort-004-project/blob/67a9c0d74918497727a0d364d624f552b6573edc/.claude/skills/coding-standards/typescript.md#L15-L17) | Do not use `any`. |
| `CS-TS-ANY-02` | [line 17](https://github.com/ai-hero-dev/cohort-004-project/blob/67a9c0d74918497727a0d364d624f552b6573edc/.claude/skills/coding-standards/typescript.md#L17) | When unsure of a type, check the Drizzle schema or use `typeof` inference. |
| `CS-TS-IMPORT-01` | [lines 19–21](https://github.com/ai-hero-dev/cohort-004-project/blob/67a9c0d74918497727a0d364d624f552b6573edc/.claude/skills/coding-standards/typescript.md#L19-L21) | Use the `~/*` alias for anything inside `/app`. |
| `CS-TS-IMPORT-02` | [line 21](https://github.com/ai-hero-dev/cohort-004-project/blob/67a9c0d74918497727a0d364d624f552b6573edc/.claude/skills/coding-standards/typescript.md#L21) | Do not use relative imports such as `../../lib/utils`; use an alias such as `~/lib/utils`. |

### `database.md`

Structural context: the file opens by identifying SQLite, better-sqlite3, and Drizzle, and says the shared database instance is initialized in `app/db/index.ts` with WAL mode and foreign keys enabled ([lines 1–3](https://github.com/ai-hero-dev/cohort-004-project/blob/67a9c0d74918497727a0d364d624f552b6573edc/.claude/skills/coding-standards/database.md#L1-L3)). It then has five sections in order: IDs, Timestamps, Booleans, Soft deletes, and Prices. The timestamp and boolean sections each include a one-line schema example.

| Stable ID | Source | Faithful bounded representation |
|---|---|---|
| `CS-DB-STACK-01` | [lines 1–3](https://github.com/ai-hero-dev/cohort-004-project/blob/67a9c0d74918497727a0d364d624f552b6573edc/.claude/skills/coding-standards/database.md#L1-L3) | The database stack is SQLite via better-sqlite3 and Drizzle. |
| `CS-DB-CONNECTION-01` | [line 3](https://github.com/ai-hero-dev/cohort-004-project/blob/67a9c0d74918497727a0d364d624f552b6573edc/.claude/skills/coding-standards/database.md#L3) | Do not create new `Database` connections in service code unless there is “a really good reason.” |
| `CS-DB-ID-01` | [lines 5–7](https://github.com/ai-hero-dev/cohort-004-project/blob/67a9c0d74918497727a0d364d624f552b6573edc/.claude/skills/coding-standards/database.md#L5-L7) | IDs are always `integer().primaryKey({ autoIncrement: true })`. |
| `CS-DB-ID-02` | [line 7](https://github.com/ai-hero-dev/cohort-004-project/blob/67a9c0d74918497727a0d364d624f552b6573edc/.claude/skills/coding-standards/database.md#L7) | Do not use UUIDs. |
| `CS-DB-TIMESTAMP-01` | [lines 9–11](https://github.com/ai-hero-dev/cohort-004-project/blob/67a9c0d74918497727a0d364d624f552b6573edc/.claude/skills/coding-standards/database.md#L9-L11) | Store timestamps as ISO strings in `text` columns. |
| `CS-DB-TIMESTAMP-02` | [line 11](https://github.com/ai-hero-dev/cohort-004-project/blob/67a9c0d74918497727a0d364d624f552b6573edc/.claude/skills/coding-standards/database.md#L11) | Do not store timestamps as Unix timestamps or integers. |
| `CS-DB-BOOLEAN-01` | [lines 17–23](https://github.com/ai-hero-dev/cohort-004-project/blob/67a9c0d74918497727a0d364d624f552b6573edc/.claude/skills/coding-standards/database.md#L17-L23) | Store booleans as integers using Drizzle's `mode: "boolean"`. |
| `CS-DB-SOFT-DELETE-01` | [lines 25–27](https://github.com/ai-hero-dev/cohort-004-project/blob/67a9c0d74918497727a0d364d624f552b6573edc/.claude/skills/coding-standards/database.md#L25-L27) | Implement soft deletion with a nullable `text("deleted_at")` column. |
| `CS-DB-SOFT-DELETE-02` | [line 27](https://github.com/ai-hero-dev/cohort-004-project/blob/67a9c0d74918497727a0d364d624f552b6573edc/.claude/skills/coding-standards/database.md#L27) | Do not actually delete rows. The source names `lessonComments` as the schema reference. |
| `CS-DB-PRICE-01` | [lines 29–31](https://github.com/ai-hero-dev/cohort-004-project/blob/67a9c0d74918497727a0d364d624f552b6573edc/.claude/skills/coding-standards/database.md#L29-L31) | Store prices in cents as integers. |
| `CS-DB-PRICE-02` | [line 31](https://github.com/ai-hero-dev/cohort-004-project/blob/67a9c0d74918497727a0d364d624f552b6573edc/.claude/skills/coding-standards/database.md#L31) | Display prices with `formatPrice()` from `~/lib/utils`; the source says it handles the “Free” case for `0` and `null`. |

### `services-and-testing.md`

Structural context: one title and three sections, in this order: “Services need tests,” “Tagged result pattern,” and “Vitest setup.” The result section names `couponService` as its reference implementation. The Vitest section says tests use globals and includes the expected lazy-getter database mock at [lines 21–29](https://github.com/ai-hero-dev/cohort-004-project/blob/67a9c0d74918497727a0d364d624f552b6573edc/.claude/skills/coding-standards/services-and-testing.md#L21-L29).

| Stable ID | Source | Faithful bounded representation |
|---|---|---|
| `CS-SVC-TEST-01` | [lines 3–5](https://github.com/ai-hero-dev/cohort-004-project/blob/67a9c0d74918497727a0d364d624f552b6573edc/.claude/skills/coding-standards/services-and-testing.md#L3-L5) | Anything named like a service, for example `authTokenService.ts`, must have an accompanying `.test.ts` file. |
| `CS-SVC-RESULT-01` | [lines 7–15](https://github.com/ai-hero-dev/cohort-004-project/blob/67a9c0d74918497727a0d364d624f552b6573edc/.claude/skills/coding-standards/services-and-testing.md#L7-L15) | For discriminated service results—not validation results—use `{ ok: true, ... } \| { ok: false, error: string }`. |
| `CS-TEST-FRAMEWORK-01` | [lines 17–19](https://github.com/ai-hero-dev/cohort-004-project/blob/67a9c0d74918497727a0d364d624f552b6573edc/.claude/skills/coding-standards/services-and-testing.md#L17-L19) | Tests use Vitest with globals. |
| `CS-TEST-DB-MOCK-01` | [lines 17–29](https://github.com/ai-hero-dev/cohort-004-project/blob/67a9c0d74918497727a0d364d624f552b6573edc/.claude/skills/coding-standards/services-and-testing.md#L17-L29) | Every test file mocks the database module before importing the service under test, using the shown `testDb` lazy-getter pattern. |
| `CS-TEST-SETUP-01` | [line 31](https://github.com/ai-hero-dev/cohort-004-project/blob/67a9c0d74918497727a0d364d624f552b6573edc/.claude/skills/coding-standards/services-and-testing.md#L31) | In `beforeEach`, use `createTestDb()` and `seedBaseData()` from `~/test/setup`. |
| `CS-TEST-DB-MOCK-02` | [line 33](https://github.com/ai-hero-dev/cohort-004-project/blob/67a9c0d74918497727a0d364d624f552b6573edc/.claude/skills/coding-standards/services-and-testing.md#L33) | Place the `vi.mock` call before the import of the service under test. This is retained separately from the earlier occurrence. |

### `routes-and-forms.md`

Structural context: one title and four sections, in this order: “React Router v7,” “Form / param validation,” “Multiple intents in one action,” and “Auth.” The multi-intent section includes a complete two-variant Zod example at [lines 21–29](https://github.com/ai-hero-dev/cohort-004-project/blob/67a9c0d74918497727a0d364d624f552b6573edc/.claude/skills/coding-standards/routes-and-forms.md#L21-L29). The auth section identifies cookie-based auth via `~/lib/session` and gives the return type of `getCurrentUserId(request)` as `number | null`.

| Stable ID | Source | Faithful bounded representation |
|---|---|---|
| `CS-ROUTE-LAYOUT-01` | [lines 3–5](https://github.com/ai-hero-dev/cohort-004-project/blob/67a9c0d74918497727a0d364d624f552b6573edc/.claude/skills/coding-standards/routes-and-forms.md#L3-L5) | Use React Router v7 file-based routing, with routes in `app/routes/`; a route file may export `loader`, `action`, a default component, `meta`, and `ErrorBoundary`. |
| `CS-ROUTE-LOGIC-01` | [line 7](https://github.com/ai-hero-dev/cohort-004-project/blob/67a9c0d74918497727a0d364d624f552b6573edc/.claude/skills/coding-standards/routes-and-forms.md#L7) | Do not put business logic directly in routes; call services. |
| `CS-ROUTE-VALIDATION-01` | [lines 9–11](https://github.com/ai-hero-dev/cohort-004-project/blob/67a9c0d74918497727a0d364d624f552b6573edc/.claude/skills/coding-standards/routes-and-forms.md#L9-L11) | Use the validation helpers from `~/lib/validation`; the source says all return `{ success, data, errors }`. |
| `CS-ROUTE-VALIDATION-02` | [line 13](https://github.com/ai-hero-dev/cohort-004-project/blob/67a9c0d74918497727a0d364d624f552b6573edc/.claude/skills/coding-standards/routes-and-forms.md#L13) | Use `parseFormData(formData, zodSchema)` for route-action form submissions. |
| `CS-ROUTE-VALIDATION-03` | [line 14](https://github.com/ai-hero-dev/cohort-004-project/blob/67a9c0d74918497727a0d364d624f552b6573edc/.claude/skills/coding-standards/routes-and-forms.md#L14) | Use `parseParams(params, zodSchema)` for route parameters. |
| `CS-ROUTE-VALIDATION-04` | [line 15](https://github.com/ai-hero-dev/cohort-004-project/blob/67a9c0d74918497727a0d364d624f552b6573edc/.claude/skills/coding-standards/routes-and-forms.md#L15) | Use `parseJsonBody(request, zodSchema)` for JSON request bodies. |
| `CS-ROUTE-INTENT-01` | [lines 17–29](https://github.com/ai-hero-dev/cohort-004-project/blob/67a9c0d74918497727a0d364d624f552b6573edc/.claude/skills/coding-standards/routes-and-forms.md#L17-L29) | When one route action handles multiple submissions, use a Zod discriminated union on an `intent` field. |
| `CS-ROUTE-AUTH-01` | [lines 31–33](https://github.com/ai-hero-dev/cohort-004-project/blob/67a9c0d74918497727a0d364d624f552b6573edc/.claude/skills/coding-standards/routes-and-forms.md#L31-L33) | Authentication is cookie-based via `~/lib/session`. |
| `CS-ROUTE-AUTH-02` | [lines 31–33](https://github.com/ai-hero-dev/cohort-004-project/blob/67a9c0d74918497727a0d364d624f552b6573edc/.claude/skills/coding-standards/routes-and-forms.md#L31-L33) | In loaders and actions, use `getCurrentUserId(request)`. |
| `CS-ROUTE-AUTH-03` | [line 33](https://github.com/ai-hero-dev/cohort-004-project/blob/67a9c0d74918497727a0d364d624f552b6573edc/.claude/skills/coding-standards/routes-and-forms.md#L33) | Redirect to `/login` when `getCurrentUserId(request)` returns `null`. |

### `frontend-and-ui.md`

Structural context: one title and three sections, in this order: “Combining tailwind classes,” “Component layout,” and “Prices.” It identifies `cn()` as a composition of clsx and tailwind-merge, and repeats the database file's context that prices are integer cents and `formatPrice()` handles `0` and `null` as “Free.”

| Stable ID | Source | Faithful bounded representation |
|---|---|---|
| `CS-UI-CLASS-01` | [lines 3–5](https://github.com/ai-hero-dev/cohort-004-project/blob/67a9c0d74918497727a0d364d624f552b6573edc/.claude/skills/coding-standards/frontend-and-ui.md#L3-L5) | Combine Tailwind classes with `cn()` from `~/lib/utils`. |
| `CS-UI-LAYOUT-01` | [lines 7–10](https://github.com/ai-hero-dev/cohort-004-project/blob/67a9c0d74918497727a0d364d624f552b6573edc/.claude/skills/coding-standards/frontend-and-ui.md#L7-L10) | Put shadcn components in `app/components/ui/`. |
| `CS-UI-LAYOUT-02` | [lines 7–10](https://github.com/ai-hero-dev/cohort-004-project/blob/67a9c0d74918497727a0d364d624f552b6573edc/.claude/skills/coding-standards/frontend-and-ui.md#L7-L10) | Put custom components directly in `app/components/`. |
| `CS-UI-LAYOUT-03` | [line 12](https://github.com/ai-hero-dev/cohort-004-project/blob/67a9c0d74918497727a0d364d624f552b6573edc/.claude/skills/coding-standards/frontend-and-ui.md#L12) | Do not nest component folders more deeply than those locations. |
| `CS-UI-PRICE-01` | [lines 14–16](https://github.com/ai-hero-dev/cohort-004-project/blob/67a9c0d74918497727a0d364d624f552b6573edc/.claude/skills/coding-standards/frontend-and-ui.md#L14-L16) | Display prices with `formatPrice()` from `~/lib/utils`. |
| `CS-UI-PRICE-02` | [line 16](https://github.com/ai-hero-dev/cohort-004-project/blob/67a9c0d74918497727a0d364d624f552b6573edc/.claude/skills/coding-standards/frontend-and-ui.md#L16) | Prices are stored in cents as integers. This repeated upstream occurrence remains separate from the database-file occurrence. |

## Structural handoff for future grilling

The entry point already defines the five natural human-grilling boundaries: one ticket per reference file, in the reference order above. Each ticket can use the corresponding section of this memo as its complete upstream input while preserving the stable IDs:

| Future ticket boundary | Stable IDs carried into it | Upstream sections and context |
|---|---|---|
| TypeScript conventions | `CS-TS-*` (5) | Object parameters plus example; `any` prohibition and type-discovery alternatives; app import alias and relative-import prohibition |
| Database & schema | `CS-DB-*` (11) | Database stack and shared connection context; IDs; timestamps plus example; booleans plus example; soft deletes plus named schema reference; storage/display rules for prices |
| Services & testing | `CS-SVC-*`, `CS-TEST-*` (6) | Test requirement; tagged result pattern plus named service reference; Vitest globals; shown database mock; per-test setup; repeated mock-order instruction |
| Routes & forms | `CS-ROUTE-*` (10) | Router layout and exports; service boundary; validation return shape and three helper mappings; multi-intent condition plus example; cookie/session context and null-user behavior |
| Frontend & UI | `CS-UI-*` (6) | Tailwind class helper and implementation context; two component locations plus nesting limit; price formatter and its repeated storage/free-case context |

The five reference files contain 38 stable rule occurrences. The entry point contains six additional loading and trigger occurrences, for 44 inventory entries total.

## Primary sources

- [`SKILL.md`](https://github.com/ai-hero-dev/cohort-004-project/blob/67a9c0d74918497727a0d364d624f552b6573edc/.claude/skills/coding-standards/SKILL.md)
- [`typescript.md`](https://github.com/ai-hero-dev/cohort-004-project/blob/67a9c0d74918497727a0d364d624f552b6573edc/.claude/skills/coding-standards/typescript.md)
- [`database.md`](https://github.com/ai-hero-dev/cohort-004-project/blob/67a9c0d74918497727a0d364d624f552b6573edc/.claude/skills/coding-standards/database.md)
- [`services-and-testing.md`](https://github.com/ai-hero-dev/cohort-004-project/blob/67a9c0d74918497727a0d364d624f552b6573edc/.claude/skills/coding-standards/services-and-testing.md)
- [`routes-and-forms.md`](https://github.com/ai-hero-dev/cohort-004-project/blob/67a9c0d74918497727a0d364d624f552b6573edc/.claude/skills/coding-standards/routes-and-forms.md)
- [`frontend-and-ui.md`](https://github.com/ai-hero-dev/cohort-004-project/blob/67a9c0d74918497727a0d364d624f552b6573edc/.claude/skills/coding-standards/frontend-and-ui.md)
