import { runImagePairValidationCli } from "../src/index.js";
import { parseJson } from "./harness.js";
import { describe, expect, it } from "vitest";

const apiImage = `ghcr.io/rajat2006/unshelf-api@sha256:${"a".repeat(64)}`;
const webImage = `ghcr.io/rajat2006/unshelf-web@sha256:${"b".repeat(64)}`;

describe("deployment image-pair validation", () => {
  it("emits the exact immutable pair before Compose mutation", () => {
    const output: string[] = [];

    const exitCode = runImagePairValidationCli({
      args: [
        "validate-image-pair",
        "--api-image",
        apiImage,
        "--web-image",
        webImage,
      ],
      write: (line) => output.push(line),
    });

    expect(exitCode).toBe(0);
    expect(output.map(parseJson)).toEqual([
      {
        ok: true,
        apiImage,
        webImage,
        apiDigest: `sha256:${"a".repeat(64)}`,
        webDigest: `sha256:${"b".repeat(64)}`,
        state: "verified",
      },
    ]);
  });

  it.each([
    {
      name: "moving API tag",
      candidateApi: "ghcr.io/rajat2006/unshelf-api:development",
      candidateWeb: webImage,
    },
    {
      name: "wrong API repository",
      candidateApi: `ghcr.io/rajat2006/unshelf-web@sha256:${"a".repeat(64)}`,
      candidateWeb: webImage,
    },
    {
      name: "malformed API digest",
      candidateApi: "ghcr.io/rajat2006/unshelf-api@sha256:not-a-digest",
      candidateWeb: webImage,
    },
    {
      name: "unrelated web image",
      candidateApi: apiImage,
      candidateWeb: "docker.io/library/caddy:2",
    },
  ])("rejects a $name", ({ candidateApi, candidateWeb }) => {
    const output: string[] = [];

    const exitCode = runImagePairValidationCli({
      args: [
        "validate-image-pair",
        "--api-image",
        candidateApi,
        "--web-image",
        candidateWeb,
      ],
      write: (line) => output.push(line),
    });

    expect(exitCode).toBe(1);
    expect(output.map(parseJson)).toEqual([
      {
        ok: false,
        error: {
          code: "invalid-image-pair",
          message: "Deployment image pair is invalid.",
        },
      },
    ]);
  });
});
