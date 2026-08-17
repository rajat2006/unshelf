import type { SourceInspectionResponse, UserId } from "@unshelf/shared";
import { classifySource, type SourceClassification } from "./classifier";

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
  readonly classify?: (source: string) => SourceClassification;
}

const SOURCE_BYTE_LIMIT = 8 * 1024;
const unavailable: SourceInspectionServiceResult = {
  ok: true,
  response: { status: "unavailable" },
};

/** Stateless orchestration boundary for ephemeral Capture suggestions. */
export function createSourceInspectionService({
  disabled = false,
  classify = classifySource,
}: SourceInspectionServiceOptions = {}): SourceInspectionService {
  return {
    inspect: (input) => {
      if (
        disabled ||
        input.signal.aborted ||
        new TextEncoder().encode(input.source).byteLength > SOURCE_BYTE_LIMIT
      ) {
        return Promise.resolve(unavailable);
      }

      try {
        const classification = classify(input.source);
        if (classification.classification !== "youtube") {
          return Promise.resolve(unavailable);
        }
        return Promise.resolve({
          ok: true,
          response: {
            status: "suggested",
            type: classification.type,
            typeEvidence: "youtube_route",
          },
        });
      } catch {
        return Promise.resolve({
          ok: false,
          error: "source_inspection_failed",
        });
      }
    },
  };
}
