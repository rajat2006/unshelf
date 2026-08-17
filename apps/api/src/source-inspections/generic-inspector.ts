import { TextDecoder } from "node:util";
import type { SourceInspectionResponse } from "@unshelf/shared";
import { Parser } from "htmlparser2";
import {
  decodeSourceInspectionContent,
  normalizeSourceInspectionContentEncoding,
} from "./content-decoding";
import type {
  AdmitInspectionDestination,
  GuardedPublicTransport,
  SourceInspectionTransportDiagnostics,
} from "./guarded-transport";
import { createInspectionDiagnosticReporter } from "./guarded-transport";
import { resolveGenericMetadata } from "./generic-metadata";

const DECOMPRESSED_BYTE_LIMIT = 256 * 1024;
const ENCODING_PRESCAN_BYTE_LIMIT = 1024;
const JSON_LD_BLOCK_LIMIT = 16;
const JSON_LD_BYTE_LIMIT = 64 * 1024;

const requestHeaders = {
  accept: "text/html, application/xhtml+xml;q=0.9",
  "accept-encoding": "gzip, deflate, br",
  "accept-language": "en",
  "user-agent":
    "Unshelf Source Inspection (+https://github.com/rajat2006/unshelf)",
} as const;

export type GenericSourceInspector = (input: {
  readonly source: string;
  readonly signal: AbortSignal;
  readonly admitDestination?: AdmitInspectionDestination;
  readonly reportDiagnostics?: (update: GenericInspectionDiagnostics) => void;
}) => Promise<SourceInspectionResponse>;

export type GenericInspectionDiagnostics = SourceInspectionTransportDiagnostics;

export function createGenericSourceInspector({
  transport,
}: {
  readonly transport: GuardedPublicTransport;
}): GenericSourceInspector {
  return async ({ source, signal, admitDestination, reportDiagnostics }) => {
    const diagnostics = createInspectionDiagnosticReporter(reportDiagnostics);
    const { report } = diagnostics;
    const result = await transport.get({
      source,
      headers: requestHeaders,
      signal,
      ...(admitDestination === undefined ? {} : { admitDestination }),
      ...(reportDiagnostics === undefined ? {} : { reportDiagnostics: report }),
    });
    if (!result.ok) {
      if (!diagnostics.hasTerminalCode()) report({ terminalCode: "origin" });
      return { status: "unavailable" };
    }

    const { response } = result;
    try {
      const contentEncoding = normalizeSourceInspectionContentEncoding(
        response.headers["content-encoding"],
      );
      if (
        response.status !== 200 ||
        !isHtml(response.headers["content-type"]) ||
        contentEncoding === null
      ) {
        report({ terminalCode: "refused" });
        return { status: "unavailable" };
      }

      const suggestion = await readMetadataSuggestions({
        body: decodeSourceInspectionContent({
          body: response.body,
          encoding: contentEncoding,
        }),
        characterEncoding: declaredCharacterEncoding(
          response.headers["content-type"],
        ),
        signal,
      });
      report({
        terminalCode: suggestion === null ? "no_metadata" : "suggested",
      });
      return suggestion ?? { status: "unavailable" };
    } catch (error) {
      if (!diagnostics.hasTerminalCode()) {
        report({
          terminalCode: signal.aborted
            ? "cancelled"
            : error instanceof InspectionLimitError
              ? "limit"
              : "origin",
        });
      }
      return { status: "unavailable" };
    } finally {
      response.cancel();
    }
  };
}

function isHtml(contentType: string | undefined): boolean {
  const mediaType = contentType?.split(";", 1)[0]?.trim().toLowerCase();
  return mediaType === "text/html" || mediaType === "application/xhtml+xml";
}

function declaredCharacterEncoding(
  contentType: string | undefined,
): string | null {
  const match =
    /(?:^|;)\s*charset\s*=\s*(?:"([^"]+)"|'([^']+)'|([^;\s]+))/iu.exec(
      contentType ?? "",
    );
  const label = match?.[1] ?? match?.[2] ?? match?.[3];
  return label === undefined ? null : normalizeCharacterEncoding(label);
}

