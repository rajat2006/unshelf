import pino, { type Logger as PinoLogger } from "pino";

export const LOG_LEVELS = [
  "debug",
  "info",
  "warn",
  "error",
  "fatal",
] as const;

export type LogLevel = (typeof LOG_LEVELS)[number];
export type LogBindings = Readonly<Record<string, unknown>>;

export interface LogEvent extends Readonly<Record<string, unknown>> {
  readonly event: string;
  readonly msg: string;
}

export interface Logger {
  debug(event: LogEvent): void;
  info(event: LogEvent): void;
  warn(event: LogEvent): void;
  error(event: LogEvent): void;
  fatal(event: LogEvent): void;
  child(bindings: LogBindings): Logger;
  flush(): Promise<void>;
}

export type CollectedLogRecord = LogEvent &
  LogBindings & {
    readonly level: LogLevel;
  };

export interface CollectingLogger extends Logger {
  readonly records: readonly CollectedLogRecord[];
}

export interface LogDestination {
  write(line: string): void;
}

export interface ProductionLoggerOptions {
  level: LogLevel;
  destination?: LogDestination;
}

export function parseLogLevel(value: string | undefined): LogLevel {
  if (value === undefined) {
    return "info";
  }
  if (isLogLevel(value)) {
    return value;
  }

  throw new Error(`Invalid LOG_LEVEL: ${value}`);
}

export function createProductionLogger({
  level,
  destination,
}: ProductionLoggerOptions): Logger {
  const options: pino.LoggerOptions = {
    base: null,
    level,
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level(label) {
        return { level: label };
      },
    },
  };
  const renderer = destination
    ? pino(options, destination)
    : pino(options);

  return adaptPinoLogger(renderer);
}

export function createCollectingLogger(): CollectingLogger {
  const records: CollectedLogRecord[] = [];
  return {
    ...createCollectingChild(records, {}),
    records,
  };
}

function adaptPinoLogger(renderer: PinoLogger): Logger {
  return adaptPinoChild(renderer, {});
}

function adaptPinoChild(
  renderer: PinoLogger,
  bindings: LogBindings,
): Logger {
  const render = (level: LogLevel, event: LogEvent): void => {
    const bounded = boundLogRecord(level, bindings, event);
    write(renderer[level].bind(renderer), bounded);
  };

  return {
    debug: (event) => render("debug", event),
    info: (event) => render("info", event),
    warn: (event) => render("warn", event),
    error: (event) => render("error", event),
    fatal: (event) => render("fatal", event),
    child: (childBindings) =>
      adaptPinoChild(renderer, { ...bindings, ...childBindings }),
    flush: () =>
      new Promise((resolve, reject) => {
        renderer.flush((error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      }),
  };
}

function createCollectingChild(
  records: CollectedLogRecord[],
  bindings: LogBindings,
): Logger {
  const collect = (level: LogLevel, event: LogEvent): void => {
    records.push({ ...boundLogRecord(level, bindings, event), level });
  };

  return {
    debug: (event) => collect("debug", event),
    info: (event) => collect("info", event),
    warn: (event) => collect("warn", event),
    error: (event) => collect("error", event),
    fatal: (event) => collect("fatal", event),
    child: (childBindings) =>
      createCollectingChild(records, { ...bindings, ...childBindings }),
    flush: () => Promise.resolve(),
  };
}

function write(
  render: (attributes: Record<string, unknown>, message: string) => void,
  { msg, ...attributes }: LogEvent,
): void {
  render(attributes, msg);
}

function isLogLevel(value: string): value is LogLevel {
  return LOG_LEVELS.some((level) => level === value);
}

function boundLogRecord(
  level: LogLevel,
  bindings: LogBindings,
  event: LogEvent,
): LogEvent & LogBindings {
  const record = cloneRecord({ ...bindings, ...event });
  if (serializedBytes(level, record) <= MAX_SERIALIZED_EVENT_BYTES) {
    return record as LogEvent & LogBindings;
  }

  record.diagnosticTruncated = true;
  truncateFields(record, LOW_PRIORITY_DIAGNOSTIC_KEYS);
  if (serializedBytes(level, record) <= MAX_SERIALIZED_EVENT_BYTES) {
    return record as LogEvent & LogBindings;
  }

  truncateFields(record, new Set(["stack"]));
  if (serializedBytes(level, record) <= MAX_SERIALIZED_EVENT_BYTES) {
    return record as LogEvent & LogBindings;
  }

  compactLowerPriorityStrings(record);
  if (serializedBytes(level, record) <= MAX_SERIALIZED_EVENT_BYTES) {
    return record as LogEvent & LogBindings;
  }

  return priorityRecord(level, record);
}

function cloneRecord(
  record: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  return cloneValue(record, new WeakSet()) as Record<string, unknown>;
}

function cloneValue(value: unknown, seen: WeakSet<object>): unknown {
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (seen.has(value)) {
    return "[Circular]";
  }
  seen.add(value);
  if (Array.isArray(value)) {
    return value.map((entry) => cloneValue(entry, seen));
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      cloneValue(entry, seen),
    ]),
  );
}

