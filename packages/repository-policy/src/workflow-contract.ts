import { parse } from "yaml";

type WorkflowScalar = boolean | number | string;

export type WorkflowInput = {
  default?: WorkflowScalar;
  description?: string;
  options?: WorkflowScalar[];
  required?: boolean;
  type?: string;
};

export type WorkflowTrigger = {
  branches: string[];
  inputs: Record<string, WorkflowInput>;
  schedules: Array<{ cron: string; timezone?: string }>;
  types: string[];
};

export type WorkflowPermissions =
  "read-all" | "write-all" | Record<string, "none" | "read" | "write">;

export type WorkflowConcurrency = {
  cancelInProgress?: boolean | string;
  group?: string;
};

export type WorkflowJob = {
  checkouts: Array<{
    action: string;
    persistCredentials?: boolean | string;
    ref?: string;
  }>;
  environment?: string;
  hasUnresolvedSecretReferences: boolean;
  inheritsSecrets: boolean;
  needs: string[];
  permissions?: WorkflowPermissions;
  secretReferences: string[];
  usesSecretsContext: boolean;
};

export type WorkflowContract = {
  concurrency?: WorkflowConcurrency;
  hasUnresolvedSecretReferences: boolean;
  inheritsSecrets: boolean;
  jobs: Record<string, WorkflowJob>;
  permissions?: WorkflowPermissions;
  secretReferences: string[];
  triggers: Record<string, WorkflowTrigger>;
  usesSecretsContext: boolean;
};

export function inspectWorkflow(source: string): WorkflowContract {
  const document: unknown = parse(source);
  const workflow = requireRecord(document, "workflow");
  const jobs = requireRecord(workflow.jobs, "workflow.jobs");
  const parsedJobs = Object.fromEntries(
    Object.entries(jobs).map(([name, value]) => [
      name,
      parseJob({ name, value }),
    ]),
  );

  return {
    concurrency: parseConcurrency(workflow.concurrency),
    hasUnresolvedSecretReferences: findUnresolvedSecretReferences(workflow),
    inheritsSecrets: Object.values(parsedJobs).some(
      ({ inheritsSecrets }) => inheritsSecrets,
    ),
    jobs: parsedJobs,
    permissions: parsePermissions(workflow.permissions),
    secretReferences: findSecretReferences(workflow),
    triggers: parseTriggers(workflow.on),
    usesSecretsContext: referencesSecretsContext(workflow),
  };
}

function parseTriggers(value: unknown): Record<string, WorkflowTrigger> {
  if (typeof value === "string") {
    return { [value]: emptyTrigger() };
  }
  if (Array.isArray(value)) {
    return Object.fromEntries(
      value.map((trigger, index) => [
        requireString(trigger, `workflow.on[${index}]`),
        emptyTrigger(),
      ]),
    );
  }

  const triggers = requireRecord(value, "workflow.on");
  return Object.fromEntries(
    Object.entries(triggers).map(([name, configuration]) => [
      name,
      parseTrigger(configuration, name),
    ]),
  );
}

function parseTrigger(configuration: unknown, name: string): WorkflowTrigger {
  const trigger = emptyTrigger();
  if (name === "schedule") {
    trigger.schedules = parseSchedules(configuration);
    return trigger;
  }
  if (!isRecord(configuration)) {
    return trigger;
  }
  trigger.branches = parseStringList(
    configuration.branches,
    `workflow.on.${name}.branches`,
  );
  trigger.inputs = parseInputs(configuration, name);
  trigger.types = parseStringList(
    configuration.types,
    `workflow.on.${name}.types`,
  );
  return trigger;
}

function emptyTrigger(): WorkflowTrigger {
  return { branches: [], inputs: {}, schedules: [], types: [] };
}

