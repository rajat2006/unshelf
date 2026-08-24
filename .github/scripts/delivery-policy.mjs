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
  if (input.channel !== "development") fail("unknown delivery channel");
  const entries = parseEnvironment(input.aggregateEnv);
  for (const name of ["DATABASE_URL", "DATABASE_TIME_ZONE"]) {
    if (!entries.get(name)) fail("incomplete development environment");
  }
  if (entries.get("MIGRATION_MODE") !== "apply")
    fail("invalid development migration mode");
  for (const name of [
    "API_IMAGE",
    "WEB_IMAGE",
    "PUBLIC_ORIGIN",
    "DATABASE_NETWORK",
  ]) {
    if (entries.has(name)) fail("workflow-owned development environment value");
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
  "configuration-matches": configurationMatches,
  "reconcile-domains": reconcileDomains,
  "select-preview": selectPreview,
  "validate-environment": validateEnvironment,
};
const command = commands[process.argv[2]];
if (!command) fail("unknown delivery policy command");

let input = "";
for await (const chunk of process.stdin) input += chunk;
process.stdout.write(`${JSON.stringify(command(JSON.parse(input)))}\n`);
