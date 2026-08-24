#!/usr/bin/env node

const fail = (message) => {
  throw new Error(message);
};

const objects = (value) => {
  if (Array.isArray(value)) return value.filter((item) => item && typeof item === "object");
  if (value && typeof value === "object" && Array.isArray(value.items)) return objects(value.items);
  return [];
};

function selectPreview(input) {
  const expectedName = `unshelf-pr-${input.prNumber}`;
  if (input.logicalName !== expectedName) fail("invalid logical preview name");
  const records = objects(input.records).filter((record) => typeof record.name === "string");
  const exact = records.filter((record) => record.name === input.logicalName);
  if (exact.length > 1) fail("ambiguous exact preview identity");
  if (exact.length === 0) {
    const capacity = records.filter((record) => /^unshelf-pr-[1-9][0-9]*$/.test(record.name)).length;
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
  return { action: "refresh", composeId: record.composeId, runtimeName: record.appName };
}

function reconcileDomains(input) {
  const domains = objects(input.domains);
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

const commands = { "reconcile-domains": reconcileDomains, "select-preview": selectPreview };
const command = commands[process.argv[2]];
if (!command) fail("unknown delivery policy command");

let input = "";
for await (const chunk of process.stdin) input += chunk;
process.stdout.write(`${JSON.stringify(command(JSON.parse(input)))}\n`);
