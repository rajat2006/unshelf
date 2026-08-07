import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const ciWorkflow = readFileSync(
  new URL("../../../.github/workflows/ci.yml", import.meta.url),
  "utf8",
);
const releasePolicyWorkflow = readFileSync(
  new URL("../../../.github/workflows/release-policy.yml", import.meta.url),
  "utf8",
);

describe("repository delivery workflows", () => {
  it("keeps Product CI available to forks without privileged authority", () => {
    expect(ciWorkflow).toContain("pull_request:");
    expect(ciWorkflow).toContain("permissions:\n  contents: read");
    expect(ciWorkflow).not.toMatch(/^\s+environment:/m);
    expect(ciWorkflow).not.toMatch(/^\s+packages: write/m);
    expect(ciWorkflow).not.toMatch(/DOKPLOY|CLERK|DATABASE_URL|R2_/);
  });

  it("evaluates main-bound pull requests from trusted base-branch code", () => {
    expect(releasePolicyWorkflow).toContain("pull_request_target:");
    expect(releasePolicyWorkflow).toContain("branches: [main]");
    expect(releasePolicyWorkflow).toContain("permissions:\n  contents: read");
    expect(releasePolicyWorkflow).toContain("name: Release policy");
    expect(releasePolicyWorkflow).toContain("ref: dev");
    expect(releasePolicyWorkflow).toContain(
      "pnpm --filter @unshelf/repository-policy build",
    );
    expect(releasePolicyWorkflow).toContain(
      "node packages/repository-policy/dist/cli.js",
    );
    expect(releasePolicyWorkflow).not.toMatch(/^\s+environment:/m);
    expect(releasePolicyWorkflow).not.toMatch(/^\s+packages: write/m);
    expect(releasePolicyWorkflow).not.toMatch(/DOKPLOY|CLERK|DATABASE_URL|R2_/);
  });
});
