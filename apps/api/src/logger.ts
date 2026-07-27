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
  return {
    debug: (event) => write(renderer.debug.bind(renderer), event),
    info: (event) => write(renderer.info.bind(renderer), event),
    warn: (event) => write(renderer.warn.bind(renderer), event),
    error: (event) => write(renderer.error.bind(renderer), event),
    fatal: (event) => write(renderer.fatal.bind(renderer), event),
    child: (bindings) => adaptPinoLogger(renderer.child(bindings)),
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
    records.push({ ...bindings, ...event, level });
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
