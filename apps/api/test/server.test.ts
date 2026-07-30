import { once } from "node:events";
import type { AddressInfo } from "node:net";
import express from "express";
import { describe, expect, it, vi } from "vitest";
import { startApiServer } from "../src/api-server";
import {
  superviseApiProcess,
  type ProcessRuntime,
} from "../src/process-failures";
import { createProductionLogger } from "../src/logging";
import { createCollectingLogger } from "../src/logging/testing";
import { StringDestination } from "./string-destination";

describe("API server startup", () => {
  it("announces the listening port only after the server is ready", async () => {
    const destination = new StringDestination();
    const logger = createProductionLogger({
      level: "info",
      destination,
    });
    const server = startApiServer(express(), 0, logger);

    expect(destination.output).toBe("");

    await once(server, "listening");

    try {
      const address = server.address() as AddressInfo;
      const lines = destination.output.trimEnd().split("\n");
      expect(lines).toHaveLength(1);
      expect(JSON.parse(lines[0]!)).toMatchObject({
        level: "info",
        event: "unshelf.api.started",
        msg: "API started",
        port: address.port,
      });
    } finally {
      server.close();
      await once(server, "close");
    }
  });

  it("reports a fatal startup failure when the port cannot be bound", async () => {
    const occupiedServer = express().listen(0);
    await once(occupiedServer, "listening");

    try {
      const occupiedPort = (occupiedServer.address() as AddressInfo).port;
      const logger = createCollectingLogger();
      const exit = vi.fn();
      const runtime: ProcessRuntime = {
        once: () => undefined,
        exit,
      };
      const failedServer = await superviseApiProcess({
        logger,
        runtime,
        start: () => startApiServer(express(), occupiedPort, logger),
      });

      await once(failedServer!, "error");
      await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(1));

      expect(logger.records).toEqual([
        {
          level: "fatal",
          event: "unshelf.api.error.unexpected",
          msg: "Unexpected API error",
          phase: "startup",
          error: expect.objectContaining({
            type: "Error",
            code: "EADDRINUSE",
          }),
        },
      ]);
    } finally {
      occupiedServer.close();
      await once(occupiedServer, "close");
    }
  });
});
