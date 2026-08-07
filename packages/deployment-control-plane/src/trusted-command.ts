import { execFile } from "node:child_process";

export type InspectResult =
  { ok: true; stdout: string } | { ok: false; reason: "not-found" | "failed" };

export type GitHubInspect = (input: {
  path: string;
  jq: string;
}) => Promise<InspectResult>;

type CommandResult =
  { ok: true; stdout: string } | { ok: false; stderr: string };

export function inspectGitHubWithGh({
  path,
  jq,
}: {
  path: string;
  jq: string;
}): Promise<InspectResult> {
  return inspectCommand({
    command: "gh",
    args: ["api", path, "--jq", jq],
    isNotFound: (diagnostic) =>
      diagnostic.includes("http 404") ||
      (/\b404\b/.test(diagnostic) && diagnostic.includes("not found")),
  });
}

export function inspectRegistryManifestWithDocker({
  trace,
}: {
  trace: string;
}): Promise<InspectResult> {
  return inspectCommand({
    command: "docker",
    args: [
      "buildx",
      "imagetools",
      "inspect",
      trace,
      "--format",
      "{{json .Manifest}}",
    ],
    isNotFound: (diagnostic) =>
      diagnostic.includes("manifest unknown") ||
      diagnostic.includes("no such manifest") ||
      diagnostic.includes("not found"),
  });
}

export function runExternalCommand({
  command,
  args,
}: {
  command: string;
  args: string[];
}): Promise<CommandResult> {
  return new Promise((resolve) => {
    execFile(command, args, { encoding: "utf8" }, (error, stdout, stderr) => {
      resolve(error === null ? { ok: true, stdout } : { ok: false, stderr });
    });
  });
}

export function parseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

export function parseBranchHead(stdout: string): string | undefined {
  const value = parseJson(stdout);
  return isRecord(value) && typeof value.headSha === "string"
    ? value.headSha
    : undefined;
}

function inspectCommand({
  command,
  args,
  isNotFound,
}: {
  command: string;
  args: string[];
  isNotFound: (diagnostic: string) => boolean;
}): Promise<InspectResult> {
  return runExternalCommand({ command, args }).then((result) =>
    result.ok
      ? result
      : {
          ok: false,
          reason: isNotFound(result.stderr.toLowerCase())
            ? "not-found"
            : "failed",
        },
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
