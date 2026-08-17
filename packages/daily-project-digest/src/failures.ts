export type DigestFailureCategory =
  | "configuration"
  | "github-evidence"
  | "discord-preflight"
  | "discord-delivery"
  | "actions-summary"
  | "orchestration";

export class DigestFailure extends Error {
  readonly category: DigestFailureCategory;

  constructor({
    category,
    message,
  }: {
    category: DigestFailureCategory;
    message: string;
  }) {
    super(message);
    this.category = category;
  }
}

export function digestFailureCategory(error: unknown): DigestFailureCategory {
  return error instanceof DigestFailure ? error.category : "orchestration";
}
