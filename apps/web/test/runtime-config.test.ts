import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const temporaryDirectories: string[] = [];

describe("web runtime configuration", () => {
  it("loads runtime configuration before the application bundle", () => {
    const html = readFileSync(
      resolve(import.meta.dirname, "../index.html"),
      "utf8",
    );

    expect(html.indexOf('src="/runtime-config.js"')).toBeGreaterThan(-1);
    expect(html.indexOf('src="/runtime-config.js"')).toBeLessThan(
      html.indexOf('src="/src/main.tsx"'),
    );
  });

  it("writes only the shared Discover deployment flag", () => {
    const webRoot = mkdtempSync(resolve(tmpdir(), "unshelf-web-config-"));
    temporaryDirectories.push(webRoot);

    execFileSync("sh", ["docker-entrypoint.sh"], {
      cwd: resolve(import.meta.dirname, ".."),
      env: {
        ...process.env,
        DISCOVER_ENABLED: "true",
        UNSHELF_RUNTIME_CONFIG_ONLY: "true",
        UNSHELF_WEB_ROOT: webRoot,
        YOUTUBE_API_KEY: "must-not-be-rendered",
        DATABASE_URL: "must-not-be-rendered-either",
      },
    });

    const runtimeConfig = readFileSync(
      resolve(webRoot, "runtime-config.js"),
      "utf8",
    );
    expect(runtimeConfig).toBe(
      "globalThis.__UNSHELF_RUNTIME_CONFIG__ = Object.freeze({ discoverEnabled: true });\n",
    );
    expect(runtimeConfig).not.toContain("must-not-be-rendered");
  });

  it("fails container startup for an ambiguous Discover flag", () => {
    const webRoot = mkdtempSync(resolve(tmpdir(), "unshelf-web-config-"));
    temporaryDirectories.push(webRoot);

    expect(() =>
      execFileSync("sh", ["docker-entrypoint.sh"], {
        cwd: resolve(import.meta.dirname, ".."),
        stdio: "pipe",
        env: {
          ...process.env,
          DISCOVER_ENABLED: "yes",
          UNSHELF_RUNTIME_CONFIG_ONLY: "true",
          UNSHELF_WEB_ROOT: webRoot,
        },
      }),
    ).toThrow();
  });
});

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true });
  }
});
