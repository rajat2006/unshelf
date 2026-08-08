import type { CandidateAdapters, CandidateChannel } from "./candidate.js";
import {
  inspectGitHubWithGh,
  inspectRegistryManifestWithDocker,
  parseBranchHead,
  type GitHubInspect,
  type InspectResult,
} from "./trusted-command.js";

type RegistryInspect = (input: { trace: string }) => Promise<InspectResult>;

type PackageInspect = (input: {
  packageName: "unshelf-api" | "unshelf-web";
}) => Promise<InspectResult>;

export function createGitHubActionsCandidateAdapters({
  environment,
  runRegistryInspect = inspectRegistryManifestWithDocker,
  runGitHubInspect = inspectGitHubWithGh,
  runPackageInspect = inspectPackageWithGh,
  nowMilliseconds = () => Date.now(),
}: {
  environment: Record<string, string | undefined>;
  runRegistryInspect?: RegistryInspect;
  runGitHubInspect?: GitHubInspect;
  runPackageInspect?: PackageInspect;
  nowMilliseconds?: () => number;
}): CandidateAdapters {
  return {
    github: {
      verifyCandidate: async ({ channel, sourceSha }) =>
        (await isApprovedCandidate({
          environment,
          channel,
          sourceSha,
          runGitHubInspect,
        }))
          ? { ok: true, value: undefined }
          : { ok: false, code: "rejected" },
    },
    ghcr: {
      inspectTrace: async ({ trace }) => {
        const packageName = packageNameFromTrace(trace);
        if (packageName === undefined) {
          return { ok: false, code: "rejected" };
        }
        const packageResult = await runPackageInspect({ packageName });
        if (!packageResult.ok && packageResult.reason !== "not-found") {
          return { ok: false, code: "unavailable" };
        }
        if (
          packageResult.ok &&
          parsePackageVisibility(packageResult.stdout) !== "private"
        ) {
          return { ok: false, code: "rejected" };
        }
        const result = await runRegistryInspect({ trace });
        if (!result.ok) {
          return result.reason === "not-found"
            ? { ok: true, value: undefined }
            : { ok: false, code: "unavailable" };
        }
        const digest = parseManifestDigest(result.stdout);
        return digest === undefined || !packageResult.ok
          ? { ok: false, code: "rejected" }
          : { ok: true, value: { digest } };
      },
    },
    clock: { nowMilliseconds },
  };
}

function packageNameFromTrace(
  trace: string,
): "unshelf-api" | "unshelf-web" | undefined {
  const match =
    /^ghcr\.io\/rajat2006\/(unshelf-api|unshelf-web):(?:development|preview|production)-[a-f0-9]{40}$/.exec(
      trace,
    );
  return match?.[1] === "unshelf-api" || match?.[1] === "unshelf-web"
    ? match[1]
    : undefined;
}

function parsePackageVisibility(stdout: string): string | undefined {
  try {
    const parsed = JSON.parse(stdout) as unknown;
    return typeof parsed === "object" &&
      parsed !== null &&
      "visibility" in parsed &&
      typeof parsed.visibility === "string"
      ? parsed.visibility
      : undefined;
  } catch {
    return undefined;
  }
}

async function isApprovedCandidate({
  environment,
  channel,
  sourceSha,
  runGitHubInspect,
}: {
  environment: Record<string, string | undefined>;
  channel: CandidateChannel;
  sourceSha: string;
  runGitHubInspect: GitHubInspect;
}): Promise<boolean> {
  if (
    environment.GITHUB_ACTIONS !== "true" ||
    environment.GITHUB_REPOSITORY !== "rajat2006/unshelf" ||
    environment.APPROVED_HEAD_REPOSITORY !== "rajat2006/unshelf" ||
    environment.APPROVED_CHANNEL !== channel ||
    environment.APPROVED_SOURCE_SHA !== sourceSha
  ) {
    return false;
  }
  if (environment.APPROVED_EVENT === "push") {
    const expectedBranch =
      channel === "development"
        ? "dev"
        : channel === "production"
          ? "main"
          : undefined;
    if (
      expectedBranch === undefined ||
      environment.APPROVED_HEAD_BRANCH !== expectedBranch
    ) {
      return false;
    }
    const result = await runGitHubInspect({
      path: `repos/rajat2006/unshelf/git/ref/heads/${expectedBranch}`,
      jq: "{headSha:.object.sha}",
    });
    return result.ok && parseBranchHead(result.stdout) === sourceSha;
  }
  if (
    environment.APPROVED_EVENT !== "pull_request" ||
    channel !== "preview" ||
    environment.APPROVED_HEAD_BRANCH === undefined ||
    environment.APPROVED_HEAD_BRANCH === ""
  ) {
    return false;
  }
  const result = await runGitHubInspect({
    path: `repos/rajat2006/unshelf/pulls?state=open&base=dev&head=rajat2006%3A${encodeURIComponent(environment.APPROVED_HEAD_BRANCH)}`,
    jq: "map({state,draft,baseRef:.base.ref,headSha:.head.sha,headRepository:.head.repo.full_name})",
  });
  return result.ok && isEligiblePreview({ stdout: result.stdout, sourceSha });
}

function isEligiblePreview({
  stdout,
  sourceSha,
}: {
  stdout: string;
  sourceSha: string;
}): boolean {
  try {
    const parsed = JSON.parse(stdout) as unknown;
    const candidate: unknown = Array.isArray(parsed) ? parsed[0] : undefined;
    return (
      Array.isArray(parsed) &&
      parsed.length === 1 &&
      typeof candidate === "object" &&
      candidate !== null &&
      "state" in candidate &&
      candidate.state === "open" &&
      "draft" in candidate &&
      candidate.draft === false &&
      "baseRef" in candidate &&
      candidate.baseRef === "dev" &&
      "headSha" in candidate &&
      candidate.headSha === sourceSha &&
      "headRepository" in candidate &&
      candidate.headRepository === "rajat2006/unshelf"
    );
  } catch {
    return false;
  }
}

function parseManifestDigest(stdout: string): string | undefined {
  try {
    const parsed = JSON.parse(stdout) as unknown;
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "digest" in parsed &&
      typeof parsed.digest === "string" &&
      /^sha256:[a-f0-9]{64}$/.test(parsed.digest)
    ) {
      return parsed.digest;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function inspectPackageWithGh({
  packageName,
}: {
  packageName: "unshelf-api" | "unshelf-web";
}): Promise<InspectResult> {
  return inspectGitHubWithGh({
    path: `users/rajat2006/packages/container/${packageName}`,
    jq: "{visibility}",
  });
}
