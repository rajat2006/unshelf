#!/usr/bin/env node

import { existsSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join, parse } from "node:path";
import { performance } from "node:perf_hooks";
import type { UserId } from "@unshelf/shared";
import { createGenericSourceInspector } from "../inspectors/generic-inspector";
import { createGuardedPublicTransport } from "../transport/guarded-transport";
import {
  createNodeConnectionTransport,
  createNodeHostResolver,
} from "../transport/node-network";
import { runSourceInspectionReleaseCommand } from "./release-command";
import {
  createSourceInspectionService,
  parseSourceInspectionDeniedHostnames,
} from "../service";
import { createYouTubeTitleInspector } from "../inspectors/youtube-title-inspector";

const transport = createGuardedPublicTransport({
  resolver: createNodeHostResolver(),
  connection: createNodeConnectionTransport(),
});
const service = createSourceInspectionService({
  disabled: false,
  youtubeTitlesDisabled: false,
  deniedHostnames: parseSourceInspectionDeniedHostnames(
    process.env.SOURCE_INSPECTION_DENIED_HOSTNAMES,
  ),
  inspectGeneric: createGenericSourceInspector({ transport }),
  inspectYouTubeTitle: createYouTubeTitleInspector({ transport }),
});
const evaluationUserId = "00000000-0000-4000-8000-000000000454" as UserId;

process.exitCode = await runSourceInspectionReleaseCommand({
  args: process.argv.slice(2),
  repositoryRoot: findRepositoryRoot(process.cwd()),
  resolvePath: ({ path }) => realpathSync(path),
  readTextFile: ({ path }) => readFileSync(path, "utf8"),
  writeTextFile: ({ path, value }) => writeFileSync(path, value, "utf8"),
  writeLine: (line) => process.stdout.write(`${line}\n`),
  inspect: ({ source, signal, observeCompletion }) =>
    service.inspect({
      source,
      signal,
      userId: evaluationUserId,
      observeCompletion,
    }),
  runtime: {
    nowMilliseconds: () => performance.now(),
    wait: (delayMs) =>
      new Promise((resolve) => {
        setTimeout(resolve, delayMs);
      }),
    schedule: ({ delayMs, callback }) => {
      const timer = setTimeout(callback, delayMs);
      return () => clearTimeout(timer);
    },
  },
});

function findRepositoryRoot(start: string): string {
  let current = start;
  const root = parse(current).root;
  while (current !== root) {
    if (existsSync(join(current, "pnpm-workspace.yaml"))) return current;
    current = dirname(current);
  }
  return start;
}
