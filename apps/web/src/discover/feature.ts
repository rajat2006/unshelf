/** API and navigation use matching deployment flags; only explicit true enables. */
export function isDiscoverEnabled(
  environment: Readonly<
    Record<string, string | boolean | undefined>
  > = import.meta.env,
): boolean {
  const runtimeConfig = (
    globalThis as typeof globalThis & {
      __UNSHELF_RUNTIME_CONFIG__?: { readonly discoverEnabled: boolean };
    }
  ).__UNSHELF_RUNTIME_CONFIG__;
  if (runtimeConfig !== undefined) {
    return runtimeConfig.discoverEnabled;
  }
  return environment.VITE_DISCOVER_ENABLED === "true";
}
