#!/usr/bin/env node

import { createGitHubActionsCandidateAdapters } from "./candidate-adapters.js";
import { runCandidateCli } from "./candidate.js";
import {
  runDeploymentCli,
  runImagePairValidationCli,
  type DeploymentAdapters,
} from "./index.js";

const unavailable = async () => ({ ok: false, code: "unavailable" }) as const;

const adapters: DeploymentAdapters = {
  github: { verifyIntent: unavailable },
  ghcr: { verifyImagePair: unavailable },
  dokploy: {
    findDeployment: unavailable,
    createDeployment: unavailable,
  },
  healthCheck: { verify: unavailable },
  clock: { nowMilliseconds: () => Date.now() },
};

const args = process.argv.slice(2);
const write = (line: string) => process.stdout.write(`${line}\n`);
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
      : await runDeploymentCli({ args, adapters, write });
