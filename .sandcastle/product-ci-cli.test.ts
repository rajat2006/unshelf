import { execFileSync, spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("Product CI CLI", () => {
  it("refuses to publish when BRANCH differs from the checked-out branch", () => {
    const repository = fs.mkdtempSync(path.join(os.tmpdir(), "product-ci-cli-"));
    directories.push(repository);
    execFileSync("git", ["init", "--initial-branch", "checked-out", repository]);
    execFileSync(
      "git",
      [
        "-C",
        repository,
        "-c",
        "user.name=Test",
        "-c",
        "user.email=test@example.com",
        "commit",
        "--allow-empty",
        "-m",
        "initial",
      ],
      { stdio: "ignore" },
    );

    const result = spawnSync(
      path.join(import.meta.dirname, "node_modules", ".bin", "tsx"),
      [path.join(import.meta.dirname, "product-ci-cli.ts"), "push"],
      {
        cwd: repository,
        encoding: "utf8",
        env: {
          ...process.env,
          BRANCH: "workflow-branch",
          GH_REPO: "owner/repository",
          OUTPUT_DIR: repository,
        },
      },
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "Candidate pushes are restricted to the current automation branch.",
    );
  });
});
