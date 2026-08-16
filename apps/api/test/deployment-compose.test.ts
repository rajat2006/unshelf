import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
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
  profiles?: string[];
};

type ResolvedCompose = {
  networks: Record<string, { external?: boolean; name?: string }>;
  services: Record<string, ResolvedService>;
  volumes?: Record<string, unknown>;
};

function resolveDeploymentCompose({
  maintenanceProfile = false,
  discoverEnabled = "false",
}: {
  maintenanceProfile?: boolean;
  discoverEnabled?: "true" | "false";
} = {}): ResolvedCompose {
  const output = execFileSync(
    "docker",
    [
      "compose",
      ...(maintenanceProfile ? ["--profile", "maintenance"] : []),
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
        DATABASE_NETWORK: "unshelf-nonproduction-database",
        APP_NAME: "unshelf-development",
        PUBLIC_ORIGIN: "https://generated.example.com",
        APPLICATION_NAME: "unshelf-development",
        CLERK_SECRET_KEY: "test-clerk-secret",
        CLERK_PUBLISHABLE_KEY: "test-clerk-publishable",
        MIGRATION_MODE: "apply",
        DISCOVER_ENABLED: discoverEnabled,
        YOUTUBE_API_KEY:
          discoverEnabled === "true" ? "youtube-runtime-secret" : "",
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
      LOG_LEVEL: "info",
      MIGRATION_MODE: "apply",
    });
    expect(services.api?.environment).toEqual({
      APPLICATION_NAME: "unshelf-development",
      CLERK_PUBLISHABLE_KEY: "test-clerk-publishable",
      CLERK_SECRET_KEY: "test-clerk-secret",
      DATABASE_URL: "postgresql://opaque-runtime-value",
      DISCOVER_ENABLED: "false",
      LOG_LEVEL: "info",
      PORT: "3001",
      PUBLIC_ORIGIN: "https://generated.example.com",
      YOUTUBE_API_KEY: "",
    });
    expect(services.web?.environment).toEqual({ DISCOVER_ENABLED: "false" });
  });

  it("builds and schedules maintenance from the API image without Provider credentials", () => {
    const packageJson = JSON.parse(
      readFileSync(resolve(repoRoot, "apps/api/package.json"), "utf8"),
    ) as { scripts: { build: string } };
    const dockerfile = readFileSync(
      resolve(repoRoot, "apps/api/Dockerfile"),
      "utf8",
    );
    const { services } = resolveDeploymentCompose({
      maintenanceProfile: true,
    });

    expect(packageJson.scripts.build).toContain("src/discover-maintenance.ts");
    expect(dockerfile).toContain("/app/deploy/dist");
    expect(services["discover-maintenance"]).toMatchObject({
      image: services.api?.image,
      command: [
        "node",
        "dist/discover-maintenance.js",
        "expire-due",
        "--execute",
      ],
      profiles: ["maintenance"],
      environment: {
        APPLICATION_NAME: "unshelf-development",
        DATABASE_URL: "postgresql://opaque-runtime-value",
        LOG_LEVEL: "info",
      },
      networks: { database: null },
    });
    expect(services["discover-maintenance"]?.environment).not.toHaveProperty(
      "YOUTUBE_API_KEY",
    );
    expect(services["discover-maintenance"]?.ports).toBeUndefined();
  });

  it("binds API acquisition and web navigation to one deployment flag", () => {
    const { services } = resolveDeploymentCompose({
      discoverEnabled: "true",
    });

    expect(services.api?.environment).toMatchObject({
      DISCOVER_ENABLED: "true",
      YOUTUBE_API_KEY: "youtube-runtime-secret",
    });
    expect(services.web?.environment).toEqual({ DISCOVER_ENABLED: "true" });
  });

  it("documents retention scheduling and additive Discover rollout and rollback", () => {
    const runbook = readFileSync(resolve(repoRoot, "docs/deploy.md"), "utf8");
    const normalized = runbook.replace(/\s+/g, " ");
    const requiredExcerpts = [
      "docker compose --profile maintenance run --rm discover-maintenance",
      "once every day",
      "failedOperations",
      "deadlineRiskRows",
      "cleanup runs even when no User opens Unshelf",
      "--confirm-suspension-termination",
      "DISCOVER_ENABLED=false",
      "retention dry run",
      "no-payload health probe",
      "enable API acquisition and web navigation together",
      "deployment secret update and API process restart",
      "preserve the additive Discover tables and User history",
      "maintenance schedule remains active",
    ];

    expect(
      requiredExcerpts.filter((excerpt) => !normalized.includes(excerpt)),
    ).toEqual([]);
  });
});
