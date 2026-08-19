import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createNodeConnectionTransport,
  createNodeHostResolver,
} from "./node-network";

const servers: ReturnType<typeof createServer>[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((failure) =>
            failure === undefined ? resolve() : reject(failure),
          );
        }),
    ),
  );
});

describe("Node connection transport", () => {
  it("connects only to the pinned address while preserving the original Host", async () => {
    let receivedHost: string | undefined;
    const server = createServer((request, response) => {
      receivedHost = request.headers.host;
      response.setHeader("Content-Type", "text/html");
      response.end("<title>Pinned</title>");
    });
    servers.push(server);
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const { port } = server.address() as AddressInfo;

    const response = await createNodeConnectionTransport().request({
      url: new URL(`http://unresolvable.invalid:${port}/article`),
      pinnedAddress: { address: "127.0.0.1", family: 4 },
      headers: { accept: "text/html" },
      connectTimeoutMs: 500,
      headersTimeoutMs: 1_500,
      maxResponseHeaderBytes: 32 * 1024,
      signal: new AbortController().signal,
    });
    for await (const chunk of response.body) void chunk;
    response.cancel();

    expect(receivedHost).toBe(`unresolvable.invalid:${port}`);
  });
});

describe("Node host resolver", () => {
  it("cancels active DNS queries when the inspection is aborted", async () => {
    const controller = new AbortController();
    let rejectResolution!: (failure: Error) => void;
    const resolution = new Promise<string[]>((_resolve, reject) => {
      rejectResolution = reject;
    });
    const cancel = vi.fn(() => rejectResolution(new Error("DNS cancelled")));
    const resolver = createNodeHostResolver({
      createResolver: () => ({
        resolveCname: () => resolution,
        resolve4: () => resolution,
        resolve6: () => resolution,
        cancel,
      }),
    });

    const pending = resolver.resolve({
      hostname: "example.com",
      signal: controller.signal,
    });
    controller.abort();

    await expect(pending).rejects.toThrow("DNS cancelled");
    expect(cancel).toHaveBeenCalledOnce();
  });
});
