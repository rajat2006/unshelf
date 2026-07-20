/**
 * Read a required, non-blank `name` from an HTTP request body without changing
 * what the User supplied. Named domain records keep surrounding whitespace, but
 * whitespace alone is not a name.
 */
export function parseRequiredName(body: unknown): { name: string } | null {
  if (typeof body !== "object" || body === null) return null;
  const { name } = body as Record<string, unknown>;
  if (typeof name !== "string" || name.trim().length === 0) return null;
  return { name };
}
