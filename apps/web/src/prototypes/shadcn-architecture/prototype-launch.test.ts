import { describe, expect, it } from "vitest";

import webPackage from "../../../package.json";
import {
  prototypeRoot,
  prototypeViteConfig,
} from "../../../vite.prototype.config";

describe("architecture prototype launch", () => {
  it("starts through the standalone prototype config", () => {
    expect(webPackage.scripts["prototype:architecture"]).toContain(
      "--config vite.prototype.config.ts",
    );
    expect(prototypeViteConfig.root).toBe(prototypeRoot);
    expect(prototypeRoot.endsWith("/apps/web/prototype")).toBe(true);
  });
});
