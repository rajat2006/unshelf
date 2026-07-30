import pino, { type Logger as PinoLogger } from "pino";
import { boundLogRecord } from "./bound-log-record";
import {
  LOG_LEVELS,
  type LogBindings,
  type LogEvent,
  type Logger,
  type LogLevel,
} from "../contract";

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
  const renderer = destination ? pino(options, destination) : pino(options);

  return adaptPinoChild(renderer, {});
}

function adaptPinoChild(renderer: PinoLogger, bindings: LogBindings): Logger {
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

function write(
  render: (attributes: Record<string, unknown>, message: string) => void,
  { msg, ...attributes }: LogEvent,
): void {
  render(attributes, msg);
}

function isLogLevel(value: string): value is LogLevel {
  return LOG_LEVELS.some((level) => level === value);
}
