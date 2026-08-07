import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  new URL("../../../.github/workflows/publish-candidate.yml", import.meta.url),
  "utf8",
);
const dockerBuildInputs = [
  "../../../apps/api/Dockerfile",
  "../../../apps/web/Dockerfile",
  "../../../.dockerignore",
]
  .map((path) => readFileSync(new URL(path, import.meta.url), "utf8"))
  .join("\n");

describe("candidate publication workflow", () => {
  it("publishes only after Product CI through the trusted control plane", () => {
    expect(workflow).toContain("workflow_run:");
    expect(workflow).toContain("workflows: [CI]");
    expect(workflow).toContain("types: [completed]");
    expect(workflow).toContain("conclusion == 'success'");
    expect(workflow).toContain(
      "head_repository.full_name == github.repository",
    );
    expect(workflow).toContain("ref: dev");
    expect(workflow).toContain("prepare-candidate");
    expect(workflow).toContain("finalize-candidate");
    expect(workflow).not.toContain("pull_request_target:");
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
