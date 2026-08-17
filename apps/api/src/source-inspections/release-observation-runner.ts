import type { SourceInspectionResponse } from "@unshelf/shared";
import type {
  SourceInspectionReleaseCase,
  SourceInspectionReleaseClass,
} from "./release-evaluation";
import type {
  SourceInspectionCompletion,
  SourceInspectionServiceResult,
  SourceInspectionTerminalCode,
} from "./service";

export interface SourceInspectionReleaseObservation {
  readonly caseId: string;
  readonly sourceClass: SourceInspectionReleaseClass;
  readonly response: SourceInspectionResponse;
  readonly completion: SourceInspectionCompletion;
  readonly callerDurationMs: number;
}

export type InspectSourceForRelease = (input: {
  readonly source: string;
  readonly signal: AbortSignal;
  readonly observeCompletion: (completion: SourceInspectionCompletion) => void;
}) => Promise<SourceInspectionServiceResult>;

export interface SourceInspectionReleaseRuntime {
  readonly nowMilliseconds: () => number;
  readonly wait: (delayMs: number) => Promise<void>;
  readonly schedule: (input: {
    readonly delayMs: number;
    readonly callback: () => void;
  }) => () => void;
}

export async function collectSourceInspectionReleaseObservations({
  cases,
  inspect,
  runtime,
}: {
  readonly cases: readonly SourceInspectionReleaseCase[];
  readonly inspect: InspectSourceForRelease;
  readonly runtime: SourceInspectionReleaseRuntime;
}): Promise<SourceInspectionReleaseObservation[]> {
  const observations: SourceInspectionReleaseObservation[] = [];
  let lastStartedAt: number | undefined;
  for (const releaseCase of cases) {
    for (let observation = 0; observation < 3; observation += 1) {
      if (lastStartedAt !== undefined) {
        const untilNextStart = Math.max(
          0,
          lastStartedAt + 3_000 - runtime.nowMilliseconds(),
        );
        if (untilNextStart > 0) await runtime.wait(untilNextStart);
      }
      const startedAt = runtime.nowMilliseconds();
      lastStartedAt = startedAt;
      observations.push(
        await observeReleaseCase({ releaseCase, inspect, runtime, startedAt }),
      );
    }
  }
  return observations;
}

async function observeReleaseCase({
  releaseCase,
  inspect,
  runtime,
  startedAt,
}: {
  readonly releaseCase: SourceInspectionReleaseCase;
  readonly inspect: InspectSourceForRelease;
  readonly runtime: SourceInspectionReleaseRuntime;
  readonly startedAt: number;
}): Promise<SourceInspectionReleaseObservation> {
  const controller = new AbortController();
  let completion: SourceInspectionCompletion | undefined;
  let cancelDeadline = (): void => undefined;
  const timedOut = new Promise<{
    readonly response: SourceInspectionResponse;
    readonly completion: SourceInspectionCompletion;
  }>((resolve) => {
    const finish = (): void => {
      controller.abort(new Error("Source inspection release deadline"));
      resolve({
        response: { status: "unavailable" },
        completion: syntheticCompletion({
          sourceClass: releaseCase.sourceClass,
          terminalCode: "timeout",
          durationMs: 3_000,
        }),
      });
    };
    cancelDeadline = runtime.schedule({ delayMs: 3_000, callback: finish });
  });
  const inspected = Promise.resolve()
    .then(() =>
      inspect({
        source: releaseCase.source,
        signal: controller.signal,
        observeCompletion: (value) => {
          completion = value;
        },
      }),
    )
    .then((result) => ({
      response: result.ok
        ? result.response
        : ({ status: "unavailable" } as const),
      completion:
        completion ??
        syntheticCompletion({
          sourceClass: releaseCase.sourceClass,
          terminalCode: "unexpected",
          durationMs: Math.max(0, runtime.nowMilliseconds() - startedAt),
        }),
    }))
    .catch(() => ({
      response: { status: "unavailable" } as const,
      completion: syntheticCompletion({
        sourceClass: releaseCase.sourceClass,
        terminalCode: controller.signal.aborted ? "cancelled" : "unexpected",
        durationMs: Math.max(0, runtime.nowMilliseconds() - startedAt),
      }),
    }));
  const result = await Promise.race([inspected, timedOut]);
  cancelDeadline();
  return {
    caseId: releaseCase.id,
    sourceClass: releaseCase.sourceClass,
    response: result.response,
    completion: result.completion,
    callerDurationMs: Math.max(0, runtime.nowMilliseconds() - startedAt),
  };
}

function syntheticCompletion({
  sourceClass,
  terminalCode,
  durationMs,
}: {
  readonly sourceClass: SourceInspectionReleaseClass;
  readonly terminalCode: SourceInspectionTerminalCode;
  readonly durationMs: number;
}): SourceInspectionCompletion {
  return {
    strategy: sourceClass.startsWith("generic_") ? "generic" : "youtube",
    terminalCode,
    suggestedTitle: false,
    suggestedType: false,
    durationMs,
    phaseTimingsMs: {},
    redirectCountBucket: "unknown",
    byteCountBucket: "unknown",
  };
}
