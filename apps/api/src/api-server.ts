import type { Server } from "node:http";
import type { Express } from "express";
import type { Logger } from "./logging/logger";

export function startApiServer(
  app: Express,
  port: number,
  logger: Logger,
): Server {
  const server = app.listen(port);
  server.once("listening", () => {
    const address = server.address();
    const listeningPort =
      address !== null && typeof address !== "string" ? address.port : port;

    logger.info({
      event: "unshelf.api.started",
      msg: "API started",
      port: listeningPort,
    });
  });

  return server;
}
