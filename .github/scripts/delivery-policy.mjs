#!/usr/bin/env node

const fail = (message) => {
  throw new Error(message);
};

const extractObjectRecords = (value) => {
  if (Array.isArray(value))
    return value.filter((item) => item && typeof item === "object");
  if (value && typeof value === "object" && Array.isArray(value.items)) {
    return extractObjectRecords(value.items);
  }
  return [];
};

const parseEnvironment = (value) => {
  if (typeof value !== "string") fail("invalid aggregate environment");
  const entries = new Map();
  for (const line of value.split(/\r?\n/)) {
    if (line.length === 0) continue;
    const separator = line.indexOf("=");
    const name = line.slice(0, separator);
    if (separator < 1 || !/^[A-Z][A-Z0-9_]*$/.test(name) || entries.has(name)) {
      fail("invalid aggregate environment");
    }
    entries.set(name, line.slice(separator + 1));
  }
  return entries;
};

function validateEnvironment(input) {
  const channels = {
    development: {
      forbidden: [
        "API_IMAGE",
        "WEB_IMAGE",
        "PUBLIC_ORIGIN",
        "DATABASE_NETWORK",
      ],
      migrationMode: "apply",
      required: ["DATABASE_URL", "DATABASE_TIME_ZONE"],
    },
    preview: {
      forbidden: [
        "API_IMAGE",
        "WEB_IMAGE",
        "PUBLIC_ORIGIN",
        "APPLICATION_NAME",
        "APP_NAME",
        "DATABASE_NETWORK",
      ],
      migrationMode: "verify",
      required: ["DATABASE_URL", "DATABASE_TIME_ZONE"],
    },
    production: {
      forbidden: ["API_IMAGE", "WEB_IMAGE", "PUBLIC_ORIGIN", "APP_NAME"],
      migrationMode: "apply",
      required: ["DATABASE_URL", "DATABASE_TIME_ZONE", "DATABASE_NETWORK"],
    },
  };
  const channel = channels[input.channel];
  if (!channel) fail("unknown delivery channel");
  const entries = parseEnvironment(input.aggregateEnv);
  for (const name of channel.required) {
    if (!entries.get(name)) fail("incomplete channel environment");
  }
  if (entries.get("MIGRATION_MODE") !== channel.migrationMode) {
    fail("invalid channel migration mode");
  }
  for (const name of channel.forbidden) {
    if (entries.has(name)) fail("workflow-owned channel environment value");
  }
  return { valid: true };
}

function allowPreviewChanges(input) {
  if (
    !Array.isArray(input.paths) ||
    input.paths.some((path) => typeof path !== "string")
  ) {
    fail("invalid changed paths");
  }
  const changesMigrationBehavior = (path) =>
    /^(apps\/api\/(drizzle\/|src\/(schema|migration-runner|migration-verifier|migrate)\.ts$|drizzle\.config\.ts$|package\.json$|Dockerfile$)|docker-compose\.yml$|pnpm-lock\.yaml$)/.test(
      path,
    );
  if (input.paths.some(changesMigrationBehavior)) {
    fail("preview changes migration behavior");
  }
  return { allowed: true };
}

function configurationMatches(input) {
  const expected = parseEnvironment(input.aggregateEnv);
  if (
    !input.injected ||
    typeof input.injected !== "object" ||
    Array.isArray(input.injected)
  ) {
    fail("invalid injected environment");
  }
  for (const [name, value] of Object.entries(input.injected)) {
    if (
      !/^[A-Z][A-Z0-9_]*$/.test(name) ||
      typeof value !== "string" ||
      expected.has(name)
    ) {
      fail("invalid injected environment");
    }
    expected.set(name, value);
  }
  let live;
  try {
    live = parseEnvironment(input.liveEnv);
  } catch {
    return { matches: false };
  }
  const matches =
    live.size === expected.size &&
    [...expected].every(([name, value]) => live.get(name) === value);
  return { matches };
}

