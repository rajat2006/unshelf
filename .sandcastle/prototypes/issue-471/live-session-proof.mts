// PROTOTYPE — throw away after issue #471 is decided.
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { run } from "@ai-hero/sandcastle";
import { noSandbox } from "@ai-hero/sandcastle/sandboxes/no-sandbox";
import { resolveAgent, type Provider } from "../../resolve-agent";

const scriptPath = fileURLToPath(import.meta.url);
const provider = process.argv[2] as Provider | undefined;
const phase = process.argv[3];
const fixture = process.argv[4];

if (provider !== "claude" && provider !== "codex") {
  throw new Error("Usage: live-session-proof.mts <claude|codex>");
}

const agent = resolveAgent([`agent:${provider}`], "implement").agent;

if (phase === "start") {
  if (!fixture) throw new Error("Missing fixture path");
  const result = await run({
    agent,
    sandbox: noSandbox(),
    cwd: fixture,
    prompt:
      "Inspect check.mjs and value.txt. Do not edit or commit anything. " +
      "Remember that this is the Product CI repair probe, then reply READY.",
    maxIterations: 1,
    name: `${provider} prototype start`,
  });
  const sessionId = result.iterations.at(-1)?.sessionId;
  if (!sessionId) throw new Error(`${provider} did not return a session id`);
  writeFileSync(join(fixture, "session-id"), sessionId);
  process.exit(0);
}

if (phase === "repair") {
  if (!fixture) throw new Error("Missing fixture path");
  const sessionId = readFileSync(join(fixture, "session-id"), "utf8").trim();
  const evidence = readFileSync(join(fixture, "ci-evidence.json"), "utf8");
  const result = await run({
    agent,
    sandbox: noSandbox(),
    cwd: fixture,
    resumeSession: sessionId,
    prompt:
      `Product CI failed on the exact current head. Bounded evidence follows:\n${evidence}\n` +
      "Repair value.txt so node check.mjs passes, commit only that repair, and reply REPAIRED.",
    maxIterations: 1,
    name: `${provider} prototype repair`,
  });
  if (!result.iterations.at(-1)?.sessionId) {
    throw new Error(`${provider} repair did not return a session id`);
  }
  process.exit(0);
}

const fixtureDir = mkdtempSync(join(tmpdir(), `unshelf-471-${provider}-`));
try {
  execFileSync("git", ["init", "-q", "-b", "main"], { cwd: fixtureDir });
  execFileSync("git", ["config", "user.name", "Wayfinder Prototype"], { cwd: fixtureDir });
  execFileSync("git", ["config", "user.email", "prototype@example.invalid"], { cwd: fixtureDir });
  writeFileSync(join(fixtureDir, "value.txt"), "broken\n");
  writeFileSync(
    join(fixtureDir, "check.mjs"),
    'import { readFileSync } from "node:fs";\n' +
      'if (readFileSync("value.txt", "utf8").trim() !== "fixed") {\n' +
      '  console.error("expected value.txt to contain fixed");\n' +
      "  process.exit(1);\n}\n",
  );
  execFileSync("git", ["add", "check.mjs", "value.txt"], { cwd: fixtureDir });
  execFileSync("git", ["commit", "-qm", "fixture"], { cwd: fixtureDir });

  const runPhase = (name: string) => {
    const child = spawnSync("pnpm", ["exec", "tsx", scriptPath, provider, name, fixtureDir], {
      cwd: process.cwd(),
      env: process.env,
      stdio: "inherit",
    });
    if (child.status !== 0) throw new Error(`${name} process failed`);
  };

  runPhase("start");
  const headSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: fixtureDir, encoding: "utf8" }).trim();
  const ci = spawnSync(process.execPath, ["check.mjs"], { cwd: fixtureDir, encoding: "utf8" });
  if (ci.status === 0) throw new Error("Fixture unexpectedly passed before repair");
  writeFileSync(
    join(fixtureDir, "ci-evidence.json"),
    JSON.stringify({
      check: "Product CI / fixture",
      headSha,
      conclusion: "failure",
      attempt: 1,
      maxAttempts: 2,
      excerpt: (ci.stderr || ci.stdout).trim().slice(0, 512),
    }),
  );

  runPhase("repair");
  execFileSync(process.execPath, ["check.mjs"], { cwd: fixtureDir, stdio: "pipe" });
  const commitCount = Number(
    execFileSync("git", ["rev-list", "--count", "HEAD"], { cwd: fixtureDir, encoding: "utf8" }).trim(),
  );
  const clean = execFileSync("git", ["status", "--porcelain", "--untracked-files=no"], {
    cwd: fixtureDir,
    encoding: "utf8",
  }).trim() === "";
  console.log(JSON.stringify({ provider, verdict: commitCount === 2 && clean ? "passed" : "failed", commitCount, clean }));
} finally {
  rmSync(fixtureDir, { recursive: true, force: true });
}
