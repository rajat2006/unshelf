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
        hasUnresolvedSecretReferences: false,
        inheritsSecrets: false,
        needs: [],
        permissions: { contents: "read", packages: "write" },
        runCommands: ["build"],
        secretReferences: [],
        usesSecretsContext: false,
      },
      deploy: {
        checkouts: [],
        environment: "${{ inputs.release }}",
        hasUnresolvedSecretReferences: false,
        inheritsSecrets: false,
        needs: ["build"],
        permissions: { contents: "read" },
        runCommands: ["deploy"],
        secretReferences: ["DEPLOYMENT_KEY", "SECOND_KEY"],
        usesSecretsContext: true,
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
      hasUnresolvedSecretReferences: false,
      inheritsSecrets: true,
      needs: [],
      permissions: undefined,
      runCommands: [],
      secretReferences: [],
      usesSecretsContext: false,
    });
  });

  it("reports whole and dynamic secret-context authority", () => {
    const workflow = inspectWorkflow(`
on: workflow_dispatch
jobs:
  inspect:
    env:
      ALL_SECRETS: \${{ toJSON(secrets) }}
      SELECTED_SECRET: \${{ secrets[inputs.secret_name] }}
    runs-on: ubuntu-latest
    steps:
      - run: inspect
`);

    expect(workflow.usesSecretsContext).toBe(true);
    expect(workflow.jobs.inspect?.usesSecretsContext).toBe(true);
    expect(workflow.hasUnresolvedSecretReferences).toBe(true);
    expect(workflow.jobs.inspect?.hasUnresolvedSecretReferences).toBe(true);
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
    expect(workflow.hasUnresolvedSecretReferences).toBe(false);
    expect(workflow.usesSecretsContext).toBe(false);
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

  it.each([
    [
      "delivery-development.yml",
      "development-delivery",
      {},
      "development",
      { actions: "read", contents: "read" },
    ],
    [
      "delivery-preview.yml",
      "preview-delivery",
      {
        pr_number: {
          description: "Pull request number",
          required: true,
          type: "number",
        },
      },
      "preview",
      { actions: "read", contents: "read", "pull-requests": "read" },
    ],
    [
      "delivery-production.yml",
      "production-delivery",
      {},
      "production",
      { actions: "read", contents: "read", deployments: "read" },
    ],
  ])(
    "keeps %s channel policy direct, manual, serialized, and least privileged",
    (name, concurrencyGroup, inputs, environment, authorizePermissions) => {
      const workflow = inspectRepositoryWorkflow(name);

      expect(Object.keys(workflow.triggers)).toEqual(["workflow_dispatch"]);
      expect(workflow.triggers.workflow_dispatch?.inputs).toEqual(inputs);
      expect(workflow.concurrency).toEqual({
        cancelInProgress: false,
        group: concurrencyGroup,
      });
      expect(workflow.permissions).toEqual({ contents: "read" });
      expect(workflow.jobs.authorize).toMatchObject({
        checkouts: [],
        environment: undefined,
        inheritsSecrets: false,
        needs: [],
        permissions: authorizePermissions,
        secretReferences: ["GITHUB_TOKEN"],
      });
      expect(workflow.jobs.inspect).toMatchObject({
        checkouts: [],
        environment,
        inheritsSecrets: false,
        needs: ["authorize"],
        permissions: { contents: "read" },
      });
      for (const imageJob of ["api-image", "web-image"]) {
        expect(workflow.jobs[imageJob]).toMatchObject({
          environment: undefined,
          inheritsSecrets: false,
          needs: ["inspect"],
          permissions: { contents: "read", packages: "write" },
          secretReferences: ["GITHUB_TOKEN"],
        });
      }
      expect(workflow.jobs.deploy).toMatchObject({
        environment,
        inheritsSecrets: false,
        needs: ["authorize", "inspect", "api-image", "web-image"],
      });
      expect(workflow.inheritsSecrets).toBe(false);
      expect(workflow.hasUnresolvedSecretReferences).toBe(false);
    },
  );

  it("keeps each channel's environment authority isolated", () => {
    const development = inspectRepositoryWorkflow("delivery-development.yml");
    const preview = inspectRepositoryWorkflow("delivery-preview.yml");
    const production = inspectRepositoryWorkflow("delivery-production.yml");

    expect(development.secretReferences).toEqual(
      expect.arrayContaining([
        "DOKPLOY_DEVELOPMENT_COMPOSE_ENV",
        "DOKPLOY_NONPRODUCTION_API_KEY",
      ]),
    );
    expect(development.secretReferences).not.toContain(
      "DOKPLOY_PRODUCTION_API_KEY",
    );
    expect(preview.secretReferences).toEqual(
      expect.arrayContaining([
        "DOKPLOY_PREVIEW_COMPOSE_ENV",
        "DOKPLOY_NONPRODUCTION_API_KEY",
      ]),
    );
    expect(preview.secretReferences).not.toContain(
      "DOKPLOY_PRODUCTION_API_KEY",
    );
    expect(production.secretReferences).toEqual(
      expect.arrayContaining([
        "DOKPLOY_PRODUCTION_API_KEY",
        "DOKPLOY_PRODUCTION_COMPOSE_ENV",
      ]),
    );
    expect(production.secretReferences).not.toContain(
      "DOKPLOY_NONPRODUCTION_API_KEY",
    );
  });

  it("requires exact Product CI before every channel can build", () => {
    for (const name of [
      "delivery-development.yml",
      "delivery-preview.yml",
      "delivery-production.yml",
    ]) {
      const authorize = inspectRepositoryWorkflow(name).jobs.authorize;
      const policy = authorize?.runCommands.join("\n") ?? "";

      expect(policy).toContain("actions/workflows/ci.yml/runs");
      expect(policy).toContain('.name == "Product"');
      expect(policy).toContain('.conclusion == "success"');
      expect(policy).not.toContain("last green");
    }
  });

  it("keeps preview authorization, schema refusal, identity, capacity, and domains visible", () => {
    const workflow = inspectRepositoryWorkflow("delivery-preview.yml");
    const authorize = workflow.jobs.authorize?.runCommands.join("\n") ?? "";
    const inspect = workflow.jobs.inspect?.runCommands.join("\n") ?? "";
    const deploy = workflow.jobs.deploy?.runCommands.join("\n") ?? "";

    expect(authorize).toContain('.state == "open"');
    expect(authorize).toContain(".draft == false");
    expect(authorize).toContain('.base.ref == "dev"');
    expect(authorize).toContain("head.repo.full_name == $repository");
    expect(authorize).toContain('name == "deploy:preview"');
    expect(authorize).toContain("migration-(runner|verifier)");
    expect(inspect).toContain("canonical_count");
    expect(inspect).toContain("-lt 3");
    expect(deploy).toContain("domain.byComposeId");
    expect(deploy).toContain("domain.create");
    expect(deploy).toContain("unshelf:last-healthy");
    expect(deploy).not.toContain("compose.delete");
  });

  it("keeps production rerun and durable release policy visible", () => {
    const workflow = inspectRepositoryWorkflow("delivery-production.yml");
    const authorize = workflow.jobs.authorize?.runCommands.join("\n") ?? "";
    const deploy = workflow.jobs.deploy?.runCommands.join("\n") ?? "";

    expect(authorize).toContain("GITHUB_RUN_ATTEMPT");
    expect(authorize).toContain("compare/${source_sha}...${main_sha}");
    expect(authorize).toContain("deployments?environment=production");
    expect(deploy).toContain("deployments?sha=${SOURCE_SHA}");
    expect(deploy).toContain("/statuses");
    expect(deploy).toContain("state=success");
  });

  it("does not automate recovery or destructive lifecycle operations", () => {
    const commands = [
      "delivery-development.yml",
      "delivery-preview.yml",
      "delivery-production.yml",
    ]
      .flatMap((name) =>
        Object.values(inspectRepositoryWorkflow(name).jobs).flatMap(
          ({ runCommands }) => runCommands,
        ),
      )
      .join("\n");

    for (const forbidden of [
      "compose.delete",
      "deployment.cancel",
      "docker system prune",
      "docker image rm",
      "packages/delete-package-version",
      "rollback",
      "down migration",
    ]) {
      expect(commands).not.toContain(forbidden);
    }
  });
});