function collectNestedObjects(value, records = []) {
  if (!value || typeof value !== "object") return records;
  if (!Array.isArray(value)) records.push(value);
  for (const nested of Array.isArray(value) ? value : Object.values(value)) {
    collectNestedObjects(nested, records);
  }
  return records;
}

function containsNestedArray(value) {
  if (Array.isArray(value)) return true;
  if (!value || typeof value !== "object") return false;
  return Object.values(value).some(containsNestedArray);
}

function deploymentState(input) {
  if (typeof input.composeId !== "string" || input.composeId.length === 0) {
    fail("invalid Compose identity");
  }
  if (!containsNestedArray(input.records)) {
    fail("invalid deployment response");
  }
  const deploymentRecords = collectNestedObjects(input.records).filter(
    (record) =>
      ["deploymentId", "status", "title"].some((name) =>
        Object.prototype.hasOwnProperty.call(record, name),
      ),
  );
  for (const record of deploymentRecords) {
    if (
      typeof record.composeId !== "string" ||
      record.composeId.length === 0 ||
      typeof record.deploymentId !== "string" ||
      record.deploymentId.length === 0 ||
      typeof record.status !== "string" ||
      record.status.length === 0 ||
      typeof record.title !== "string" ||
      record.title.length === 0
    ) {
      fail("invalid deployment record");
    }
  }
  const composeRecords = deploymentRecords.filter(
    (record) => record.composeId === input.composeId,
  );
  const terminal = new Set(["done", "error", "cancelled"]);
  if (input.title === undefined) {
    return {
      state: composeRecords.some((record) => !terminal.has(record.status))
        ? "outstanding"
        : "settled",
    };
  }
  if (typeof input.title !== "string" || input.title.length === 0) {
    fail("invalid deployment title");
  }
  const exact = composeRecords.filter((record) => record.title === input.title);
  const byId = new Map();
  for (const record of exact) {
    if (
      typeof record.deploymentId !== "string" ||
      record.deploymentId.length === 0
    ) {
      fail("invalid deployment identity");
    }
    const statuses = byId.get(record.deploymentId) ?? new Set();
    statuses.add(record.status);
    byId.set(record.deploymentId, statuses);
  }
  if (byId.size > 1) fail("ambiguous deployment identity");
  if (byId.size === 0) return { state: "missing" };
  const [[deploymentId, statuses]] = byId;
  if (statuses.size !== 1) fail("ambiguous deployment state");
  const [status] = statuses;
  return {
    deploymentId,
    state: terminal.has(status) ? status : "pending",
  };
}

function authorizeProductCi(input) {
  if (!/^[0-9a-f]{40}$/.test(input.sourceSha ?? "")) {
    fail("invalid Product CI revision");
  }
  const runs = Array.isArray(input.runs?.workflow_runs)
    ? input.runs.workflow_runs
    : [];
  for (const run of runs) {
    if (
      run.head_sha !== input.sourceSha ||
      run.event !== input.event ||
      run.status !== "completed" ||
      run.conclusion !== "success" ||
      (input.branch !== null && run.head_branch !== input.branch)
    ) {
      continue;
    }
    const jobs = input.jobsByRunId?.[run.id]?.jobs;
    if (
      Array.isArray(jobs) &&
      jobs.some(
        (job) =>
          job.name === "Product" &&
          job.status === "completed" &&
          job.conclusion === "success",
      )
    ) {
      return { runId: run.id };
    }
  }
  fail("exact Product CI evidence is unavailable");
}

function authorizePreview(input) {
  const pull = input.pull;
  if (
    !Number.isSafeInteger(input.prNumber) ||
    input.prNumber < 1 ||
    typeof input.repository !== "string" ||
    pull?.state !== "open" ||
    pull?.draft !== false ||
    pull?.base?.ref !== "dev" ||
    pull?.head?.repo?.full_name !== input.repository ||
    !Array.isArray(pull?.labels) ||
    !pull.labels.some((label) => label?.name === "deploy:preview")
  ) {
    fail("pull request is not authorized for preview");
  }
  const sourceSha = pull.head.sha;
  const trustedSha = pull.base.sha;
  if (!/^[0-9a-f]{40}$/.test(sourceSha) || !/^[0-9a-f]{40}$/.test(trustedSha)) {
    fail("invalid preview revision");
  }
  return {
    logicalName: `unshelf-pr-${input.prNumber}`,
    sourceSha,
    trustedSha,
  };
}

