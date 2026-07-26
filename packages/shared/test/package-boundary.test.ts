import { build } from "esbuild";
import * as shared from "@unshelf/shared";
import {
  createItemRequestSchema,
  itemIdSchema,
} from "@unshelf/shared/validation";
import { describe, expect, it } from "vitest";

describe("shared package entrypoints", () => {
  it("exposes validation through its dedicated subpath", () => {
    expect(createItemRequestSchema).toBeDefined();
    expect(itemIdSchema).toBeDefined();
  });

  it("keeps the existing browser-facing entrypoint free of validation runtime", async () => {
    expect("createItemRequestSchema" in shared).toBe(false);

    const bundle = await build({
      bundle: true,
      metafile: true,
      platform: "browser",
      stdin: {
        contents: 'import "@unshelf/shared";',
        resolveDir: new URL("..", import.meta.url).pathname,
      },
      write: false,
    });
    expect(Object.keys(bundle.metafile.inputs)).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/[/\\]zod[/\\]/)]),
    );
  });
});
