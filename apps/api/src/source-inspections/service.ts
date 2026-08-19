import {
  SOURCE_INSPECTION_SOURCE_BYTE_LIMIT,
  type SourceInspectionResponse,
  type UserId,
} from "@unshelf/shared";
import { performance } from "node:perf_hooks";
import {
  classifySource,
  normalizeSourceHostname,
  sourceHostname,
  sourceInspectionStrategy,
  type SourceClassification,
} from "./classifier";
import type {
  GenericInspectionDiagnostics,
  GenericSourceInspector,
} from "./inspectors/generic-inspector";
import type {
  AdmitInspectionDestination,
  ByteCountBucket,
  RedirectCountBucket,
  SourceInspectionPhaseTimings,
} from "./transport/guarded-transport";
import {
  createSourceInspectionAdmissionGate,
  type SourceInspectionAdmissionGate,
} from "./admission-gate";
import {
  YOUTUBE_OEMBED_HOSTNAME,
  type YouTubeTitleInspector,
} from "./inspectors/youtube-title-inspector";

export interface InspectSourceInput {
  readonly source: string;
  readonly userId: UserId;
  readonly signal: AbortSignal;
  /** Request-scoped sink; production supplies the correlated restricted logger. */
  readonly observeCompletion?: (completion: SourceInspectionCompletion) => void;
}

export type SourceInspectionStrategy = "youtube" | "generic";
export type SourceInspectionTerminalCode =
  | "suggested"
  | "unsupported"
  | "unsafe"
  | "refused"
  | "timeout"
  | "limit"
  | "overload"
  | "origin"
  | "no_metadata"
  | "cancelled"
  | "unexpected";

export interface SourceInspectionCompletion {
  readonly strategy: SourceInspectionStrategy;
  readonly terminalCode: SourceInspectionTerminalCode;
  readonly suggestedTitle: boolean;
  readonly suggestedType: boolean;
  readonly durationMs: number;
  readonly phaseTimingsMs: SourceInspectionPhaseTimings;
  readonly redirectCountBucket: RedirectCountBucket;
  readonly byteCountBucket: ByteCountBucket;
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
  readonly deniedHostnames?: ReadonlySet<string>;
  readonly admissionGate?: SourceInspectionAdmissionGate;
  readonly monotonicNow?: () => number;
  readonly classify?: (source: string) => SourceClassification;
  readonly inspectGeneric?: GenericSourceInspector;
  readonly inspectYouTubeTitle?: YouTubeTitleInspector;
}

const unavailable: SourceInspectionServiceResult = {
  ok: true,
  response: { status: "unavailable" },
};

