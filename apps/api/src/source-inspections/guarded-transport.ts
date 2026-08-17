import { BlockList, isIP } from "node:net";

export interface GuardedTransportResponse {
  readonly status: number;
  readonly headers: Readonly<Record<string, string | undefined>>;
  readonly body: AsyncIterable<Uint8Array>;
  readonly cancel: () => void;
}

export type GuardedTransportResult =
  | { readonly ok: true; readonly response: GuardedTransportResponse }
  | { readonly ok: false };

export interface GuardedPublicTransport {
  get(input: {
    readonly source: string;
    readonly headers: Readonly<Record<string, string>>;
    readonly redirectPolicy?: "follow" | "refuse";
    readonly signal: AbortSignal;
  }): Promise<GuardedTransportResult>;
}

export interface HostResolution {
  readonly aliases: readonly string[];
  readonly addresses: readonly ResolvedAddress[];
}

export interface ResolvedAddress {
  readonly address: string;
  readonly family: 4 | 6;
}

export interface HostResolver {
  resolve(input: {
    readonly hostname: string;
    readonly signal: AbortSignal;
  }): Promise<HostResolution>;
}

export interface ConnectionTransport {
  request(input: {
    readonly url: URL;
    readonly pinnedAddress: ResolvedAddress;
    readonly headers: Readonly<Record<string, string>>;
    readonly connectTimeoutMs: number;
    readonly headersTimeoutMs: number;
    readonly maxResponseHeaderBytes: number;
    readonly signal: AbortSignal;
  }): Promise<GuardedTransportResponse>;
}

export interface InspectionClock {
  schedule(input: {
    readonly delayMs: number;
    readonly callback: () => void;
  }): () => void;
}

const outboundHeaderNames = new Set([
  "accept",
  "accept-encoding",
  "accept-language",
  "user-agent",
]);
const nonPublicAddresses = createNonPublicAddressLists();

export function createGuardedPublicTransport({
  resolver,
  connection,
  clock = systemClock,
}: {
  readonly resolver: HostResolver;
  readonly connection: ConnectionTransport;
  readonly clock?: InspectionClock;
}): GuardedPublicTransport {
  return {
    get: async ({ source, headers, redirectPolicy = "follow", signal }) => {
      const deadline = createDeadline({ parentSignal: signal, clock });
      const unavailable = (): GuardedTransportResult => {
        deadline.dispose();
        return { ok: false };
      };
      try {
        let url = parseEligibleUrl(source);
        if (url === null) return unavailable();
        url.hash = "";

        for (let redirectCount = 0; redirectCount <= 5; redirectCount += 1) {
          const response = await requestValidatedUrl({
            url,
            headers,
            signal: deadline.signal,
            clock,
            resolver,
            connection,
          });
          if (response === null) return unavailable();

          const location = redirectLocation(response);
          if (location === null) {
            return {
              ok: true,
              response: withTransferLimit({
                response,
                signal: deadline.signal,
                disposeDeadline: deadline.dispose,
              }),
            };
          }
          response.cancel();
          if (redirectPolicy === "refuse") return unavailable();
          if (redirectCount === 5) return unavailable();

          const redirected = parseEligibleUrl(new URL(location, url).href);
          if (
            redirected === null ||
            (url.protocol === "https:" && redirected.protocol === "http:")
          ) {
            return unavailable();
          }
          redirected.hash = "";
          url = redirected;
        }
        return unavailable();
      } catch {
        return unavailable();
      }
    },
  };
}

const systemClock: InspectionClock = {
  schedule: ({ delayMs, callback }) => {
    const timeout = setTimeout(callback, delayMs);
    timeout.unref();
    return () => clearTimeout(timeout);
  },
};

function createDeadline({
  parentSignal,
  clock,
}: {
  readonly parentSignal: AbortSignal;
  readonly clock: InspectionClock;
}): {
  readonly signal: AbortSignal;
  readonly dispose: () => void;
} {
  return createTimedSignal({
    parentSignal,
    clock,
    delayMs: 2_500,
    reason: "Source inspection deadline",
  });
}

