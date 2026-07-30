import { boundLogRecord } from "./bound-log-record";
import type { LogBindings, LogEvent, Logger, LogLevel } from "../contract";

export type CollectedLogRecord = LogEvent &
  LogBindings & {
    readonly level: LogLevel;
  };

export interface CollectingLogger extends Logger {
  readonly records: readonly CollectedLogRecord[];
}

export function createCollectingLogger(): CollectingLogger {
  const records: CollectedLogRecord[] = [];
  return {
    ...createCollectingChild(records, {}),
    records,
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