async function readMetadataSuggestions({
  body,
  characterEncoding,
  signal,
}: {
  readonly body: AsyncIterable<Uint8Array>;
  readonly characterEncoding: string | null;
  readonly signal: AbortSignal;
}): Promise<SourceInspectionResponse | null> {
  let decoder: TextDecoder | undefined;
  let encodingPrelude: Uint8Array = new Uint8Array();
  let decompressedBytes = 0;
  let inTitle = false;
  let titleStarted = false;
  let headClosed = false;
  let title = "";
  const jsonLd = createBoundedJsonLdCollector();
  const openGraphTitles: string[] = [];
  const openGraphTypes: string[] = [];
  const parser = new Parser(
    {
      onopentag: (name, attributes) => {
        if (name === "title" && !headClosed && !titleStarted) {
          inTitle = true;
          titleStarted = true;
        }
        if (name === "body") {
          headClosed = true;
          parser.pause();
        }
        if (
          name === "script" &&
          attributes.type?.split(";", 1)[0]?.trim().toLowerCase() ===
            "application/ld+json"
        ) {
          jsonLd.startBlock();
        }
        if (name === "meta") {
          const property = attributes.property?.trim().toLowerCase();
          if (property === "og:title" && attributes.content !== undefined) {
            openGraphTitles.push(attributes.content);
          }
          if (property === "og:type" && attributes.content !== undefined) {
            openGraphTypes.push(attributes.content);
          }
        }
      },
      ontext: (text) => {
        if (inTitle) title += text;
        jsonLd.append(text);
      },
      onclosetag: (name) => {
        if (name === "title") inTitle = false;
        if (name === "script") jsonLd.finishBlock();
        if (name === "head") {
          headClosed = true;
          parser.pause();
        }
      },
    },
    { decodeEntities: true },
  );

  for await (const chunk of body) {
    if (signal.aborted) throw signal.reason;
    decompressedBytes += chunk.byteLength;
    if (decompressedBytes > DECOMPRESSED_BYTE_LIMIT) {
      throw new InspectionLimitError();
    }
    if (decoder === undefined) {
      encodingPrelude = concatenateBytes({
        first: encodingPrelude,
        second: chunk,
      });
      if (encodingPrelude.byteLength < ENCODING_PRESCAN_BYTE_LIMIT) continue;
      decoder = new TextDecoder(
        selectCharacterEncoding({
          bytes: encodingPrelude,
          declared: characterEncoding,
        }),
      );
      parser.write(decoder.decode(encodingPrelude, { stream: true }));
      encodingPrelude = new Uint8Array();
    } else {
      parser.write(decoder.decode(chunk, { stream: true }));
    }
    if (headClosed) break;
  }
  decoder ??= new TextDecoder(
    selectCharacterEncoding({
      bytes: encodingPrelude,
      declared: characterEncoding,
    }),
  );
  if (encodingPrelude.byteLength > 0) {
    parser.write(decoder.decode(encodingPrelude, { stream: true }));
  }
  parser.end(decoder.decode());

  return resolveGenericMetadata({
    documentTitle: title,
    jsonLdBlocks: jsonLd.values(),
    openGraphTitles,
    openGraphTypes,
  });
}

class InspectionLimitError extends Error {}

function createBoundedJsonLdCollector(): {
  readonly startBlock: () => void;
  readonly append: (text: string) => void;
  readonly finishBlock: () => void;
  readonly values: () => readonly string[];
} {
  const blocks: string[] = [];
  const encoder = new TextEncoder();
  let block = "";
  let blockBytes = 0;
  let blocksSeen = 0;
  let collectedBytes = 0;
  let collecting = false;
  let budgetExhausted = false;

  return {
    startBlock: () => {
      block = "";
      blockBytes = 0;
      blocksSeen += 1;
      collecting = !budgetExhausted && blocksSeen <= JSON_LD_BLOCK_LIMIT;
    },
    append: (text) => {
      if (!collecting) return;
      const textBytes = encoder.encode(text).byteLength;
      if (collectedBytes + blockBytes + textBytes > JSON_LD_BYTE_LIMIT) {
        block = "";
        collecting = false;
        budgetExhausted = true;
        return;
      }
      block += text;
      blockBytes += textBytes;
    },
    finishBlock: () => {
      if (!collecting) return;
      blocks.push(block);
      collectedBytes += blockBytes;
      block = "";
      collecting = false;
    },
    values: () => blocks,
  };
}

function selectCharacterEncoding({
  bytes,
  declared,
}: {
  readonly bytes: Uint8Array;
  readonly declared: string | null;
}): string {
  return (
    byteOrderMarkEncoding(bytes) ??
    declared ??
    sniffHtmlCharacterEncoding(bytes) ??
    "utf-8"
  );
}

function sniffHtmlCharacterEncoding(bytes: Uint8Array): string | null {
  let encoding: string | null = null;
  const parser = new Parser({
    onopentag: (name, attributes) => {
      if (name !== "meta" || encoding !== null) return;
      const charset = attributes.charset;
      if (charset !== undefined) {
        encoding = normalizeCharacterEncoding(charset);
        return;
      }
      if (attributes["http-equiv"]?.toLowerCase() !== "content-type") return;
      encoding = declaredCharacterEncoding(attributes.content);
    },
  });
  parser.end(
    new TextDecoder("windows-1252").decode(
      bytes.subarray(0, ENCODING_PRESCAN_BYTE_LIMIT),
    ),
  );
  return encoding;
}

function normalizeCharacterEncoding(label: string): string {
  const normalized = label.trim().toLowerCase();
  return normalized === "iso-8859-1" || normalized === "us-ascii"
    ? "windows-1252"
    : normalized;
}

function byteOrderMarkEncoding(bytes: Uint8Array): string | null {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return "utf-8";
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return "utf-16be";
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return "utf-16le";
  return null;
}

function concatenateBytes({
  first,
  second,
}: {
  readonly first: Uint8Array;
  readonly second: Uint8Array;
}): Uint8Array {
  const combined = new Uint8Array(first.byteLength + second.byteLength);
  combined.set(first);
  combined.set(second, first.byteLength);
  return combined;
}