function validateDeliveryValues(input) {
  if (!Array.isArray(input.origins) || !Array.isArray(input.digests)) {
    fail("invalid delivery values");
  }
  for (const value of input.origins) {
    try {
      const origin = new URL(value);
      if (origin.protocol !== "https:" || origin.origin !== value) {
        fail("invalid HTTPS origin");
      }
    } catch {
      fail("invalid HTTPS origin");
    }
  }
  if (input.digests.some((digest) => !/^sha256:[0-9a-f]{64}$/.test(digest))) {
    fail("invalid immutable digest");
  }
  return { valid: true };
}

function markerState(input) {
  const prefix = "unshelf:last-healthy ";
  if (
    typeof input.description !== "string" ||
    !input.description.startsWith(prefix) ||
    !/^[0-9a-f]{40}$/.test(input.sourceSha ?? "")
  ) {
    return { matches: false };
  }
  let marker;
  try {
    marker = JSON.parse(input.description.slice(prefix.length));
  } catch {
    return { matches: false };
  }
  const expectedKeys = [
    "apiDigest",
    "deploymentId",
    "runAttempt",
    "runId",
    "sourceSha",
    "webDigest",
  ];
  if (
    !marker ||
    typeof marker !== "object" ||
    Array.isArray(marker) ||
    JSON.stringify(Object.keys(marker).sort()) !==
      JSON.stringify(expectedKeys) ||
    marker.sourceSha !== input.sourceSha ||
    !/^sha256:[0-9a-f]{64}$/.test(marker.apiDigest ?? "") ||
    !/^sha256:[0-9a-f]{64}$/.test(marker.webDigest ?? "") ||
    !/^[1-9][0-9]*$/.test(marker.runId ?? "") ||
    !/^[1-9][0-9]*$/.test(marker.runAttempt ?? "") ||
    typeof marker.deploymentId !== "string" ||
    marker.deploymentId.length === 0
  ) {
    return { matches: false };
  }
  return { marker, matches: true };
}

function authorizeProductionRevision(input) {
  if (
    !Number.isSafeInteger(input.runAttempt) ||
    input.runAttempt < 1 ||
    !/^[0-9a-f]{40}$/.test(input.mainSha ?? "") ||
    !/^[0-9a-f]{40}$/.test(input.runSha ?? "") ||
    !Array.isArray(input.successfulReleases)
  ) {
    fail("invalid production revision evidence");
  }
  if (input.runAttempt === 1) return { sourceSha: input.mainSha };
  // GitHub compares base...head: run...main must be ahead/identical so main still
  // contains the retained rerun SHA, while run...release must be behind so every
  // other successful release predates it. This preserves ADR-0022's immutable
  // rerun revision and refuses a rerun after a newer production success.
  if (!new Set(["ahead", "identical"]).has(input.relationToMain)) {
    fail("production rerun is no longer contained in main");
  }
  for (const release of input.successfulReleases) {
    if (release.sha === input.runSha) continue;
    if (release.relationFromRun !== "behind") {
      fail("a newer production release already succeeded");
    }
  }
  return { sourceSha: input.runSha };
}

