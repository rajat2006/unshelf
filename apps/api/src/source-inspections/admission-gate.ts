import type { UserId } from "@unshelf/shared";
import { performance } from "node:perf_hooks";

export interface SourceInspectionPermit {
  readonly tryMoveToHostname: (hostname: string) => boolean;
  readonly release: () => void;
}

export type SourceInspectionAdmission =
  | { readonly ok: true; readonly permit: SourceInspectionPermit }
  | { readonly ok: false; readonly error: "overload" | "rate_limited" };

export interface SourceInspectionAdmissionGate {
  tryAcquire(input: {
    readonly userId: UserId;
    readonly hostname: string;
  }): SourceInspectionAdmission;
}

const MAX_ACTIVE_PER_USER = 2;
const MAX_ACTIVE_PER_HOST = 2;
const MAX_ACTIVE_PROCESS = 16;
const USER_BUCKET_CAPACITY = 5;
const USER_TOKEN_REFILL_PER_MS = 20 / 60_000;

export function createSourceInspectionAdmissionGate({
  now = () => performance.now(),
}: {
  readonly now?: () => number;
} = {}): SourceInspectionAdmissionGate {
  const activeByUser = new Map<UserId, number>();
  const activeByHost = new Map<string, number>();
  const buckets = new Map<UserId, { tokens: number; lastRefillMs: number }>();
  let activeProcess = 0;

  return {
    tryAcquire: ({ userId, hostname }) => {
      if (
        (activeByUser.get(userId) ?? 0) >= MAX_ACTIVE_PER_USER ||
        (activeByHost.get(hostname) ?? 0) >= MAX_ACTIVE_PER_HOST ||
        activeProcess >= MAX_ACTIVE_PROCESS
      ) {
        return { ok: false, error: "overload" };
      }

      const nowMs = now();
      const previous = buckets.get(userId) ?? {
        tokens: USER_BUCKET_CAPACITY,
        lastRefillMs: nowMs,
      };
      const tokens = Math.min(
        USER_BUCKET_CAPACITY,
        previous.tokens +
          Math.max(0, nowMs - previous.lastRefillMs) * USER_TOKEN_REFILL_PER_MS,
      );
      if (tokens < 1) {
        buckets.set(userId, { tokens, lastRefillMs: nowMs });
        return { ok: false, error: "rate_limited" };
      }
      buckets.set(userId, { tokens: tokens - 1, lastRefillMs: nowMs });

      increment(activeByUser, userId);
      increment(activeByHost, hostname);
      activeProcess += 1;
      let released = false;
      let currentHostname = hostname;
      return {
        ok: true,
        permit: {
          tryMoveToHostname: (nextHostname) => {
            if (released) return false;
            if (nextHostname === currentHostname) return true;
            if ((activeByHost.get(nextHostname) ?? 0) >= MAX_ACTIVE_PER_HOST) {
              return false;
            }
            decrement(activeByHost, currentHostname);
            increment(activeByHost, nextHostname);
            currentHostname = nextHostname;
            return true;
          },
          release: () => {
            if (released) return;
            released = true;
            decrement(activeByUser, userId);
            decrement(activeByHost, currentHostname);
            activeProcess -= 1;
          },
        },
      };
    },
  };
}

function increment<Key>(counts: Map<Key, number>, key: Key): void {
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

function decrement<Key>(counts: Map<Key, number>, key: Key): void {
  const next = (counts.get(key) ?? 1) - 1;
  if (next === 0) counts.delete(key);
  else counts.set(key, next);
}
