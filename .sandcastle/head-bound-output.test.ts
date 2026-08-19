import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { writeHeadBoundJson } from "./head-bound-output";

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("head-bound runner output", () => {
  it("serializes the post-repair payload beside the exact head it describes", () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "head-bound-output-"));
    directories.push(outputDir);

    writeHeadBoundJson({
      outputDir,
      jsonFile: "payload.json",
      value: { summary: "regenerated after repair" },
      headFile: "head.txt",
      headSha: "green-repair-head",
    });

    expect(JSON.parse(fs.readFileSync(path.join(outputDir, "payload.json"), "utf8"))).toEqual({
      summary: "regenerated after repair",
    });
    expect(fs.readFileSync(path.join(outputDir, "head.txt"), "utf8")).toBe(
      "green-repair-head\n",
    );
  });
});
