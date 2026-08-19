import * as fs from "node:fs";
import * as path from "node:path";
import { z } from "zod";
import {
  inspectProductCi,
  recordRecoveryAction,
  requestProductCiRerun,
  waitForProductCi,
  type RecoveryState,
} from "./product-ci";
import { GhProductCiGitHub } from "./product-ci-github";
import { requireEnv } from "./require-env";

const stateSchema = z.object({
  actions: z.array(z.enum(["repair-push", "rerun"])).max(2),
});

const [command, ...args] = process.argv.slice(2);
const repository = requireEnv("GH_REPO");
const github = new GhProductCiGitHub({ repository });
const statePath = path.join(
  process.env.OUTPUT_DIR ?? process.env.RUNNER_TEMP ?? ".",
  "product-ci-recovery.json",
);

switch (command) {
  case "inspect":
  case "final-gate": {
    const verdict = await inspectProductCi({ github, prNumber: numberArg("--pr") });
    reportVerdict(verdict);
    break;
  }
  case "wait": {
    const verdict = await waitForProductCi({
      github,
      prNumber: numberArg("--pr"),
      timeoutMs: numberArg("--timeout-seconds", 5_400) * 1_000,
      pollIntervalMs: numberArg("--poll-seconds", 30) * 1_000,
    });
    reportVerdict(verdict);
    break;
  }
  case "record-repair-push": {
    const result = recordRecoveryAction({
      state: readState(),
      action: "repair-push",
    });
    if (!result.ok) fail(result.reason);
    writeState(result.state);
    console.log(`Recorded repair push (${result.state.actions.length}/2 actions).`);
    break;
  }
  case "rerun": {
    const result = await requestProductCiRerun({
      github,
      prNumber: numberArg("--pr"),
      runId: numberArg("--run"),
      state: readState(),
    });
    if (!result.ok) fail(result.reason);
    writeState(result.state);
    console.log(`Accepted Product CI rerun (${result.state.actions.length}/2 actions).`);
    break;
  }
  default:
    fail(
      "Usage: product-ci-cli.ts inspect|wait|final-gate --pr N; " +
        "rerun --pr N --run ID; or record-repair-push",
    );
}

function numberArg(name: string, fallback?: number) {
  const index = args.indexOf(name);
  const raw = index === -1 ? undefined : args[index + 1];
  if (raw === undefined && fallback !== undefined) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) fail(`${name} must be a positive integer.`);
  return value;
}

function readState(): RecoveryState {
  if (!fs.existsSync(statePath)) return { actions: [] };
  const parsed = stateSchema.safeParse(JSON.parse(fs.readFileSync(statePath, "utf8")));
  if (!parsed.success) fail("Product CI recovery state is malformed; refusing to reset the budget.");
  return parsed.data;
}

function writeState(state: RecoveryState) {
  fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
}

function reportVerdict(verdict: Awaited<ReturnType<typeof inspectProductCi>>) {
  if (verdict.ok) {
    console.log(
      `Product CI passed for PR #${verdict.proof.prNumber} at ` +
        `${verdict.proof.headSha}/${verdict.proof.baseSha} (${verdict.proof.runUrl}).`,
    );
    return;
  }
  fail(`${verdict.reason}\n${verdict.diagnostics}`);
}

function fail(message: string): never {
  console.error(message);
  const outputDir = process.env.OUTPUT_DIR ?? process.env.RUNNER_TEMP;
  if (outputDir) fs.writeFileSync(path.join(outputDir, "failure_reason.txt"), message);
  process.exit(1);
}
