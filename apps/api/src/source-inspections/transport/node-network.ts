import { promises as dns } from "node:dns";
import * as http from "node:http";
import * as https from "node:https";
import type { LookupFunction } from "node:net";
import type {
  ConnectionTransport,
  GuardedTransportResponse,
  HostResolver,
  ResolvedAddress,
} from "./guarded-transport";
import { SourceInspectionTimeoutError } from "./guarded-transport";

// Node adapters expose cancellable DNS and pinned-address connections to the
// guarded transport; policy decisions stay in guarded-transport.ts.

const CNAME_LIMIT = 16;

interface NodeDnsResolver {
  resolveCname(hostname: string): Promise<string[]>;
  resolve4(hostname: string): Promise<string[]>;
  resolve6(hostname: string): Promise<string[]>;
  cancel(): void;
}

export function createNodeHostResolver({
  createResolver = () => new dns.Resolver(),
}: {
  readonly createResolver?: () => NodeDnsResolver;
} = {}): HostResolver {
  return {
    resolve: async ({ hostname, signal }) => {
      signal.throwIfAborted();
      const resolver = createResolver();
      const cancelResolution = () => resolver.cancel();
      signal.addEventListener("abort", cancelResolution, { once: true });
      const pending = [hostname];
      const visited = new Set<string>();
      const aliases: string[] = [];
      const addresses: ResolvedAddress[] = [];

      try {
        while (pending.length > 0) {
          signal.throwIfAborted();
          const current = pending.shift();
          if (current === undefined || visited.has(current)) continue;
          visited.add(current);
          if (visited.size > CNAME_LIMIT)
            throw new Error("DNS alias limit exceeded");

          const [cnames, ipv4, ipv6] = await Promise.all([
            resolveRecords(() => resolver.resolveCname(current)),
            resolveRecords(() => resolver.resolve4(current)),
            resolveRecords(() => resolver.resolve6(current)),
          ]);
          signal.throwIfAborted();
          for (const alias of cnames) {
            aliases.push(alias);
            pending.push(alias);
          }
          addresses.push(
            ...ipv4.map((address) => ({ address, family: 4 as const })),
            ...ipv6.map((address) => ({ address, family: 6 as const })),
          );
        }

        return {
          aliases: [...new Set(aliases)],
          addresses: uniqueAddresses(addresses),
        };
      } finally {
        signal.removeEventListener("abort", cancelResolution);
      }
    },
  };
}

async function resolveRecords(
  resolve: () => Promise<string[]>,
): Promise<string[]> {
  try {
    return await resolve();
  } catch (failure) {
    if (
      typeof failure === "object" &&
      failure !== null &&
      "code" in failure &&
      (failure.code === "ENODATA" || failure.code === "ENOTFOUND")
    ) {
      return [];
    }
    throw failure;
  }
}

function uniqueAddresses(
  addresses: readonly ResolvedAddress[],
): ResolvedAddress[] {
  return [
    ...new Map(
      addresses.map((entry) => [`${entry.family}:${entry.address}`, entry]),
    ).values(),
  ];
}

export function createNodeConnectionTransport(): ConnectionTransport {
  return {
    request: (input) =>
      new Promise((resolve, reject) => {
        let connected = false;
        const reportConnected = () => {
          if (connected) return;
          connected = true;
          clearTimeout(connectTimeout);
          input.onConnected?.();
        };
        const lookup: LookupFunction = (_hostname, options, callback) => {
          callback(
            null,
            options.all ? [input.pinnedAddress] : input.pinnedAddress.address,
            options.all ? undefined : input.pinnedAddress.family,
          );
        };
        const client = input.url.protocol === "https:" ? https : http;
        const request = client.request(
          input.url,
          {
            method: "GET",
            agent: false,
            headers: input.headers,
            lookup,
            maxHeaderSize: input.maxResponseHeaderBytes,
            servername:
              input.url.protocol === "https:" ? input.url.hostname : undefined,
            signal: input.signal,
          },
          (response) => {
            reportConnected();
            clearTimeout(headersTimeout);
            resolve({
              status: response.statusCode ?? 0,
              headers: normalizeHeaders(response.headers),
              body: response as AsyncIterable<Uint8Array>,
              cancel: () => response.destroy(),
            });
          },
        );
        const connectTimeout = setTimeout(() => {
          request.destroy(
            new SourceInspectionTimeoutError(
              "Source inspection connection deadline",
            ),
          );
        }, input.connectTimeoutMs);
        connectTimeout.unref();
        const headersTimeout = setTimeout(() => {
          request.destroy(
            new SourceInspectionTimeoutError(
              "Source inspection headers deadline",
            ),
          );
        }, input.headersTimeoutMs);
        headersTimeout.unref();
        request.once("socket", (socket) => {
          if (input.url.protocol === "https:") {
            socket.once("secureConnect", reportConnected);
          } else if (!socket.connecting) {
            reportConnected();
          } else {
            socket.once("connect", reportConnected);
          }
        });
        request.once("error", (failure) => {
          clearTimeout(connectTimeout);
          clearTimeout(headersTimeout);
          reject(failure);
        });
        request.end();
      }),
  };
}

function normalizeHeaders(
  headers: http.IncomingHttpHeaders,
): GuardedTransportResponse["headers"] {
  return Object.fromEntries(
    Object.entries(headers).map(([name, value]) => [
      name.toLowerCase(),
      Array.isArray(value) ? value.join(", ") : value,
    ]),
  );
}
