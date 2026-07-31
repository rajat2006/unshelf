import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const temporaryRepositories: string[] = [];

function runGit({
  repository,
  args,
}: {
  repository: string;
  args: string[];
}) {
  return execFileSync("git", args, {
    cwd: repository,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: "/usr/bin:/bin",
    },
  });
}

function createRepository({
  dependencyBackedChecks = false,
}: {
  dependencyBackedChecks?: boolean;
} = {}) {
  const repository = fs.mkdtempSync(
    path.join(os.tmpdir(), "unshelf-pre-commit-"),
  );
  temporaryRepositories.push(repository);

  runGit({ repository, args: ["init", "--quiet"] });
  runGit({
    repository,
    args: ["config", "user.email", "pre-commit-test@unshelf.local"],
  });
  runGit({
    repository,
    args: ["config", "user.name", "Unshelf pre-commit test"],
  });

  fs.writeFileSync(path.join(repository, "README.md"), "# Fixture\n");
  runGit({ repository, args: ["add", "README.md"] });
  runGit({ repository, args: ["commit", "--quiet", "-m", "initial"] });

  const hooksDirectory = path.join(repository, ".git-hooks");
  fs.mkdirSync(hooksDirectory);
  fs.copyFileSync(
    path.join(repositoryRoot, ".husky", "pre-commit"),
    path.join(hooksDirectory, "pre-commit"),
  );
  fs.chmodSync(path.join(hooksDirectory, "pre-commit"), 0o755);
  runGit({
    repository,
    args: ["config", "core.hooksPath", ".git-hooks"],
  });

  if (dependencyBackedChecks) {
    fs.symlinkSync(
      path.join(repositoryRoot, "node_modules"),
      path.join(repository, "node_modules"),
      "dir",
    );
    for (const configurationFile of [
      ".prettierignore",
      ".prettierrc.json",
      "eslint.config.mjs",
      "lint-staged.config.mjs",
      "tsconfig.base.json",
    ]) {
      fs.copyFileSync(
        path.join(repositoryRoot, configurationFile),
        path.join(repository, configurationFile),
      );
    }
    fs.mkdirSync(path.join(repository, "packages", "shared", "src"), {
      recursive: true,
    });
    fs.copyFileSync(
      path.join(repositoryRoot, "packages", "shared", "tsconfig.json"),
      path.join(repository, "packages", "shared", "tsconfig.json"),
    );
    for (const workspace of ["apps/api", "apps/web"]) {
      fs.mkdirSync(path.join(repository, workspace, "src"), {
        recursive: true,
      });
      fs.writeFileSync(
        path.join(repository, workspace, "tsconfig.json"),
        `${JSON.stringify(
          {
            extends: "../../tsconfig.base.json",
            compilerOptions: {
              rootDir: "src",
              ...(workspace === "apps/web" ? { jsx: "react-jsx" } : {}),
            },
            include: ["src"],
          },
          null,
          2,
        )}\n`,
      );
    }
  }

  return repository;
}

function createInstallFixture() {
  const repository = fs.mkdtempSync(
    path.join(os.tmpdir(), "unshelf-husky-install-"),
  );
  temporaryRepositories.push(repository);
  runGit({ repository, args: ["init", "--quiet"] });

  fs.mkdirSync(path.join(repository, ".husky"));
  for (const hookFile of ["install.mjs", "pre-commit"]) {
    fs.copyFileSync(
      path.join(repositoryRoot, ".husky", hookFile),
      path.join(repository, ".husky", hookFile),
    );
  }
  fs.writeFileSync(
    path.join(repository, "package.json"),
    `${JSON.stringify(
      {
        name: "husky-install-fixture",
        private: true,
        scripts: {
          prepare: "node .husky/install.mjs",
        },
        devDependencies: {
          husky: `file:${path.join(repositoryRoot, "node_modules", "husky")}`,
        },
      },
      null,
      2,
    )}\n`,
  );

  return repository;
}

afterEach(() => {
  for (const repository of temporaryRepositories.splice(0)) {
    fs.rmSync(repository, { recursive: true, force: true });
  }
});

