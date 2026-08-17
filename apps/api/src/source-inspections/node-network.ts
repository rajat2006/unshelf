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

const CNAME_LIMIT = 16;

export function createNodeHostResolver(): HostResolver {
  return {
    resolve: async ({ hostname, signal }) => {
      const pending = [hostname];
      const visited = new Set<string>();
      const aliases: string[] = [];
      const addresses: ResolvedAddress[] = [];

      while (pending.length > 0) {
        signal.throwIfAborted();
        const current = pending.shift();
        if (current === undefined || visited.has(current)) continue;
        visited.add(current);
        if (visited.size > CNAME_LIMIT)
          throw new Error("DNS alias limit exceeded");

        const [cnames, ipv4, ipv6] = await Promise.all([
          resolveRecords(() => dns.resolveCname(current)),
          resolveRecords(() => dns.resolve4(current)),
          resolveRecords(() => dns.resolve6(current)),
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
            clearTimeout(connectTimeout);
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
          request.destroy(new Error("Source inspection connection deadline"));
        }, input.connectTimeoutMs);
        connectTimeout.unref();
        const headersTimeout = setTimeout(() => {
          request.destroy(new Error("Source inspection headers deadline"));
        }, input.headersTimeoutMs);
        headersTimeout.unref();
        request.once("socket", (socket) => {
          if (input.url.protocol === "https:") {
            socket.once("secureConnect", () => clearTimeout(connectTimeout));
          } else if (!socket.connecting) {
            clearTimeout(connectTimeout);
          } else {
            socket.once("connect", () => clearTimeout(connectTimeout));
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
