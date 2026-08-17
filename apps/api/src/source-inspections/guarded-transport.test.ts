import { describe, expect, it, vi } from "vitest";
import {
  createGuardedPublicTransport,
  type ConnectionTransport,
  type HostResolver,
  type InspectionClock,
} from "./guarded-transport";
import { anyValue } from "../../test/assertion-boundaries";

describe("Guarded public transport", () => {
  it("pins a validated public address and omits only the fragment", async () => {
    const resolve = vi.fn<HostResolver["resolve"]>(() =>
      Promise.resolve({
        aliases: ["edge.example.net"],
        addresses: [
          { address: "93.184.216.34", family: 4 as const },
          { address: "2606:2800:220:1:248:1893:25c8:1946", family: 6 as const },
        ],
      }),
    );
    const cancel = vi.fn();
    const request = vi.fn<ConnectionTransport["request"]>(() =>
      Promise.resolve({
        status: 200,
        headers: { "content-type": "text/html" },
        body: emptyBody(),
        cancel,
      }),
    );
    const transport = createGuardedPublicTransport({
      resolver: { resolve },
      connection: { request },
    });
    const signal = new AbortController().signal;

    const result = await transport.get({
      source: "https://example.com/article?token=sensitive#section",
      headers: { accept: "text/html", cookie: "must-not-leave" },
      signal,
    });

    expect(result.ok).toBe(true);
    expect(resolve).toHaveBeenCalledWith({
      hostname: "example.com",
      signal: anyValue(AbortSignal),
    });
    expect(request).toHaveBeenCalledWith({
      url: new URL("https://example.com/article?token=sensitive"),
      pinnedAddress: { address: "93.184.216.34", family: 4 },
      headers: { accept: "text/html" },
      connectTimeoutMs: 500,
      headersTimeoutMs: 1_500,
      maxResponseHeaderBytes: 32 * 1024,
      signal: anyValue(AbortSignal),
      onConnected: anyValue(Function),
    });
    expect(request).toHaveBeenCalledOnce();
    expect(cancel).not.toHaveBeenCalled();
  });

  it.each([
    {
      caseName: "mixed public and private answers",
      addresses: [
        { address: "93.184.216.34", family: 4 as const },
        { address: "10.0.0.4", family: 4 as const },
      ],
    },
    {
      caseName: "an IPv4-mapped private IPv6 answer",
      addresses: [{ address: "::ffff:127.0.0.1", family: 6 as const }],
    },
  ])("refuses $caseName before connecting", async ({ addresses }) => {
    const resolver: HostResolver = {
      resolve: () => Promise.resolve({ aliases: [], addresses }),
    };
    const request = vi.fn<ConnectionTransport["request"]>();
    const transport = createGuardedPublicTransport({
      resolver,
      connection: { request },
    });

    await expect(
      transport.get({
        source: "https://example.com/article",
        headers: {},
        signal: new AbortController().signal,
      }),
    ).resolves.toEqual({ ok: false });
    expect(request).not.toHaveBeenCalled();
  });

  it("reports an unsafe terminal without retaining the refused hostname", async () => {
    const diagnostics: unknown[] = [];
    const transport = createGuardedPublicTransport({
      resolver: {
        resolve: () =>
          Promise.resolve({
            aliases: [],
            addresses: [{ address: "10.0.0.4", family: 4 }],
          }),
      },
      connection: { request: vi.fn() },
    });

    await transport.get({
      source: "https://private.example/article?secret=value",
      headers: {},
      signal: new AbortController().signal,
      reportDiagnostics: (update) => diagnostics.push(update),
    });

    expect(diagnostics).toContainEqual({ terminalCode: "unsafe" });
    expect(JSON.stringify(diagnostics)).not.toContain("private.example");
    expect(JSON.stringify(diagnostics)).not.toContain("secret");
  });

  it.each([
    "article/path",
    "ftp://example.com/article",
    "https://user:secret@example.com/article",
    "https://127.0.0.1/article",
    "https://[::1]/article",
    "https://2130706433/article",
    "https://localhost/article",
    "https://example.com:444/article",
    "https://example..com/article",
  ])("refuses an ineligible address form before DNS: %s", async (source) => {
    const resolve = vi.fn<HostResolver["resolve"]>();
    const request = vi.fn<ConnectionTransport["request"]>();

    await expect(
      createGuardedPublicTransport({
        resolver: { resolve },
        connection: { request },
      }).get({
        source,
        headers: {},
        signal: new AbortController().signal,
      }),
    ).resolves.toEqual({ ok: false });
    expect(resolve).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
  });

  it("revalidates and repins every manual redirect", async () => {
    const resolve = vi.fn<HostResolver["resolve"]>(({ hostname }) =>
      Promise.resolve({
        aliases: [],
        addresses: [
          {
            address:
              hostname === "example.com" ? "93.184.216.34" : "142.250.72.14",
            family: 4,
          },
        ],
      }),
    );
    const redirectCancel = vi.fn();
    const request = vi
      .fn<ConnectionTransport["request"]>()
      .mockResolvedValueOnce({
        status: 302,
        headers: {
          location: "https://cdn.example.net/final?edition=current#heading",
        },
        body: emptyBody(),
        cancel: redirectCancel,
      })
      .mockResolvedValueOnce({
        status: 200,
        headers: { "content-type": "text/html" },
        body: emptyBody(),
        cancel: vi.fn(),
      });
    const transport = createGuardedPublicTransport({
      resolver: { resolve },
      connection: { request },
    });

    const result = await transport.get({
      source: "https://example.com/start",
      headers: { accept: "text/html" },
      signal: new AbortController().signal,
    });

    expect(result.ok).toBe(true);
    expect(resolve.mock.calls.map(([input]) => input.hostname)).toEqual([
      "example.com",
      "cdn.example.net",
    ]);
    expect(request.mock.calls[1]?.[0]).toMatchObject({
      url: new URL("https://cdn.example.net/final?edition=current"),
      pinnedAddress: { address: "142.250.72.14", family: 4 },
    });
    expect(redirectCancel).toHaveBeenCalledOnce();
  });

  it("moves destination admission at each redirect and reports its count bucket", async () => {
    const request = vi
      .fn<ConnectionTransport["request"]>()
      .mockResolvedValueOnce({
        status: 302,
        headers: { location: "https://busy.example/final" },
        body: emptyBody(),
        cancel: vi.fn(),
      });
    const destinations: string[] = [];
    const diagnostics: unknown[] = [];
    const transport = createGuardedPublicTransport({
      resolver: {
        resolve: () =>
          Promise.resolve({
            aliases: [],
            addresses: [{ address: "93.184.216.34", family: 4 }],
          }),
      },
      connection: { request },
    });

    await expect(
      transport.get({
        source: "https://first.example/start",
        headers: {},
        signal: new AbortController().signal,
        admitDestination: ({ hostname }) => {
          destinations.push(hostname);
          return hostname === "busy.example" ? "overload" : "allowed";
        },
        reportDiagnostics: (update) => diagnostics.push(update),
      }),
    ).resolves.toEqual({ ok: false });

    expect(destinations).toEqual(["first.example", "busy.example"]);
    expect(request).toHaveBeenCalledOnce();
    expect(diagnostics).toContainEqual({ redirectCountBucket: "1" });
    expect(diagnostics).toContainEqual({ terminalCode: "overload" });
  });

  it("reports transferred bytes using bounded buckets", async () => {
    const diagnostics: unknown[] = [];
    const times = [0, 5, 5, 8, 12, 12, 20];
    const transport = createGuardedPublicTransport({
      resolver: {
        resolve: () =>
          Promise.resolve({
            aliases: [],
            addresses: [{ address: "93.184.216.34", family: 4 }],
          }),
      },
      connection: {
        request: (input) => {
          input.onConnected?.();
          return Promise.resolve({
            status: 200,
            headers: { "content-type": "text/html" },
            body: byteChunks([new Uint8Array(70_000)]),
            cancel: vi.fn(),
          });
        },
      },
      monotonicNow: () => times.shift() ?? 20,
    });
    const result = await transport.get({
      source: "https://first.example/article",
      headers: {},
      signal: new AbortController().signal,
      reportDiagnostics: (update) => diagnostics.push(update),
    });
    if (!result.ok) throw new Error("Expected response");

    for await (const chunk of result.response.body) {
      // Consume the public transport response through its bounded stream.
      void chunk;
    }

    expect(diagnostics).toContainEqual({
      phaseTimingsMs: { body: 8 },
    });
    expect(diagnostics).toContainEqual({
      byteCountBucket: "65537-262144",
    });
    expect(diagnostics).toContainEqual({ phaseTimingsMs: { dns: 5 } });
    expect(diagnostics).toContainEqual({ phaseTimingsMs: { connection: 3 } });
    expect(diagnostics).toContainEqual({
      phaseTimingsMs: { responseHeaders: 4 },
    });
  });

  it("refuses a redirect when the caller requires a fixed origin", async () => {
    const resolve: HostResolver["resolve"] = () =>
      Promise.resolve({
        aliases: [],
        addresses: [{ address: "142.250.72.14", family: 4 }],
      });
    const cancel = vi.fn();
    const request = vi.fn<ConnectionTransport["request"]>(() =>
      Promise.resolve({
        status: 302,
        headers: { location: "https://example.com/not-youtube" },
        body: emptyBody(),
        cancel,
      }),
    );

    await expect(
      createGuardedPublicTransport({
        resolver: { resolve },
        connection: { request },
      }).get({
        source: "https://www.youtube.com/oembed?format=json",
        headers: { accept: "application/json" },
        redirectPolicy: "refuse",
        signal: new AbortController().signal,
      }),
    ).resolves.toEqual({ ok: false });
    expect(request).toHaveBeenCalledOnce();
    expect(cancel).toHaveBeenCalledOnce();
  });

  it.each([
    {
      caseName: "HTTPS downgrade",
      location: "http://public.example.net/final",
      redirectedAddresses: [{ address: "142.250.72.14", family: 4 as const }],
      expectedRequests: 1,
    },
    {
      caseName: "private redirect target",
      location: "https://private.example.net/final",
      redirectedAddresses: [{ address: "192.168.1.4", family: 4 as const }],
      expectedRequests: 1,
    },
  ])(
    "refuses a $caseName",
    async ({ location, redirectedAddresses, expectedRequests }) => {
      const resolver: HostResolver = {
        resolve: ({ hostname }) =>
          Promise.resolve({
            aliases: [],
            addresses:
              hostname === "example.com"
                ? [{ address: "93.184.216.34", family: 4 }]
                : redirectedAddresses,
          }),
      };
      const cancel = vi.fn();
      const request = vi.fn<ConnectionTransport["request"]>(() =>
        Promise.resolve({
          status: 302,
          headers: { location },
          body: emptyBody(),
          cancel,
        }),
      );

      await expect(
        createGuardedPublicTransport({
          resolver,
          connection: { request },
        }).get({
          source: "https://example.com/start",
          headers: {},
          signal: new AbortController().signal,
        }),
      ).resolves.toEqual({ ok: false });
      expect(request).toHaveBeenCalledTimes(expectedRequests);
      expect(cancel).toHaveBeenCalledOnce();
    },
  );

  it("stops after five redirects without a hidden retry", async () => {
    const resolver: HostResolver = {
      resolve: () =>
        Promise.resolve({
          aliases: [],
          addresses: [{ address: "93.184.216.34", family: 4 }],
        }),
    };
    const cancel = vi.fn();
    const request = vi.fn<ConnectionTransport["request"]>(() =>
      Promise.resolve({
        status: 302,
        headers: { location: "/next" },
        body: emptyBody(),
        cancel,
      }),
    );

    await expect(
      createGuardedPublicTransport({
        resolver,
        connection: { request },
      }).get({
        source: "https://example.com/start",
        headers: {},
        signal: new AbortController().signal,
      }),
    ).resolves.toEqual({ ok: false });
    expect(request).toHaveBeenCalledTimes(6);
    expect(cancel).toHaveBeenCalledTimes(6);
  });

  it("cancels a response whose transferred body exceeds 512 KiB", async () => {
    const cancel = vi.fn();
    const resolver: HostResolver = {
      resolve: () =>
        Promise.resolve({
          aliases: [],
          addresses: [{ address: "93.184.216.34", family: 4 }],
        }),
    };
    const connection: ConnectionTransport = {
      request: () =>
        Promise.resolve({
          status: 200,
          headers: { "content-type": "text/html" },
          body: byteChunks([
            new Uint8Array(400 * 1024),
            new Uint8Array(113 * 1024),
          ]),
          cancel,
        }),
    };
    const result = await createGuardedPublicTransport({
      resolver,
      connection,
    }).get({
      source: "https://example.com/large",
      headers: {},
      signal: new AbortController().signal,
    });
    if (!result.ok) throw new Error("Expected the response headers");

    await expect(consume(result.response.body)).rejects.toThrow(
      "transfer limit",
    );
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("aborts DNS when the 2.5 second end-to-end deadline expires", async () => {
    let expire: (() => void) | undefined;
    const cancelDeadline = vi.fn();
    const schedule = vi.fn<InspectionClock["schedule"]>(
      ({ callback, delayMs }) => {
        if (delayMs === 2_500) expire = callback;
        return cancelDeadline;
      },
    );
    const resolver: HostResolver = {
      resolve: ({ signal }) =>
        new Promise((_, reject) => {
          signal.addEventListener(
            "abort",
            () =>
              reject(
                signal.reason instanceof Error
                  ? signal.reason
                  : new Error("Source inspection aborted"),
              ),
            { once: true },
          );
        }),
    };
    const request = vi.fn<ConnectionTransport["request"]>();
    const pending = createGuardedPublicTransport({
      resolver,
      connection: { request },
      clock: { schedule },
    }).get({
      source: "https://example.com/slow",
      headers: {},
      signal: new AbortController().signal,
    });

    expect(schedule).toHaveBeenCalledWith({
      delayMs: 2_500,
      callback: anyValue(Function),
    });
    expire?.();
    await expect(pending).resolves.toEqual({ ok: false });
    expect(request).not.toHaveBeenCalled();
    expect(cancelDeadline).toHaveBeenCalledTimes(2);
  });

  it("cancels an open response when its caller aborts", async () => {
    const cancel = vi.fn();
    const controller = new AbortController();
    const result = await createGuardedPublicTransport({
      resolver: {
        resolve: () =>
          Promise.resolve({
            aliases: [],
            addresses: [{ address: "93.184.216.34", family: 4 }],
          }),
      },
      connection: {
        request: () =>
          Promise.resolve({
            status: 200,
            headers: { "content-type": "text/html" },
            body: emptyBody(),
            cancel,
          }),
      },
    }).get({
      source: "https://example.com/article",
      headers: {},
      signal: controller.signal,
    });
    if (!result.ok) throw new Error("Expected an open response");

    controller.abort();

    expect(cancel).toHaveBeenCalledOnce();
  });

  it("refuses DNS resolution after its 300 ms phase ceiling", async () => {
    const expirations = new Map<number, () => void>();
    const schedule = vi.fn<InspectionClock["schedule"]>(
      ({ callback, delayMs }) => {
        expirations.set(delayMs, callback);
        return vi.fn();
      },
    );
    const resolver: HostResolver = {
      resolve: () => new Promise(() => undefined),
    };
    const pending = createGuardedPublicTransport({
      resolver,
      connection: { request: vi.fn() },
      clock: { schedule },
    }).get({
      source: "https://example.com/slow-dns",
      headers: {},
      signal: new AbortController().signal,
    });

    expect(schedule).toHaveBeenCalledWith({
      delayMs: 300,
      callback: anyValue(Function),
    });
    expirations.get(300)?.();
    await expect(pending).resolves.toEqual({ ok: false });
  });
});

function emptyBody(): AsyncIterable<Uint8Array> {
  return byteChunks([]);
}

async function* byteChunks(
  values: readonly Uint8Array[],
): AsyncIterable<Uint8Array> {
  for (const value of values) yield value;
}

async function consume(body: AsyncIterable<Uint8Array>): Promise<void> {
  for await (const chunk of body) {
    // Consumption is the observable transport seam.
    void chunk;
  }
}
