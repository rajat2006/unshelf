import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");

interface ResolvedCompose {
  services: Record<
    string,
    {
      environment?: Record<string, string>;
      logging?: {
        driver: string;
        options: Record<string, string>;
      };
    }
  >;
}

function resolveProductionCompose(logLevel = ""): ResolvedCompose {
  const output = execFileSync(
    "docker",
    [
      "compose",
      "--project-directory",
      repoRoot,
      "--file",
      resolve(repoRoot, "docker-compose.yml"),
      "config",
      "--format",
      "json",
    ],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        DOMAIN: "unshelf.example.com",
        POSTGRES_PASSWORD: "test-password",
        LOG_LEVEL: logLevel,
        CLERK_SECRET_KEY: "test-clerk-secret",
        CLERK_PUBLISHABLE_KEY: "test-clerk-publishable",
        VITE_CLERK_PUBLISHABLE_KEY: "test-clerk-publishable",
      },
    },
  );

  return JSON.parse(output) as ResolvedCompose;
}

describe("production container logging", () => {
  it("defaults and passes through the production log level", () => {
    const defaultServices = resolveProductionCompose().services;
    expect(defaultServices.api?.environment?.LOG_LEVEL).toBe("info");
    expect(defaultServices.migrate?.environment?.LOG_LEVEL).toBe("info");

    const configuredServices = resolveProductionCompose("warn").services;
    expect(configuredServices.api?.environment?.LOG_LEVEL).toBe("warn");
    expect(configuredServices.migrate?.environment?.LOG_LEVEL).toBe("warn");
  });

  it("resolves the bounded blocking policy for every service", () => {
    const { services } = resolveProductionCompose();

    expect(
      Object.fromEntries(
        Object.entries(services).map(([name, service]) => [
          name,
          service.logging,
        ]),
      ),
    ).toEqual({
      api: {
        driver: "local",
        options: { "max-file": "5", "max-size": "20m", mode: "blocking" },
      },
      db: {
        driver: "local",
        options: { "max-file": "5", "max-size": "10m", mode: "blocking" },
      },
      migrate: {
        driver: "local",
        options: { "max-file": "3", "max-size": "5m", mode: "blocking" },
      },
      web: {
        driver: "local",
        options: { "max-file": "3", "max-size": "5m", mode: "blocking" },
      },
    });
  });

  it("documents the operator workflow and retention boundary", () => {
    const runbook = readFileSync(resolve(repoRoot, "docs/deploy.md"), "utf8");
    const normalizedRunbook = runbook.replace(/\s+/g, " ");
    const requiredExcerpts = [
      "180 MB",
      "byte-bounded, not time-bounded",
      "not an audit trail",
      "not a cross-deployment archive",
      "Rotation removes",
      "container recreation removes",
      "VPS loss removes",
      "sensitive User data",
      "restricted access",
      "docker compose -f docker-compose.yml ps --all",
      "--since=30m --tail=200 --timestamps api",
      "docker compose -f docker-compose.yml logs --timestamps migrate",
      "--format '{{.Name}} {{json .HostConfig.LogConfig}}'",
      "ps --all --quiet migrate",
      "--since=24h --timestamps --no-color",
      "unshelf-predeploy.log",
    ];

    expect(
      requiredExcerpts.filter(
        (excerpt) => !normalizedRunbook.includes(excerpt),
      ),
    ).toEqual([]);
  });
});
