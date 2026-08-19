import * as fs from "node:fs";
import * as path from "node:path";

/** Serialize a workflow publication payload and the exact HEAD it describes. */
export function writeHeadBoundJson({
  outputDir,
  jsonFile,
  value,
  headFile,
  headSha,
}: {
  outputDir: string;
  jsonFile: string;
  value: unknown;
  headFile: string;
  headSha: string;
}) {
  fs.writeFileSync(
    path.join(outputDir, jsonFile),
    JSON.stringify(value, null, 2),
  );
  fs.writeFileSync(path.join(outputDir, headFile), `${headSha}\n`);
}

export function writeReviewOutput({
  outputDir,
  payload,
  headSha,
}: {
  outputDir: string;
  payload: unknown;
  headSha: string;
}) {
  writeHeadBoundJson({
    outputDir,
    jsonFile: "review_payload.json",
    value: payload,
    headFile: "review_head_sha.txt",
    headSha,
  });
}

export function writeImplementPrOutput({
  outputDir,
  replies,
  headSha,
}: {
  outputDir: string;
  replies: unknown;
  headSha: string;
}) {
  writeHeadBoundJson({
    outputDir,
    jsonFile: "thread_replies.json",
    value: replies,
    headFile: "implement_pr_head_sha.txt",
    headSha,
  });
}
