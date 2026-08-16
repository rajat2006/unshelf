/** API and navigation use matching deployment flags; only explicit true enables. */
export function isDiscoverEnabled(
  environment: Readonly<
    Record<string, string | boolean | undefined>
  > = import.meta.env,
): boolean {
  return environment.VITE_DISCOVER_ENABLED === "true";
}
