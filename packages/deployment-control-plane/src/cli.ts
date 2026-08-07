#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { createGitHubActionsCandidateAdapters } from "./candidate-adapters.js";
import { runCandidateCli } from "./candidate.js";
import { createGitHubActionsDeploymentAdapters } from "./deployment-adapters.js";
import {
  runDeploymentCli,
  runImagePairValidationCli,
  type DeploymentAdapters,
} from "./index.js";

const unavailable = async () => ({ ok: false, code: "unavailable" }) as const;

const unavailableAdapters: DeploymentAdapters = {
  github: { verifyIntent: unavailable },
  ghcr: { verifyImagePair: unavailable, advanceChannel: unavailable },
  dokploy: {
    convergeCompose: unavailable,
    inspectAttempt: unavailable,
    startDeployment: unavailable,
  },
  healthCheck: { verify: unavailable },
  clock: { nowMilliseconds: () => Date.now() },
};

const args = process.argv.slice(2);
const write = (line: string) => process.stdout.write(`${line}\n`);
const deploymentAdapters =
  args[0] === "reconcile"
    ? createGitHubActionsDeploymentAdapters({
        environment: process.env,
        composeFile: readFileSync(
          new URL("../../../docker-compose.yml", import.meta.url),
          "utf8",
        ),
      })
    : unavailableAdapters;
process.exitCode =
  args[0] === "validate-image-pair"
    ? runImagePairValidationCli({ args, write })
    : args[0]?.endsWith("-candidate")
      ? await runCandidateCli({
          args,
          adapters: createGitHubActionsCandidateAdapters({
            environment: process.env,
          }),
          write,
        })
      : await runDeploymentCli({ args, adapters: deploymentAdapters, write });
