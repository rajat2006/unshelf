import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repositoryRoot = new URL("../../../", import.meta.url);
const agentInstructions = ["AGENTS.md", "CLAUDE.md"];

function wayfinderArtifactPolicyTarget(instructions: string): string {
  const links = [
    ...instructions.matchAll(/\]\(([^)]+wayfinder-artifacts\.md)\)/g),
  ];

  expect(links).toHaveLength(1);
  return links[0]?.[1] ?? "";
}

const ciWorkflow = readFileSync(
  new URL("../../../.github/workflows/ci.yml", import.meta.url),
  "utf8",
);
const releasePolicyWorkflow = readFileSync(
  new URL("../../../.github/workflows/release-policy.yml", import.meta.url),
  "utf8",
);
const agentImplementPrdWorkflow = readFileSync(
  new URL(
    "../../../.github/workflows/agent-implement-prd.yml",
    import.meta.url,
  ),
  "utf8",
);
const workflowsDirectory = new URL(
  "../../../.github/workflows/",
  import.meta.url,
);
const agentWorkflows = new Map(
  readdirSync(workflowsDirectory)
    .filter((name) => name.startsWith("agent-") && name.endsWith(".yml"))
    .map((name) => [
      name,
      readFileSync(new URL(name, workflowsDirectory), "utf8"),
    ]),
);

describe("repository delivery workflows", () => {
  it("lets supported agents discover one project-owned Wayfinder artifact policy", () => {
    const targets = agentInstructions.map((instructionFile) =>
      wayfinderArtifactPolicyTarget(
        readFileSync(new URL(instructionFile, repositoryRoot), "utf8"),
      ),
    );

    expect(new Set(targets).size).toBe(1);

    const policyTarget = targets[0] ?? "";
    const policyPath = new URL(policyTarget, repositoryRoot);
    const repositoryRelativePath = path.relative(
      fileURLToPath(repositoryRoot),
      fileURLToPath(policyPath),
    );

    expect(existsSync(policyPath)).toBe(true);
    expect(repositoryRelativePath).toBe("docs/agents/wayfinder-artifacts.md");
    expect(repositoryRelativePath.split(path.sep)).not.toContain(".agents");
    expect(repositoryRelativePath.split(path.sep)).not.toContain(".claude");
    expect(repositoryRelativePath.split(path.sep)).not.toContain(".codex");
  });

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

  it("allows PRD implementation slices to complete full verification", () => {
    expect(agentImplementPrdWorkflow).toContain("timeout-minutes: 120");
  });

  it("derives Sandcastle bases from the repository or pull request", () => {
    const defaultBranchWorkflows = [
      "agent-architecture-review.yml",
      "agent-explore.yml",
      "agent-implement-prd.yml",
      "agent-implement.yml",
      "agent-to-issues.yml",
    ];
    for (const name of defaultBranchWorkflows) {
      const workflow = agentWorkflows.get(name);
      expect(workflow, name).toContain(
        "BASE_BRANCH: ${{ github.event.repository.default_branch }}",
      );
      expect(workflow, name).toContain("ref: ${{ env.BASE_BRANCH }}");
    }

    const pullRequestWorkflows = [
      "agent-implement-pr.yml",
      "agent-review.yml",
      "agent-update-branch.yml",
    ];
    for (const name of pullRequestWorkflows) {
      const workflow = agentWorkflows.get(name);
      expect(workflow, name).toContain(
        "BASE_BRANCH: ${{ github.event.pull_request.base.ref }}",
      );
      expect(workflow, name).toContain(
        '"$BASE_BRANCH:refs/remotes/origin/$BASE_BRANCH"',
      );
    }

    expect(agentWorkflows.get("agent-implement.yml")).toContain(
      '--base "$BASE_BRANCH"',
    );
    expect(agentWorkflows.get("agent-implement-prd.yml")).toContain(
      '--base "$BASE_BRANCH"',
    );

    for (const [name, workflow] of agentWorkflows) {
      expect(workflow, name).not.toMatch(/\b(?:origin\/)?main\b/);
    }
  });
});
