import { describe, expect, it } from "vitest";
import type { UserId } from "@unshelf/shared";
import { createGenericSourceInspector } from "./generic-inspector";
import {
  createGuardedPublicTransport,
  type ConnectionTransport,
  type HostResolver,
} from "./guarded-transport";
import { createSourceInspectionService } from "./service";

const userId = "a156d86a-09d3-4935-9bf0-1820fa357f90" as UserId;

describe("Generic Source inspection", () => {
  it("returns a public document title through the guarded boundary", async () => {
    const resolver: HostResolver = {
      resolve: () =>
        Promise.resolve({
          aliases: ["edge.publisher.example"],
          addresses: [{ address: "93.184.216.34", family: 4 }],
        }),
    };
    const connection: ConnectionTransport = {
      request: () =>
        Promise.resolve({
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" },
          body: htmlBody(
            "<html><head><title>Source-first capture</title></head></html>",
          ),
          cancel: () => undefined,
        }),
    };
    const transport = createGuardedPublicTransport({ resolver, connection });
    const service = createSourceInspectionService({
      inspectGeneric: createGenericSourceInspector({ transport }),
    });

    await expect(
      service.inspect({
        source: "https://publisher.example/learning/article",
        userId,
        signal: new AbortController().signal,
      }),
    ).resolves.toEqual({
      ok: true,
      response: {
        status: "suggested",
        title: "Source-first capture",
        titleEvidence: "document_title",
      },
    });
  });
});

async function* htmlBody(html: string): AsyncIterable<Uint8Array> {
  yield new TextEncoder().encode(html);
}
