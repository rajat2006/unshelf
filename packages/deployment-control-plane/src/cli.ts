#!/usr/bin/env node

import { runDeploymentCli, type DeploymentAdapters } from "./index.js";

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

process.exitCode = await runDeploymentCli({
  args: process.argv.slice(2),
  adapters,
  write: (line) => process.stdout.write(`${line}\n`),
});
