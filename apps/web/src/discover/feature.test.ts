import { afterEach, describe, expect, it } from "vitest";
import { isDiscoverEnabled } from "./feature";

describe("Discover deployment feature", () => {
  it("uses runtime deployment configuration before build-time development configuration", () => {
    runtimeGlobal.__UNSHELF_RUNTIME_CONFIG__ = { discoverEnabled: true };
    expect(isDiscoverEnabled({ VITE_DISCOVER_ENABLED: "false" })).toBe(true);

    runtimeGlobal.__UNSHELF_RUNTIME_CONFIG__ = { discoverEnabled: false };
    expect(isDiscoverEnabled({ VITE_DISCOVER_ENABLED: "true" })).toBe(false);
  });
});

afterEach(() => {
  delete runtimeGlobal.__UNSHELF_RUNTIME_CONFIG__;
});

const runtimeGlobal = globalThis as typeof globalThis & {
  __UNSHELF_RUNTIME_CONFIG__?: { readonly discoverEnabled: boolean };
};
