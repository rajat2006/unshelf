import { Readable } from "node:stream";
import { createBrotliDecompress, createGunzip, createInflate } from "node:zlib";

export type SourceInspectionContentEncoding =
  "identity" | "gzip" | "deflate" | "br";

export function normalizeSourceInspectionContentEncoding(
  contentEncoding: string | undefined,
): SourceInspectionContentEncoding | null {
  const encoding = contentEncoding?.trim().toLowerCase() || "identity";
  return encoding === "identity" ||
    encoding === "gzip" ||
    encoding === "deflate" ||
    encoding === "br"
    ? encoding
    : null;
}

export async function* decodeSourceInspectionContent({
  body,
  encoding,
}: {
  readonly body: AsyncIterable<Uint8Array>;
  readonly encoding: SourceInspectionContentEncoding;
}): AsyncIterable<Uint8Array> {
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
