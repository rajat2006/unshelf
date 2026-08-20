import {
  elapsedMilliseconds,
  readClock,
  writeStructuredFailure,
  type AdapterResult,
  type Clock,
} from "./runtime.js";

export {
  runCandidateCli,
  type CandidateAdapters,
  type CandidateChannel,
} from "./candidate.js";
export { createGitHubActionsCandidateAdapters } from "./candidate-adapters.js";
export { createGitHubActionsDeploymentAdapters } from "./deployment-adapters.js";

export type DeploymentIntent = {
  channel: "development" | "preview" | "production";
  sourceSha: string;
  apiImage: string;
  webImage: string;
  publicOrigin: string;
  correlation: string;
};

type ImagePair = Pick<DeploymentIntent, "apiImage" | "webImage">;

export function runImagePairValidationCli(input: {
  args: string[];
  write: (line: string) => void;
}): number {
  const pair = parseDeploymentImagePair(input.args);
  if (pair === undefined) {
    input.write(
      JSON.stringify({
        ok: false,
        error: {
          code: "invalid-image-pair",
          message: "Deployment image pair is invalid.",
        },
      }),
    );
    return 1;
  }
  input.write(
    JSON.stringify({
      ok: true,
      ...pair,
      apiDigest: pair.apiImage.split("@")[1],
      webDigest: pair.webImage.split("@")[1],
      state: "verified",
    }),
  );
  return 0;
}

type VerifiedImagePair = {
  apiDigest: string;
  webDigest: string;
  sourceSha: string;
};

type DeploymentRecord = {
  deploymentId: string;
  status: "running" | "done" | "error" | "cancelled";
};

type DeploymentAttempt = {
  queue: { jobId: string; state: "waiting" | "active" }[];
  deployments: DeploymentRecord[];
};

export type DeploymentAdapters = {
  github: {
    verifyIntent(input: DeploymentIntent): Promise<AdapterResult<undefined>>;
  };
  ghcr: {
    verifyImagePair(
      input: ImagePair & Pick<DeploymentIntent, "sourceSha">,
    ): Promise<AdapterResult<VerifiedImagePair>>;
    advanceChannel(
      input: ImagePair & Pick<DeploymentIntent, "channel">,
    ): Promise<AdapterResult<undefined>>;
  };
  dokploy: {
    convergeCompose(input: DeploymentIntent): Promise<AdapterResult<undefined>>;
    inspectAttempt(
      input: DeploymentIntent,
    ): Promise<AdapterResult<DeploymentAttempt>>;
    startDeployment(input: DeploymentIntent): Promise<AdapterResult<undefined>>;
  };
  healthCheck: {
    verify(
      input: Pick<DeploymentIntent, "publicOrigin">,
    ): Promise<AdapterResult<undefined>>;
  };
  clock: Clock;
};

type DeploymentCliInput = {
  args: string[];
  adapters: DeploymentAdapters;
  write: (line: string) => void;
};

