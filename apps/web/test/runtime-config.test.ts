import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { afterEach, describe, expect, it } from "vitest";

const temporaryDirectories: string[] = [];

describe("web runtime configuration", () => {
  it("enables both local processes through the documented root dev setup", () => {
    const repoRoot = resolve(import.meta.dirname, "../../..");
    const rootPackage = JSON.parse(
      readFileSync(resolve(repoRoot, "package.json"), "utf8"),
    ) as { scripts: { dev: string } };

    expect(rootPackage.scripts.dev).toBe("turbo run dev");
    expect(
      readFileSync(resolve(repoRoot, "apps/web/.env.development"), "utf8"),
    ).toContain("VITE_DISCOVER_ENABLED=true");
    expect(
      readFileSync(resolve(repoRoot, "apps/api/.env.example"), "utf8"),
    ).toMatch(/DISCOVER_ENABLED=true[\s\S]+YOUTUBE_API_KEY=\.\.\./);
  });

  it("leaves deployment configuration unset in the Vite development entry", () => {
    const source = readFileSync(
      resolve(import.meta.dirname, "../public/runtime-config.js"),
      "utf8",
    );
    const localGlobal: Record<string, unknown> = {};

    runInNewContext(source, { globalThis: localGlobal });

    expect(localGlobal.__UNSHELF_RUNTIME_CONFIG__).toBeUndefined();
  });

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

  it("keeps deployed runtime configuration fail-closed", () => {
    const webRoot = mkdtempSync(resolve(tmpdir(), "unshelf-web-config-"));
    temporaryDirectories.push(webRoot);

    execFileSync("sh", ["docker-entrypoint.sh"], {
      cwd: resolve(import.meta.dirname, ".."),
      env: {
        ...process.env,
        DISCOVER_ENABLED: "false",
        UNSHELF_RUNTIME_CONFIG_ONLY: "true",
        UNSHELF_WEB_ROOT: webRoot,
      },
    });

    expect(readFileSync(resolve(webRoot, "runtime-config.js"), "utf8")).toBe(
      "globalThis.__UNSHELF_RUNTIME_CONFIG__ = Object.freeze({ discoverEnabled: false });\n",
    );
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
