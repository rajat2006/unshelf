import type { DeploymentAdapters, DeploymentIntent } from "./index.js";
import {
  inspectGitHubWithGh,
  inspectRegistryManifestWithDocker,
  parseBranchHead,
  parseJson,
  runExternalCommand,
  type GitHubInspect,
} from "./trusted-command.js";

type RegistryInspect = (input: {
  trace: string;
}) => Promise<
  { ok: true; digest: string } | { ok: false; reason: "not-found" | "failed" }
>;

type DokployRequest = (input: {
  method: "GET" | "POST";
  path: string;
  body?: Record<string, unknown>;
}) => Promise<{ ok: true; value: unknown } | { ok: false; status: number }>;

type HealthRequest = (input: { url: string }) => Promise<{
  ok: boolean;
  status: number;
  contentType: string;
  body: string;
}>;

type TagImage = (input: {
  source: string;
  target: string;
}) => Promise<{ ok: boolean }>;

export function createGitHubActionsDeploymentAdapters({
  environment,
  composeFile,
  runGitHubInspect = inspectGitHubWithGh,
  runRegistryInspect = inspectRegistryWithDocker,
  runDokployRequest = createDokployRequester(environment),
  runHealthRequest = requestHealth,
  runTagImage = tagImageWithDocker,
  nowMilliseconds = () => Date.now(),
  sleep = (milliseconds: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, milliseconds)),
}: {
  environment: Record<string, string | undefined>;
  composeFile: string;
  runGitHubInspect?: GitHubInspect;
  runRegistryInspect?: RegistryInspect;
  runDokployRequest?: DokployRequest;
  runHealthRequest?: HealthRequest;
  runTagImage?: TagImage;
  nowMilliseconds?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
}): DeploymentAdapters {
  const composeId = environment.DOKPLOY_COMPOSE_ID;
  return {
    github: {
      verifyIntent: async (intent) =>
        (await isApprovedDevelopmentIntent({
          environment,
          intent,
          runGitHubInspect,
        }))
          ? { ok: true, value: undefined }
          : { ok: false, code: "rejected" },
    },
    ghcr: {
      verifyImagePair: async ({ sourceSha, apiImage, webImage }) => {
        if (!hasDevelopmentAuthority({ environment, sourceSha })) {
          return { ok: false, code: "rejected" };
        }
        const [api, web] = await Promise.all([
          runRegistryInspect({
            trace: `ghcr.io/rajat2006/unshelf-api:development-${sourceSha}`,
          }),
          runRegistryInspect({
            trace: `ghcr.io/rajat2006/unshelf-web:development-${sourceSha}`,
          }),
        ]);
        if (!api.ok || !web.ok) {
          return { ok: false, code: "unavailable" };
        }
        const apiDigest = apiImage.split("@")[1];
        const webDigest = webImage.split("@")[1];
        return api.digest === apiDigest && web.digest === webDigest
          ? {
              ok: true,
              value: {
                sourceSha,
                apiDigest: api.digest,
                webDigest: web.digest,
              },
            }
          : { ok: false, code: "rejected" };
      },
      advanceChannel: async ({ channel, apiImage, webImage }) => {
        if (
          channel !== "development" ||
          environment.DEPLOYMENT_ENVIRONMENT !== "development"
        ) {
          return { ok: false, code: "rejected" };
        }
        return (await convergeDevelopmentTags({
          apiImage,
          webImage,
          runRegistryInspect,
          runTagImage,
        }))
          ? { ok: true, value: undefined }
          : { ok: false, code: "unavailable" };
      },
    },
    dokploy: {
      convergeCompose: async (intent) => {
        const env = deploymentEnvironment({ environment, intent });
        if (
          composeId === undefined ||
          env === undefined ||
          !isApprovedRuntime({ environment, intent })
        ) {
          return { ok: false, code: "rejected" };
        }
        const result = await runDokployRequest({
          method: "POST",
          path: "/compose.update",
          body: {
            composeId,
            composeFile,
            sourceType: "raw",
            composeType: "docker-compose",
            isolatedDeployment: true,
            env,
          },
        });
        return result.ok
          ? { ok: true, value: undefined }
          : {
              ok: false,
              code: result.status === 403 ? "rejected" : "unavailable",
            };
      },
      inspectAttempt: async (intent) => {
        if (
          composeId === undefined ||
          !isApprovedRuntime({ environment, intent })
        ) {
          return { ok: false, code: "rejected" };
        }
        const [queueResult, deploymentResult] = await Promise.all([
          runDokployRequest({ method: "GET", path: "/deployment.queueList" }),
          runDokployRequest({
            method: "GET",
            path: `/deployment.allByCompose?composeId=${encodeURIComponent(composeId)}`,
          }),
        ]);
        if (!queueResult.ok || !deploymentResult.ok) {
          return { ok: false, code: "unavailable" };
        }
        const queue = correlatedQueueRecords({
          value: queueResult.value,
          composeId,
          correlation: intent.correlation,
          description: correlationDescription({ environment, intent }),
        });
        const deployments = correlatedDeploymentRecords({
          value: deploymentResult.value,
          composeId,
          correlation: intent.correlation,
          description: correlationDescription({ environment, intent }),
        });
        return queue === undefined || deployments === undefined
          ? { ok: false, code: "rejected" }
          : { ok: true, value: { queue, deployments } };
      },
      startDeployment: async (intent) => {
        if (
          composeId === undefined ||
          !isApprovedRuntime({ environment, intent })
        ) {
          return { ok: false, code: "rejected" };
        }
        const result = await runDokployRequest({
          method: "POST",
          path: "/compose.deploy",
          body: {
            composeId,
            title: intent.correlation,
            description: correlationDescription({ environment, intent }),
          },
        });
        return result.ok
          ? { ok: true, value: undefined }
          : {
              ok: false,
              code: result.status === 403 ? "rejected" : "unavailable",
            };
      },
    },
    healthCheck: {
      verify: async ({ publicOrigin }) => {
        const [api, web] = await Promise.all([
          runHealthRequest({ url: `${publicOrigin}/api/health` }),
          runHealthRequest({ url: `${publicOrigin}/` }),
        ]);
        return isHealthyApi(api) && isUnshelfShell(web)
          ? { ok: true, value: undefined }
          : { ok: false, code: "rejected" };
      },
    },
    clock: { nowMilliseconds, sleep },
  };
}

