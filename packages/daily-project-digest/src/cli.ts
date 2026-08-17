#!/usr/bin/env node

import {
  createGitHubActionsDeliveryAdapters,
  createGitHubActionsPreviewAdapters,
} from "./github-actions.js";
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
    throw new Error("Daily Project Digest configuration is invalid.");
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
    })}\n`,
  );
}

function requiredEnvironmentValue(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") {
    throw new Error("Daily Project Digest configuration is invalid.");
  }
  return value;
}

function failureCategory(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("configuration")) {
    return "configuration";
  }
  if (message.startsWith("GitHub ")) {
    return "github-evidence";
  }
  if (message.includes("Discord preflight")) {
    return "discord-preflight";
  }
  if (message.includes("delivery")) {
    return "discord-delivery";
  }
  if (message.includes("summary") || message.includes("preview capability")) {
    return "actions-summary";
  }
  return "orchestration";
}

try {
  await main();
} catch (error) {
  process.stderr.write(
    `Daily Project Digest failed safely (${failureCategory(error)}).\n`,
  );
  process.exitCode = 1;
}
