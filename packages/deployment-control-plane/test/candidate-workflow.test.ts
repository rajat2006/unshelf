import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  new URL("../../../.github/workflows/publish-candidate.yml", import.meta.url),
  "utf8",
);
const productCiWorkflow = readFileSync(
  new URL("../../../.github/workflows/ci.yml", import.meta.url),
  "utf8",
);
const triggers = workflow.slice(
  workflow.indexOf("on:\n"),
  workflow.indexOf("\npermissions:"),
);
const dockerBuildInputs = [
  "../../../apps/api/Dockerfile",
  "../../../apps/web/Dockerfile",
  "../../../.dockerignore",
]
  .map((path) => readFileSync(new URL(path, import.meta.url), "utf8"))
  .join("\n");

describe("candidate publication workflow", () => {
  it("publishes only by explicit manual dispatch after exact Product CI", () => {
    expect(triggers.match(/^ {2}[a-z_]+:/gm)).toEqual(["  workflow_dispatch:"]);
    expect(workflow).toContain("source_sha:");
    expect(workflow).toContain("source_event:");
    expect(workflow).toContain("head_branch:");
    expect(workflow).toContain("actions/workflows/ci.yml/runs");
    expect(workflow).toContain("actions: read");
    expect(workflow).toContain("ref: dev");
    expect(workflow).toContain("prepare-candidate");
    expect(workflow).toContain("finalize-candidate");
    expect(workflow).not.toContain("pull_request_target:");
  });

  it("does not narrow Product CI while candidate publication is contained", () => {
    expect(productCiWorkflow).toContain("pull_request:");
    expect(productCiWorkflow).toContain("branches: [main, dev]");
    expect(productCiWorkflow).toContain("workflow_dispatch:");
  });

  it("publishes separate immutable API and web trace images", () => {
    expect(workflow).toContain("file: apps/api/Dockerfile");
    expect(workflow).toContain("file: apps/web/Dockerfile");
    expect(workflow).toContain(
      "ghcr.io/rajat2006/unshelf-api:${{ env.TRACE }}",
    );
    expect(workflow).toContain(
      "ghcr.io/rajat2006/unshelf-web:${{ env.TRACE }}",
    );
    expect(workflow).toContain(
      "org.opencontainers.image.revision=${{ env.SOURCE_SHA }}",
    );
    expect(workflow).toContain("io.unshelf.channel=${{ env.CHANNEL }}");
    expect(workflow).not.toMatch(
      /:(?:preview|development|production|v\d+\.\d+\.\d+)\s*$/m,
    );
  });

  it("uses only job-scoped package authority and no deployment authority", () => {
    expect(workflow).toContain("packages: write");
    expect(workflow).toContain("password: ${{ secrets.GITHUB_TOKEN }}");
    expect(workflow).toContain("cancel-in-progress: true");
    expect(workflow).not.toContain("environment:");
    expect(workflow).not.toMatch(/dokploy/i);
    expect(workflow).not.toMatch(/(?:registry|ghcr).*(?:password|token)/i);
  });

  it("keeps registry credentials outside build contexts and runtime images", () => {
    const buildArgBlocks = workflow.match(/build-args: \|\n(?: {12}.+\n)+/g);

    expect(dockerBuildInputs).not.toMatch(/GITHUB_TOKEN|GH_TOKEN|CR_PAT/);
    expect(dockerBuildInputs).toContain(".npmrc");
    expect(dockerBuildInputs).toContain(".pnpm-store");
    expect(buildArgBlocks).toHaveLength(1);
    expect(buildArgBlocks?.[0]).not.toMatch(/TOKEN|PASSWORD|SECRET/);
  });
});
