import { execFile, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestApp, type TestApp } from "./harness";
import { parseJsonRecord } from "./assertion-boundaries";

const execFileAsync = promisify(execFile);
const API_ROOT = fileURLToPath(new URL("..", import.meta.url));
let harness: TestApp;

beforeAll(async () => {
  harness = await startTestApp();
});

afterAll(async () => {
  await harness.stop();
});

describe("Discover maintenance CLI", () => {
  it("rejects an ambiguous invocation before opening the database", async () => {
    const failure = await captureFailure(
      execFileAsync(
        process.execPath,
        ["--import", "tsx", "src/discover-maintenance.ts"],
        {
          cwd: API_ROOT,
          env: {
            ...process.env,
            DATABASE_URL: "postgresql://unshelf:db-secret@127.0.0.1:1/unshelf",
            YOUTUBE_API_KEY: "unused-youtube-secret",
          },
        },
      ),
    );

    expect(failure.code).not.toBe(0);
    const output = `${failure.stdout}\n${failure.stderr}`;
    expect(output).toContain(
      "Maintenance mode must be expire-due or complete-youtube-purge",
    );
    expect(output).not.toContain("db-secret");
    expect(output).not.toContain("unused-youtube-secret");
    expect(output).not.toContain("ECONNREFUSED");
  });

  it("dry-runs then executes due expiry without a YouTube key", async () => {
    const fetchedAt = new Date(Date.now() - 31 * 24 * 60 * 60 * 1_000);
    const expiresAt = new Date(Date.now() - 60 * 60 * 1_000);
    const inserted = await harness.pool.query<{ id: string }>(
      `INSERT INTO discover_provider_targets (
         provider,
         target_kind,
         acquisition_scope,
         external_reference,
         target_payload,
         fetched_at,
         expires_at
       ) VALUES ('youtube', 'channel', 'system', $1, $2, $3, $4)
       RETURNING id`,
      [
        "UC_cli_retention",
        JSON.stringify({
          schemaVersion: 1,
          uploadsPlaylistId: "UU_cli_retention",
        }),
        fetchedAt,
        expiresAt,
      ],
    );
    const targetId = inserted.rows[0]?.id;
    if (targetId === undefined) throw new Error("expected target fixture");

    const dryRun = await runCli(["expire-due", "--dry-run"]);
    expect(dryRun.at(-1)).toMatchObject({
      event: "unshelf.discover.maintenance.completed",
      dryRun: true,
      clearedRows: 0,
      dueRows: 1,
      deadlineRiskRows: 1,
    });
    expect(await readExternalReference(targetId)).toBe("UC_cli_retention");

    const execution = await runCli(["expire-due", "--execute"]);
    expect(execution.at(-1)).toMatchObject({
      event: "unshelf.discover.maintenance.completed",
      dryRun: false,
      clearedRows: 1,
      failedOperations: 0,
    });
    expect(await readExternalReference(targetId)).toBeNull();
  });

  it("starts disabled without a YouTube key and fails enabled startup without it", async () => {
    const disabled = spawn(
      process.execPath,
      ["--import", "tsx", "src/server.ts"],
      {
        cwd: API_ROOT,
        env: apiEnvironment({ DISCOVER_ENABLED: "false" }),
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    try {
      const output = await waitForOutput(disabled, "unshelf.api.started");
      expect(output).not.toContain("YOUTUBE_API_KEY is required");
    } finally {
      disabled.kill("SIGTERM");
      await new Promise((resolve) => disabled.once("close", resolve));
    }

    const enabledFailure = await captureFailure(
      execFileAsync(process.execPath, ["--import", "tsx", "src/server.ts"], {
        cwd: API_ROOT,
        env: apiEnvironment({ DISCOVER_ENABLED: "true" }),
      }),
    );
    expect(enabledFailure.code).not.toBe(0);
    expect(`${enabledFailure.stdout}\n${enabledFailure.stderr}`).toContain(
      "YOUTUBE_API_KEY is required when Discover is enabled",
    );
  });

  it("runs an idempotent complete YouTube purge through the CLI", async () => {
    const fetchedAt = new Date(Date.now() - 24 * 60 * 60 * 1_000);
    const expiresAt = new Date(Date.now() + 29 * 24 * 60 * 60 * 1_000);
    const inserted = await harness.pool.query<{ id: string }>(
      `INSERT INTO discover_provider_targets (
         provider,
         target_kind,
         acquisition_scope,
         external_reference,
         target_payload,
         fetched_at,
         expires_at
       ) VALUES ('youtube', 'channel', 'system', $1, $2, $3, $4)
       RETURNING id`,
      [
        "UC_cli_complete",
        JSON.stringify({
          schemaVersion: 1,
          uploadsPlaylistId: "UU_cli_complete",
        }),
        fetchedAt,
        expiresAt,
      ],
    );
    const targetId = inserted.rows[0]?.id;
    if (targetId === undefined) throw new Error("expected target fixture");
    const command = [
      "complete-youtube-purge",
      "--execute",
      "--confirm-suspension-termination",
    ];

    const first = await runCli(command);
    expect(first.at(-1)).toMatchObject({
      event: "unshelf.discover.maintenance.completed",
      kind: "complete",
      clearedRows: 1,
    });
    const second = await runCli(command);
    expect(second.at(-1)).toMatchObject({
      event: "unshelf.discover.maintenance.completed",
      kind: "complete",
      clearedRows: 0,
    });
    expect(await readExternalReference(targetId)).toBeNull();
    const retained = await harness.pool.query<{ gate: string; target: string }>(
      `SELECT
         (SELECT error_class FROM discover_provider_gates WHERE provider = 'youtube') AS gate,
         (SELECT count(*)::text FROM discover_provider_targets WHERE id = $1) AS target`,
      [targetId],
    );
    expect(retained.rows[0]).toEqual({
      gate: "provider_suspended",
      target: "1",
    });
  });
});

async function runCli(arguments_: readonly string[]) {
  const result = await execFileAsync(
    process.execPath,
    ["--import", "tsx", "src/discover-maintenance.ts", ...arguments_],
    {
      cwd: API_ROOT,
      env: {
        ...process.env,
        DATABASE_URL: harness.databaseUrl,
        YOUTUBE_API_KEY: undefined,
      },
    },
  );
  return result.stdout.trim().split("\n").map(parseJsonRecord);
}

async function readExternalReference(targetId: string): Promise<string | null> {
  const result = await harness.pool.query<{
    external_reference: string | null;
  }>("SELECT external_reference FROM discover_provider_targets WHERE id = $1", [
    targetId,
  ]);
  return result.rows[0]?.external_reference ?? null;
}

function apiEnvironment(
  overrides: Readonly<Record<string, string>>,
): NodeJS.ProcessEnv {
  return {
    ...process.env,
    DATABASE_URL: harness.databaseUrl,
    PORT: "0",
    PUBLIC_ORIGIN: "https://startup.example.com",
    CLERK_SECRET_KEY: "sk_test_startup",
    CLERK_PUBLISHABLE_KEY: "pk_test_startup",
    YOUTUBE_API_KEY: undefined,
    ...overrides,
  };
}

async function waitForOutput(
  child: ReturnType<typeof spawn>,
  expected: string,
): Promise<string> {
  let output = "";
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Timed out waiting for ${expected}`));
    }, 10_000);
    const collect = (chunk: Buffer): void => {
      output += chunk.toString("utf8");
      if (output.includes(expected)) {
        clearTimeout(timeout);
        resolve(output);
      }
    };
    child.stdout?.on("data", collect);
    child.stderr?.on("data", collect);
    child.once("exit", (code) => {
      clearTimeout(timeout);
      reject(
        new Error(`API exited before startup with ${String(code)}: ${output}`),
      );
    });
  });
}

async function captureFailure(
  operation: Promise<unknown>,
): Promise<{ code?: number; stderr?: string; stdout?: string }> {
  try {
    await operation;
  } catch (failure) {
    return failure as { code?: number; stderr?: string; stdout?: string };
  }
  throw new Error("Expected operation to fail");
}
