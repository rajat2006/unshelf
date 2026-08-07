export type AdapterResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: "unavailable" | "rejected" | "ambiguous" };

export type Clock = {
  nowMilliseconds(): number;
  sleep?(milliseconds: number): Promise<void>;
};

export function readClock(clock: Clock): number | undefined {
  try {
    const value = clock.nowMilliseconds();
    return Number.isFinite(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

export function elapsedMilliseconds({
  startedAt,
  finishedAt,
}: {
  startedAt: number;
  finishedAt: number;
}): number {
  return Math.max(0, finishedAt - startedAt);
}

export function writeStructuredFailure({
  write,
  code,
  message,
  durationMs,
  evidence,
}: {
  write: (line: string) => void;
  code: string;
  message: string;
  durationMs: number;
  evidence?: Record<string, string>;
}): number {
  write(
    JSON.stringify({
      ok: false,
      error: { code, message },
      ...(evidence === undefined ? {} : { evidence }),
      durationMs,
    }),
  );
  return 1;
}
