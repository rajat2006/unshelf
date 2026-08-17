export type DigestFailureCategory =
  | "configuration"
  | "github-evidence"
  | "discord-preflight"
  | "discord-delivery"
  | "actions-summary"
  | "orchestration";

export type AIPresentationFailureReason =
  "timeout" | "request-failure" | "contract-validation";

export class AIPresentationFailure extends Error {
  readonly reason: AIPresentationFailureReason;

  constructor(reason: AIPresentationFailureReason) {
    super("Daily Project Digest AI presentation failed safely.");
    this.reason = reason;
  }
}

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
