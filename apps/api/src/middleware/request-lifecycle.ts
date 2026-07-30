import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import type { Request, RequestHandler } from "express";
import {
  serializeDiagnosticQuery,
  serializeDiagnosticValue,
} from "../diagnostics";
import type { Logger, LogLevel } from "../logging";

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
      /** Redacted request context attached only to a failed terminal record. */
      failureRequest?: Readonly<Record<string, unknown>>;
    }
  }
}

export interface RequestLifecycleOptions {
  readonly logger: Logger;
  readonly generateRequestId?: () => string;
  readonly monotonicNow?: () => number;
  /** Exact configured secrets removed from failure request snapshots. */
  readonly diagnosticSecrets?: readonly string[];
}

export function createRequestLifecycle({
  logger,
  generateRequestId = randomUUID,
  monotonicNow = () => performance.now(),
  diagnosticSecrets,
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
      const failureRequest =
        req.failureRequest ??
        (termination === "aborted" || (status !== undefined && status >= 400)
          ? failureRequestSnapshot(req, diagnosticSecrets)
          : undefined);
      req.logger[level]({
        event: "unshelf.api.request.ended",
        msg: "API request ended",
        ...(req.user === undefined ? {} : { userId: req.user.id }),
        method: normalizeMethod(req.method),
        route: registeredRoute(req),
        durationMs: monotonicNow() - startedAt,
        termination,
        ...(status === undefined ? {} : { status }),
        ...(failureRequest === undefined ? {} : { request: failureRequest }),
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

export function registeredRoute(req: Request): string {
  const route: unknown = req.route;
  const path =
    typeof route === "object" && route !== null && "path" in route
      ? route.path
      : undefined;
  if (typeof path !== "string") {
    return req.routingResolved ? "UNMATCHED" : "UNRESOLVED";
  }
  const mount = req.baseUrl.length > 0 ? req.baseUrl : req.routeMount;
  if (path === "/" && mount.length > 0) {
    return mount;
  }
  return `${mount}${path}`;
}

export function failureRequestSnapshot(
  req: Request,
  secrets?: readonly string[],
): Readonly<Record<string, unknown>> {
  const route = registeredRoute(req);
  return serializeDiagnosticValue(
    {
      method: req.method,
      path: rawRequestPath(req.originalUrl),
      headers: req.headers,
      params: failureRouteParameters({
        path: rawRequestPath(req.originalUrl),
        route,
        current: req.params,
      }),
      query: serializeDiagnosticQuery(req.query, { secrets }),
      body: req.body as unknown,
    },
    { secrets },
  ) as Readonly<Record<string, unknown>>;
}

function rawRequestPath(originalUrl: string): string {
  const queryStart = originalUrl.indexOf("?");
  return queryStart === -1 ? originalUrl : originalUrl.slice(0, queryStart);
}

function failureRouteParameters({
  path,
  route,
  current,
}: {
  path: string;
  route: string;
  current: Readonly<Record<string, string | string[]>> | undefined;
}): Readonly<Record<string, string | string[]>> {
  const captured = current ?? {};
  if (
    Object.keys(captured).length > 0 ||
    route === "UNRESOLVED" ||
    route === "UNMATCHED"
  ) {
    return captured;
  }

  const pathSegments = path.split("/");
  const routeSegments = route.split("/");
  if (pathSegments.length !== routeSegments.length) {
    return captured;
  }

  return Object.fromEntries(
    routeSegments.flatMap((segment, index) => {
      if (!segment.startsWith(":")) {
        return [];
      }
      const name = segment.slice(1);
      const value = pathSegments[index];
      return name.length === 0 || value === undefined
        ? []
        : [[name, safelyDecode(value)]];
    }),
  );
}

function safelyDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
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
