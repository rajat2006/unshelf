import { isAbsolute, relative, sep } from "node:path";
import {
  collectSourceInspectionReleaseObservations,
  evaluateSourceInspectionRelease,
  parseSourceInspectionReleaseManifest,
  type InspectSourceForRelease,
  type SourceInspectionReleaseRuntime,
} from "./release-evaluation";

interface ReleaseCommandArguments {
  readonly manifestPath: string;
  readonly reportPath: string;
  readonly region: string;
  readonly commit: string;
  readonly deterministicCorpusPassed: boolean;
  readonly clientLifecyclePassed: boolean;
  readonly invariantsPassed: boolean;
}

export async function runSourceInspectionReleaseCommand({
  args,
  repositoryRoot,
  resolvePath,
  readTextFile,
  writeTextFile,
  writeLine,
  inspect,
  runtime,
}: {
  readonly args: readonly string[];
  readonly repositoryRoot: string;
  readonly resolvePath: (input: { readonly path: string }) => string;
  readonly readTextFile: (input: { readonly path: string }) => string;
  readonly writeTextFile: (input: {
    readonly path: string;
    readonly value: string;
  }) => void;
  readonly writeLine: (line: string) => void;
  readonly inspect: InspectSourceForRelease;
  readonly runtime: SourceInspectionReleaseRuntime;
}): Promise<number> {
  try {
    const input = parseArguments(args);
    if (!isAbsolute(input.manifestPath) || !isAbsolute(input.reportPath)) {
      throw new ReleaseCommandInputError();
    }
    if (!isOutsideRepository({ path: input.manifestPath, repositoryRoot })) {
      throw new ReleaseCommandInputError();
    }
    const resolvedManifestPath = resolvePath({ path: input.manifestPath });
    if (!isOutsideRepository({ path: resolvedManifestPath, repositoryRoot })) {
      throw new ReleaseCommandInputError();
    }
    const document: unknown = JSON.parse(
      readTextFile({ path: resolvedManifestPath }),
    );
    const parsed = parseSourceInspectionReleaseManifest(document);
    if (!parsed.ok) throw new ReleaseCommandInputError();
    const observations = await collectSourceInspectionReleaseObservations({
      cases: parsed.manifest.cases,
      inspect,
      runtime,
    });
    const report = evaluateSourceInspectionRelease({
      manifest: parsed.manifest,
      observations,
      region: input.region,
      qualification: {
        commit: input.commit,
        deterministicCorpusPassed: input.deterministicCorpusPassed,
        clientLifecyclePassed: input.clientLifecyclePassed,
        safetyPrivacyCancellationLimitsNoWritePassed: input.invariantsPassed,
      },
    });
    writeTextFile({
      path: input.reportPath,
      value: `${JSON.stringify(report, null, 2)}\n`,
    });
    writeLine(
      JSON.stringify({
        ok: report.recommendation !== "blocked",
        recommendation: report.recommendation,
      }),
    );
    return report.recommendation === "blocked" ? 1 : 0;
  } catch {
    writeLine(JSON.stringify({ ok: false, error: "invalid_evaluation_input" }));
    return 1;
  }
}

function parseArguments(args: readonly string[]): ReleaseCommandArguments {
  const values = new Map<string, string>();
  const flags = new Set<string>();
  const booleanFlags = new Set([
    "--deterministic-corpus-passed",
    "--client-lifecycle-passed",
    "--invariants-passed",
  ]);
  for (let index = 0; index < args.length; index += 1) {
    const name = args[index];
    if (name === undefined || !name.startsWith("--")) {
      throw new ReleaseCommandInputError();
    }
    if (booleanFlags.has(name)) {
      if (flags.has(name)) throw new ReleaseCommandInputError();
      flags.add(name);
      continue;
    }
    const value = args[index + 1];
    if (value === undefined || value.startsWith("--") || values.has(name)) {
      throw new ReleaseCommandInputError();
    }
    values.set(name, value);
    index += 1;
  }
  const manifestPath = values.get("--manifest");
  const reportPath = values.get("--report");
  const region = values.get("--region");
  const commit = values.get("--commit");
  if (
    manifestPath === undefined ||
    reportPath === undefined ||
    region === undefined ||
    !/^[a-z0-9][a-z0-9._-]{0,63}$/u.test(region) ||
    commit === undefined ||
    !/^[a-f0-9]{40}$/u.test(commit) ||
    values.size !== 4
  ) {
    throw new ReleaseCommandInputError();
  }
  return {
    manifestPath,
    reportPath,
    region,
    commit,
    deterministicCorpusPassed: flags.has("--deterministic-corpus-passed"),
    clientLifecyclePassed: flags.has("--client-lifecycle-passed"),
    invariantsPassed: flags.has("--invariants-passed"),
  };
}

function isOutsideRepository({
  path,
  repositoryRoot,
}: {
  readonly path: string;
  readonly repositoryRoot: string;
}): boolean {
  const fromRepository = relative(repositoryRoot, path);
  return (
    fromRepository === ".." ||
    fromRepository.startsWith(`..${sep}`) ||
    isAbsolute(fromRepository)
  );
}

class ReleaseCommandInputError extends Error {}
