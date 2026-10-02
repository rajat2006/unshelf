import { Type } from "@unshelf/shared";
import { randomUUID } from "node:crypto";
import type { ChapterDiscoveryResult, ItemId, UserId } from "@unshelf/shared";
import type { Database } from "../db";
import type { Logger } from "../logging";
import { getItem } from "../items/repository";
import { reserve, release } from "./admission";
import { validateResponse } from "./response";
import { callResponses, modelRequest, ProviderFailure } from "./model";
import { usageFields } from "./usage";

export type ModelCall = (input: {
  request: Record<string, unknown>;
  signal: AbortSignal;
  apiKey: string;
}) => Promise<unknown>;
export type ChapterDiscovery = (input: {
  userId: UserId;
  itemId: ItemId;
  signal: AbortSignal;
  requestId?: string;
}) => Promise<ChapterDiscoveryResult>;

export function createChapterDiscovery({
  db,
  apiKey,
  modelCall = callResponses,
  logger,
  now,
}: {
  db: Database;
  apiKey?: string;
  modelCall?: ModelCall;
  logger: Logger;
  now?: () => Date;
}): ChapterDiscovery {
  return async ({ userId, itemId, signal, requestId = randomUUID() }) => {
    const item = await getItem(db, userId, itemId);
    if (!item) return { ok: false, error: "not_found" };
    if (item.type !== Type.Book || item.parts.length)
      return { ok: false, error: "ineligible" };
    if (!apiKey?.trim()) return { ok: false, error: "missing_configuration" };
    if (signal.aborted) return { ok: false, error: "cancelled" };
    const claim = randomUUID();
    if (!(await reserve({ db, userId, claim, now: now?.() })))
      return { ok: false, error: "usage_limit" };
    let dispatched = false;
    let raw: unknown;
    let result: ChapterDiscoveryResult = {
      ok: false,
      error: "provider_failure",
    };
    let providerCode: string | null = null;
    const started = performance.now();
    const controller = new AbortController();
    const cancel = () => controller.abort();
    signal.addEventListener("abort", cancel, { once: true });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 60_000);
    let abortListener: () => void = () => {};
    try {
      if (signal.aborted) {
        result = { ok: false, error: "cancelled" };
        return result;
      }
      const aborted = new Promise<never>((_, reject) => {
        abortListener = () => reject(new Error("attempt_aborted"));
        controller.signal.addEventListener("abort", abortListener, {
          once: true,
        });
      });
      dispatched = true;
      // Race also bounds dependencies that ignore abort; late settlement is never delivered.
      raw = await Promise.race([
        modelCall({
          apiKey,
          signal: controller.signal,
          request: modelRequest(item.title),
        }),
        aborted,
      ]);
      result = validateResponse(raw);
    } catch (error) {
      providerCode = error instanceof ProviderFailure ? error.code : null;
      result = {
        ok: false,
        error: timedOut
          ? "timeout"
          : signal.aborted
            ? "cancelled"
            : providerCode === "invalid_body"
              ? "malformed_output"
              : "provider_failure",
      };
    } finally {
      clearTimeout(timer);
      signal.removeEventListener("abort", cancel);
      controller.signal.removeEventListener("abort", abortListener);
      if (dispatched) {
        const usage = usageFields(raw);
        const fields = {
          attemptId: claim,
          requestId,
          ...usage,
          elapsedMs: performance.now() - started,
          outcome: result.ok ? result.preview.kind : result.error,
          providerCode,
        };
        logger.info({
          event: "unshelf.chapters.attempt.ended",
          msg: "Chapter research ended",
          ...fields,
        });
        if (usage.estimatedUsd !== null && usage.estimatedUsd > 0.1)
          logger.warn({
            event: "unshelf.chapters.cost.over_target",
            msg: "Chapter research exceeded monitored target",
            ...fields,
          });
      }
      await release({ db, userId, claim, undispatched: !dispatched });
    }
    return result;
  };
}
