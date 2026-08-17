import { Readable } from "node:stream";
import { TextDecoder } from "node:util";
import { createBrotliDecompress, createGunzip, createInflate } from "node:zlib";
import type { SourceInspectionResponse } from "@unshelf/shared";
import { Parser } from "htmlparser2";
import type { GuardedPublicTransport } from "./guarded-transport";

const DECOMPRESSED_BYTE_LIMIT = 256 * 1024;
const TITLE_CODE_POINT_LIMIT = 512;

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
}) => Promise<SourceInspectionResponse>;

export function createGenericSourceInspector({
  transport,
}: {
  readonly transport: GuardedPublicTransport;
}): GenericSourceInspector {
  return async ({ source, signal }) => {
    const result = await transport.get({
      source,
      headers: requestHeaders,
      signal,
    });
    if (!result.ok) return { status: "unavailable" };

    const { response } = result;
    try {
      if (
        response.status !== 200 ||
        !isHtml(response.headers["content-type"]) ||
        !isAcceptedEncoding(response.headers["content-encoding"])
      ) {
        return { status: "unavailable" };
      }

      const title = await readDocumentTitle({
        body: decodeBody(
          response.body,
          normalizedEncoding(response.headers["content-encoding"]),
        ),
        characterEncoding: declaredCharacterEncoding(
          response.headers["content-type"],
        ),
        signal,
      });
      return title === null
        ? { status: "unavailable" }
        : {
            status: "suggested",
            title,
            titleEvidence: "document_title",
          };
    } catch {
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

function declaredCharacterEncoding(contentType: string | undefined): string {
  const match =
    /(?:^|;)\s*charset\s*=\s*(?:"([^"]+)"|'([^']+)'|([^;\s]+))/iu.exec(
      contentType ?? "",
    );
  const label = (match?.[1] ?? match?.[2] ?? match?.[3] ?? "utf-8")
    .trim()
    .toLowerCase();
  return label === "iso-8859-1" ? "windows-1252" : label;
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

function isAcceptedEncoding(contentEncoding: string | undefined): boolean {
  return normalizedEncoding(contentEncoding) !== null;
}

async function* decodeBody(
  body: AsyncIterable<Uint8Array>,
  encoding: AcceptedEncoding | null,
): AsyncIterable<Uint8Array> {
  if (encoding === null) return;
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
  const decoded = compressed.pipe(decompressor) as AsyncIterable<Uint8Array>;
  yield* decoded;
}

async function readDocumentTitle({
  body,
  characterEncoding,
  signal,
}: {
  readonly body: AsyncIterable<Uint8Array>;
  readonly characterEncoding: string;
  readonly signal: AbortSignal;
}): Promise<string | null> {
  let decoder: TextDecoder | undefined;
  let encodingPrelude: Uint8Array = new Uint8Array();
  let decompressedBytes = 0;
  let inTitle = false;
  let headClosed = false;
  let title = "";
  const parser = new Parser(
    {
      onopentag: (name) => {
        if (name === "title" && !headClosed) inTitle = true;
        if (name === "body") {
          headClosed = true;
          parser.pause();
        }
      },
      ontext: (text) => {
        if (inTitle) title += text;
      },
      onclosetag: (name) => {
        if (name === "title") inTitle = false;
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
    if (decompressedBytes > DECOMPRESSED_BYTE_LIMIT) return null;
    if (decoder === undefined) {
      encodingPrelude = concatenateBytes(encodingPrelude, chunk);
      if (encodingPrelude.byteLength < 3) continue;
      decoder = new TextDecoder(
        byteOrderMarkEncoding(encodingPrelude) ?? characterEncoding,
      );
      parser.write(decoder.decode(encodingPrelude, { stream: true }));
      encodingPrelude = new Uint8Array();
    } else {
      parser.write(decoder.decode(chunk, { stream: true }));
    }
    if (headClosed) break;
  }
  decoder ??= new TextDecoder(
    byteOrderMarkEncoding(encodingPrelude) ?? characterEncoding,
  );
  if (encodingPrelude.byteLength > 0) {
    parser.write(decoder.decode(encodingPrelude, { stream: true }));
  }
  parser.end(decoder.decode());

  const normalized = title.replace(/\s+/gu, " ").trim();
  if (normalized.length === 0) return null;
  return [...normalized].slice(0, TITLE_CODE_POINT_LIMIT).join("");
}

function byteOrderMarkEncoding(bytes: Uint8Array): string | null {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return "utf-8";
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return "utf-16be";
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return "utf-16le";
  return null;
}

function concatenateBytes(first: Uint8Array, second: Uint8Array): Uint8Array {
  const combined = new Uint8Array(first.byteLength + second.byteLength);
  combined.set(first);
  combined.set(second, first.byteLength);
  return combined;
}