function createTimedSignal({
  parentSignal,
  clock,
  delayMs,
  reason,
}: {
  readonly parentSignal: AbortSignal;
  readonly clock: InspectionClock;
  readonly delayMs: number;
  readonly reason: string;
}): {
  readonly signal: AbortSignal;
  readonly dispose: () => void;
} {
  const controller = new AbortController();
  const abortFromParent = () => controller.abort(parentSignal.reason);
  if (parentSignal.aborted) abortFromParent();
  else parentSignal.addEventListener("abort", abortFromParent, { once: true });
  const cancelTimeout = clock.schedule({
    delayMs,
    callback: () => controller.abort(new Error(reason)),
  });
  let disposed = false;
  return {
    signal: controller.signal,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      cancelTimeout();
      parentSignal.removeEventListener("abort", abortFromParent);
    },
  };
}

function raceWithAbort<Value>(
  promise: Promise<Value>,
  signal: AbortSignal,
): Promise<Value> {
  if (signal.aborted) return Promise.reject(abortError(signal));
  return new Promise((resolve, reject) => {
    const abort = () => reject(abortError(signal));
    signal.addEventListener("abort", abort, { once: true });
    void promise.then(resolve, reject).finally(() => {
      signal.removeEventListener("abort", abort);
    });
  });
}

function abortError(signal: AbortSignal): Error {
  return signal.reason instanceof Error
    ? signal.reason
    : new Error("Source inspection aborted");
}

async function requestValidatedUrl({
  url,
  headers,
  signal,
  clock,
  resolver,
  connection,
}: {
  readonly url: URL;
  readonly headers: Readonly<Record<string, string>>;
  readonly signal: AbortSignal;
  readonly clock: InspectionClock;
  readonly resolver: HostResolver;
  readonly connection: ConnectionTransport;
}): Promise<GuardedTransportResponse | null> {
  const dnsDeadline = createTimedSignal({
    parentSignal: signal,
    clock,
    delayMs: 300,
    reason: "Source inspection DNS deadline",
  });
  let resolution: HostResolution;
  try {
    resolution = await raceWithAbort(
      resolver.resolve({ hostname: url.hostname, signal: dnsDeadline.signal }),
      dnsDeadline.signal,
    );
  } finally {
    dnsDeadline.dispose();
  }
  if (
    resolution.addresses.length === 0 ||
    resolution.aliases.some((alias) => !isDnsHostname(alias)) ||
    resolution.addresses.some(
      ({ address, family }) =>
        isIP(address) !== family ||
        (family === 4
          ? nonPublicAddresses.ipv4.check(address, "ipv4")
          : nonPublicAddresses.ipv6.check(address, "ipv6")),
    )
  ) {
    return null;
  }

  const pinned = resolution.addresses[0];
  if (pinned === undefined) return null;
  const response = await raceWithAbort(
    connection.request({
      url,
      pinnedAddress: pinned,
      headers: Object.fromEntries(
        Object.entries(headers).filter(([name]) =>
          outboundHeaderNames.has(name.toLowerCase()),
        ),
      ),
      connectTimeoutMs: 500,
      headersTimeoutMs: 1_500,
      maxResponseHeaderBytes: 32 * 1024,
      signal,
    }),
    signal,
  );
  if (responseHeaderBytes(response.headers) > 32 * 1024) {
    response.cancel();
    return null;
  }
  return response;
}

function responseHeaderBytes(
  headers: Readonly<Record<string, string | undefined>>,
): number {
  return Object.entries(headers).reduce(
    (total, [name, value]) =>
      total + Buffer.byteLength(name) + Buffer.byteLength(value ?? "") + 4,
    2,
  );
}

