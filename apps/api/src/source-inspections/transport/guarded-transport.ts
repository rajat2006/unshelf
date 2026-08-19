import { BlockList, isIP } from "node:net";
import { performance } from "node:perf_hooks";

// The sole arbitrary-public-network boundary: validate and pin every destination,
// re-run the guard on redirects, and collapse policy failures to unavailable.

export interface GuardedTransportResponse {
  readonly status: number;
  readonly headers: Readonly<Record<string, string | undefined>>;
  readonly body: AsyncIterable<Uint8Array>;
  readonly cancel: () => void;
}

export type GuardedTransportResult =
  | { readonly ok: true; readonly response: GuardedTransportResponse }
  | { readonly ok: false };

export type DestinationAdmission = "allowed" | "refused" | "overload";
export type AdmitInspectionDestination = (input: {
  readonly hostname: string;
}) => DestinationAdmission;
export type RedirectCountBucket = "0" | "1" | "2-5" | "unknown";
export type ByteCountBucket =
  "0" | "1-65536" | "65537-262144" | "262145-524288" | "over_limit" | "unknown";
export interface SourceInspectionPhaseTimings {
  readonly dns?: number;
  readonly connection?: number;
  readonly responseHeaders?: number;
  readonly body?: number;
}

export interface GuardedPublicTransport {
  get(input: {
    readonly source: string;
    readonly headers: Readonly<Record<string, string>>;
    readonly redirectPolicy?: "follow" | "refuse";
    readonly signal: AbortSignal;
    readonly admitDestination?: AdmitInspectionDestination;
    readonly reportDiagnostics?: (
      update: SourceInspectionTransportDiagnostics,
    ) => void;
  }): Promise<GuardedTransportResult>;
}

export interface SourceInspectionTransportDiagnostics {
  readonly terminalCode?:
    | "unsafe"
    | "refused"
    | "timeout"
    | "limit"
    | "overload"
    | "origin"
    | "cancelled"
    | "suggested"
    | "no_metadata";
  readonly redirectCountBucket?: RedirectCountBucket;
  readonly byteCountBucket?: ByteCountBucket;
  readonly phaseTimingsMs?: SourceInspectionPhaseTimings;
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
    readonly onConnected?: () => void;
  }): Promise<GuardedTransportResponse>;
}

