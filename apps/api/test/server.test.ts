import { once } from "node:events";
import type { AddressInfo } from "node:net";
import express from "express";
import { describe, expect, it } from "vitest";
import { startApiServer } from "../src/api-server";
import {
  createCollectingLogger,
  createProductionLogger,
} from "../src/logger";
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

  it("does not announce startup when the port cannot be bound", async () => {
    const occupiedServer = express().listen(0);
    await once(occupiedServer, "listening");

    try {
      const occupiedPort = (occupiedServer.address() as AddressInfo).port;
      const logger = createCollectingLogger();
      const failedServer = startApiServer(express(), occupiedPort, logger);

      await once(failedServer, "error");

      expect(logger.records).toEqual([]);
    } finally {
      occupiedServer.close();
      await once(occupiedServer, "close");
    }
  });
});
