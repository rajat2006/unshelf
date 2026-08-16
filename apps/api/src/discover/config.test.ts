import { describe, expect, it } from "vitest";
import { readDiscoverConfig } from "./config";

describe("Discover startup configuration", () => {
  it("stays disabled without adding a YouTube startup requirement", () => {
    expect(readDiscoverConfig({})).toEqual({ enabled: false });
    expect(readDiscoverConfig({ DISCOVER_ENABLED: "false" })).toEqual({
      enabled: false,
    });
  });

  it("fails startup when Discover is enabled without the system key", () => {
    expect(() => readDiscoverConfig({ DISCOVER_ENABLED: "true" })).toThrow(
      "YOUTUBE_API_KEY is required when Discover is enabled",
    );
  });

  it("registers the key as a diagnostic secret without exposing it in config errors", () => {
    const apiKey = "youtube-system-secret";
    expect(
      readDiscoverConfig({ DISCOVER_ENABLED: "true", YOUTUBE_API_KEY: apiKey }),
    ).toEqual({ enabled: true, apiKey, diagnosticSecrets: [apiKey] });
  });

  it("rejects ambiguous feature flag values", () => {
    expect(() => readDiscoverConfig({ DISCOVER_ENABLED: "yes" })).toThrow(
      "DISCOVER_ENABLED must be true or false",
    );
  });
});
