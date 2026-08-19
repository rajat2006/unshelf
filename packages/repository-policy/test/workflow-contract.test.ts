import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repositoryRoot = new URL("../../../", import.meta.url);

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
const productiveWorkflowNames = [
  "agent-implement.yml",
  "agent-implement-prd.yml",
  "agent-review.yml",
  "agent-implement-pr.yml",
] as const;
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
    const policyTarget = wayfinderArtifactPolicyTarget(
      readFileSync(new URL("CLAUDE.md", repositoryRoot), "utf8"),
    );
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

  it("gives every productive capability the Product CI recovery authority and time", () => {
    for (const name of productiveWorkflowNames) {
      const workflow = agentWorkflows.get(name);
      expect(workflow, name).toContain("timeout-minutes: 120");
      expect(workflow, name).toContain("actions: write");
      expect(workflow, name).toContain("GH_TOKEN: ${{ secrets.AGENT_PAT }}");
    }
  });

  it("runs an exact Product CI gate before protected lifecycle mutations", () => {
    const mutations = new Map([
      ["agent-implement.yml", "Request automated review"],
      ["agent-implement-prd.yml", "Close the completed sub-issue"],
      ["agent-review.yml", "Post the review"],
      ["agent-implement-pr.yml", "Reply on answered threads"],
    ]);

    for (const [name, mutation] of mutations) {
      const workflow = agentWorkflows.get(name) ?? "";
      const gateIndex = workflow.indexOf("Final Product CI gate");
      expect(gateIndex, name).toBeGreaterThan(-1);
      expect(workflow.indexOf(mutation), name).toBeGreaterThan(gateIndex);
    }
  });

  it("never force-pushes an automation branch retry", () => {
    for (const name of productiveWorkflowNames) {
      expect(agentWorkflows.get(name), name).not.toMatch(
        /git push[^\n]*--force/,
      );
    }
  });

  it("resumes only an unambiguous same-repository draft leaf PR", () => {
    const workflow = agentWorkflows.get("agent-implement.yml") ?? "";
    expect(workflow).toContain("--state all");
    expect(workflow).toContain('.state == "OPEN"');
    expect(workflow).toContain(".isDraft == true");
    expect(workflow).toContain(".isCrossRepository == false");
    expect(workflow).toContain(".author.login == $owner");
    expect(workflow).toContain(".baseRefName == $base");
    expect(workflow).toContain("matching-refs/heads/${branch}");
    expect(workflow).toContain('git checkout -B "$BRANCH" "origin/$BRANCH"');
    expect(workflow).toContain("Reconcile the agent-owned draft PR");
  });

  it("gates both PRD advances and head-bound review publications", () => {
    const prd = agentWorkflows.get("agent-implement-prd.yml") ?? "";
    const review = agentWorkflows.get("agent-review.yml") ?? "";
    const implementPr = agentWorkflows.get("agent-implement-pr.yml") ?? "";

    expect(prd.match(/Final Product CI gate/g)).toHaveLength(2);
    expect(prd.indexOf("Final Product CI gate — close child")).toBeLessThan(
      prd.indexOf("Close the completed sub-issue"),
    );
    expect(prd.indexOf("Final Product CI gate — advance PRD")).toBeLessThan(
      prd.indexOf("Chain — re-label the PRD"),
    );
    expect(review).toContain("review_head_sha.txt");
    expect(review).toContain("--expected-head-file");
    expect(review).toContain("printf '**Reason:** %s\\n\\n' \"$reason\"");
    expect(review.match(/Final Product CI gate/g)).toHaveLength(2);
    expect(implementPr).toContain("implement_pr_head_sha.txt");
    expect(implementPr).toContain("--expected-head-file");
    expect(implementPr).toContain("current_ids=$(gh api graphql");
    expect(
      implementPr.match(/product-ci-cli.ts final-gate/g)?.length,
    ).toBeGreaterThanOrEqual(3);
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
      "baseRefName == $base",
    );
    expect(agentWorkflows.get("agent-implement-prd.yml")).toContain(
      "baseRefName == $base",
    );

    for (const [name, workflow] of agentWorkflows) {
      expect(workflow, name).not.toMatch(/\b(?:origin\/)?main\b/);
    }
  });
});
