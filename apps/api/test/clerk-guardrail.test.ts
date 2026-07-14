import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The ADR-0009 build constraint, enforced as a test: Clerk is imported in exactly
 * two places — the web `useCurrentUser()` wrapper and the api auth middleware.
 * Any third `@clerk/*` import is lock-in leaking past the wrapper and fails here.
 */
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../.."); // test → apps/api → apps → repo root

const SCANNED_DIRS = ["apps/web/src", "apps/api/src"];
const ALLOWED = new Set(["apps/web/src/auth.tsx", "apps/api/src/auth.ts"]);
const CLERK_IMPORT = /["']@clerk\//;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

describe("Clerk guardrail (ADR-0009)", () => {
  it("imports @clerk only in the two thin wrappers", () => {
    const importers = SCANNED_DIRS.flatMap((dir) =>
      sourceFiles(join(repoRoot, dir))
        .filter((file) => CLERK_IMPORT.test(readFileSync(file, "utf8")))
        .map((file) => relative(repoRoot, file)),
    );

    expect(new Set(importers)).toEqual(ALLOWED);
  });
});
