import type { ChapterDiscoveryResult } from "@unshelf/shared";
import { chapterPreviewSchema } from "@unshelf/shared/validation";

export function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
export function outputEntries(raw: unknown): Record<string, unknown>[] {
  const output = record(raw).output;
  return Array.isArray(output) ? output.map(record) : [];
}
export function validateResponse(raw: unknown): ChapterDiscoveryResult {
  const envelope = record(raw);
  const fail = (
    error: Extract<ChapterDiscoveryResult, { ok: false }>["error"],
  ): ChapterDiscoveryResult => ({ ok: false, error });
  if (envelope.status === "failed") return fail("provider_failure");
  if (envelope.status === "incomplete") return fail("incomplete_output");
  if (envelope.status !== "completed") return fail("malformed_output");
  const output = outputEntries(raw);
  const messages = output.filter((entry) => entry.type === "message");
  const content = messages.flatMap((entry) =>
    Array.isArray(entry.content) ? entry.content.map(record) : [],
  );
  if (content.some((entry) => entry.type === "refusal"))
    return fail("provider_refusal");
  const searches = output.filter(
    (entry) => entry.type === "web_search_call" && entry.status === "completed",
  );
  if (
    !searches.length ||
    messages.length !== 1 ||
    content.length !== 1 ||
    content[0].type !== "output_text" ||
    typeof content[0].text !== "string" ||
    content[0].text.length > 500_000
  )
    return fail("malformed_output");
  const consulted = new Set(
    searches.flatMap((entry) => {
      const sources = record(entry.action).sources;
      return Array.isArray(sources)
        ? sources
            .map((source) => record(source).url)
            .filter((url): url is string => typeof url === "string")
        : [];
    }),
  );
  try {
    const parsed = chapterPreviewSchema.safeParse(
      JSON.parse(content[0].text) as unknown,
    );
    if (!parsed.success) return fail("malformed_output");
    const preview = parsed.data;
    const ids = new Set(preview.sources.map((source) => source.id));
    if (
      ids.size !== preview.sources.length ||
      preview.sources.some((source) => !consulted.has(source.url)) ||
      preview.chapters.some((chapter) =>
        chapter.evidence.some((id) => !ids.has(id)),
      )
    )
      return fail("malformed_output");
    if (preview.kind === "suggestions") {
      if (
        !preview.title ||
        preview.reason !== null ||
        !preview.chapters.length ||
        !preview.sources.length
      )
        return fail("malformed_output");
    } else if (!preview.reason || preview.chapters.length)
      return fail("malformed_output");
    return { ok: true, preview };
  } catch {
    return fail("malformed_output");
  }
}
