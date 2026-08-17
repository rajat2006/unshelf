import type { SourceInspectionResponse, UserId } from "@unshelf/shared";
import { classifySource, type SourceClassification } from "./classifier";
import type { YouTubeTitleInspector } from "./youtube-title-inspector";

export interface InspectSourceInput {
  readonly source: string;
  readonly userId: UserId;
  readonly signal: AbortSignal;
}

export type SourceInspectionServiceResult =
  | { ok: true; response: SourceInspectionResponse }
  | { ok: false; error: string };

export interface SourceInspectionService {
  inspect(input: InspectSourceInput): Promise<SourceInspectionServiceResult>;
}

interface SourceInspectionServiceOptions {
  readonly disabled?: boolean;
  readonly youtubeTitlesDisabled?: boolean;
  readonly classify?: (source: string) => SourceClassification;
  readonly inspectGeneric?: (input: {
    readonly source: string;
    readonly signal: AbortSignal;
  }) => Promise<SourceInspectionResponse>;
  readonly inspectYouTubeTitle?: YouTubeTitleInspector;
}

const SOURCE_BYTE_LIMIT = 8 * 1024;
const unavailable: SourceInspectionServiceResult = {
  ok: true,
  response: { status: "unavailable" },
};

/** Stateless orchestration boundary for ephemeral Capture suggestions. */
export function createSourceInspectionService({
  disabled = false,
  youtubeTitlesDisabled = false,
  classify = classifySource,
  inspectGeneric = () => Promise.resolve({ status: "unavailable" }),
  inspectYouTubeTitle = () => Promise.resolve(null),
}: SourceInspectionServiceOptions = {}): SourceInspectionService {
  return {
    inspect: async (input) => {
      if (
        disabled ||
        input.signal.aborted ||
        new TextEncoder().encode(input.source).byteLength > SOURCE_BYTE_LIMIT
      ) {
        return unavailable;
      }

      try {
        const classification = classify(input.source);
        if (classification.classification === "generic") {
          return {
            ok: true,
            response: await inspectGeneric({
              source: input.source,
              signal: input.signal,
            }),
          };
        }
        if (classification.classification === "unsupported_youtube") {
          return unavailable;
        }
        let title: string | null = null;
        if (!youtubeTitlesDisabled && "canonicalSource" in classification) {
          try {
            title = await inspectYouTubeTitle({
              canonicalSource: classification.canonicalSource,
              signal: input.signal,
            });
          } catch {
            // Title acquisition is optional; local route Type remains useful.
          }
        }
        const typeSuggestion = {
          status: "suggested" as const,
          type: classification.type,
          typeEvidence: "youtube_route" as const,
        };
        const response: SourceInspectionResponse =
          title === null
            ? typeSuggestion
            : {
                ...typeSuggestion,
                title,
                titleEvidence: "youtube_oembed",
              };
        return { ok: true, response };
      } catch {
        return {
          ok: false,
          error: "source_inspection_failed",
        };
      }
    },
  };
}
