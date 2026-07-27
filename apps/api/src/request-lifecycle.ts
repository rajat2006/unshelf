import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import type { Request, RequestHandler } from "express";
import type { Logger, LogLevel } from "./logger";

declare global {
  namespace Express {
    interface Request {
      /** Server-owned correlation identifier for this request. */
      requestId: string;
      /** Request-scoped logger carrying the server-owned correlation identifier. */
      logger: Logger;
      /** Whether the request traversed the complete registered routing stack. */
      routingResolved: boolean;
    }
  }
}

export interface RequestLifecycleOptions {
  readonly logger: Logger;
  readonly requestId?: () => string;
  readonly monotonicNow?: () => number;
}

export function createRequestLifecycle({
  logger,
  requestId = randomUUID,
  monotonicNow = () => performance.now(),
}: RequestLifecycleOptions): RequestHandler {
  return (req, res, next) => {
    const id = requestId();
    const startedAt = monotonicNow();
    req.requestId = id;
    req.logger = logger.child({ requestId: id });
    req.routingResolved = false;
    res.setHeader("X-Request-Id", id);

    let recorded = false;
    const recordTermination = (termination: "completed" | "aborted"): void => {
      if (recorded) {
        return;
      }
      recorded = true;

      const status = res.headersSent ? res.statusCode : undefined;
      const level = requestLevel(req, termination, status);
      req.logger[level]({
        event: "unshelf.api.request.ended",
        msg: "API request ended",
        method: normalizeMethod(req.method),
        route: registeredRoute(req),
        durationMs: monotonicNow() - startedAt,
        termination,
        ...(status === undefined ? {} : { status }),
      });
    };

    res.once("finish", () => recordTermination("completed"));
    res.once("close", () =>
      recordTermination(res.writableFinished ? "completed" : "aborted"),
    );
    next();
  };
}

export const markRoutingResolved: RequestHandler = (req, _res, next) => {
  req.routingResolved = true;
  next();
};

function requestLevel(
  req: Request,
  termination: "completed" | "aborted",
  status: number | undefined,
): LogLevel {
  if (termination === "aborted" || (status !== undefined && status >= 500)) {
    return "error";
  }
  if (registeredRoute(req) === "/api/health" && status !== undefined && status < 400) {
    return "debug";
  }
  return "info";
}

function normalizeMethod(method: string): string {
  const normalized = method.toUpperCase();
  return STANDARD_METHODS.has(normalized) ? normalized : "_OTHER";
}

function registeredRoute(req: Request): string {
  const path: unknown = req.route?.path;
  if (typeof path !== "string") {
    return req.routingResolved ? "UNMATCHED" : "UNRESOLVED";
  }
  if (path === "/" && req.baseUrl.length > 0) {
    return req.baseUrl;
  }
  return `${req.baseUrl}${path}`;
}

const STANDARD_METHODS = new Set([
  "CONNECT",
  "DELETE",
  "GET",
  "HEAD",
  "OPTIONS",
  "PATCH",
  "POST",
  "PUT",
  "TRACE",
]);