function parseIntent(args: string[]): DeploymentIntent | undefined {
  if (args[0] !== "reconcile") {
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
  const apiImage = values.get("--api-image");
  const webImage = values.get("--web-image");
  const publicOrigin = values.get("--public-origin");
  const correlation = values.get("--correlation");
  if (
    values.size !== 6 ||
    (channel !== "development" &&
      channel !== "preview" &&
      channel !== "production") ||
    sourceSha === undefined ||
    !/^[a-f0-9]{40}$/.test(sourceSha) ||
    apiImage === undefined ||
    !isDeploymentImage({ value: apiImage, repository: "unshelf-api" }) ||
    webImage === undefined ||
    !isDeploymentImage({ value: webImage, repository: "unshelf-web" }) ||
    publicOrigin === undefined ||
    !isValidPublicOrigin({ channel, publicOrigin }) ||
    correlation === undefined ||
    !matchesIdentifierSyntax(correlation)
  ) {
    return undefined;
  }
  return {
    channel,
    sourceSha,
    apiImage,
    webImage,
    publicOrigin,
    correlation,
  };
}

function parseDeploymentImagePair(args: string[]): ImagePair | undefined {
  if (
    args.length !== 5 ||
    args[0] !== "validate-image-pair" ||
    args[1] !== "--api-image" ||
    args[3] !== "--web-image"
  ) {
    return undefined;
  }
  const apiImage = args[2];
  const webImage = args[4];
  return apiImage !== undefined &&
    webImage !== undefined &&
    isDeploymentImage({ value: apiImage, repository: "unshelf-api" }) &&
    isDeploymentImage({ value: webImage, repository: "unshelf-web" })
    ? { apiImage, webImage }
    : undefined;
}

function isDeploymentImage({
  value,
  repository,
}: {
  value: string;
  repository: "unshelf-api" | "unshelf-web";
}): boolean {
  return new RegExp(
    `^ghcr\\.io/rajat2006/${repository}@sha256:[a-f0-9]{64}$`,
  ).test(value);
}

function isValidPublicOrigin({
  channel,
  publicOrigin,
}: {
  channel: "development" | "preview" | "production";
  publicOrigin: string;
}): boolean {
  try {
    const parsed = new URL(publicOrigin);
    const isExactOrigin =
      parsed.protocol === "https:" &&
      parsed.username === "" &&
      parsed.password === "" &&
      parsed.pathname === "/" &&
      parsed.search === "" &&
      parsed.hash === "" &&
      parsed.origin === publicOrigin;
    return (
      isExactOrigin &&
      (channel === "production"
        ? publicOrigin === "https://unshelf.tech"
        : publicOrigin !== "https://unshelf.tech")
    );
  } catch {
    return false;
  }
}

// Reconciliation is monotonic: prove live authority and the immutable image
// pair before mutation, resume at most one correlated Dokploy attempt, require
// public health, then advance channel tags. Reordering can duplicate remote work
// or advertise an unserved image pair.
export async function runDeploymentCli(
  input: DeploymentCliInput,
): Promise<number> {
  const intent = parseIntent(input.args);
  if (intent === undefined) {
    input.write(
      JSON.stringify({
        ok: false,
        error: {
          code: "invalid-intent",
          message: "Deployment intent is invalid.",
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
      message: "Deployment reconciliation failed safely.",
      durationMs: 0,
      evidence: deploymentEvidence(intent),
    });
  }
  try {
    const github = await input.adapters.github.verifyIntent(intent);
    if (!github.ok) {
      return writeAdapterFailure({ input, startedAt, adapter: "github" });
    }
    const images = await input.adapters.ghcr.verifyImagePair({
      sourceSha: intent.sourceSha,
      apiImage: intent.apiImage,
      webImage: intent.webImage,
    });
    if (!images.ok) {
      return writeAdapterFailure({ input, startedAt, adapter: "ghcr" });
    }
    if (!isVerifiedImagePair({ intent, images: images.value })) {
      return writeFailure({
        input,
        startedAt,
        code: "invalid-adapter-result",
        message: "An external adapter returned an invalid result.",
      });
    }
    let attempt = await input.adapters.dokploy.inspectAttempt(intent);
    if (!attempt.ok) {
      return writeAdapterFailure({ input, startedAt, adapter: "dokploy" });
    }
    let state = inspectAttempt(attempt.value);
    if (state.kind === "invalid") {
      return writeInvalidAdapterResult({ input, startedAt });
    }
    if (state.kind === "ambiguous") {
      return writeAmbiguousDeployment({ input, startedAt });
    }
    if (state.kind === "missing") {
      const converged = await input.adapters.dokploy.convergeCompose(intent);
      if (!converged.ok) {
        return writeAdapterFailure({ input, startedAt, adapter: "dokploy" });
      }
      const started = await input.adapters.dokploy.startDeployment(intent);
      if (!started.ok) {
        return writeAdapterFailure({ input, startedAt, adapter: "dokploy" });
      }
    }
    for (let poll = 0; state.kind !== "done" && poll < 120; poll += 1) {
      attempt = await input.adapters.dokploy.inspectAttempt(intent);
      if (!attempt.ok) {
        return writeAdapterFailure({ input, startedAt, adapter: "dokploy" });
      }
      state = inspectAttempt(attempt.value);
      if (state.kind === "invalid") {
        return writeInvalidAdapterResult({ input, startedAt });
      }
      if (state.kind === "ambiguous") {
        return writeAmbiguousDeployment({ input, startedAt });
      }
      if (state.kind === "failed") {
        return writeFailure({
          input,
          startedAt,
          code: "remote-deployment-failed",
          message: "The correlated remote deployment did not succeed.",
        });
      }
      if (state.kind !== "done") {
        await (input.adapters.clock.sleep?.(5_000) ?? Promise.resolve());
      }
    }
    if (state.kind !== "done") {
      return writeFailure({
        input,
        startedAt,
        code: "missing-deployment",
        message: "The correlated remote deployment could not be resolved.",
      });
    }
    const health = await verifyPublicHealth({
      adapters: input.adapters,
      publicOrigin: intent.publicOrigin,
    });
    if (!health.ok) {
      return writeAdapterFailure({ input, startedAt, adapter: "health-check" });
    }
    const advanced = await input.adapters.ghcr.advanceChannel({
      channel: intent.channel,
      apiImage: intent.apiImage,
      webImage: intent.webImage,
    });
    if (!advanced.ok) {
      return writeAdapterFailure({ input, startedAt, adapter: "ghcr" });
    }
    input.write(
      JSON.stringify({
        ok: true,
        channel: intent.channel,
        sourceSha: intent.sourceSha,
        apiDigest: images.value.apiDigest,
        webDigest: images.value.webDigest,
        deploymentId: state.deploymentId,
        state: "healthy",
        durationMs: elapsedMilliseconds({
          startedAt,
          finishedAt: readClock(input.adapters.clock) ?? startedAt,
        }),
      }),
    );
    return 0;
  } catch {
    return writeFailure({
      input,
      startedAt,
      code: "unexpected-failure",
      message: "Deployment reconciliation failed safely.",
    });
  }
}

function isVerifiedImagePair({
  intent,
  images,
}: {
  intent: DeploymentIntent;
  images: VerifiedImagePair;
}): boolean {
  return (
    images.sourceSha === intent.sourceSha &&
    images.apiDigest === intent.apiImage.split("@")[1] &&
    images.webDigest === intent.webImage.split("@")[1]
  );
}

// Dokploy reports a deployment done once it accepts the Swarm update, which is
// before the replacement containers finish booting and the reverse proxy routes
// to them. Poll the public origin on the deployment cadence instead of failing
// the whole reconcile on the first refused request.
async function verifyPublicHealth({
  adapters,
  publicOrigin,
}: {
  adapters: DeploymentAdapters;
  publicOrigin: string;
}): Promise<AdapterResult<undefined>> {
  let health = await adapters.healthCheck.verify({ publicOrigin });
  for (let poll = 0; !health.ok && poll < 24; poll += 1) {
    await (adapters.clock.sleep?.(5_000) ?? Promise.resolve());
    health = await adapters.healthCheck.verify({ publicOrigin });
  }
  return health;
}

type AttemptState =
  | { kind: "missing" | "pending" | "failed" | "ambiguous" | "invalid" }
  | { kind: "done"; deploymentId: string };

function inspectAttempt(attempt: DeploymentAttempt): AttemptState {
  if (!Array.isArray(attempt.queue) || !Array.isArray(attempt.deployments)) {
    return { kind: "invalid" };
  }
  if (attempt.queue.length > 1 || attempt.deployments.length > 1) {
    return { kind: "ambiguous" };
  }
  const queue = attempt.queue[0];
  const deployment = attempt.deployments[0];
  if (
    (queue !== undefined &&
      (!isSafePublicIdentifier(queue.jobId) ||
        (queue.state !== "waiting" && queue.state !== "active"))) ||
    (deployment !== undefined &&
      (!isSafePublicIdentifier(deployment.deploymentId) ||
        !["running", "done", "error", "cancelled"].includes(deployment.status)))
  ) {
    return { kind: "invalid" };
  }
  if (deployment?.status === "done") {
    return { kind: "done", deploymentId: deployment.deploymentId };
  }
  if (deployment?.status === "error" || deployment?.status === "cancelled") {
    return { kind: "failed" };
  }
  if (queue !== undefined || deployment?.status === "running") {
    return { kind: "pending" };
  }
  return { kind: "missing" };
}

function writeInvalidAdapterResult({
  input,
  startedAt,
}: {
  input: DeploymentCliInput;
  startedAt: number;
}): number {
  return writeFailure({
    input,
    startedAt,
    code: "invalid-adapter-result",
    message: "An external adapter returned an invalid result.",
  });
}

function writeAmbiguousDeployment({
  input,
  startedAt,
}: {
  input: DeploymentCliInput;
  startedAt: number;
}): number {
  return writeFailure({
    input,
    startedAt,
    code: "ambiguous-deployment",
    message: "Deployment reconciliation found conflicting state.",
  });
}

function matchesIdentifierSyntax(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value);
}

// Dokploy mints job and deployment identifiers over the URL-safe alphabet, so
// roughly one in thirty opens with "-" or "_". Reject the shape of a secret
// rather than the leading character of a legitimate remote identifier.
function matchesRemoteIdentifierSyntax(value: string): boolean {
  return /^[A-Za-z0-9_-][A-Za-z0-9._:-]{0,127}$/.test(value);
}

function isSafePublicIdentifier(value: string): boolean {
  const sensitiveShape =
    /^(?:gh[opusr]_|github_pat_|sk[-_]|user[_-])|(?:^|[_-])(?:password|postgres|secret|token|user)(?:[_:-]|$)/i;
  return matchesRemoteIdentifierSyntax(value) && !sensitiveShape.test(value);
}

function writeAdapterFailure({
  input,
  startedAt,
  adapter,
}: {
  input: DeploymentCliInput;
  startedAt: number;
  adapter: "github" | "ghcr" | "dokploy" | "health-check";
}): number {
  return writeFailure({
    input,
    startedAt,
    code: `${adapter}-failure`,
    message: "Deployment reconciliation was rejected by an external adapter.",
  });
}

function writeFailure({
  input,
  startedAt,
  code,
  message,
}: {
  input: DeploymentCliInput;
  startedAt: number;
  code: string;
  message: string;
}): number {
  return writeStructuredFailure({
    write: input.write,
    code,
    message,
    durationMs: elapsedMilliseconds({
      startedAt,
      finishedAt: readClock(input.adapters.clock) ?? startedAt,
    }),
    evidence: deploymentEvidence(parseIntent(input.args)),
  });
}

function deploymentEvidence(
  intent: DeploymentIntent | undefined,
): Record<string, string> | undefined {
  return intent === undefined
    ? undefined
    : {
        channel: intent.channel,
        sourceSha: intent.sourceSha,
        correlation: intent.correlation,
      };
}
