import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const policyPath = fileURLToPath(
  new URL("../../../.github/scripts/delivery-policy.mjs", import.meta.url),
);

function runPolicy(command: string, input: unknown) {
  return spawnSync(process.execPath, [policyPath, command], {
    encoding: "utf8",
    input: JSON.stringify(input),
  });
}

describe("direct delivery policy", () => {
  it("requires the complete development migration environment", () => {
    const accepted = runPolicy("validate-environment", {
      aggregateEnv: [
        "DATABASE_URL=postgres://private",
        "DATABASE_TIME_ZONE=UTC",
        "MIGRATION_MODE=apply",
      ].join("\n"),
      channel: "development",
    });
    expect(accepted.status).toBe(0);
    expect(JSON.parse(accepted.stdout)).toEqual({ valid: true });

    for (const aggregateEnv of [
      "DATABASE_URL=postgres://private\nMIGRATION_MODE=apply",
      "DATABASE_URL=postgres://private\nDATABASE_TIME_ZONE=UTC\nMIGRATION_MODE=verify",
      "DATABASE_URL=postgres://private\nDATABASE_TIME_ZONE=UTC\nMIGRATION_MODE=apply\nDATABASE_NETWORK=wrong",
    ]) {
      expect(
        runPolicy("validate-environment", {
          aggregateEnv,
          channel: "development",
        }).status,
      ).not.toBe(0);
    }
  });

  it("refuses every repository path that can change preview migration behavior", () => {
    const ordinary = runPolicy("allow-preview-changes", {
      paths: ["apps/api/src/discover/router.ts", "apps/web/src/App.tsx"],
    });
    expect(ordinary.status).toBe(0);
    expect(JSON.parse(ordinary.stdout)).toEqual({ allowed: true });

    for (const path of [
      "apps/api/drizzle/0018_change.sql",
      "apps/api/src/schema.ts",
      "apps/api/src/migration-runner.ts",
      "apps/api/src/migration-verifier.ts",
      "apps/api/src/migrate.ts",
      "apps/api/drizzle.config.ts",
      "apps/api/package.json",
      "apps/api/Dockerfile",
      "docker-compose.yml",
      "pnpm-lock.yaml",
    ]) {
      expect(
        runPolicy("allow-preview-changes", { paths: [path] }).status,
      ).not.toBe(0);
    }
  });

  it("matches the complete live environment without exposing its values", () => {
    const aggregateEnv = [
      "DATABASE_URL=postgres://private?sslmode=disable",
      "DATABASE_TIME_ZONE=UTC",
      "MIGRATION_MODE=apply",
    ].join("\n");
    const injected = {
      API_IMAGE: `ghcr.io/rajat2006/unshelf-api@sha256:${"a".repeat(64)}`,
      DATABASE_NETWORK: "unshelf-nonprod-db",
      PUBLIC_ORIGIN: "https://dev.example.com",
      WEB_IMAGE: `ghcr.io/rajat2006/unshelf-web@sha256:${"b".repeat(64)}`,
    };
    const liveEnv = [
      "MIGRATION_MODE=apply",
      `WEB_IMAGE=${injected.WEB_IMAGE}`,
      "DATABASE_TIME_ZONE=UTC",
      `PUBLIC_ORIGIN=${injected.PUBLIC_ORIGIN}`,
      "DATABASE_URL=postgres://private?sslmode=disable",
      `API_IMAGE=${injected.API_IMAGE}`,
      `DATABASE_NETWORK=${injected.DATABASE_NETWORK}`,
    ].join("\n");

    const matching = runPolicy("configuration-matches", {
      aggregateEnv,
      injected,
      liveEnv,
    });
    expect(matching.status).toBe(0);
    expect(JSON.parse(matching.stdout)).toEqual({ matches: true });

    for (const driftedEnv of [
      liveEnv.replace(
        "DATABASE_TIME_ZONE=UTC",
        "DATABASE_TIME_ZONE=Asia/Kolkata",
      ),
      liveEnv.replace("postgres://private", "postgres://other"),
      `${liveEnv}\nUNEXPECTED=value`,
    ]) {
      const drifted = runPolicy("configuration-matches", {
        aggregateEnv,
        injected,
        liveEnv: driftedEnv,
      });
      expect(drifted.status).toBe(0);
      expect(JSON.parse(drifted.stdout)).toEqual({ matches: false });
      expect(drifted.stdout).not.toContain("postgres://");
    }
  });

  it("admits a new preview only below the three-record capacity", () => {
    const admitted = runPolicy("select-preview", {
      logicalName: "unshelf-pr-44",
      prNumber: 44,
      records: { items: [{ composeId: "one", name: "unshelf-pr-1" }] },
    });
    expect(admitted.status).toBe(0);
    expect(JSON.parse(admitted.stdout)).toEqual({ action: "create" });

    const refused = runPolicy("select-preview", {
      logicalName: "unshelf-pr-44",
      prNumber: 44,
      records: {
        items: [1, 2, 3].map((number) => ({ name: `unshelf-pr-${number}` })),
      },
    });
    expect(refused.status).not.toBe(0);
  });

  it("fails closed for duplicate and partially formed exact preview identities", () => {
    for (const records of [
      [
        {
          composeId: "one",
          name: "unshelf-pr-44",
          appName: "unshelf-pr-44-abcdef",
        },
        {
          composeId: "two",
          name: "unshelf-pr-44",
          appName: "unshelf-pr-44-ghijkl",
        },
      ],
      [{ composeId: "one", name: "unshelf-pr-44" }],
      [{ name: "unshelf-pr-44", appName: "unshelf-pr-44-abcdef" }],
    ]) {
      const result = runPolicy("select-preview", {
        logicalName: "unshelf-pr-44",
        prNumber: 44,
        records: { items: records },
      });
      expect(result.status).not.toBe(0);
    }
  });

  it("refreshes one exact preview at capacity and ignores substring collisions", () => {
    const result = runPolicy("select-preview", {
      logicalName: "unshelf-pr-44",
      prNumber: 44,
      records: {
        items: [
          { composeId: "near", name: "unshelf-pr-440" },
          { composeId: "one", name: "unshelf-pr-1" },
          { composeId: "two", name: "unshelf-pr-2" },
          {
            composeId: "exact",
            name: "unshelf-pr-44",
            appName: "unshelf-pr-44-abcdef",
          },
        ],
      },
    });
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      action: "refresh",
      composeId: "exact",
      runtimeName: "unshelf-pr-44-abcdef",
    });
  });

  it("returns only missing exact domains and rejects an occupied route", () => {
    const input = {
      composeId: "compose-44",
      host: "pr-44.preview.example.com",
      domains: [
        {
          domainId: "api-domain",
          composeId: "compose-44",
          host: "pr-44.preview.example.com",
          path: "/api",
          serviceName: "api",
          port: 3001,
          https: true,
        },
      ],
    };
    const missing = runPolicy("reconcile-domains", input);
    expect(missing.status).toBe(0);
    expect(JSON.parse(missing.stdout)).toEqual([
      { path: "/", port: 80, serviceName: "web" },
    ]);

    const conflict = runPolicy("reconcile-domains", {
      ...input,
      domains: [
        ...input.domains,
        {
          domainId: "wrong-web",
          composeId: "compose-44",
          host: input.host,
          path: "/",
          serviceName: "other",
          port: 80,
          https: true,
        },
      ],
    });
    expect(conflict.status).not.toBe(0);
  });

  it("reconciles neither, either, and both domains and refuses duplicates", () => {
    const base = { composeId: "compose-44", host: "pr-44.preview.example.com" };
    const api = {
      domainId: "api",
      ...base,
      path: "/api",
      serviceName: "api",
      port: 3001,
      https: true,
    };
    const web = {
      domainId: "web",
      ...base,
      path: "/",
      serviceName: "web",
      port: 80,
      https: true,
    };
    expect(
      JSON.parse(
        runPolicy("reconcile-domains", { ...base, domains: [] }).stdout,
      ),
    ).toHaveLength(2);
    expect(
      JSON.parse(
        runPolicy("reconcile-domains", { ...base, domains: [web] }).stdout,
      ),
    ).toEqual([{ path: "/api", port: 3001, serviceName: "api" }]);
    expect(
      JSON.parse(
        runPolicy("reconcile-domains", { ...base, domains: [api, web] }).stdout,
      ),
    ).toEqual([]);
    expect(
      runPolicy("reconcile-domains", {
        ...base,
        domains: [api, { ...api, domainId: "duplicate" }],
      }).status,
    ).not.toBe(0);
  });
});
