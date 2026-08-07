import type { DeploymentAdapters } from "../src/index.js";

export function parseJson(line: string): unknown {
  return JSON.parse(line) as unknown;
}

export function createFakeDeploymentAdapters(
  mutations: string[],
  times: number[] = [1_000, 1_250],
): DeploymentAdapters {
  const attempts = new Map<
    string,
    {
      queue: { jobId: string; state: "waiting" | "active" }[];
      deployments: {
        deploymentId: string;
        status: "running" | "done" | "error" | "cancelled";
      }[];
    }
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
      advanceChannel: async () => {
        mutations.push("ghcr:advance-channel");
        return { ok: true, value: undefined };
      },
    },
    dokploy: {
      convergeCompose: async () => {
        mutations.push("dokploy:converge");
        return { ok: true, value: undefined };
      },
      inspectAttempt: async (intent) => {
        mutations.push("dokploy:inspect");
        const attempt = attempts.get(intent.correlation);
        return {
          ok: true,
          value: attempt ?? { queue: [], deployments: [] },
        };
      },
      startDeployment: async (intent) => {
        mutations.push("dokploy:start");
        attempts.set(intent.correlation, {
          queue: [],
          deployments: [{ deploymentId: "deployment-1", status: "done" }],
        });
        return { ok: true, value: undefined };
      },
    },
    healthCheck: {
      verify: async () => {
        mutations.push("health-check");
        return { ok: true, value: undefined };
      },
    },
    clock: {
      nowMilliseconds: () => times.shift() ?? 1_250,
      sleep: async () => undefined,
    },
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
    correlation: `development:${"a".repeat(40)}:run-42`,
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
