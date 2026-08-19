import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import { requireEnv } from "./require-env";
import { verifyUnresolvedThreadSet } from "./review-threads";

const execFileAsync = promisify(execFile);
const threadIdsSchema = z.array(z.string().min(1));
const [command, ...args] = process.argv.slice(2);

switch (command) {
  case "snapshot":
    console.log(JSON.stringify(await unresolvedThreadIds(numberArg("--pr"))));
    break;
  case "assert-current": {
    const expected = threadIdsSchema.parse(JSON.parse(stringArg("--expected")));
    const current = await unresolvedThreadIds(numberArg("--pr"));
    const verdict = verifyUnresolvedThreadSet({ expected, current });
    if (!verdict.ok) fail(verdict.error);
    break;
  }
  default:
    fail("Usage: review-threads-cli.ts snapshot|assert-current --pr N [--expected JSON]");
}

async function unresolvedThreadIds(prNumber: number) {
  const repository = requireEnv("GH_REPO");
  const [owner, name] = repository.split("/");
  if (!owner || !name) fail("GH_REPO must be an owner/name repository.");
  const query = `
    query($owner: String!, $name: String!, $pr: Int!) {
      repository(owner: $owner, name: $name) {
        pullRequest(number: $pr) {
          reviewThreads(first: 100) { nodes { id isResolved } }
        }
      }
    }`;
  const { stdout } = await execFileAsync("gh", [
    "api",
    "graphql",
    "-f",
    `owner=${owner}`,
    "-f",
    `name=${name}`,
    "-F",
    `pr=${prNumber}`,
    "-f",
    `query=${query}`,
    "--jq",
    "[.data.repository.pullRequest.reviewThreads.nodes[] | select(.isResolved == false) | .id]",
  ]);
  return threadIdsSchema.parse(JSON.parse(stdout));
}

function numberArg(name: string) {
  const value = Number(stringArg(name));
  if (!Number.isInteger(value) || value <= 0) fail(`${name} must be a positive integer.`);
  return value;
}

function stringArg(name: string) {
  const index = args.indexOf(name);
  const value = index === -1 ? undefined : args[index + 1];
  if (!value) fail(`${name} is required.`);
  return value;
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}