export function createInspectionDiagnosticReporter(
  sink?: (update: SourceInspectionTransportDiagnostics) => void,
): {
  readonly report: (update: SourceInspectionTransportDiagnostics) => void;
  readonly hasTerminalCode: () => boolean;
} {
  let terminalReported = false;
  return {
    report: (update) => {
      if (update.terminalCode !== undefined) terminalReported = true;
      sink?.(update);
    },
    hasTerminalCode: () => terminalReported,
  };
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
  monotonicNow = () => performance.now(),
}: {
  readonly resolver: HostResolver;
  readonly connection: ConnectionTransport;
  readonly clock?: InspectionClock;
  readonly monotonicNow?: () => number;
}): GuardedPublicTransport {
  return {
    get: async ({
      source,
      headers,
      redirectPolicy = "follow",
      signal,
      admitDestination,
      reportDiagnostics,
    }) => {
      const deadline = createDeadline({ parentSignal: signal, clock });
      reportDiagnostics?.({
        redirectCountBucket: "0",
        byteCountBucket: "0",
      });
      const unavailable = (
        update?: SourceInspectionTransportDiagnostics,
      ): GuardedTransportResult => {
        if (update !== undefined) reportDiagnostics?.(update);
        deadline.dispose();
        return { ok: false };
      };
      try {
        let url = parseEligibleUrl(source);
        if (url === null) return unavailable({ terminalCode: "unsafe" });
        url.hash = "";

        for (let redirectCount = 0; redirectCount <= 5; redirectCount += 1) {
          reportDiagnostics?.({
            redirectCountBucket: bucketRedirectCount(redirectCount),
          });
          const destinationAdmission = admitDestination?.({
            hostname: url.hostname,
          });
          if (
            destinationAdmission === "refused" ||
            destinationAdmission === "overload"
          ) {
            return unavailable({ terminalCode: destinationAdmission });
          }
          const validated = await requestValidatedUrl({
            url,
            headers,
            signal: deadline.signal,
            clock,
            resolver,
            connection,
            monotonicNow,
            reportDiagnostics,
          });
          if (!validated.ok) {
            return unavailable({ terminalCode: validated.terminalCode });
          }
          const { response } = validated;

          const location = redirectLocation(response);
          if (location === null) {
            return {
              ok: true,
              response: withTransferLimit({
                response,
                signal: deadline.signal,
                disposeDeadline: deadline.dispose,
                reportDiagnostics,
                monotonicNow,
              }),
            };
          }
          reportDiagnostics?.({
            redirectCountBucket: bucketRedirectCount(redirectCount + 1),
          });
          response.cancel();
          if (redirectPolicy === "refuse") {
            return unavailable({ terminalCode: "refused" });
          }
          if (redirectCount === 5) {
            return unavailable({ terminalCode: "limit" });
          }

          const redirected = parseEligibleUrl(new URL(location, url).href);
          if (
            redirected === null ||
            (url.protocol === "https:" && redirected.protocol === "http:")
          ) {
            return unavailable({ terminalCode: "unsafe" });
          }
          redirected.hash = "";
          url = redirected;
        }
        return unavailable({ terminalCode: "limit" });
      } catch (error) {
        return unavailable({
          terminalCode: signal.aborted
            ? "cancelled"
            : deadline.signal.aborted ||
                error instanceof SourceInspectionTimeoutError
              ? "timeout"
              : "origin",
        });
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
    callback: () => controller.abort(new SourceInspectionTimeoutError(reason)),
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
  monotonicNow,
  reportDiagnostics,
}: {
  readonly url: URL;
  readonly headers: Readonly<Record<string, string>>;
  readonly signal: AbortSignal;
  readonly clock: InspectionClock;
  readonly resolver: HostResolver;
  readonly connection: ConnectionTransport;
  readonly monotonicNow: () => number;
  readonly reportDiagnostics?: (
    update: SourceInspectionTransportDiagnostics,
  ) => void;
}): Promise<
  | { readonly ok: true; readonly response: GuardedTransportResponse }
  | { readonly ok: false; readonly terminalCode: "unsafe" | "limit" }
> {
  const dnsDeadline = createTimedSignal({
    parentSignal: signal,
    clock,
    delayMs: 300,
    reason: "Source inspection DNS deadline",
  });
  let resolution: HostResolution;
  const dnsStartedAt = monotonicNow();
  try {
    resolution = await raceWithAbort(
      resolver.resolve({ hostname: url.hostname, signal: dnsDeadline.signal }),
      dnsDeadline.signal,
    );
  } finally {
    reportDiagnostics?.({
      phaseTimingsMs: {
        dns: Math.max(0, monotonicNow() - dnsStartedAt),
      },
    });
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
    return { ok: false, terminalCode: "unsafe" };
  }

  const pinned = resolution.addresses[0];
  if (pinned === undefined) return { ok: false, terminalCode: "unsafe" };
  const connectionStartedAt = monotonicNow();
  let connectedAt: number | undefined;
  let response: GuardedTransportResponse;
  try {
    response = await raceWithAbort(
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
        onConnected: () => {
          if (connectedAt !== undefined) return;
          connectedAt = monotonicNow();
          reportDiagnostics?.({
            phaseTimingsMs: {
              connection: Math.max(0, connectedAt - connectionStartedAt),
            },
          });
        },
      }),
      signal,
    );
  } finally {
    reportDiagnostics?.({
      phaseTimingsMs: {
        responseHeaders: Math.max(
          0,
          monotonicNow() - (connectedAt ?? connectionStartedAt),
        ),
      },
    });
  }
  if (responseHeaderBytes(response.headers) > 32 * 1024) {
    response.cancel();
    return { ok: false, terminalCode: "limit" };
  }
  return { ok: true, response };
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
  reportDiagnostics,
  monotonicNow,
}: {
  readonly response: GuardedTransportResponse;
  readonly signal: AbortSignal;
  readonly disposeDeadline: () => void;
  readonly reportDiagnostics?: (
    update: SourceInspectionTransportDiagnostics,
  ) => void;
  readonly monotonicNow: () => number;
}): GuardedTransportResponse {
  let cancelled = false;
  const abort = () => {
    reportDiagnostics?.({
      terminalCode:
        signal.reason instanceof SourceInspectionTimeoutError
          ? "timeout"
          : "cancelled",
    });
    cancel();
  };
  const cancel = () => {
    if (cancelled) return;
    cancelled = true;
    signal.removeEventListener("abort", abort);
    response.cancel();
    disposeDeadline();
  };
  signal.addEventListener("abort", abort, { once: true });
  if (signal.aborted) abort();
  return {
    ...response,
    body: boundedBody({
      body: response.body,
      cancel,
      signal,
      disposeDeadline,
      reportDiagnostics,
      monotonicNow,
    }),
    cancel,
  };
}

export class SourceInspectionTimeoutError extends Error {}

async function* boundedBody({
  body,
  cancel,
  signal,
  disposeDeadline,
  reportDiagnostics,
  monotonicNow,
}: {
  readonly body: AsyncIterable<Uint8Array>;
  readonly cancel: () => void;
  readonly signal: AbortSignal;
  readonly disposeDeadline: () => void;
  readonly reportDiagnostics?: (
    update: SourceInspectionTransportDiagnostics,
  ) => void;
  readonly monotonicNow: () => number;
}): AsyncIterable<Uint8Array> {
  let transferredBytes = 0;
  const bodyStartedAt = monotonicNow();
  reportDiagnostics?.({ byteCountBucket: "0" });
  try {
    for await (const chunk of body) {
      if (signal.aborted) throw signal.reason;
      transferredBytes += chunk.byteLength;
      if (transferredBytes > 512 * 1024) {
        reportDiagnostics?.({
          terminalCode: "limit",
          byteCountBucket: "over_limit",
        });
        cancel();
        disposeDeadline();
        throw new Error("Source inspection transfer limit exceeded");
      }
      reportDiagnostics?.({
        byteCountBucket: bucketTransferredBytes(transferredBytes),
      });
      yield chunk;
    }
  } finally {
    reportDiagnostics?.({
      phaseTimingsMs: {
        body: Math.max(0, monotonicNow() - bodyStartedAt),
      },
    });
  }
}

function bucketRedirectCount(count: number): "0" | "1" | "2-5" {
  if (count === 0) return "0";
  return count === 1 ? "1" : "2-5";
}

function bucketTransferredBytes(
  bytes: number,
): "0" | "1-65536" | "65537-262144" | "262145-524288" {
  if (bytes === 0) return "0";
  if (bytes <= 64 * 1024) return "1-65536";
  if (bytes <= 256 * 1024) return "65537-262144";
  return "262145-524288";
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