async function convergeDevelopmentTags({
  apiImage,
  webImage,
  runRegistryInspect,
  runTagImage,
}: {
  apiImage: string;
  webImage: string;
  runRegistryInspect: RegistryInspect;
  runTagImage: TagImage;
}): Promise<boolean> {
  const apiTarget = "ghcr.io/rajat2006/unshelf-api:development";
  const webTarget = "ghcr.io/rajat2006/unshelf-web:development";
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await Promise.all([
      runTagImage({ source: apiImage, target: apiTarget }),
      runTagImage({ source: webImage, target: webTarget }),
    ]);
    const [api, web] = await Promise.all([
      runRegistryInspect({ trace: apiTarget }),
      runRegistryInspect({ trace: webTarget }),
    ]);
    if (
      api.ok &&
      web.ok &&
      api.digest === apiImage.split("@")[1] &&
      web.digest === webImage.split("@")[1]
    ) {
      return true;
    }
  }
  return false;
}

function isApprovedRuntime({
  environment,
  intent,
}: {
  environment: Record<string, string | undefined>;
  intent: DeploymentIntent;
}): boolean {
  return (
    hasDevelopmentAuthority({ environment, sourceSha: intent.sourceSha }) &&
    intent.channel === "development" &&
    environment.PUBLIC_ORIGIN === intent.publicOrigin &&
    intent.correlation ===
      `development:${intent.sourceSha}:run-${environment.GITHUB_RUN_ID ?? ""}` &&
    isExactHttpsOrigin(environment.DOKPLOY_URL)
  );
}

