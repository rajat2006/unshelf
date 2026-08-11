/** Find one named PostgreSQL uniqueness failure through Drizzle's error wrapper. */
export function isUniqueConstraintViolation(
  error: unknown,
  constraint: string,
): boolean {
  let current: unknown = error;
  while (current instanceof Error) {
    const postgresError = current as Error & {
      code?: unknown;
      constraint?: unknown;
      cause?: unknown;
    };
    if (
      postgresError.code === "23505" &&
      postgresError.constraint === constraint
    ) {
      return true;
    }
    current = postgresError.cause;
  }
  return false;
}
