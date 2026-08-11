import type { ErrorRequestHandler } from "express";
import { serializeFailure, type DiagnosticOptions } from "../diagnostics";
import { failureRequestSnapshot, registeredRoute } from "./request-lifecycle";
import { recordValidationFailure } from "./validation";

export function createApiErrorHandler(
  options: DiagnosticOptions = {},
): ErrorRequestHandler {
  return (error, req, res, _next) => {
    if (isMalformedJsonError(error)) {
      recordValidationFailure(req, "malformed_json");
      res.status(400).json({
        error: "invalid_json",
        message: "Request body must be valid JSON",
      });
      return;
    }

    if (isArchivedLearningPlanViolation(error)) {
      res.status(409).json({ error: "learning plan is archived" });
      return;
    }

    const route = registeredRoute(req);
    req.failureRequest = failureRequestSnapshot(req, options.secrets);
    req.logger?.error({
      event: "unshelf.api.error.unexpected",
      msg: "Unexpected API error",
      phase: "request",
      ...(req.user === undefined ? {} : { userId: req.user.id }),
      ...(route === "UNRESOLVED" || route === "UNMATCHED" ? {} : { route }),
      ...serializeFailure(error, options),
    });

    res.status(500).json({
      error: "internal_server_error",
      message: "An unexpected error occurred",
    });
  };
}

function isArchivedLearningPlanViolation(error: unknown): boolean {
  let current: unknown = error;
  while (current instanceof Error) {
    const postgresError = current as Error & {
      code?: unknown;
      constraint?: unknown;
      cause?: unknown;
    };
    if (
      postgresError.code === "23514" &&
      postgresError.constraint === "learning_plan_active_structure"
    ) {
      return true;
    }
    current = postgresError.cause;
  }
  return false;
}

export const apiErrorHandler: ErrorRequestHandler = createApiErrorHandler();

function isMalformedJsonError(
  error: unknown,
): error is SyntaxError & { status: 400; type: "entity.parse.failed" } {
  return (
    error instanceof SyntaxError &&
    "status" in error &&
    error.status === 400 &&
    "type" in error &&
    error.type === "entity.parse.failed"
  );
}
