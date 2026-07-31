export const LOG_LEVELS = ["debug", "info", "warn", "error", "fatal"] as const;

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
