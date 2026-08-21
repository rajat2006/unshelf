import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  new URL("../../../.github/workflows/deploy-development.yml", import.meta.url),
  "utf8",
);
const triggers = workflow.slice(
  workflow.indexOf("on:\n"),
  workflow.indexOf("\npermissions:"),
);

describe("hosted development deployment workflow", () => {
  it("starts only by explicit manual dispatch for an exact dev SHA", () => {
    expect(triggers.match(/^ {2}[a-z_]+:/gm)).toEqual(["  workflow_dispatch:"]);
    expect(workflow).toContain("source_sha:");
    expect(workflow).toContain("SOURCE_SHA: ${{ inputs.source_sha }}");
    expect(workflow).toContain("ref: dev");
  });

  it("uses only the development environment and non-production inputs", () => {
    expect(workflow.match(/^ {4}environment: development$/gm)).toHaveLength(1);
    expect(workflow).toContain("DEPLOYMENT_ENVIRONMENT: development");
    expect(workflow).toContain("DOKPLOY_NONPRODUCTION_API_KEY");
    expect(workflow).toContain("DOKPLOY_DEVELOPMENT_COMPOSE_ID");
    expect(workflow).not.toMatch(
      /environment: production|DOKPLOY_PRODUCTION|PRODUCTION_DOKPLOY/,
    );
  });

  it("keeps active remote work and only the newest pending target", () => {
    expect(workflow).toContain("group: development-deployment");
    expect(workflow).toContain("cancel-in-progress: false");
  });

  it("hands immutable digests to the trusted CLI under the target lock", () => {
    expect(workflow).toContain("docker buildx imagetools inspect");
    expect(workflow).toContain(
      "node packages/deployment-control-plane/dist/cli.js reconcile",
    );
    expect(workflow).toContain(
      '--correlation "development:$SOURCE_SHA:run-$GITHUB_RUN_ID"',
    );
    expect(workflow).toContain("packages: write");
    expect(workflow).not.toContain("compose.cancelDeployment");
    expect(workflow).not.toContain("deployment.killProcess");
  });
});
