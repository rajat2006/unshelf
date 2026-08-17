const TITLE_CODE_POINT_LIMIT = 512;

export function normalizeSuggestionTitle(value: string): string | null {
  const normalized = value.replace(/\s+/gu, " ").trim();
  if (normalized.length === 0) return null;
  return [...normalized].slice(0, TITLE_CODE_POINT_LIMIT).join("");
}