function withTransferLimit({
  response,
  signal,
  disposeDeadline,
}: {
  readonly response: GuardedTransportResponse;
  readonly signal: AbortSignal;
  readonly disposeDeadline: () => void;
}): GuardedTransportResponse {
  let cancelled = false;
  const abort = () => cancel();
  const cancel = () => {
    if (cancelled) return;
    cancelled = true;
    signal.removeEventListener("abort", abort);
    response.cancel();
    disposeDeadline();
  };
  signal.addEventListener("abort", abort, { once: true });
  if (signal.aborted) cancel();
  return {
    ...response,
    body: boundedBody({
      body: response.body,
      cancel,
      signal,
      disposeDeadline,
    }),
    cancel,
  };
}

async function* boundedBody({
  body,
  cancel,
  signal,
  disposeDeadline,
}: {
  readonly body: AsyncIterable<Uint8Array>;
  readonly cancel: () => void;
  readonly signal: AbortSignal;
  readonly disposeDeadline: () => void;
}): AsyncIterable<Uint8Array> {
  let transferredBytes = 0;
  for await (const chunk of body) {
    if (signal.aborted) throw signal.reason;
    transferredBytes += chunk.byteLength;
    if (transferredBytes > 512 * 1024) {
      cancel();
      disposeDeadline();
      throw new Error("Source inspection transfer limit exceeded");
    }
    yield chunk;
  }
}

function redirectLocation(response: GuardedTransportResponse): string | null {
  if (![301, 302, 303, 307, 308].includes(response.status)) return null;
  const entry = Object.entries(response.headers).find(
    ([name]) => name.toLowerCase() === "location",
  );
  return entry?.[1] ?? null;
}

function createNonPublicAddressLists(): {
  readonly ipv4: BlockList;
  readonly ipv6: BlockList;
} {
  const ipv4 = new BlockList();
  const ipv6 = new BlockList();
  const ipv4Subnets: readonly [string, number][] = [
    ["0.0.0.0", 8],
    ["10.0.0.0", 8],
    ["100.64.0.0", 10],
    ["127.0.0.0", 8],
    ["169.254.0.0", 16],
    ["172.16.0.0", 12],
    ["192.0.0.0", 24],
    ["192.0.2.0", 24],
    ["192.31.196.0", 24],
    ["192.52.193.0", 24],
    ["192.88.99.0", 24],
    ["192.168.0.0", 16],
    ["192.175.48.0", 24],
    ["198.18.0.0", 15],
    ["198.51.100.0", 24],
    ["203.0.113.0", 24],
    ["224.0.0.0", 4],
    ["240.0.0.0", 4],
  ];
  const ipv6Subnets: readonly [string, number][] = [
    ["::", 128],
    ["::1", 128],
    ["::ffff:0:0", 96],
    ["64:ff9b::", 96],
    ["64:ff9b:1::", 48],
    ["100::", 64],
    ["2001::", 23],
    ["2001:db8::", 32],
    ["2002::", 16],
    ["3fff::", 20],
    ["5f00::", 16],
    ["fc00::", 7],
    ["fe80::", 10],
    ["ff00::", 8],
  ];
  for (const [network, prefix] of ipv4Subnets) {
    ipv4.addSubnet(network, prefix, "ipv4");
  }
  for (const [network, prefix] of ipv6Subnets) {
    ipv6.addSubnet(network, prefix, "ipv6");
  }
  return { ipv4, ipv6 };
}

function parseEligibleUrl(source: string): URL | null {
  try {
    const url = new URL(source);
    return (url.protocol === "http:" || url.protocol === "https:") &&
      url.username.length === 0 &&
      url.password.length === 0 &&
      url.port.length === 0 &&
      isDnsHostname(url.hostname)
      ? url
      : null;
  } catch {
    return null;
  }
}

function isDnsHostname(hostname: string): boolean {
  if (
    isIP(hostname) !== 0 ||
    hostname.length > 253 ||
    !hostname.includes(".")
  ) {
    return false;
  }
  const labels = hostname.split(".");
  return labels.every(
    (label) =>
      label.length > 0 &&
      label.length <= 63 &&
      /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/iu.test(label),
  );
}