describe("pre-commit hook", () => {
  it("checks staged TypeScript across the product workspaces", () => {
    const repository = createRepository({ dependencyBackedChecks: true });
    const stagedFiles = [
      "apps/api/src/example.ts",
      "apps/web/src/example.tsx",
      "packages/shared/src/example.ts",
    ];
    for (const stagedFile of stagedFiles) {
      fs.writeFileSync(
        path.join(repository, stagedFile),
        "export let stagedValue:number= 1\n",
      );
    }
    runGit({ repository, args: ["add", ...stagedFiles] });

    const commit = spawnSync("git", ["commit", "-m", "product workspaces"], {
      cwd: repository,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: [
          path.join(repositoryRoot, "node_modules", ".bin"),
          path.dirname(process.execPath),
          "/usr/bin",
          "/bin",
        ].join(path.delimiter),
      },
    });

    expect(commit.status, `${commit.stdout}${commit.stderr}`).toBe(0);
    for (const stagedFile of stagedFiles) {
      expect(
        runGit({
          repository,
          args: ["show", `HEAD:${stagedFile}`],
        }),
      ).toBe("export const stagedValue: number = 1;\n");
    }
  });

  it("preserves partially staged content byte-for-byte", () => {
    const repository = createRepository({ dependencyBackedChecks: true });
    const source = path.join(
      repository,
      "packages",
      "shared",
      "src",
      "partial.ts",
    );
    fs.writeFileSync(source, "export const stagedValue = 1;\n");
    runGit({
      repository,
      args: ["add", "packages/shared/src/partial.ts"],
    });
    runGit({
      repository,
      args: ["commit", "--quiet", "--no-verify", "-m", "partial baseline"],
    });

    const stagedContent = "export const stagedValue = 2;\n";
    fs.writeFileSync(source, stagedContent);
    runGit({
      repository,
      args: ["add", "packages/shared/src/partial.ts"],
    });
    const worktreeContent = `${stagedContent}export const unstagedValue = 3;\n`;
    fs.writeFileSync(source, worktreeContent);

    const commit = spawnSync("git", ["commit", "-m", "partial source"], {
      cwd: repository,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: [
          path.join(repositoryRoot, "node_modules", ".bin"),
          path.dirname(process.execPath),
          "/usr/bin",
          "/bin",
        ].join(path.delimiter),
      },
    });

    expect(commit.status, `${commit.stdout}${commit.stderr}`).toBe(0);
    expect(
      runGit({
        repository,
        args: ["show", "HEAD:packages/shared/src/partial.ts"],
      }),
    ).toBe(stagedContent);
    expect(fs.readFileSync(source, "utf8")).toBe(worktreeContent);
  });

  it("restores the index and worktree after a lint failure", () => {
    const repository = createRepository({ dependencyBackedChecks: true });
    const source = path.join(
      repository,
      "packages",
      "shared",
      "src",
      "failure.ts",
    );
    fs.writeFileSync(source, "export const value = 1;\n");
    runGit({
      repository,
      args: ["add", "packages/shared/src/failure.ts"],
    });
    runGit({
      repository,
      args: ["commit", "--quiet", "--no-verify", "-m", "failure baseline"],
    });

    fs.writeFileSync(source, 'export const parsed = JSON.parse("{}");\n');
    runGit({
      repository,
      args: ["add", "packages/shared/src/failure.ts"],
    });
    const stagedContent = runGit({
      repository,
      args: ["show", ":packages/shared/src/failure.ts"],
    });
    const worktreeContent =
      `${stagedContent}export const unstagedValue = "preserve me";\n`;
    fs.writeFileSync(source, worktreeContent);

    const commit = spawnSync("git", ["commit", "-m", "lint failure"], {
      cwd: repository,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: [
          path.join(repositoryRoot, "node_modules", ".bin"),
          path.dirname(process.execPath),
          "/usr/bin",
          "/bin",
        ].join(path.delimiter),
      },
    });

    expect(commit.status).not.toBe(0);
    expect(`${commit.stdout}${commit.stderr}`).toContain(
      "@typescript-eslint/no-unsafe-assignment",
    );
    expect(runGit({ repository, args: ["rev-list", "--count", "HEAD"] }).trim()).toBe(
      "2",
    );
    expect(
      runGit({
        repository,
        args: ["show", ":packages/shared/src/failure.ts"],
      }),
    ).toBe(stagedContent);
    expect(fs.readFileSync(source, "utf8")).toBe(worktreeContent);
  });

  it("allows an explicit no-verify commit to bypass the hook", () => {
    const repository = createRepository();
    const readme = path.join(repository, "README.md");
    const conflictedContent = [
      "<<<<<<< HEAD",
      "# Ours",
      "=======",
      "# Theirs",
      ">>>>>>> branch",
      "",
    ].join("\n");
    fs.writeFileSync(readme, conflictedContent);
    runGit({ repository, args: ["add", "README.md"] });

    const commit = spawnSync(
      "git",
      ["commit", "--no-verify", "-m", "intentional bypass"],
      {
        cwd: repository,
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: "/usr/bin:/bin",
        },
      },
    );

    expect(commit.status, `${commit.stdout}${commit.stderr}`).toBe(0);
    expect(runGit({ repository, args: ["show", "HEAD:README.md"] })).toBe(
      conflictedContent,
    );
  });

  it("warns and permits a clean commit when hook dependencies are unavailable", () => {
    const repository = createInstallFixture();
    runGit({
      repository,
      args: ["config", "user.email", "pre-commit-test@unshelf.local"],
    });
    runGit({
      repository,
      args: ["config", "user.name", "Unshelf pre-commit test"],
    });
    const installation = spawnSync(
      "pnpm",
      ["install", "--ignore-workspace", "--no-frozen-lockfile"],
      {
        cwd: repository,
        encoding: "utf8",
        env: {
          ...process.env,
          CI: "",
        },
      },
    );
    expect(
      installation.status,
      `${installation.stdout}${installation.stderr}`,
    ).toBe(0);

    fs.writeFileSync(path.join(repository, "baseline.txt"), "baseline\n");
    runGit({ repository, args: ["add", "."] });
    runGit({
      repository,
      args: ["commit", "--quiet", "--no-verify", "-m", "baseline"],
    });
    fs.rmSync(path.join(repository, "node_modules"), {
      recursive: true,
      force: true,
    });
    fs.writeFileSync(path.join(repository, "clean.txt"), "clean\n");
    runGit({ repository, args: ["add", "clean.txt"] });

    const commit = spawnSync("git", ["commit", "-m", "clean fallback"], {
      cwd: repository,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: "/usr/bin:/bin",
      },
    });

    expect(commit.status, `${commit.stdout}${commit.stderr}`).toBe(0);
    expect(`${commit.stdout}${commit.stderr}`).toContain(
      "lint-staged unavailable",
    );
  }, 30_000);

  it("permits commits in a worktree without generated hooks or dependencies", () => {
    const repository = createInstallFixture();
    runGit({
      repository,
      args: ["config", "user.email", "pre-commit-test@unshelf.local"],
    });
    runGit({
      repository,
      args: ["config", "user.name", "Unshelf pre-commit test"],
    });
    const installation = spawnSync(
      "pnpm",
      ["install", "--ignore-workspace", "--no-frozen-lockfile"],
      {
        cwd: repository,
        encoding: "utf8",
        env: {
          ...process.env,
          CI: "",
        },
      },
    );
    expect(
      installation.status,
      `${installation.stdout}${installation.stderr}`,
    ).toBe(0);

    fs.writeFileSync(path.join(repository, "baseline.txt"), "baseline\n");
    runGit({ repository, args: ["add", "."] });
    runGit({
      repository,
      args: ["commit", "--quiet", "--no-verify", "-m", "baseline"],
    });
    const worktree = `${repository}-worktree`;
    temporaryRepositories.push(worktree);
    runGit({
      repository,
      args: ["worktree", "add", "--quiet", "-b", "fixture-worktree", worktree],
    });
    fs.writeFileSync(path.join(worktree, "worktree.txt"), "worktree\n");
    runGit({ repository: worktree, args: ["add", "worktree.txt"] });

    const commit = spawnSync("git", ["commit", "-m", "worktree commit"], {
      cwd: worktree,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: "/usr/bin:/bin",
      },
    });

    expect(commit.status, `${commit.stdout}${commit.stderr}`).toBe(0);
    expect(fs.existsSync(path.join(worktree, ".husky", "_"))).toBe(false);
  }, 30_000);

  it("leaves Git hook configuration untouched during CI installation", () => {
    const repository = createInstallFixture();

    const installation = spawnSync(
      "pnpm",
      ["install", "--ignore-workspace", "--no-frozen-lockfile"],
      {
        cwd: repository,
        encoding: "utf8",
        env: {
          ...process.env,
          CI: "true",
        },
      },
    );
    const hookPath = spawnSync(
      "git",
      ["config", "--get", "core.hooksPath"],
      {
        cwd: repository,
        encoding: "utf8",
      },
    );

    expect(
      installation.status,
      `${installation.stdout}${installation.stderr}`,
    ).toBe(0);
    expect(hookPath.status).toBe(1);
    expect(fs.existsSync(path.join(repository, ".husky", "_"))).toBe(false);
  }, 30_000);

  it("enables Husky during a normal workspace installation", () => {
    const repository = createInstallFixture();

    const installation = spawnSync(
      "pnpm",
      ["install", "--ignore-workspace", "--no-frozen-lockfile"],
      {
        cwd: repository,
        encoding: "utf8",
        env: {
          ...process.env,
          CI: "",
        },
      },
    );

    expect(
      installation.status,
      `${installation.stdout}${installation.stderr}`,
    ).toBe(0);
    expect(
      runGit({
        repository,
        args: ["config", "--get", "core.hooksPath"],
      }).trim(),
    ).toBe(".husky/_");
    expect(fs.existsSync(path.join(repository, ".husky", "_", "pre-commit"))).toBe(
      true,
    );
  }, 30_000);

  it("hides unrelated unstaged content from typed staged checks", () => {
    const repository = createRepository({ dependencyBackedChecks: true });
    const sourceDirectory = path.join(
      repository,
      "packages",
      "shared",
      "src",
    );
    const stagedSource = path.join(sourceDirectory, "staged.ts");
    const unstagedSource = path.join(sourceDirectory, "unstaged.ts");
    fs.writeFileSync(
      stagedSource,
      [
        'import { supportingValue } from "./unstaged.js";',
        "",
        "export const answer = supportingValue;",
        "",
      ].join("\n"),
    );
    fs.writeFileSync(unstagedSource, "export const supportingValue = 1;\n");
    runGit({ repository, args: ["add", "packages/shared/src"] });
    runGit({
      repository,
      args: ["commit", "--quiet", "--no-verify", "-m", "source baseline"],
    });

    fs.writeFileSync(
      stagedSource,
      [
        'import { supportingValue } from "./unstaged.js"',
        "export const answer:number= supportingValue",
        "",
      ].join("\n"),
    );
    runGit({
      repository,
      args: ["add", "packages/shared/src/staged.ts"],
    });
    const unstagedContent = "export const supportingValue = ;\n";
    fs.writeFileSync(unstagedSource, unstagedContent);

    const commit = spawnSync("git", ["commit", "-m", "staged source"], {
      cwd: repository,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: [
          path.join(repositoryRoot, "node_modules", ".bin"),
          path.dirname(process.execPath),
          "/usr/bin",
          "/bin",
        ].join(path.delimiter),
      },
    });

    expect(commit.status, `${commit.stdout}${commit.stderr}`).toBe(0);
    expect(
      runGit({
        repository,
        args: ["show", "HEAD:packages/shared/src/staged.ts"],
      }),
    ).toBe(
      [
        'import { supportingValue } from "./unstaged.js";',
        "export const answer: number = supportingValue;",
        "",
      ].join("\n"),
    );
    expect(fs.readFileSync(unstagedSource, "utf8")).toBe(unstagedContent);
  });

  it("lint-fixes and then formats staged product TypeScript", () => {
    const repository = createRepository({ dependencyBackedChecks: true });
    const source = path.join(
      repository,
      "packages",
      "shared",
      "src",
      "example.ts",
    );
    fs.writeFileSync(
      source,
      "export let answer:number= 42\n",
    );
    runGit({
      repository,
      args: ["add", "packages/shared/src/example.ts"],
    });

    const commit = spawnSync("git", ["commit", "-m", "typed source"], {
      cwd: repository,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: [
          path.join(repositoryRoot, "node_modules", ".bin"),
          path.dirname(process.execPath),
          "/usr/bin",
          "/bin",
        ].join(path.delimiter),
      },
    });

    expect(commit.status, `${commit.stdout}${commit.stderr}`).toBe(0);
    expect(
      runGit({
        repository,
        args: ["show", "HEAD:packages/shared/src/example.ts"],
      }),
      `${commit.stdout}${commit.stderr}`,
    ).toBe("export const answer: number = 42;\n");
    expect(fs.readFileSync(source, "utf8")).toBe(
      "export const answer: number = 42;\n",
    );
  });

  it("rejects conflict markers when dependency-backed checks are unavailable", () => {
    const repository = createRepository();
    const readme = path.join(repository, "README.md");
    fs.writeFileSync(
      readme,
      ["<<<<<<< HEAD", "# Ours", "=======", "# Theirs", ">>>>>>> branch", ""].join(
        "\n",
      ),
    );
    runGit({ repository, args: ["add", "README.md"] });

    const commit = spawnSync("git", ["commit", "-m", "conflicted"], {
      cwd: repository,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: "/usr/bin:/bin",
      },
    });

    expect(commit.status).not.toBe(0);
    expect(`${commit.stdout}${commit.stderr}`).toContain(
      "lint-staged unavailable",
    );
    expect(runGit({ repository, args: ["rev-list", "--count", "HEAD"] }).trim()).toBe(
      "1",
    );
    expect(
      runGit({ repository, args: ["show", ":README.md"] }),
    ).toBe(fs.readFileSync(readme, "utf8"));
  });
});