function hasDevelopmentAuthority({
  environment,
  sourceSha,
}: {
  environment: Record<string, string | undefined>;
  sourceSha: string;
}): boolean {
  return (
    environment.GITHUB_ACTIONS === "true" &&
    environment.GITHUB_REPOSITORY === "rajat2006/unshelf" &&
    environment.DEPLOYMENT_ENVIRONMENT === "development" &&
    environment.APPROVED_CHANNEL === "development" &&
    environment.APPROVED_SOURCE_SHA === sourceSha
  );
}

function isExactHttpsOrigin(value: string | undefined): boolean {
  if (value === undefined) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && parsed.origin === value;
  } catch {
    return false;
  }
}

async function isApprovedDevelopmentIntent({
  environment,
  intent,
  runGitHubInspect,
}: {
  environment: Record<string, string | undefined>;
  intent: DeploymentIntent;
  runGitHubInspect: GitHubInspect;
}): Promise<boolean> {
  if (
    !isApprovedRuntime({ environment, intent }) ||
    environment.APPROVED_EVENT !== "workflow_run" ||
    environment.APPROVED_HEAD_BRANCH !== "dev" ||
    environment.APPROVED_HEAD_REPOSITORY !== "rajat2006/unshelf" ||
    environment.APPROVED_CANDIDATE_CONCLUSION !== "success"
  ) {
    return false;
  }
  const branch = await runGitHubInspect({
    path: "repos/rajat2006/unshelf/git/ref/heads/dev",
    jq: "{headSha:.object.sha}",
  });
  if (!branch.ok || parseBranchHead(branch.stdout) !== intent.sourceSha) {
    return false;
  }
  const ci = await runGitHubInspect({
    path: `repos/rajat2006/unshelf/actions/workflows/ci.yml/runs?head_sha=${intent.sourceSha}&status=completed&per_page=100`,
    jq: "[.workflow_runs[] | {headSha:.head_sha,headBranch:.head_branch,event,conclusion}]",
  });
  return ci.ok && hasSuccessfulProductCi({ stdout: ci.stdout, intent });
}

function hasSuccessfulProductCi({
  stdout,
  intent,
}: {
  stdout: string;
  intent: DeploymentIntent;
}): boolean {
  const value = parseJson(stdout);
  return (
    Array.isArray(value) &&
    value.some(
      (run) =>
        isRecord(run) &&
        run.headSha === intent.sourceSha &&
        run.headBranch === "dev" &&
        run.event === "push" &&
        run.conclusion === "success",
    )
  );
}

function deploymentEnvironment({
  environment,
  intent,
}: {
  environment: Record<string, string | undefined>;
  intent: DeploymentIntent;
}): string | undefined {
  const base = environment.DOKPLOY_COMPOSE_ENV;
  if (
    base === undefined ||
    /\r/.test(base) ||
    /^(?:API_IMAGE|WEB_IMAGE|PUBLIC_ORIGIN)=/m.test(base)
  ) {
    return undefined;
  }
  return `${base.replace(/\n+$/, "")}\nAPI_IMAGE=${intent.apiImage}\nWEB_IMAGE=${intent.webImage}\nPUBLIC_ORIGIN=${intent.publicOrigin}`;
}

function correlatedQueueRecords({
  value,
  composeId,
  correlation,
  description,
}: {
  value: unknown;
  composeId: string;
  correlation: string;
  description: string;
}): { jobId: string; state: "waiting" | "active" }[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const records: { jobId: string; state: "waiting" | "active" }[] = [];
  for (const item of value) {
    if (!isRecord(item) || !isRecord(item.data)) continue;
    if (item.data.titleLog !== correlation) {
      continue;
    }
    if (
      item.data.composeId !== composeId ||
      item.data.applicationType !== "compose" ||
      item.data.descriptionLog !== description ||
      typeof item.id !== "string" ||
      (item.state !== "waiting" && item.state !== "active")
    ) {
      return undefined;
    }
    records.push({ jobId: item.id, state: item.state });
  }
  return records;
}

