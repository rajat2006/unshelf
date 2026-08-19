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