function truncateFields(
  value: Record<string, unknown> | unknown[],
  keys: ReadonlySet<string>,
): void {
  for (const [key, entry] of Object.entries(value)) {
    if (keys.has(key)) {
      value[key as keyof typeof value] = TRUNCATED as never;
    } else if (entry !== null && typeof entry === "object") {
      truncateFields(entry as Record<string, unknown>, keys);
    }
  }
}

function compactLowerPriorityStrings(
  value: Record<string, unknown> | unknown[],
  path: readonly string[] = [],
): void {
  for (const [key, entry] of Object.entries(value)) {
    const nextPath = [...path, key];
    if (
      typeof entry === "string" &&
      entry.length > COMPACT_STRING_LENGTH &&
      !isPriorityString(nextPath)
    ) {
      value[key as keyof typeof value] =
        `${entry.slice(0, COMPACT_STRING_LENGTH)}${TRUNCATED}` as never;
    } else if (entry !== null && typeof entry === "object") {
      compactLowerPriorityStrings(
        entry as Record<string, unknown>,
        nextPath,
      );
    }
  }
}

function priorityRecord(
  level: LogLevel,
  record: Readonly<Record<string, unknown>>,
): LogEvent & LogBindings {
  const priority: Record<string, unknown> = {
    ...pickFields(record, PRIORITY_ENVELOPE_FIELDS),
    ...(isRecord(record.error)
      ? { error: pickFields(record.error, ERROR_IDENTITY_FIELDS) }
      : {}),
    diagnosticTruncated: true,
  };
  if (serializedBytes(level, priority) <= MAX_SERIALIZED_EVENT_BYTES) {
    return priority as LogEvent & LogBindings;
  }
  return forceCompactPriorityRecord(priority) as LogEvent & LogBindings;
}

function forceCompactPriorityRecord(
  value: Readonly<Record<string, unknown>>,
  preserveErrorContainer = true,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => {
      if (typeof entry === "string") {
        return [
          key,
          entry.length <= FORCED_PRIORITY_STRING_LENGTH
            ? entry
            : `${entry.slice(0, FORCED_PRIORITY_STRING_LENGTH)}${TRUNCATED}`,
        ];
      }
      if (isRecord(entry)) {
        return [
          key,
          preserveErrorContainer && key === "error"
            ? forceCompactPriorityRecord(entry, false)
            : TRUNCATED,
        ];
      }
      if (entry !== null && typeof entry === "object") {
        return [key, TRUNCATED];
      }
      return [key, entry];
    }),
  );
}

function pickFields(
  value: Readonly<Record<string, unknown>>,
  fields: readonly string[],
): Record<string, unknown> {
  return Object.fromEntries(
    fields.flatMap((field) =>
      value[field] === undefined ? [] : [[field, value[field]]],
    ),
  );
}

function serializedBytes(
  level: LogLevel,
  record: Readonly<Record<string, unknown>>,
): number {
  return (
    Buffer.byteLength(
      JSON.stringify({
        time: "2026-07-27T00:00:00.000Z",
        level,
        ...record,
      }),
      "utf8",
    ) + 1
  );
}

function isRecord(
  value: unknown,
): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isPriorityString(path: readonly string[]): boolean {
  const joined = path.join(".");
  return (
    PRIORITY_ENVELOPE_FIELDS.some((field) => field === path[0]) ||
    ERROR_IDENTITY_FIELDS.some((field) => joined === `error.${field}`)
  );
}

export const MAX_SERIALIZED_EVENT_BYTES = 64 * 1024;
const TRUNCATED = "[TRUNCATED]";
const COMPACT_STRING_LENGTH = 1_024;
const FORCED_PRIORITY_STRING_LENGTH = 256;
const LOW_PRIORITY_DIAGNOSTIC_KEYS = new Set([
  "body",
  "parameters",
  "params",
]);
const PRIORITY_ENVELOPE_FIELDS = [
  "event",
  "msg",
  "requestId",
  "userId",
  "route",
  "method",
  "phase",
  "dependency",
  "termination",
  "status",
  "durationMs",
] as const;
const ERROR_IDENTITY_FIELDS = ["type", "code", "message"] as const;
