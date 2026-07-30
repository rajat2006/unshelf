import { expect } from "vitest";

export function anyValue(constructor: unknown): unknown {
  return expect.any(constructor) as unknown;
}

export function objectContaining(
  expected: Readonly<Record<string, unknown>>,
): unknown {
  return expect.objectContaining(expected) as unknown;
}

export function stringMatching(expected: string | RegExp): unknown {
  return expect.stringMatching(expected) as unknown;
}

export function parseJsonRecord(serialized: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(serialized);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new TypeError("Expected a JSON object");
  }
  return parsed as Record<string, unknown>;
}
