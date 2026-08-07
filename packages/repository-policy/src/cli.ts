#!/usr/bin/env node

import { execFileSync } from "node:child_process";

type Arguments = {
  baseRef?: string;
  headRef?: string;
  baseRepository?: string;
  headRepository?: string;
  labels: string[];
  mainSha?: string;
  devSha?: string;
  headSha?: string;
};

const releaseLabelNames = [
  "release:patch",
  "release:minor",
  "release:major",
] as const;
type ReleaseLabel = (typeof releaseLabelNames)[number];
type CompleteArguments = Required<Arguments>;

const releaseLabels: Readonly<
  Record<ReleaseLabel, "patch" | "minor" | "major">
> = {
  "release:patch": "patch",
  "release:minor": "minor",
  "release:major": "major",
};

function isReleaseLabel(label: string): label is ReleaseLabel {
  return releaseLabelNames.some((candidate) => candidate === label);
}

function hasRequiredInputs(input: Arguments): input is CompleteArguments {
  return [
    input.baseRef,
    input.headRef,
    input.baseRepository,
    input.headRepository,
    input.mainSha,
    input.devSha,
    input.headSha,
  ].every((value) => value !== undefined);
}

function parseArguments(values: string[]): Arguments {
  const parsed: Arguments = { labels: [] };
  const namedArguments: Record<string, keyof Omit<Arguments, "labels">> = {
    "--base-ref": "baseRef",
    "--head-ref": "headRef",
    "--base-repository": "baseRepository",
    "--head-repository": "headRepository",
    "--main-sha": "mainSha",
    "--dev-sha": "devSha",
    "--head-sha": "headSha",
  };

  for (let index = 0; index < values.length; index += 2) {
    const name = values[index];
    const value = values[index + 1];
    if (name === "--label" && value !== undefined) {
      parsed.labels.push(value);
      continue;
    }
    if (name === "--labels-json" && value !== undefined) {
      const labels: unknown = JSON.parse(value);
      if (
        !Array.isArray(labels) ||
        !labels.every((label) => typeof label === "string")
      ) {
        throw new Error("invalid-input");
      }
      parsed.labels.push(...labels);
      continue;
    }
    const key = name === undefined ? undefined : namedArguments[name];
    if (key === undefined || value === undefined) {
      throw new Error("invalid-input");
    }
    parsed[key] = value;
  }
  return parsed;
}

function isAncestor({
  ancestor,
  descendant,
}: {
  ancestor: string;
  descendant: string;
}): boolean {
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", ancestor, descendant], {
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

function run(): void {
  const input = parseArguments(process.argv.slice(2));
  if (!hasRequiredInputs(input)) {
    throw new Error("invalid-input");
  }

  const selectedLabels = input.labels.filter(isReleaseLabel);
  if (
    input.baseRef !== "main" ||
    input.baseRepository !== input.headRepository
  ) {
    throw new Error("policy-rejected");
  }

  if (input.headRef === "dev") {
    if (
      input.devSha !== input.headSha ||
      selectedLabels.length !== 1 ||
      !isAncestor({ ancestor: input.mainSha, descendant: input.devSha })
    ) {
      throw new Error("policy-rejected");
    }
    const bump = releaseLabels[selectedLabels[0]];
    process.stdout.write(
      `${JSON.stringify({ ok: true, kind: "release", bump })}\n`,
    );
    return;
  }

  if (
    input.headRef === "main" ||
    selectedLabels.length !== 0 ||
    !isAncestor({ ancestor: input.mainSha, descendant: input.headSha })
  ) {
    throw new Error("policy-rejected");
  }
  process.stdout.write(`${JSON.stringify({ ok: true, kind: "hotfix" })}\n`);
}

try {
  run();
} catch (error) {
  const invalidInput =
    error instanceof Error && error.message === "invalid-input";
  process.stdout.write(
    `${JSON.stringify({
      ok: false,
      error: {
        code: invalidInput ? "invalid-input" : "policy-rejected",
        message: invalidInput
          ? "Release policy inputs are invalid."
          : "Pull request does not satisfy release policy.",
      },
    })}\n`,
  );
  process.exitCode = 1;
}
