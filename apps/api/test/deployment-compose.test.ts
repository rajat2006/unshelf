import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");
const digest = `sha256:${"a".repeat(64)}`;

type ResolvedService = {
  build?: unknown;
  command?: string[];
  depends_on?: Record<string, { condition: string }>;
  environment?: Record<string, string>;
  image?: string;
  labels?: Record<string, string>;
  networks?: Record<string, unknown>;
  ports?: unknown[];
};

type ResolvedCompose = {
  networks: Record<string, { external?: boolean; name?: string }>;
  services: Record<string, ResolvedService>;
  volumes?: Record<string, unknown>;
};

function resolveDeploymentCompose(): ResolvedCompose {
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
        API_IMAGE: `ghcr.io/rajat2006/unshelf-api@${digest}`,
        WEB_IMAGE: `ghcr.io/rajat2006/unshelf-web@${digest}`,
        DATABASE_URL: "postgresql://opaque-runtime-value",
        DATABASE_TIME_ZONE: "America/Los_Angeles",
        DATABASE_NETWORK: "unshelf-nonproduction-database",
        APP_NAME: "unshelf-development",
        PUBLIC_ORIGIN: "https://generated.example.com",
        APPLICATION_NAME: "unshelf-development",
        CLERK_SECRET_KEY: "test-clerk-secret",
        CLERK_PUBLISHABLE_KEY: "test-clerk-publishable",
        MIGRATION_MODE: "apply",
      },
    },
  );
  return JSON.parse(output) as ResolvedCompose;
}

describe("deployment Compose contract", () => {
  it("contains only the digest-pinned migrate, api, and web graph", () => {
    const { services, volumes } = resolveDeploymentCompose();

    expect(Object.keys(services).sort()).toEqual(["api", "migrate", "web"]);
    expect(services.migrate?.image).toBe(
      `ghcr.io/rajat2006/unshelf-api@${digest}`,
    );
    expect(services.api?.image).toBe(services.migrate?.image);
    expect(services.web?.image).toBe(`ghcr.io/rajat2006/unshelf-web@${digest}`);
    expect(services.migrate?.build).toBeUndefined();
    expect(services.api?.build).toBeUndefined();
    expect(services.web?.build).toBeUndefined();
    expect(services.api?.depends_on?.migrate?.condition).toBe(
      "service_completed_successfully",
    );
    expect(services.web?.depends_on?.api?.condition).toBe("service_started");
    expect(volumes).toBeUndefined();
  });

  it("keeps database and ingress access at the intended boundaries", () => {
    const { networks, services } = resolveDeploymentCompose();

    expect(Object.keys(networks).sort()).toEqual(["database", "default"]);
    expect(networks.database).toMatchObject({
      external: true,
      name: "unshelf-nonproduction-database",
    });
    expect(Object.keys(services.migrate?.networks ?? {})).toEqual(["database"]);
    expect(Object.keys(services.api?.networks ?? {})).toEqual(["database"]);
    expect(Object.keys(services.web?.networks ?? {})).toEqual(["default"]);
    expect(services.migrate?.ports).toBeUndefined();
    expect(services.api?.ports).toBeUndefined();
    expect(services.web?.ports).toBeUndefined();
    expect(services.api?.labels).toEqual({
      "traefik.docker.network": "unshelf-development",
    });
    expect(services.web?.labels).toEqual({
      "traefik.docker.network": "unshelf-development",
    });
  });

  it("passes only opaque runtime configuration to the services that need it", () => {
    const { services } = resolveDeploymentCompose();

    expect(services.migrate?.environment).toEqual({
      APPLICATION_NAME: "unshelf-development",
      DATABASE_URL: "postgresql://opaque-runtime-value",
      DATABASE_TIME_ZONE: "America/Los_Angeles",
      LOG_LEVEL: "info",
      MIGRATION_MODE: "apply",
    });
    expect(services.api?.environment).toEqual({
      APPLICATION_NAME: "unshelf-development",
      CLERK_PUBLISHABLE_KEY: "test-clerk-publishable",
      CLERK_SECRET_KEY: "test-clerk-secret",
      DATABASE_URL: "postgresql://opaque-runtime-value",
      DATABASE_TIME_ZONE: "America/Los_Angeles",
      LOG_LEVEL: "info",
      PORT: "3001",
      PUBLIC_ORIGIN: "https://generated.example.com",
    });
    expect(services.web?.environment).toBeUndefined();
  });
});