function parseSchedules(
  value: unknown,
): Array<{ cron: string; timezone?: string }> {
  if (value === null) {
    return [];
  }
  return requireArray(value, "workflow.on.schedule").map((entry, index) => {
    const schedule = requireRecord(entry, `workflow.on.schedule[${index}]`);
    const parsed: { cron: string; timezone?: string } = {
      cron: requireString(schedule.cron, `workflow.on.schedule[${index}].cron`),
    };
    if (schedule.timezone !== undefined) {
      parsed.timezone = requireString(
        schedule.timezone,
        `workflow.on.schedule[${index}].timezone`,
      );
    }
    return parsed;
  });
}

function parseInputs(
  configuration: unknown,
  triggerName: string,
): Record<string, WorkflowInput> {
  if (configuration === null) {
    return {};
  }
  if (!isRecord(configuration)) {
    return {};
  }
  const trigger = configuration;
  if (trigger.inputs === undefined) {
    return {};
  }
  const inputs = requireRecord(
    trigger.inputs,
    `workflow.on.${triggerName}.inputs`,
  );

  return Object.fromEntries(
    Object.entries(inputs).map(([name, value]) => {
      const input = requireRecord(
        value,
        `workflow.on.${triggerName}.inputs.${name}`,
      );
      const parsed: WorkflowInput = {};
      if (input.default !== undefined) {
        parsed.default = requireScalar(input.default, `${name}.default`);
      }
      if (input.description !== undefined) {
        parsed.description = requireString(
          input.description,
          `${name}.description`,
        );
      }
      if (input.options !== undefined) {
        parsed.options = requireArray(input.options, `${name}.options`).map(
          (option) => requireScalar(option, `${name}.options`),
        );
      }
      if (input.required !== undefined) {
        parsed.required = requireBoolean(input.required, `${name}.required`);
      }
      if (input.type !== undefined) {
        parsed.type = requireString(input.type, `${name}.type`);
      }
      return [name, parsed];
    }),
  );
}

function parseJob({
  name,
  value,
}: {
  name: string;
  value: unknown;
}): WorkflowJob {
  const job = requireRecord(value, `workflow.jobs.${name}`);
  return {
    checkouts: parseCheckouts(job.steps, name),
    environment: parseEnvironment(job.environment, name),
    hasUnresolvedSecretReferences: findUnresolvedSecretReferences(job),
    inheritsSecrets: job.secrets === "inherit",
    needs: parseNeeds(job.needs, name),
    permissions: parsePermissions(job.permissions),
    secretReferences: findSecretReferences(job),
    usesSecretsContext: referencesSecretsContext(job),
  };
}

function parseCheckouts(
  value: unknown,
  jobName: string,
): WorkflowJob["checkouts"] {
  if (value === undefined) {
    return [];
  }
  const steps = requireArray(value, `workflow.jobs.${jobName}.steps`);
  return steps.flatMap((value, index) => {
    const step = requireRecord(
      value,
      `workflow.jobs.${jobName}.steps[${index}]`,
    );
    if (
      typeof step.uses !== "string" ||
      !step.uses.startsWith("actions/checkout@")
    ) {
      return [];
    }

    const checkout: WorkflowJob["checkouts"][number] = {
      action: step.uses,
    };
    if (step.with === undefined) {
      return [checkout];
    }
    const inputs = requireRecord(
      step.with,
      `workflow.jobs.${jobName}.steps[${index}].with`,
    );
    if (inputs.ref !== undefined) {
      checkout.ref = requireString(inputs.ref, "checkout.ref");
    }
    if (inputs["persist-credentials"] !== undefined) {
      const persistCredentials = inputs["persist-credentials"];
      if (
        typeof persistCredentials !== "boolean" &&
        typeof persistCredentials !== "string"
      ) {
        throw new Error("checkout.persist-credentials is invalid");
      }
      checkout.persistCredentials = persistCredentials;
    }
    return [checkout];
  });
}

function parseEnvironment(value: unknown, jobName: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value === "string") {
    return value;
  }
  const environment = requireRecord(
    value,
    `workflow.jobs.${jobName}.environment`,
  );
  return requireString(
    environment.name,
    `workflow.jobs.${jobName}.environment.name`,
  );
}