function selectProductionDeployment(input) {
  const payloadKeys = [
    "apiDigest",
    "dokployDeploymentId",
    "runAttempt",
    "runId",
    "webDigest",
  ];
  if (
    !Array.isArray(input.deployments) ||
    !input.payload ||
    typeof input.payload !== "object" ||
    !input.statusesById ||
    typeof input.statusesById !== "object"
  ) {
    fail("invalid production Deployment evidence");
  }
  const exact = input.deployments.filter(
    (deployment) =>
      deployment?.payload &&
      payloadKeys.every(
        (key) => deployment.payload[key] === input.payload[key],
      ),
  );
  if (exact.length > 1) fail("ambiguous production Deployment evidence");
  if (exact.length === 0) return { action: "create" };
  const deploymentId = exact[0].id;
  if (typeof deploymentId !== "number" && typeof deploymentId !== "string") {
    fail("invalid production Deployment identity");
  }
  if (!Object.prototype.hasOwnProperty.call(input.statusesById, deploymentId)) {
    return { action: "inspect", deploymentId };
  }
  const statuses = input.statusesById[deploymentId];
  if (!Array.isArray(statuses)) fail("invalid production Deployment statuses");
  return {
    action: statuses.some((status) => status?.state === "success")
      ? "complete"
      : "record-success",
    deploymentId,
  };
}

function healthState(input) {
  let api;
  try {
    api = JSON.parse(input.apiBody);
  } catch {
    return { healthy: false };
  }
  const webBody = typeof input.webBody === "string" ? input.webBody : "";
  return {
    healthy:
      api?.status === "ok" &&
      api?.db === "up" &&
      /<title>Unshelf<\/title>/i.test(webBody) &&
      /id=(?:"root"|'root')/i.test(webBody),
  };
}

function selectPreview(input) {
  const expectedName = `unshelf-pr-${input.prNumber}`;
  if (input.logicalName !== expectedName) fail("invalid logical preview name");
  const records = extractObjectRecords(input.records).filter(
    (record) => typeof record.name === "string",
  );
  const exact = records.filter((record) => record.name === input.logicalName);
  if (exact.length > 1) fail("ambiguous exact preview identity");
  if (exact.length === 0) {
    const capacity = records.filter((record) =>
      /^unshelf-pr-[1-9][0-9]*$/.test(record.name),
    ).length;
    if (capacity >= 3) fail("preview capacity exhausted");
    return { action: "create" };
  }
  const record = exact[0];
  if (
    typeof record.composeId !== "string" ||
    !new RegExp(`^${expectedName}-[A-Za-z0-9_-]{6}$`).test(record.appName ?? "")
  ) {
    fail("invalid runtime preview identity");
  }
  return {
    action: "refresh",
    composeId: record.composeId,
    runtimeName: record.appName,
  };
}

function reconcileDomains(input) {
  const domains = extractObjectRecords(input.domains);
  const required = [
    { path: "/api", port: 3001, serviceName: "api" },
    { path: "/", port: 80, serviceName: "web" },
  ];
  return required.filter((route) => {
    const occupied = domains.filter(
      (domain) => domain.host === input.host && domain.path === route.path,
    );
    const exact = occupied.filter(
      (domain) =>
        domain.composeId === input.composeId &&
        domain.serviceName === route.serviceName &&
        domain.port === route.port &&
        domain.https === true,
    );
    if (occupied.length > 1 || (occupied.length === 1 && exact.length !== 1)) {
      fail(`preview route ${route.path} is already occupied`);
    }
    return exact.length === 0;
  });
}

const commands = {
  "allow-preview-changes": allowPreviewChanges,
  "authorize-preview": authorizePreview,
  "authorize-production-revision": authorizeProductionRevision,
  "authorize-product-ci": authorizeProductCi,
  "configuration-matches": configurationMatches,
  "deployment-state": deploymentState,
  "health-state": healthState,
  "marker-state": markerState,
  "reconcile-domains": reconcileDomains,
  "select-preview": selectPreview,
  "select-production-deployment": selectProductionDeployment,
  "validate-delivery-values": validateDeliveryValues,
  "validate-environment": validateEnvironment,
};
const command = commands[process.argv[2]];
if (!command) fail("unknown delivery policy command");

let input = "";
for await (const chunk of process.stdin) input += chunk;
process.stdout.write(`${JSON.stringify(command(JSON.parse(input)))}\n`);
