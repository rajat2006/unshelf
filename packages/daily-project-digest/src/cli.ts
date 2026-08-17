#!/usr/bin/env node

import {
  createGitHubActionsDeliveryAdapters,
  createGitHubActionsPreviewAdapters,
} from "./github-actions.js";
import { DigestFailure, digestFailureCategory } from "./failures.js";
import { runDailyProjectDigest } from "./index.js";

async function main(): Promise<void> {
  const mode = process.argv[2];
  const token = process.env.GITHUB_TOKEN;
  const repository = process.env.GITHUB_REPOSITORY;
  if (
    process.argv.length !== 3 ||
    (mode !== "preview" && mode !== "deliver") ||
    token === undefined ||
    repository === undefined
  ) {
    throw new DigestFailure({
      category: "configuration",
      message: "Daily Project Digest configuration is invalid.",
    });
  }
  const commonInput = {
    token,
    repository,
    openaiApiKey: process.env.DAILY_DIGEST_OPENAI_API_KEY,
  };
  const result =
    mode === "preview"
      ? await runDailyProjectDigest(
          { mode },
          createGitHubActionsPreviewAdapters({
            ...commonInput,
            summaryPath: requiredEnvironmentValue("GITHUB_STEP_SUMMARY"),
          }),
        )
      : await runDailyProjectDigest(
          { mode },
          createGitHubActionsDeliveryAdapters({
            ...commonInput,
            webhookUrl: requiredEnvironmentValue(
              "DAILY_DIGEST_DISCORD_WEBHOOK_URL",
            ),
          }),
        );
  process.stdout.write(
    `${JSON.stringify({
      ok: true,
      mode: result.mode,
      windowEnd: result.windowEnd,
      aiPresentation: result.aiPresentation,
      ...(result.aiPresentation === "failed"
        ? {
            aiFailureReason: result.aiFailureReason,
            ...(result.aiFailureSubjectId === undefined
              ? {}
              : { aiFailureSubjectId: result.aiFailureSubjectId }),
          }
        : {}),
    })}\n`,
  );
}

function requiredEnvironmentValue(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") {
    throw new DigestFailure({
      category: "configuration",
      message: "Daily Project Digest configuration is invalid.",
    });
  }
  return value;
}

try {
  await main();
} catch (error) {
  process.stderr.write(
    `Daily Project Digest failed safely (${digestFailureCategory(error)}).\n`,
  );
  process.exitCode = 1;
}
