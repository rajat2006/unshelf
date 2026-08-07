import { createGitHubActionsDeploymentAdapters } from "../src/deployment-adapters.js";
import { validIntentArgs } from "./harness.js";
import { describe, expect, it } from "vitest";

const sourceSha = "a".repeat(40);
const apiDigest = `sha256:${"b".repeat(64)}`;
const webDigest = `sha256:${"c".repeat(64)}`;
const apiImage = `ghcr.io/rajat2006/unshelf-api@${apiDigest}`;
const webImage = `ghcr.io/rajat2006/unshelf-web@${webDigest}`;
const correlation = `development:${sourceSha}:run-42`;

function environment(
  overrides: Record<string, string | undefined> = {},
): Record<string, string | undefined> {
  return {
    GITHUB_ACTIONS: "true",
    GITHUB_REPOSITORY: "rajat2006/unshelf",
    GITHUB_RUN_ID: "42",
    DEPLOYMENT_ENVIRONMENT: "development",
    APPROVED_CHANNEL: "development",
    APPROVED_SOURCE_SHA: sourceSha,
    APPROVED_EVENT: "workflow_run",
    APPROVED_HEAD_BRANCH: "dev",
    APPROVED_HEAD_REPOSITORY: "rajat2006/unshelf",
    APPROVED_CANDIDATE_CONCLUSION: "success",
    DOKPLOY_URL: "https://dokploy.example.invalid",
    DOKPLOY_API_KEY: "private-dokploy-key",
    DOKPLOY_COMPOSE_ID: "compose-development",
    DOKPLOY_COMPOSE_ENV:
      "DATABASE_URL=postgresql://opaque\nDATABASE_NETWORK=database-dev\nMIGRATION_MODE=apply",
    PUBLIC_ORIGIN: "https://dev-123.dokploy.example",
    ...overrides,
  };
}

function intent() {
  return {
    channel: "development" as const,
    sourceSha,
    apiImage,
    webImage,
    publicOrigin: "https://dev-123.dokploy.example",
    correlation,
  };
}

