import { Readable } from "node:stream";
import { TextDecoder } from "node:util";
import { createBrotliDecompress, createGunzip, createInflate } from "node:zlib";
import type { CanonicalYouTubeSource } from "./classifier";
import type {
  AdmitInspectionDestination,
  GuardedPublicTransport,
  SourceInspectionTransportDiagnostics,
} from "./guarded-transport";
import { createInspectionDiagnosticReporter } from "./guarded-transport";

const OEMBED_ENDPOINT = "https://www.youtube.com/oembed";
export const YOUTUBE_OEMBED_HOSTNAME = "www.youtube.com";
const JSON_BYTE_LIMIT = 64 * 1024;
const TITLE_CODE_POINT_LIMIT = 512;

const requestHeaders = {
  accept: "application/json",
  "accept-encoding": "gzip, deflate, br",
  "accept-language": "en",
  "user-agent":
    "Unshelf Source Inspection (+https://github.com/rajat2006/unshelf)",
} as const;

export type YouTubeTitleInspector = (input: {
  readonly canonicalSource: CanonicalYouTubeSource;
  readonly signal: AbortSignal;
  readonly admitDestination?: AdmitInspectionDestination;
  readonly reportDiagnostics?: (
    update: SourceInspectionTransportDiagnostics,
  ) => void;
}) => Promise<string | null>;

export function createYouTubeTitleInspector({
  transport,
}: {
  readonly transport: GuardedPublicTransport;
}): YouTubeTitleInspector {
  return async ({
    canonicalSource,
    signal,
    admitDestination,
    reportDiagnostics,
  }) => {
    const diagnostics = createInspectionDiagnosticReporter(reportDiagnostics);
    const { report } = diagnostics;
    const endpoint = new URL(OEMBED_ENDPOINT);
    endpoint.searchParams.set("url", canonicalSource);
    endpoint.searchParams.set("format", "json");

    const result = await transport.get({
      source: endpoint.href,
      headers: requestHeaders,
      redirectPolicy: "refuse",
      signal,
      ...(admitDestination === undefined ? {} : { admitDestination }),
      ...(reportDiagnostics === undefined ? {} : { reportDiagnostics: report }),
    });
    if (!result.ok) {
      if (!diagnostics.hasTerminalCode()) report({ terminalCode: "origin" });
      return null;
    }

    const { response } = result;
    try {
      const encoding = normalizedEncoding(response.headers["content-encoding"]);
      if (
        response.status !== 200 ||
        !isJson(response.headers["content-type"]) ||
        encoding === null
      ) {
        report({ terminalCode: "refused" });
        return null;
      }

      const document = await readBoundedJson({
        body: decodeBody(response.body, encoding),
        signal,
      });
      if (
        typeof document !== "object" ||
        document === null ||
        !("title" in document) ||
        typeof document.title !== "string"
      ) {
        report({ terminalCode: "no_metadata" });
        return null;
      }

      const normalized = document.title.replace(/\s+/gu, " ").trim();
      if (normalized.length === 0) {
        report({ terminalCode: "no_metadata" });
        return null;
      }
      report({ terminalCode: "suggested" });
      return [...normalized].slice(0, TITLE_CODE_POINT_LIMIT).join("");
    } catch (error) {
      if (!diagnostics.hasTerminalCode()) {
        report({
          terminalCode: signal.aborted
            ? "cancelled"
            : error instanceof YouTubeTitleLimitError
              ? "limit"
              : "origin",
        });
      }
      return null;
    } finally {
      response.cancel();
    }
  };
}

function isJson(contentType: string | undefined): boolean {
  return (
    contentType?.split(";", 1)[0]?.trim().toLowerCase() === "application/json"
  );
}

type AcceptedEncoding = "identity" | "gzip" | "deflate" | "br";

function normalizedEncoding(
  contentEncoding: string | undefined,
): AcceptedEncoding | null {
  const encoding = contentEncoding?.trim().toLowerCase() || "identity";
  return encoding === "identity" ||
    encoding === "gzip" ||
    encoding === "deflate" ||
    encoding === "br"
    ? encoding
    : null;
}

async function* decodeBody(
  body: AsyncIterable<Uint8Array>,
  encoding: AcceptedEncoding,
): AsyncIterable<Uint8Array> {
  if (encoding === "identity") {
    yield* body;
    return;
  }

  const compressed = Readable.from(body);
  const decompressor =
    encoding === "gzip"
      ? createGunzip()
      : encoding === "deflate"
        ? createInflate()
        : createBrotliDecompress();
  yield* compressed.pipe(decompressor) as AsyncIterable<Uint8Array>;
}

async function readBoundedJson({
  body,
  signal,
}: {
  readonly body: AsyncIterable<Uint8Array>;
  readonly signal: AbortSignal;
}): Promise<unknown> {
  signal.throwIfAborted();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  for await (const chunk of body) {
    signal.throwIfAborted();
    byteLength += chunk.byteLength;
    if (byteLength > JSON_BYTE_LIMIT) {
      throw new YouTubeTitleLimitError();
    }
    chunks.push(chunk);
  }
  signal.throwIfAborted();

  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
}

class YouTubeTitleLimitError extends Error {}
