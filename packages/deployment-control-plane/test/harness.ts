import type { DeploymentAdapters, DeploymentIntent } from "../src/index.js";

export function parseJson(line: string): unknown {
  return JSON.parse(line) as unknown;
}

export function createFakeDeploymentAdapters(
  mutations: string[],
  times: number[] = [1_000, 1_250],
): DeploymentAdapters {
  const deployments = new Map<
    string,
    { deploymentId: string; intent: DeploymentIntent }
  >();
  return {
    github: {
      verifyIntent: async () => {
        mutations.push("github");
        return { ok: true, value: undefined };
      },
    },
    ghcr: {
      verifyImagePair: async ({ sourceSha }) => {
        mutations.push("ghcr");
        return {
          ok: true,
          value: {
            apiDigest: `sha256:${"b".repeat(64)}`,
            webDigest: `sha256:${"c".repeat(64)}`,
            sourceSha,
          },
        };
      },
    },
    dokploy: {
      findDeployment: async (intent) => {
        mutations.push("dokploy:find");
        const deployment = deployments.get(intent.correlation);
        return {
          ok: true,
          value: deployment,
        };
      },
      createDeployment: async (intent) => {
        mutations.push("dokploy:create");
        const deployment = { deploymentId: "deployment-1", intent };
        deployments.set(intent.correlation, deployment);
        return { ok: true, value: deployment };
      },
    },
    healthCheck: {
      verify: async () => {
        mutations.push("health-check");
        return { ok: true, value: undefined };
      },
    },
    clock: { nowMilliseconds: () => times.shift() ?? 1_250 },
  };
}

export function validIntentArgs(
  overrides: Partial<{
    channel: string;
    sourceSha: string;
    apiImage: string;
    webImage: string;
    publicOrigin: string;
    correlation: string;
  }> = {},
): string[] {
  const values = {
    channel: "development",
    sourceSha: "a".repeat(40),
    apiImage: `ghcr.io/rajat2006/unshelf-api@sha256:${"b".repeat(64)}`,
    webImage: `ghcr.io/rajat2006/unshelf-web@sha256:${"c".repeat(64)}`,
    publicOrigin: "https://dev-123.dokploy.example",
    correlation: "development:run-42",
    ...overrides,
  };
  return [
    "reconcile",
    "--channel",
    values.channel,
    "--source-sha",
    values.sourceSha,
    "--api-image",
    values.apiImage,
    "--web-image",
    values.webImage,
    "--public-origin",
    values.publicOrigin,
    "--correlation",
    values.correlation,
  ];
}
