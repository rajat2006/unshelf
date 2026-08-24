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
  it("requires each channel's complete migration environment", () => {
    for (const [channel, migrationMode, extra] of [
      ["development", "apply", []],
      ["preview", "verify", []],
      ["production", "apply", ["DATABASE_NETWORK=unshelf-production-db"]],
    ] as const) {
      const accepted = runPolicy("validate-environment", {
        aggregateEnv: [
          "DATABASE_URL=postgres://private",
          "DATABASE_TIME_ZONE=UTC",
          `MIGRATION_MODE=${migrationMode}`,
          ...extra,
        ].join("\n"),
        channel,
      });
      expect(accepted.status).toBe(0);
      expect(JSON.parse(accepted.stdout)).toEqual({ valid: true });
    }

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

    expect(
      runPolicy("validate-environment", {
        aggregateEnv:
          "DATABASE_URL=postgres://private\nDATABASE_TIME_ZONE=UTC\nMIGRATION_MODE=apply",
        channel: "preview",
      }).status,
    ).not.toBe(0);
    expect(
      runPolicy("validate-environment", {
        aggregateEnv:
          "DATABASE_URL=postgres://private\nDATABASE_TIME_ZONE=UTC\nMIGRATION_MODE=apply",
        channel: "production",
      }).status,
    ).not.toBe(0);
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

  it("classifies delayed, active, terminal, duplicate, and interrupted deployments", () => {
    const composeId = "compose-development";
    const title = "development:source:run-1-attempt-1";
    const record = (status: string, deploymentId = "deployment-1") => ({
      composeId,
      deploymentId,
      status,
      title,
    });

    expect(
      JSON.parse(
        runPolicy("deployment-state", { composeId, records: [], title }).stdout,
      ),
    ).toEqual({ state: "missing" });
    for (const status of ["queued", "running"]) {
      expect(
        JSON.parse(
          runPolicy("deployment-state", {
            composeId,
            records: { result: { deployments: [record(status)] } },
            title,
          }).stdout,
        ),
      ).toEqual({ deploymentId: "deployment-1", state: "pending" });
    }
    for (const status of ["done", "error", "cancelled"]) {
      expect(
        JSON.parse(
          runPolicy("deployment-state", {
            composeId,
            records: [record(status), record(status)],
            title,
          }).stdout,
        ),
      ).toEqual({ deploymentId: "deployment-1", state: status });
    }
    expect(
      runPolicy("deployment-state", {
        composeId,
        records: [record("running"), record("running", "deployment-2")],
        title,
      }).status,
    ).not.toBe(0);

    expect(
      JSON.parse(
        runPolicy("deployment-state", {
          composeId,
          records: [
            record("done"),
            { ...record("running"), title: "older-run" },
          ],
        }).stdout,
      ),
    ).toEqual({ state: "outstanding" });
    expect(
      JSON.parse(
        runPolicy("deployment-state", {
          composeId,
          records: {
            composeId,
            result: [record("done"), record("error", "deployment-2")],
          },
        }).stdout,
      ),
    ).toEqual({ state: "settled" });
  });

  it("authorizes Product CI only from immutable exact-run revision evidence", () => {
    const sourceSha = "a".repeat(40);
    const oldSha = "b".repeat(40);
    const successfulJob = {
      conclusion: "success",
      name: "Product",
      status: "completed",
    };
    const accepted = runPolicy("authorize-product-ci", {
      branch: "dev",
      event: "push",
      jobsByRunId: { 11: { jobs: [successfulJob] } },
      runs: {
        workflow_runs: [
          {
            conclusion: "success",
            event: "push",
            head_branch: "dev",
            head_sha: sourceSha,
            id: 11,
            status: "completed",
          },
        ],
      },
      sourceSha,
    });
    expect(accepted.status).toBe(0);
    expect(JSON.parse(accepted.stdout)).toEqual({ runId: 11 });

    const staleNestedAssociation = runPolicy("authorize-product-ci", {
      branch: "dev",
      event: "push",
      jobsByRunId: { 11: { jobs: [successfulJob] } },
      runs: {
        workflow_runs: [
          {
            conclusion: "success",
            event: "push",
            head_branch: "dev",
            head_sha: oldSha,
            id: 11,
            pull_requests: [{ head: { sha: sourceSha } }],
            status: "completed",
          },
        ],
      },
      sourceSha,
    });
    expect(staleNestedAssociation.status).not.toBe(0);

    for (const input of [
      { branch: "main", event: "push" },
      { branch: "dev", event: "pull_request" },
    ]) {
      expect(
        runPolicy("authorize-product-ci", {
          ...input,
          jobsByRunId: { 11: { jobs: [successfulJob] } },
          runs: {
            workflow_runs: [
              {
                conclusion: "success",
                event: "push",
                head_branch: "dev",
                head_sha: sourceSha,
                id: 11,
                status: "completed",
              },
            ],
          },
          sourceSha,
        }).status,
      ).not.toBe(0);
    }
  });

  it("authorizes only an open labelled same-repository preview into dev", () => {
    const sourceSha = "a".repeat(40);
    const trustedSha = "b".repeat(40);
    const pull = {
      base: { ref: "dev", sha: trustedSha },
      draft: false,
      head: { repo: { full_name: "rajat2006/unshelf" }, sha: sourceSha },
      labels: [{ name: "deploy:preview" }],
      state: "open",
    };
    const accepted = runPolicy("authorize-preview", {
      prNumber: 44,
      pull,
      repository: "rajat2006/unshelf",
    });
    expect(accepted.status).toBe(0);
    expect(JSON.parse(accepted.stdout)).toEqual({
      logicalName: "unshelf-pr-44",
      sourceSha,
      trustedSha,
    });

    for (const rejectedPull of [
      { ...pull, state: "closed" },
      { ...pull, draft: true },
      { ...pull, base: { ...pull.base, ref: "main" } },
      { ...pull, head: { ...pull.head, repo: { full_name: "fork/unshelf" } } },
      { ...pull, labels: [] },
    ]) {
      expect(
        runPolicy("authorize-preview", {
          prNumber: 44,
          pull: rejectedPull,
          repository: "rajat2006/unshelf",
        }).status,
      ).not.toBe(0);
    }
  });

  it("accepts only exact HTTPS origins and immutable image digests", () => {
    const valid = runPolicy("validate-delivery-values", {
      digests: [`sha256:${"a".repeat(64)}`, `sha256:${"b".repeat(64)}`],
      origins: ["https://dev.example.com", "https://api.example.com:8443"],
    });
    expect(valid.status).toBe(0);
    expect(JSON.parse(valid.stdout)).toEqual({ valid: true });

    for (const origin of [
      "http://dev.example.com",
      "https://dev.example.com/",
      "https://dev.example.com/path",
      "https://dev.example.com?query=yes",
      "https://user:secret@dev.example.com",
    ]) {
      expect(
        runPolicy("validate-delivery-values", {
          digests: [],
          origins: [origin],
        }).status,
      ).not.toBe(0);
    }
    for (const digest of ["latest", "sha256:abc", `sha512:${"a".repeat(64)}`]) {
      expect(
        runPolicy("validate-delivery-values", {
          digests: [digest],
          origins: [],
        }).status,
      ).not.toBe(0);
    }
  });

  it("matches only a complete healthy marker for the selected revision", () => {
    const sourceSha = "a".repeat(40);
    const marker = {
      apiDigest: `sha256:${"b".repeat(64)}`,
      deploymentId: "deployment-1",
      runAttempt: "1",
      runId: "42",
      sourceSha,
      webDigest: `sha256:${"c".repeat(64)}`,
    };
    const matching = runPolicy("marker-state", {
      description: `unshelf:last-healthy ${JSON.stringify(marker)}`,
      sourceSha,
    });
    expect(matching.status).toBe(0);
    expect(JSON.parse(matching.stdout)).toEqual({ marker, matches: true });

    for (const description of [
      "",
      "ordinary description",
      "unshelf:last-healthy not-json",
      `unshelf:last-healthy ${JSON.stringify({ ...marker, sourceSha: "d".repeat(40) })}`,
      `unshelf:last-healthy ${JSON.stringify({ ...marker, deploymentId: "" })}`,
      `unshelf:last-healthy ${JSON.stringify({ ...marker, unexpected: true })}`,
    ]) {
      const result = runPolicy("marker-state", { description, sourceSha });
      expect(result.status).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual({ matches: false });
    }
  });

  it("preserves safe production reruns and refuses ancestry or newer-release drift", () => {
    const mainSha = "a".repeat(40);
    const runSha = "b".repeat(40);
    expect(
      JSON.parse(
        runPolicy("authorize-production-revision", {
          mainSha,
          runAttempt: 1,
          runSha,
          successfulReleases: [],
        }).stdout,
      ),
    ).toEqual({ sourceSha: mainSha });

    const safe = runPolicy("authorize-production-revision", {
      mainSha,
      relationToMain: "ahead",
      runAttempt: 2,
      runSha,
      successfulReleases: [{ relationFromRun: "behind", sha: "c".repeat(40) }],
    });
    expect(safe.status).toBe(0);
    expect(JSON.parse(safe.stdout)).toEqual({ sourceSha: runSha });

    for (const input of [
      { relationToMain: "diverged", successfulReleases: [] },
      {
        relationToMain: "ahead",
        successfulReleases: [{ relationFromRun: "ahead", sha: "d".repeat(40) }],
      },
    ]) {
      expect(
        runPolicy("authorize-production-revision", {
          mainSha,
          runAttempt: 2,
          runSha,
          ...input,
        }).status,
      ).not.toBe(0);
    }
  });

  it("records one successful production Deployment idempotently", () => {
    const payload = {
      apiDigest: `sha256:${"a".repeat(64)}`,
      dokployDeploymentId: "dokploy-1",
      runAttempt: "1",
      runId: "42",
      webDigest: `sha256:${"b".repeat(64)}`,
    };
    expect(
      JSON.parse(
        runPolicy("select-production-deployment", {
          deployments: [{ id: 1, payload: { ...payload, runAttempt: "2" } }],
          payload,
          statusesById: {},
        }).stdout,
      ),
    ).toEqual({ action: "create" });

    const deployment = { id: 7, payload };
    expect(
      JSON.parse(
        runPolicy("select-production-deployment", {
          deployments: [deployment],
          payload,
          statusesById: {},
        }).stdout,
      ),
    ).toEqual({ action: "inspect", deploymentId: 7 });
    expect(
      JSON.parse(
        runPolicy("select-production-deployment", {
          deployments: [deployment],
          payload,
          statusesById: { 7: [{ state: "failure" }] },
        }).stdout,
      ),
    ).toEqual({ action: "record-success", deploymentId: 7 });
    expect(
      JSON.parse(
        runPolicy("select-production-deployment", {
          deployments: [deployment],
          payload,
          statusesById: { 7: [{ state: "success" }] },
        }).stdout,
      ),
    ).toEqual({ action: "complete", deploymentId: 7 });
    expect(
      runPolicy("select-production-deployment", {
        deployments: [deployment, { ...deployment, id: 8 }],
        payload,
        statusesById: {},
      }).status,
    ).not.toBe(0);
  });

  it("classifies API and web health without returning private response bodies", () => {
    const healthy = runPolicy("health-state", {
      apiBody: JSON.stringify({ db: "up", status: "ok" }),
      webBody:
        '<html><head><title>Unshelf</title></head><body><div id="root"></div></body></html>',
    });
    expect(healthy.status).toBe(0);
    expect(JSON.parse(healthy.stdout)).toEqual({ healthy: true });

    for (const input of [
      { apiBody: "not-json", webBody: "private web body" },
      {
        apiBody: JSON.stringify({ db: "down", status: "ok" }),
        webBody: '<title>Unshelf</title><div id="root"></div>',
      },
      {
        apiBody: JSON.stringify({ db: "up", status: "ok" }),
        webBody: "private web body",
      },
    ]) {
      const result = runPolicy("health-state", input);
      expect(result.status).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual({ healthy: false });
      expect(result.stdout).not.toContain("private");
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