/** Stateless orchestration boundary for ephemeral Capture suggestions. */
export function createSourceInspectionService({
  disabled = false,
  youtubeTitlesDisabled = false,
  deniedHostnames = new Set(),
  admissionGate = createSourceInspectionAdmissionGate(),
  monotonicNow = () => performance.now(),
  classify = classifySource,
  inspectGeneric = () => Promise.resolve({ status: "unavailable" }),
  inspectYouTubeTitle = () => Promise.resolve(null),
}: SourceInspectionServiceOptions = {}): SourceInspectionService {
  return {
    inspect: async (input) => {
      const startedAt = monotonicNow();
      const initialStrategy = sourceInspectionStrategy(input.source);
      let diagnosticTerminalCode: SourceInspectionTerminalCode | undefined;
      let redirectCountBucket: SourceInspectionCompletion["redirectCountBucket"] =
        initialStrategy === "youtube" ? "0" : "unknown";
      let byteCountBucket: SourceInspectionCompletion["byteCountBucket"] =
        initialStrategy === "youtube" ? "0" : "unknown";
      let phaseTimingsMs: SourceInspectionPhaseTimings = {};
      const reportDiagnostics = (
        update: GenericInspectionDiagnostics,
      ): void => {
        diagnosticTerminalCode = update.terminalCode ?? diagnosticTerminalCode;
        redirectCountBucket = update.redirectCountBucket ?? redirectCountBucket;
        byteCountBucket = update.byteCountBucket ?? byteCountBucket;
        phaseTimingsMs = addPhaseTimings({
          total: phaseTimingsMs,
          update: update.phaseTimingsMs,
        });
      };
      const complete = (
        result: SourceInspectionServiceResult,
        terminalCode: SourceInspectionTerminalCode,
        strategy = initialStrategy,
      ): SourceInspectionServiceResult => {
        const response = result.ok ? result.response : undefined;
        try {
          input.observeCompletion?.({
            strategy,
            terminalCode,
            suggestedTitle:
              response?.status === "suggested" && "title" in response,
            suggestedType:
              response?.status === "suggested" && "type" in response,
            durationMs: Math.max(0, monotonicNow() - startedAt),
            phaseTimingsMs,
            redirectCountBucket,
            byteCountBucket,
          });
        } catch {
          // Diagnostics must never change Capture availability.
        }
        return result;
      };

      if (disabled) {
        return complete(unavailable, "refused");
      }
      if (input.signal.aborted) return complete(unavailable, "cancelled");
      if (
        new TextEncoder().encode(input.source).byteLength >
        SOURCE_INSPECTION_SOURCE_BYTE_LIMIT
      ) {
        return complete(unavailable, "limit");
      }

      const hostname = sourceHostname(input.source);
      if (hostname === null) return complete(unavailable, "unsupported");
      if (deniedHostnames.has(hostname)) {
        return complete(unavailable, "refused");
      }

      let classification: SourceClassification;
      try {
        classification = classify(input.source);
      } catch {
        return complete(
          { ok: false, error: "source_inspection_failed" },
          "unexpected",
        );
      }
      const strategy =
        classification.classification === "generic" ? "generic" : "youtube";
      const initialDestination =
        classification.classification === "youtube" &&
        "canonicalSource" in classification &&
        !youtubeTitlesDisabled
          ? YOUTUBE_OEMBED_HOSTNAME
          : hostname;
      if (deniedHostnames.has(initialDestination)) {
        return complete(unavailable, "refused", strategy);
      }
      const admission = admissionGate.tryAcquire({
        userId: input.userId,
        hostname: initialDestination,
      });
      if (!admission.ok) {
        return complete(
          unavailable,
          admission.error === "rate_limited" ? "refused" : "overload",
          strategy,
        );
      }
      let destinationPolicyTerminal: "refused" | "overload" | undefined;
      const admitDestination: AdmitInspectionDestination = ({
        hostname: destination,
      }) => {
        const normalized = normalizeSourceHostname(destination);
        if (deniedHostnames.has(normalized)) {
          destinationPolicyTerminal = "refused";
          return "refused";
        }
        if (!admission.permit.tryMoveToHostname(normalized)) {
          destinationPolicyTerminal = "overload";
          return "overload";
        }
        return "allowed";
      };

      try {
        if (classification.classification === "generic") {
          const result: SourceInspectionServiceResult = {
            ok: true,
            response: await inspectGeneric({
              source: input.source,
              signal: input.signal,
              admitDestination,
              reportDiagnostics,
            }),
          };
          return complete(
            result,
            input.signal.aborted
              ? "cancelled"
              : result.response.status === "suggested"
                ? "suggested"
                : (diagnosticTerminalCode ?? "no_metadata"),
            "generic",
          );
        }
        if (classification.classification === "unsupported_youtube") {
          return complete(unavailable, "unsupported", "youtube");
        }
        let title: string | null = null;
        if (!youtubeTitlesDisabled && "canonicalSource" in classification) {
          try {
            title = await inspectYouTubeTitle({
              canonicalSource: classification.canonicalSource,
              signal: input.signal,
              admitDestination,
              reportDiagnostics,
            });
          } catch {
            // Title acquisition is optional; local route Type remains useful.
            diagnosticTerminalCode = input.signal.aborted
              ? "cancelled"
              : "unexpected";
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
        if (destinationPolicyTerminal !== undefined) {
          return complete(unavailable, destinationPolicyTerminal, "youtube");
        }
        return complete(
          { ok: true, response },
          input.signal.aborted
            ? "cancelled"
            : title === null && diagnosticTerminalCode !== undefined
              ? diagnosticTerminalCode
              : "suggested",
          "youtube",
        );
      } catch {
        return complete(
          input.signal.aborted
            ? unavailable
            : { ok: false, error: "source_inspection_failed" },
          input.signal.aborted ? "cancelled" : "unexpected",
          strategy,
        );
      } finally {
        admission.permit.release();
      }
    },
  };
}

function addPhaseTimings({
  total,
  update,
}: {
  readonly total: SourceInspectionPhaseTimings;
  readonly update: SourceInspectionPhaseTimings | undefined;
}): SourceInspectionPhaseTimings {
  if (update === undefined) return total;
  const accumulated: Record<string, number> = { ...total };
  for (const phase of [
    "dns",
    "connection",
    "responseHeaders",
    "body",
  ] as const) {
    if (update[phase] !== undefined) {
      accumulated[phase] = (total[phase] ?? 0) + update[phase];
    }
  }
  return accumulated;
}

export function parseSourceInspectionDeniedHostnames(
  value: string | undefined,
): ReadonlySet<string> {
  return new Set(
    (value ?? "")
      .split(",")
      .map((hostname) => normalizeSourceHostname(hostname.trim()))
      .filter((hostname) => hostname.length > 0),
  );
}

export function parseSourceInspectionDisabled(
  value: string | undefined,
): boolean {
  return value !== "false";
}
