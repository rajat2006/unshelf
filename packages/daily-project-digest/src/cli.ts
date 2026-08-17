#!/usr/bin/env node

import { createGitHubActionsPreviewAdapters } from "./github-actions.js";
import { runDailyProjectDigest } from "./index.js";

async function main(): Promise<void> {
  const token = process.env.GITHUB_TOKEN;
  const repository = process.env.GITHUB_REPOSITORY;
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (
    process.argv.length !== 3 ||
    process.argv[2] !== "preview" ||
    token === undefined ||
    repository === undefined ||
    summaryPath === undefined
  ) {
    throw new Error("Daily Project Digest preview configuration is invalid.");
  }
  const result = await runDailyProjectDigest(
    { mode: "preview" },
    createGitHubActionsPreviewAdapters({ token, repository, summaryPath }),
  );
  process.stdout.write(
    `${JSON.stringify({
      ok: true,
      mode: result.mode,
      windowEnd: result.windowEnd,
    })}\n`,
  );
}

try {
  await main();
} catch {
  process.stderr.write("Daily Project Digest preview failed safely.\n");
  process.exitCode = 1;
}
