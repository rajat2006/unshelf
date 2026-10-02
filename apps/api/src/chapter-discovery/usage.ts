import { outputEntries, record } from "./response";
import { model } from "./model";

function count(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : null;
}
export function usageFields(raw: unknown) {
  const envelope = record(raw);
  const usage = record(envelope.usage);
  const inputTokens = count(usage.input_tokens);
  const cachedTokens = count(record(usage.input_tokens_details).cached_tokens);
  const outputTokens = count(usage.output_tokens);
  const searchCalls = Array.isArray(envelope.output)
    ? outputEntries(raw).filter((entry) => entry.type === "web_search_call")
        .length
    : null;
  // Never copy arbitrary provider strings into logs. Unknown models have unknown prices.
  const returnedModel = envelope.model === model ? model : null;
  const estimatedUsd =
    returnedModel !== null &&
    inputTokens !== null &&
    cachedTokens !== null &&
    cachedTokens <= inputTokens &&
    outputTokens !== null &&
    searchCalls !== null
      ? ((inputTokens - cachedTokens) * 0.2 +
          cachedTokens * 0.02 +
          outputTokens * 1.2) /
          1_000_000 +
        searchCalls * 0.01
      : null;
  return {
    requestedModel: model,
    returnedModel,
    inputTokens,
    cachedTokens,
    outputTokens,
    searchCalls,
    estimatedUsd,
    pricingVersion: "openai-2026-09-07",
  };
}
