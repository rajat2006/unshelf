import { existsSync, readdirSync, readFileSync } from "node:fs";
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

const ALLOWED = new Set([
  "apps/web/src/auth.tsx",
  "apps/api/src/middleware/auth.ts",
]);
const CLERK_IMPORT = /["']@clerk\//;

/**
 * Every workspace source tree — apps/*\/{src,test} and packages/*\/src.
 * Discovered rather than hardcoded so a future workspace (say, apps/agent) is
 * scanned from birth instead of slipping past the guardrail.
 */
function scannedDirs(): string[] {
  return ["apps", "packages"].flatMap((group) =>
    readdirSync(join(repoRoot, group), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .flatMap((entry) =>
        ["src", "test"]
          .map((sub) => join(group, entry.name, sub))
          .filter((dir) => existsSync(join(repoRoot, dir))),
      ),
  );
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

describe("Clerk guardrail (ADR-0009)", () => {
  it("imports @clerk only in the two thin wrappers", () => {
    const importers = scannedDirs().flatMap((dir) =>
      sourceFiles(join(repoRoot, dir))
        .filter((file) => CLERK_IMPORT.test(readFileSync(file, "utf8")))
        .map((file) => relative(repoRoot, file)),
    );

    expect(new Set(importers)).toEqual(ALLOWED);
  });
});
