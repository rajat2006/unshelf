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
      /** Mounted template prefix captured before Express unwinds a router. */
      routeMount: string;
    }
  }
}

export interface RequestLifecycleOptions {
  readonly logger: Logger;
  readonly generateRequestId?: () => string;
  readonly monotonicNow?: () => number;
  /** Exact configured secrets removed from all failure diagnostics. */
  readonly diagnosticSecrets?: readonly string[];
}

export function createRequestLifecycle({
  logger,
  generateRequestId = randomUUID,
  monotonicNow = () => performance.now(),
}: RequestLifecycleOptions): RequestHandler {
  return (req, res, next) => {
    const requestId = generateRequestId();
    const startedAt = monotonicNow();
    req.requestId = requestId;
    req.logger = logger.child({ requestId });
    req.routingResolved = false;
    req.routeMount = "";
    res.setHeader("X-Request-Id", requestId);

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

export const captureRouteMount: RequestHandler = (req, _res, next) => {
  req.routeMount = req.baseUrl;
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
  if (
    registeredRoute(req) === "/api/health" &&
    status !== undefined &&
    status < 400
  ) {
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
  const mount = req.baseUrl.length > 0 ? req.baseUrl : req.routeMount;
  if (path === "/" && mount.length > 0) {
    return mount;
  }
  return `${mount}${path}`;
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
