export type DiscoverConfig =
  | { enabled: false }
  | { enabled: true; apiKey: string; diagnosticSecrets: readonly string[] };

/** Parse deployment configuration before the HTTP server is allowed to start. */
export function readDiscoverConfig(
  environment: Readonly<Record<string, string | undefined>>,
): DiscoverConfig {
  const enabled = environment.DISCOVER_ENABLED;
  if (enabled === undefined || enabled === "false") return { enabled: false };
  if (enabled !== "true") {
    throw new Error("DISCOVER_ENABLED must be true or false");
  }
  const apiKey = environment.YOUTUBE_API_KEY;
  if (apiKey === undefined || apiKey.length === 0) {
    throw new Error("YOUTUBE_API_KEY is required when Discover is enabled");
  }
  return { enabled: true, apiKey, diagnosticSecrets: [apiKey] };
}