function parseNeeds(value: unknown, jobName: string): string[] {
  if (value === undefined) {
    return [];
  }
  if (typeof value === "string") {
    return [value];
  }
  return requireArray(value, `workflow.jobs.${jobName}.needs`).map(
    (dependency) => requireString(dependency, `workflow.jobs.${jobName}.needs`),
  );
}

function parseStringList(value: unknown, path: string): string[] {
  if (value === undefined) {
    return [];
  }
  if (typeof value === "string") {
    return [value];
  }
  return requireArray(value, path).map((entry) => requireString(entry, path));
}

function parsePermissions(value: unknown): WorkflowPermissions | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (value === "read-all" || value === "write-all") {
    return value;
  }
  const permissions = requireRecord(value, "workflow.permissions");
  return Object.fromEntries(
    Object.entries(permissions).map(([scope, access]) => {
      if (access !== "none" && access !== "read" && access !== "write") {
        throw new Error(`workflow permission ${scope} is invalid`);
      }
      return [scope, access];
    }),
  );
}

function parseConcurrency(value: unknown): WorkflowConcurrency | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value === "string") {
    return { group: value };
  }
  const concurrency = requireRecord(value, "workflow.concurrency");
  const parsed: WorkflowConcurrency = {};
  if (concurrency.group !== undefined) {
    parsed.group = requireString(
      concurrency.group,
      "workflow.concurrency.group",
    );
  }
  if (concurrency["cancel-in-progress"] !== undefined) {
    const cancelInProgress = concurrency["cancel-in-progress"];
    if (
      typeof cancelInProgress !== "boolean" &&
      typeof cancelInProgress !== "string"
    ) {
      throw new Error("workflow.concurrency.cancel-in-progress is invalid");
    }
    parsed.cancelInProgress = cancelInProgress;
  }
  return parsed;
}

function findSecretReferences(value: unknown): string[] {
  const references = new Set<string>();
  visitStrings(value, (text) => {
    for (const match of text.matchAll(namedSecretReferencePattern)) {
      const name = match[1] ?? match[2];
      if (name !== undefined) {
        references.add(name);
      }
    }
  });
  return [...references].sort();
}

const namedSecretReferencePattern =
  /\bsecrets(?:\s*\.\s*([A-Za-z_][A-Za-z0-9_]*)|\s*\[\s*["']([A-Za-z_][A-Za-z0-9_]*)["']\s*\])/g;

function findUnresolvedSecretReferences(value: unknown): boolean {
  let hasUnresolvedReferences = false;
  visitStrings(value, (text) => {
    for (const expression of text.matchAll(/\$\{\{([\s\S]*?)\}\}/g)) {
      const withoutNamedReferences = (expression[1] ?? "").replace(
        namedSecretReferencePattern,
        "",
      );
      if (/\bsecrets\b/.test(withoutNamedReferences)) {
        hasUnresolvedReferences = true;
      }
    }
  });
  return hasUnresolvedReferences;
}

function referencesSecretsContext(value: unknown): boolean {
  let referencesSecrets = false;
  visitStrings(value, (text) => {
    if (/\$\{\{[\s\S]*?\bsecrets\b[\s\S]*?\}\}/.test(text)) {
      referencesSecrets = true;
    }
  });
  return referencesSecrets;
}

function visitStrings(value: unknown, visit: (value: string) => void): void {
  if (typeof value === "string") {
    visit(value);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry) => visitStrings(entry, visit));
    return;
  }
  if (isRecord(value)) {
    Object.values(value).forEach((entry) => visitStrings(entry, visit));
  }
}

function requireRecord(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(`${path} must be a mapping`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${path} must be a sequence`);
  }
  return value;
}

function requireBoolean(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${path} must be a boolean`);
  }
  return value;
}

function requireScalar(value: unknown, path: string): WorkflowScalar {
  if (
    typeof value !== "boolean" &&
    typeof value !== "number" &&
    typeof value !== "string"
  ) {
    throw new Error(`${path} must be a scalar`);
  }
  return value;
}

function requireString(value: unknown, path: string): string {
  if (typeof value !== "string") {
    throw new Error(`${path} must be a string`);
  }
  return value;
}
