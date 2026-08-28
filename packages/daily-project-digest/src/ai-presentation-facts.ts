export const aiPresentationFactIds = [
  "title",
  "summary",
  "verification",
] as const;

export type AIPresentationFactId = (typeof aiPresentationFactIds)[number];
