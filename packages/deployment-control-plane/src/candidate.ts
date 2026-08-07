import {
  elapsedMilliseconds,
  readClock,
  writeStructuredFailure,
  type AdapterResult,
  type Clock,
} from "./runtime.js";

export type CandidateChannel = "development" | "preview" | "production";

type CandidateIdentity = {
  channel: CandidateChannel;
  sourceSha: string;
};

type CandidateIntent = CandidateIdentity & {
  command: "prepare-candidate" | "finalize-candidate";
  apiDigest?: string;
  webDigest?: string;
};

export type CandidateAdapters = {
  github: {
    verifyCandidate(
      input: CandidateIdentity,
    ): Promise<AdapterResult<undefined>>;
  };
  ghcr: {
    inspectTrace(input: {
      trace: string;
    }): Promise<AdapterResult<{ digest: string } | undefined>>;
  };
  clock: Clock;
};

export async function runCandidateCli(input: {
  args: string[];
  adapters: CandidateAdapters;
  write: (line: string) => void;
}): Promise<number> {
  const intent = parseCandidateIntent(input.args);
  if (intent === undefined) {
    input.write(
      JSON.stringify({
        ok: false,
        error: {
          code: "invalid-candidate-intent",
          message: "Candidate intent is invalid.",
        },
      }),
    );
    return 1;
  }

  const startedAt = readClock(input.adapters.clock);
  if (startedAt === undefined) {
    return writeStructuredFailure({
      write: input.write,
      code: "unexpected-failure",
      message: "Candidate publication failed safely.",
      durationMs: 0,
    });
  }
  try {
    const identity = { channel: intent.channel, sourceSha: intent.sourceSha };
    const verified = await input.adapters.github.verifyCandidate(identity);
    if (!verified.ok) {
      return writeFailure({ input, startedAt, code: "github-failure" });
    }
    const traces = candidateTraces(identity);
    const [api, web] = await Promise.all([
      input.adapters.ghcr.inspectTrace({ trace: traces.apiTrace }),
      input.adapters.ghcr.inspectTrace({ trace: traces.webTrace }),
    ]);
    if (!api.ok || !web.ok) {
      return writeFailure({ input, startedAt, code: "ghcr-failure" });
    }
    if (intent.command === "prepare-candidate") {
      if (api.value !== undefined || web.value !== undefined) {
        return writeFailure({
          input,
          startedAt,
          code: "duplicate-trace-identity",
        });
      }
      input.write(
        JSON.stringify({
          ok: true,
          ...identity,
          ...traces,
          state: "ready",
          durationMs: elapsedMilliseconds({
            startedAt,
            finishedAt: readClock(input.adapters.clock) ?? startedAt,
          }),
        }),
      );
      return 0;
    }
    if (api.value === undefined || web.value === undefined) {
      return writeFailure({
        input,
        startedAt,
        code: "partial-publication",
      });
    }
    if (
      api.value.digest !== intent.apiDigest ||
      web.value.digest !== intent.webDigest
    ) {
      return writeFailure({ input, startedAt, code: "digest-mismatch" });
    }
    input.write(
      JSON.stringify({
        ok: true,
        ...identity,
        apiImage: `ghcr.io/rajat2006/unshelf-api@${intent.apiDigest}`,
        webImage: `ghcr.io/rajat2006/unshelf-web@${intent.webDigest}`,
        apiDigest: intent.apiDigest,
        webDigest: intent.webDigest,
        state: "candidate",
        durationMs: elapsedMilliseconds({
          startedAt,
          finishedAt: readClock(input.adapters.clock) ?? startedAt,
        }),
      }),
    );
    return 0;
  } catch {
    return writeFailure({ input, startedAt, code: "unexpected-failure" });
  }
}

function parseCandidateIntent(args: string[]): CandidateIntent | undefined {
  const command = args[0];
  if (command !== "prepare-candidate" && command !== "finalize-candidate") {
    return undefined;
  }
  const values = new Map<string, string>();
  for (let index = 1; index < args.length; index += 2) {
    const name = args[index];
    const value = args[index + 1];
    if (name === undefined || value === undefined || values.has(name)) {
      return undefined;
    }
    values.set(name, value);
  }
  const channel = values.get("--channel");
  const sourceSha = values.get("--source-sha");
  const apiDigest = values.get("--api-digest");
  const webDigest = values.get("--web-digest");
  const hasValidDigests =
    command === "prepare-candidate"
      ? values.size === 2 && apiDigest === undefined && webDigest === undefined
      : values.size === 4 &&
        apiDigest !== undefined &&
        /^[a-f0-9]{64}$/.test(apiDigest.slice("sha256:".length)) &&
        apiDigest.startsWith("sha256:") &&
        webDigest !== undefined &&
        /^[a-f0-9]{64}$/.test(webDigest.slice("sha256:".length)) &&
        webDigest.startsWith("sha256:");
  if (
    !hasValidDigests ||
    (channel !== "development" &&
      channel !== "preview" &&
      channel !== "production") ||
    sourceSha === undefined ||
    !/^[a-f0-9]{40}$/.test(sourceSha)
  ) {
    return undefined;
  }
  return { command, channel, sourceSha, apiDigest, webDigest };
}

function candidateTraces(identity: CandidateIdentity): {
  apiTrace: string;
  webTrace: string;
} {
  const suffix = `${identity.channel}-${identity.sourceSha}`;
  return {
    apiTrace: `ghcr.io/rajat2006/unshelf-api:${suffix}`,
    webTrace: `ghcr.io/rajat2006/unshelf-web:${suffix}`,
  };
}

function writeFailure({
  input,
  startedAt,
  code,
}: {
  input: {
    adapters: CandidateAdapters;
    write: (line: string) => void;
  };
  startedAt: number;
  code: string;
}): number {
  writeStructuredFailure({
    write: input.write,
    code,
    message: "Candidate publication failed safely.",
    durationMs: elapsedMilliseconds({
      startedAt,
      finishedAt: readClock(input.adapters.clock) ?? startedAt,
    }),
  });
  return 1;
}
