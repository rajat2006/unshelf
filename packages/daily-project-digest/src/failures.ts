export type DigestFailureCategory =
  | "configuration"
  | "github-evidence"
  | "discord-preflight"
  | "discord-delivery"
  | "actions-summary"
  | "orchestration";

export type AIPresentationFailureReason =
  | "request-timeout"
  | "request-network"
  | "request-unexpected"
  | "response-http-authentication"
  | "response-http-rate-limit"
  | "response-http-client"
  | "response-http-provider"
  | "response-body-json"
  | "response-incomplete"
  | "response-envelope"
  | "response-refusal"
  | "response-output-text"
  | "response-output-json"
  | "contract-envelope"
  | "contract-schema-version"
  | "contract-items"
  | "contract-item-shape"
  | "contract-sentence-whitespace"
  | "contract-sentence-length"
  | "contract-sentence-control"
  | "contract-sentence-list"
  | "contract-sentence-punctuation"
  | "contract-sentence-opening"
  | "contract-sentence-url"
  | "contract-sentence-markdown"
  | "contract-sentence-mention"
  | "contract-sentence-lifecycle"
  | "contract-sentence-prompt-control"
  | "contract-duplicate-subject"
  | "contract-unknown-subject"
  | "contract-citation"
  | "contract-subject-set"
  | "contract-unexpected";

export class AIPresentationFailure extends Error {
  readonly reason: AIPresentationFailureReason;
  readonly subjectId: string | undefined;

  constructor({
    reason,
    subjectId,
  }: {
    reason: AIPresentationFailureReason;
    subjectId?: string;
  }) {
    super("Daily Project Digest AI presentation failed safely.");
    this.reason = reason;
    this.subjectId = subjectId;
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
