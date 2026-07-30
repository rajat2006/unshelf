import { describe, expect, it } from "vitest";
import { createCollectingLogger } from "../src/logging/testing";

describe("collecting logger", () => {
  it("collects child-bound events synchronously", () => {
    const logger = createCollectingLogger();
    const requestLogger = logger.child({ requestId: "request-123" });

    requestLogger.warn({
      event: "unshelf.test.collected",
      msg: "Test event collected",
      reason: "test",
    });

    expect(logger.records).toEqual([
      {
        level: "warn",
        requestId: "request-123",
        event: "unshelf.test.collected",
        msg: "Test event collected",
        reason: "test",
      },
    ]);
  });
});
