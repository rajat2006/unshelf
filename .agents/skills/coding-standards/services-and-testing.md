# Services and testing

## Services need tests

Anything named like a service (e.g. `authTokenService.ts`) must have an accompanying `.test.ts` file.

## Tagged service results

For discriminated results from services (not validation), use:

```ts
{ ok: true, ... } | { ok: false, error: string }
```

## Vitest and API integration setup

Unit and API tests use Vitest.

For API integration tests that require a database, use `startTestApp()` from `apps/api/test/harness.ts` in `beforeAll`, and stop the returned harness in `afterAll`.
