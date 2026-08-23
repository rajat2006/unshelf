import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { inspectWorkflow } from "../src/workflow-contract";

const workflowsDirectory = new URL(
  "../../../.github/workflows/",
  import.meta.url,
);

function inspectRepositoryWorkflow(name: string) {
  return inspectWorkflow(
    readFileSync(new URL(name, workflowsDirectory), "utf8"),
  );
}

describe("deployment workflow contract inspection", () => {
  it("normalizes the workflow policy fields used by deployment contract tests", () => {
    const workflow = inspectWorkflow(`
name: Example deployment
on:
  workflow_dispatch:
    inputs:
      release:
        description: Release identity
        required: true
        type: choice
        options: [preview, production]
  schedule:
    - cron: "0 16 * * *"
permissions:
  contents: read
concurrency:
  group: deployment-\${{ inputs.release }}
  cancel-in-progress: false
jobs:
  build:
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@0123456789abcdef
        with:
          ref: \${{ github.sha }}
          persist-credentials: false
      - env:
          UNPRIVILEGED_VALUE: \${{ vars.PUBLIC_VALUE }}
        run: build
  deploy:
    needs: build
    environment:
      name: \${{ inputs.release }}
      url: \${{ vars.PUBLIC_ORIGIN }}
    permissions:
      contents: read
    env:
      DEPLOYMENT_KEY: \${{ secrets.DEPLOYMENT_KEY }}
      SECOND_KEY: \${{ secrets['SECOND_KEY'] }}
    steps:
      - run: deploy
`);

    expect(workflow.triggers).toEqual({
      schedule: {
        branches: [],
        inputs: {},
        schedules: [{ cron: "0 16 * * *" }],
        types: [],
      },
      workflow_dispatch: {
        branches: [],
        inputs: {
          release: {
            description: "Release identity",
            options: ["preview", "production"],
            required: true,
            type: "choice",
          },
        },
        schedules: [],
        types: [],
      },
    });
    expect(workflow.permissions).toEqual({ contents: "read" });
    expect(workflow.concurrency).toEqual({
      cancelInProgress: false,
      group: "deployment-${{ inputs.release }}",
    });
    expect(workflow.inheritsSecrets).toBe(false);
    expect(workflow.secretReferences).toEqual(["DEPLOYMENT_KEY", "SECOND_KEY"]);
    expect(workflow.jobs).toEqual({
      build: {
        checkouts: [
          {
            action: "actions/checkout@0123456789abcdef",
            persistCredentials: false,
            ref: "${{ github.sha }}",
          },
        ],
        environment: undefined,
        inheritsSecrets: false,
        needs: [],
        permissions: { contents: "read", packages: "write" },
        secretReferences: [],
      },
      deploy: {
        checkouts: [],
        environment: "${{ inputs.release }}",
        inheritsSecrets: false,
        needs: ["build"],
        permissions: { contents: "read" },
        secretReferences: ["DEPLOYMENT_KEY", "SECOND_KEY"],
      },
    });
  });

  it("reports inherited reusable-workflow secret authority", () => {
    const workflow = inspectWorkflow(`
on: workflow_dispatch
jobs:
  delegate:
    uses: owner/repository/.github/workflows/deploy.yml@trusted-ref
    secrets: inherit
`);

    expect(workflow.inheritsSecrets).toBe(true);
    expect(workflow.jobs.delegate).toEqual({
      checkouts: [],
      environment: undefined,
      inheritsSecrets: true,
      needs: [],
      permissions: undefined,
      secretReferences: [],
    });
  });

  it("keeps Product CI unprivileged and available for every pull request", () => {
    const workflow = inspectRepositoryWorkflow("ci.yml");

    expect(Object.keys(workflow.triggers).sort()).toEqual([
      "pull_request",
      "push",
      "workflow_dispatch",
    ]);
    expect(workflow.triggers.pull_request?.branches).toEqual([]);
    expect(workflow.triggers.push?.branches).toEqual(["main", "dev"]);
    expect(workflow.permissions).toEqual({ contents: "read" });
    expect(workflow.secretReferences).toEqual([]);
    expect(workflow.jobs.product).toMatchObject({
      checkouts: [
        {
          action: "actions/checkout@v4",
          persistCredentials: false,
        },
      ],
      environment: undefined,
      inheritsSecrets: false,
      needs: [],
      permissions: undefined,
      secretReferences: [],
    });
  });

  it("keeps contained candidate publication manual and outside environments", () => {
    const workflow = inspectRepositoryWorkflow("publish-candidate.yml");

    expect(Object.keys(workflow.triggers)).toEqual(["workflow_dispatch"]);
    expect(workflow.triggers.workflow_dispatch?.inputs).toEqual({
      head_branch: {
        description: "Branch containing the exact source commit",
        required: true,
        type: "string",
      },
      source_event: {
        description: "Product CI event that approved the source",
        options: ["push", "pull_request"],
        required: true,
        type: "choice",
      },
      source_sha: {
        description: "Exact source commit to publish",
        required: true,
        type: "string",
      },
    });
    expect(workflow.concurrency).toEqual({
      cancelInProgress: true,
      group: "candidate-${{ inputs.source_event }}-${{ inputs.head_branch }}",
    });
    expect(workflow.jobs.preflight).toMatchObject({
      checkouts: [
        {
          action: "actions/checkout@11d5960a326750d5838078e36cf38b85af677262",
          persistCredentials: false,
          ref: "dev",
        },
      ],
      environment: undefined,
      inheritsSecrets: false,
      needs: [],
      permissions: {
        actions: "read",
        contents: "read",
        packages: "read",
      },
    });
    expect(workflow.jobs["api-image"]).toMatchObject({
      checkouts: [
        {
          action: "actions/checkout@11d5960a326750d5838078e36cf38b85af677262",
          persistCredentials: false,
          ref: "${{ env.SOURCE_SHA }}",
        },
      ],
      environment: undefined,
      inheritsSecrets: false,
      needs: ["preflight"],
      permissions: { contents: "read", packages: "write" },
    });
    expect(workflow.jobs["web-image"]).toMatchObject({
      checkouts: [
        {
          action: "actions/checkout@11d5960a326750d5838078e36cf38b85af677262",
          persistCredentials: false,
          ref: "${{ env.SOURCE_SHA }}",
        },
      ],
      environment: undefined,
      inheritsSecrets: false,
      needs: ["preflight"],
      permissions: { contents: "read", packages: "write" },
    });
    expect(workflow.jobs.candidate).toMatchObject({
      checkouts: [
        {
          action: "actions/checkout@11d5960a326750d5838078e36cf38b85af677262",
          persistCredentials: false,
          ref: "dev",
        },
      ],
      environment: undefined,
      inheritsSecrets: false,
      needs: ["api-image", "web-image"],
      permissions: { contents: "read", packages: "read" },
    });
    expect(
      Object.values(workflow.jobs).map(({ environment }) => environment),
    ).toEqual([undefined, undefined, undefined, undefined]);
    expect(
      Object.values(workflow.jobs).map(
        ({ secretReferences }) => secretReferences,
      ),
    ).toEqual([
      ["GITHUB_TOKEN"],
      ["GITHUB_TOKEN"],
      ["GITHUB_TOKEN"],
      ["GITHUB_TOKEN"],
    ]);
    expect(workflow.inheritsSecrets).toBe(false);
  });

  it("keeps contained development authority in its locked environment", () => {
    const workflow = inspectRepositoryWorkflow("deploy-development.yml");

    expect(Object.keys(workflow.triggers)).toEqual(["workflow_dispatch"]);
    expect(workflow.triggers.workflow_dispatch?.inputs).toEqual({
      source_sha: {
        description: "Exact current dev commit to deploy",
        required: true,
        type: "string",
      },
    });
    expect(workflow.concurrency).toEqual({
      cancelInProgress: false,
      group: "development-deployment",
    });
    expect(workflow.jobs.deploy).toEqual({
      checkouts: [
        {
          action: "actions/checkout@11d5960a326750d5838078e36cf38b85af677262",
          persistCredentials: false,
          ref: "dev",
        },
      ],
      environment: "development",
      inheritsSecrets: false,
      needs: [],
      permissions: {
        actions: "read",
        contents: "read",
        packages: "write",
      },
      secretReferences: [
        "DOKPLOY_DEVELOPMENT_COMPOSE_ENV",
        "DOKPLOY_NONPRODUCTION_API_KEY",
        "GITHUB_TOKEN",
      ],
    });
    expect(workflow.secretReferences).not.toContain(
      "DOKPLOY_PRODUCTION_API_KEY",
    );
  });
});
