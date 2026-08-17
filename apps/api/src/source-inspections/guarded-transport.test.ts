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
      address: "93.184.216.34",
      family: 4,
      headers: { accept: "text/html" },
      connectTimeoutMs: 500,
      headersTimeoutMs: 1_500,
      maxResponseHeaderBytes: 32 * 1024,
      signal: anyValue(AbortSignal),
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
      address: "142.250.72.14",
    });
    expect(redirectCancel).toHaveBeenCalledOnce();
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
