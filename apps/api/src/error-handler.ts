import type { ErrorRequestHandler } from "express";

export const apiErrorHandler: ErrorRequestHandler = (
  error,
  _req,
  res,
  _next,
) => {
  if (isMalformedJsonError(error)) {
    res.status(400).json({
      error: "invalid_json",
      message: "Request body must be valid JSON",
    });
    return;
  }

  res.status(500).json({
    error: "internal_server_error",
    message: "An unexpected error occurred",
  });
};

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
