export type DeploymentIntent = {
  channel: "development" | "preview" | "production";
  sourceSha: string;
  apiImage: string;
  webImage: string;
  publicOrigin: string;
  correlation: string;
};

type AdapterResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: "unavailable" | "rejected" | "ambiguous" };

type ImagePair = Pick<DeploymentIntent, "apiImage" | "webImage">;

type VerifiedImagePair = {
  apiDigest: string;
  webDigest: string;
  sourceSha: string;
};

type DeploymentRecord = {
  deploymentId: string;
  intent: DeploymentIntent;
};

export type DeploymentAdapters = {
  github: {
    verifyIntent(input: DeploymentIntent): Promise<AdapterResult<undefined>>;
  };
  ghcr: {
    verifyImagePair(
      input: ImagePair & Pick<DeploymentIntent, "sourceSha">,
    ): Promise<AdapterResult<VerifiedImagePair>>;
  };
  dokploy: {
    findDeployment(
      input: DeploymentIntent,
    ): Promise<AdapterResult<DeploymentRecord | undefined>>;
    createDeployment(
      input: DeploymentIntent,
    ): Promise<AdapterResult<DeploymentRecord>>;
  };
  healthCheck: {
    verify(
      input: Pick<DeploymentIntent, "publicOrigin">,
    ): Promise<AdapterResult<undefined>>;
  };
  clock: {
    nowMilliseconds(): number;
  };
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
    !/^ghcr\.io\/rajat2006\/unshelf-api@sha256:[a-f0-9]{64}$/.test(apiImage) ||
    webImage === undefined ||
    !/^ghcr\.io\/rajat2006\/unshelf-web@sha256:[a-f0-9]{64}$/.test(webImage) ||
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

export async function runDeploymentCli(input: {
  args: string[];
  adapters: DeploymentAdapters;
  write: (line: string) => void;
}): Promise<number> {
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

  const startedAt = readClock(input.adapters);
  if (startedAt === undefined) {
    return writeStructuredFailure({
      write: input.write,
      code: "unexpected-failure",
      message: "Deployment reconciliation failed safely.",
      durationMs: 0,
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
    const existingDeployment =
      await input.adapters.dokploy.findDeployment(intent);
    if (!existingDeployment.ok) {
      return writeAdapterFailure({ input, startedAt, adapter: "dokploy" });
    }
    const deployment =
      existingDeployment.value === undefined
        ? await input.adapters.dokploy.createDeployment(intent)
        : intentsMatch({ left: existingDeployment.value.intent, right: intent })
          ? { ok: true as const, value: existingDeployment.value }
          : undefined;
    if (deployment === undefined) {
      return writeFailure({
        input,
        startedAt,
        code: "ambiguous-deployment",
        message: "Deployment reconciliation found conflicting state.",
      });
    }
    if (!deployment.ok) {
      return writeAdapterFailure({ input, startedAt, adapter: "dokploy" });
    }
    if (
      !isSafePublicIdentifier(deployment.value.deploymentId) ||
      !intentsMatch({ left: deployment.value.intent, right: intent })
    ) {
      return writeFailure({
        input,
        startedAt,
        code: "invalid-adapter-result",
        message: "An external adapter returned an invalid result.",
      });
    }
    const health = await input.adapters.healthCheck.verify({
      publicOrigin: intent.publicOrigin,
    });
    if (!health.ok) {
      return writeAdapterFailure({ input, startedAt, adapter: "health-check" });
    }
    input.write(
      JSON.stringify({
        ok: true,
        channel: intent.channel,
        sourceSha: intent.sourceSha,
        apiDigest: images.value.apiDigest,
        webDigest: images.value.webDigest,
        deploymentId: deployment.value.deploymentId,
        state: "healthy",
        durationMs: elapsedMilliseconds({
          startedAt,
          finishedAt: readClock(input.adapters) ?? startedAt,
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

function intentsMatch({
  left,
  right,
}: {
  left: DeploymentIntent;
  right: DeploymentIntent;
}): boolean {
  return (
    left.channel === right.channel &&
    left.sourceSha === right.sourceSha &&
    left.apiImage === right.apiImage &&
    left.webImage === right.webImage &&
    left.publicOrigin === right.publicOrigin &&
    left.correlation === right.correlation
  );
}

function matchesIdentifierSyntax(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value);
}

function isSafePublicIdentifier(value: string): boolean {
  const sensitiveShape =
    /^(?:gh[opusr]_|github_pat_|sk[-_]|user[_-])|(?:^|[_-])(?:password|postgres|secret|token|user)(?:[_:-]|$)/i;
  return matchesIdentifierSyntax(value) && !sensitiveShape.test(value);
}

function elapsedMilliseconds({
  startedAt,
  finishedAt,
}: {
  startedAt: number;
  finishedAt: number;
}): number {
  return Math.max(0, finishedAt - startedAt);
}

function readClock(adapters: DeploymentAdapters): number | undefined {
  try {
    const value = adapters.clock.nowMilliseconds();
    return Number.isFinite(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

function writeAdapterFailure({
  input,
  startedAt,
  adapter,
}: {
  input: {
    adapters: DeploymentAdapters;
    write: (line: string) => void;
  };
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
  input: {
    adapters: DeploymentAdapters;
    write: (line: string) => void;
  };
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
      finishedAt: readClock(input.adapters) ?? startedAt,
    }),
  });
}

function writeStructuredFailure({
  write,
  code,
  message,
  durationMs,
}: {
  write: (line: string) => void;
  code: string;
  message: string;
  durationMs: number;
}): number {
  write(JSON.stringify({ ok: false, error: { code, message }, durationMs }));
  return 1;
}
