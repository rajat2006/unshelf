import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  writeImplementPrOutput,
  writeReviewOutput,
} from "./head-bound-output";

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("head-bound runner output", () => {
  it("serializes Review's post-repair result beside the exact head it describes", () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "head-bound-output-"));
    directories.push(outputDir);

    writeReviewOutput({
      outputDir,
      payload: { summary: "regenerated after repair" },
      headSha: "green-repair-head",
    });

    expect(
      JSON.parse(
        fs.readFileSync(path.join(outputDir, "review_payload.json"), "utf8"),
      ),
    ).toEqual({ summary: "regenerated after repair" });
    expect(
      fs.readFileSync(path.join(outputDir, "review_head_sha.txt"), "utf8"),
    ).toBe("green-repair-head\n");
  });

  it("serializes Implement-PR's regenerated replies beside the green head", () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "head-bound-output-"));
    directories.push(outputDir);

    writeImplementPrOutput({
      outputDir,
      replies: [{ threadId: "thread-1", body: "fixed after repair" }],
      headSha: "green-feedback-head",
    });

    expect(
      JSON.parse(
        fs.readFileSync(path.join(outputDir, "thread_replies.json"), "utf8"),
      ),
    ).toEqual([{ threadId: "thread-1", body: "fixed after repair" }]);
    expect(
      fs.readFileSync(
        path.join(outputDir, "implement_pr_head_sha.txt"),
        "utf8",
      ),
    ).toBe("green-feedback-head\n");
  });
});