describe("GitHub Actions deployment adapters", () => {
  it("approves only the current dev SHA with a successful exact Product CI run", async () => {
    const paths: string[] = [];
    const adapters = createGitHubActionsDeploymentAdapters({
      environment: environment(),
      composeFile: "services: {}",
      runGitHubInspect: async ({ path }) => {
        paths.push(path);
        return path.includes("git/ref/heads/dev")
          ? { ok: true, stdout: JSON.stringify({ headSha: sourceSha }) }
          : {
              ok: true,
              stdout: JSON.stringify([
                {
                  headSha: sourceSha,
                  headBranch: "dev",
                  event: "push",
                  conclusion: "success",
                },
              ]),
            };
      },
    });

    await expect(adapters.github.verifyIntent(intent())).resolves.toEqual({
      ok: true,
      value: undefined,
    });
    expect(paths).toEqual([
      "repos/rajat2006/unshelf/git/ref/heads/dev",
      `repos/rajat2006/unshelf/actions/workflows/ci.yml/runs?head_sha=${sourceSha}&status=completed&per_page=100`,
    ]);
  });

  it("rejects production environment authority before any GitHub request", async () => {
    let inspected = false;
    const adapters = createGitHubActionsDeploymentAdapters({
      environment: environment({ DEPLOYMENT_ENVIRONMENT: "production" }),
      composeFile: "services: {}",
      runGitHubInspect: async () => {
        inspected = true;
        return { ok: false, reason: "failed" };
      },
    });

    await expect(adapters.github.verifyIntent(intent())).resolves.toEqual({
      ok: false,
      code: "rejected",
    });
    expect(inspected).toBe(false);
  });

  it("binds both immutable images to their exact source trace", async () => {
    const traces: string[] = [];
    const adapters = createGitHubActionsDeploymentAdapters({
      environment: environment(),
      composeFile: "services: {}",
      runRegistryInspect: async ({ trace }) => {
        traces.push(trace);
        return {
          ok: true,
          digest: trace.includes("unshelf-api") ? apiDigest : webDigest,
        };
      },
    });

    await expect(
      adapters.ghcr.verifyImagePair({ sourceSha, apiImage, webImage }),
    ).resolves.toEqual({
      ok: true,
      value: { sourceSha, apiDigest, webDigest },
    });
    expect(traces).toEqual([
      `ghcr.io/rajat2006/unshelf-api:development-${sourceSha}`,
      `ghcr.io/rajat2006/unshelf-web:development-${sourceSha}`,
    ]);
  });

  it("converges raw isolated Compose with the verified pair and origin", async () => {
    const requests: unknown[] = [];
    const adapters = createGitHubActionsDeploymentAdapters({
      environment: environment(),
      composeFile: "services:\n  api: {}",
      runDokployRequest: async (request) => {
        requests.push(request);
        return { ok: true, value: {} };
      },
    });

    await expect(adapters.dokploy.convergeCompose(intent())).resolves.toEqual({
      ok: true,
      value: undefined,
    });
    expect(requests).toEqual([
      {
        method: "POST",
        path: "/compose.update",
        body: {
          composeId: "compose-development",
          composeFile: "services:\n  api: {}",
          sourceType: "raw",
          composeType: "docker-compose",
          isolatedDeployment: true,
          env: `DATABASE_URL=postgresql://opaque\nDATABASE_NETWORK=database-dev\nMIGRATION_MODE=apply\nAPI_IMAGE=${apiImage}\nWEB_IMAGE=${webImage}\nPUBLIC_ORIGIN=https://dev-123.dokploy.example`,
        },
      },
    ]);
    expect(JSON.stringify(requests)).toContain(`WEB_IMAGE=${webImage}`);
    expect(JSON.stringify(requests)).toContain(
      "PUBLIC_ORIGIN=https://dev-123.dokploy.example",
    );
    expect(JSON.stringify(requests)).not.toContain("private-dokploy-key");
  });

  it("discovers the exact correlated queue and deployment records", async () => {
    const adapters = createGitHubActionsDeploymentAdapters({
      environment: environment(),
      composeFile: "services: {}",
      runDokployRequest: async ({ path }) =>
        path === "/deployment.queueList"
          ? {
              ok: true,
              value: [
                {
                  id: "job-1",
                  state: "active",
                  data: {
                    composeId: "compose-development",
                    applicationType: "compose",
                    titleLog: correlation,
                    descriptionLog: `channel=development source=${sourceSha} run=42`,
                  },
                },
                {
                  id: "unrelated-job",
                  state: "waiting",
                  data: { titleLog: "development:run-other" },
                },
              ],
            }
          : {
              ok: true,
              value: [
                {
                  deploymentId: "deployment-1",
                  composeId: "compose-development",
                  title: correlation,
                  description: `channel=development source=${sourceSha} run=42`,
                  status: "running",
                },
              ],
            },
    });

    await expect(adapters.dokploy.inspectAttempt(intent())).resolves.toEqual({
      ok: true,
      value: {
        queue: [{ jobId: "job-1", state: "active" }],
        deployments: [{ deploymentId: "deployment-1", status: "running" }],
      },
    });
  });

  it("rejects a reused correlation bound to a different source SHA", async () => {
    const adapters = createGitHubActionsDeploymentAdapters({
      environment: environment(),
      composeFile: "services: {}",
      runDokployRequest: async ({ path }) =>
        path === "/deployment.queueList"
          ? { ok: true, value: [] }
          : {
              ok: true,
              value: [
                {
                  deploymentId: "deployment-1",
                  composeId: "compose-development",
                  title: correlation,
                  description: `channel=development source=${"d".repeat(40)} run=42`,
                  status: "done",
                },
              ],
            },
    });

    await expect(adapters.dokploy.inspectAttempt(intent())).resolves.toEqual({
      ok: false,
      code: "rejected",
    });
  });

  it("requires both API/database health and the Unshelf HTML shell", async () => {
    const urls: string[] = [];
    const adapters = createGitHubActionsDeploymentAdapters({
      environment: environment(),
      composeFile: "services: {}",
      runHealthRequest: async ({ url }) => {
        urls.push(url);
        return url.endsWith("/api/health")
          ? {
              ok: true,
              status: 200,
              contentType: "application/json",
              body: JSON.stringify({ status: "ok", db: "up" }),
            }
          : {
              ok: true,
              status: 200,
              contentType: "text/html; charset=utf-8",
              body: '<!doctype html><title>Unshelf</title><div id="root"></div>',
            };
      },
    });

    await expect(
      adapters.healthCheck.verify({
        publicOrigin: "https://dev-123.dokploy.example",
      }),
    ).resolves.toEqual({ ok: true, value: undefined });
    expect(urls).toEqual([
      "https://dev-123.dokploy.example/api/health",
      "https://dev-123.dokploy.example/",
    ]);
  });

  it("moves both development tags only to the supplied immutable pair", async () => {
    const tags: unknown[] = [];
    const adapters = createGitHubActionsDeploymentAdapters({
      environment: environment(),
      composeFile: "services: {}",
      runTagImage: async (input) => {
        tags.push(input);
        return { ok: true };
      },
      runRegistryInspect: async ({ trace }) => ({
        ok: true,
        digest: trace.includes("unshelf-api") ? apiDigest : webDigest,
      }),
    });

    await expect(
      adapters.ghcr.advanceChannel({
        channel: "development",
        apiImage,
        webImage,
      }),
    ).resolves.toEqual({ ok: true, value: undefined });
    expect(tags).toEqual([
      {
        source: apiImage,
        target: "ghcr.io/rajat2006/unshelf-api:development",
      },
      {
        source: webImage,
        target: "ghcr.io/rajat2006/unshelf-web:development",
      },
    ]);
  });

  it("repairs a transient single-tag failure before reporting the pair healthy", async () => {
    const tags: { source: string; target: string }[] = [];
    let webAttempts = 0;
    const adapters = createGitHubActionsDeploymentAdapters({
      environment: environment(),
      composeFile: "services: {}",
      runTagImage: async (input) => {
        tags.push(input);
        if (input.target.endsWith("unshelf-web:development")) {
          webAttempts += 1;
          return { ok: webAttempts > 1 };
        }
        return { ok: true };
      },
      runRegistryInspect: async ({ trace }) => ({
        ok: true,
        digest:
          webAttempts > 1
            ? trace.includes("unshelf-api")
              ? apiDigest
              : webDigest
            : `sha256:${"d".repeat(64)}`,
      }),
    });

    await expect(
      adapters.ghcr.advanceChannel({
        channel: "development",
        apiImage,
        webImage,
      }),
    ).resolves.toEqual({ ok: true, value: undefined });
    expect(tags).toHaveLength(4);
    expect(webAttempts).toBe(2);
  });

  it("keeps the public reconcile command named and secret-free", () => {
    expect(validIntentArgs()).not.toContain("private-dokploy-key");
    expect(validIntentArgs()).not.toContain("postgresql://opaque");
  });
});