function correlatedDeploymentRecords({
  value,
  composeId,
  correlation,
  description,
}: {
  value: unknown;
  composeId: string;
  correlation: string;
  description: string;
}):
  | {
      deploymentId: string;
      status: "running" | "done" | "error" | "cancelled";
    }[]
  | undefined {
  if (!Array.isArray(value)) return undefined;
  const records: {
    deploymentId: string;
    status: "running" | "done" | "error" | "cancelled";
  }[] = [];
  for (const item of value) {
    if (!isRecord(item) || item.title !== correlation) {
      continue;
    }
    if (
      item.composeId !== composeId ||
      item.description !== description ||
      typeof item.deploymentId !== "string" ||
      (item.status !== "running" &&
        item.status !== "done" &&
        item.status !== "error" &&
        item.status !== "cancelled")
    ) {
      return undefined;
    }
    records.push({ deploymentId: item.deploymentId, status: item.status });
  }
  return records;
}

function correlationDescription({
  environment,
  intent,
}: {
  environment: Record<string, string | undefined>;
  intent: DeploymentIntent;
}): string {
  return `channel=${intent.channel} source=${intent.sourceSha} run=${environment.GITHUB_RUN_ID ?? "unknown"}`;
}

function isHealthyApi(response: Awaited<ReturnType<HealthRequest>>): boolean {
  if (!response.ok || response.status !== 200) return false;
  const body = parseJson(response.body);
  return isRecord(body) && body.status === "ok" && body.db === "up";
}

function isUnshelfShell(response: Awaited<ReturnType<HealthRequest>>): boolean {
  return (
    response.ok &&
    response.status === 200 &&
    response.contentType.toLowerCase().startsWith("text/html") &&
    /<title>Unshelf<\/title>/i.test(response.body) &&
    /id=["']?root["']?/i.test(response.body)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function inspectRegistryWithDocker({
  trace,
}: {
  trace: string;
}): Promise<Awaited<ReturnType<RegistryInspect>>> {
  const result = await inspectRegistryManifestWithDocker({ trace });
  if (!result.ok) return result;
  const value = parseJson(result.stdout);
  return isRecord(value) && typeof value.digest === "string"
    ? { ok: true, digest: value.digest }
    : { ok: false, reason: "failed" };
}

type DokployFetch = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body: string | undefined;
    redirect: "error";
  },
) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}>;

// Dokploy serves its routes under /api. DOKPLOY_URL must stay an exact HTTPS
// origin — isExactHttpsOrigin rejects anything carrying a path — so the prefix
// is applied here rather than being folded into the variable.
export function createDokployRequester(
  environment: Record<string, string | undefined>,
  runFetch: DokployFetch = fetch,
): DokployRequest {
  return async ({ method, path, body }) => {
    const baseUrl = environment.DOKPLOY_URL;
    const apiKey = environment.DOKPLOY_API_KEY;
    if (baseUrl === undefined || apiKey === undefined) {
      return { ok: false, status: 0 };
    }
    try {
      const response = await runFetch(`${baseUrl}/api${path}`, {
        method,
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        redirect: "error",
      });
      if (!response.ok) return { ok: false, status: response.status };
      return { ok: true, value: await response.json() };
    } catch {
      return { ok: false, status: 0 };
    }
  };
}

async function requestHealth({
  url,
}: {
  url: string;
}): Promise<Awaited<ReturnType<HealthRequest>>> {
  try {
    const response = await fetch(url, { redirect: "error" });
    return {
      ok: response.ok,
      status: response.status,
      contentType: response.headers.get("content-type") ?? "",
      body: await response.text(),
    };
  } catch {
    return { ok: false, status: 0, contentType: "", body: "" };
  }
}

async function tagImageWithDocker({
  source,
  target,
}: {
  source: string;
  target: string;
}): Promise<{ ok: boolean }> {
  const result = await runExternalCommand({
    command: "docker",
    args: ["buildx", "imagetools", "create", "--tag", target, source],
  });
  return { ok: result.ok };
}
