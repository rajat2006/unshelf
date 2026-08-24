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
        { composeId: "one", name: "unshelf-pr-44", appName: "unshelf-pr-44-abcdef" },
        { composeId: "two", name: "unshelf-pr-44", appName: "unshelf-pr-44-ghijkl" },
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
    expect(JSON.parse(runPolicy("reconcile-domains", { ...base, domains: [] }).stdout)).toHaveLength(2);
    expect(JSON.parse(runPolicy("reconcile-domains", { ...base, domains: [web] }).stdout)).toEqual([
      { path: "/api", port: 3001, serviceName: "api" },
    ]);
    expect(JSON.parse(runPolicy("reconcile-domains", { ...base, domains: [api, web] }).stdout)).toEqual([]);
    expect(runPolicy("reconcile-domains", { ...base, domains: [api, { ...api, domainId: "duplicate" }] }).status).not.toBe(0);
  });
});
