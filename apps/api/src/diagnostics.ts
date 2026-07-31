export interface FailureDiagnostics {
  readonly error: Readonly<Record<string, unknown>>;
  readonly database?: Readonly<Record<string, unknown>>;
}

export interface DiagnosticOptions {
  readonly secrets?: readonly string[];
}

export function serializeDiagnosticValue(
  value: unknown,
  options: DiagnosticOptions = {},
): unknown {
  return serializeWithCredentialRedaction(value, options, isCredentialKey);
}

export function serializeDiagnosticQuery(
  value: unknown,
  options: DiagnosticOptions = {},
): unknown {
  return serializeWithCredentialRedaction(value, options, isSignatureParameter);
}

function serializeWithCredentialRedaction(
  value: unknown,
  options: DiagnosticOptions,
  isSensitiveKey: (key: string) => boolean,
): unknown {
  return redactValue(
    value,
    undefined,
    configuredSecrets(options.secrets ?? []),
    new WeakSet(),
    isSensitiveKey,
  );
}

export function serializeFailure(
  error: unknown,
  options: DiagnosticOptions = {},
): FailureDiagnostics {
  const database = isRecord(error)
    ? collectDatabaseDiagnostics(error)
    : undefined;
  const serialized = {
    error: serializeError(error, MAX_CAUSE_DEPTH),
    ...(database === undefined ? {} : { database }),
  };
  return serializeDiagnosticValue(serialized, options) as FailureDiagnostics;
}

function serializeError(
  error: unknown,
  remainingCauseDepth: number,
): Readonly<Record<string, unknown>> {
  if (!(error instanceof Error)) {
    return {
      type: "NonErrorThrow",
      value: error,
    };
  }

  const errorRecord = error as Error & Readonly<Record<string, unknown>>;
  return {
    type: error.constructor.name || error.name,
    ...(errorRecord.code === undefined ? {} : { code: errorRecord.code }),
    message: error.message,
    ...(error.stack === undefined ? {} : { stack: error.stack }),
    ...(remainingCauseDepth > 0 && error.cause !== undefined
      ? {
          cause: serializeError(error.cause, remainingCauseDepth - 1),
        }
      : {}),
  };
}

function collectDatabaseDiagnostics(
  error: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> | undefined {
  const diagnostics: Record<string, unknown> = {};
  const seen = new Set<Readonly<Record<string, unknown>>>();
  let current: Readonly<Record<string, unknown>> | undefined = error;
  let remainingDepth = MAX_CAUSE_DEPTH;

  while (current !== undefined && !seen.has(current) && remainingDepth >= 0) {
    seen.add(current);
    for (const [outputField, inputFields] of DATABASE_DIAGNOSTIC_FIELDS) {
      if (diagnostics[outputField] !== undefined) {
        continue;
      }
      const inputField = inputFields.find(
        (field) => current?.[field] !== undefined,
      );
      if (inputField !== undefined) {
        diagnostics[outputField] = current[inputField];
      }
    }
    current = isRecord(current.cause) ? current.cause : undefined;
    remainingDepth -= 1;
  }
  return Object.keys(diagnostics).length === 0 ? undefined : diagnostics;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null;
}

const DATABASE_DIAGNOSTIC_FIELDS = [
  ["query", ["query"]],
  ["parameters", ["parameters", "params"]],
  ["severity", ["severity"]],
  ["detail", ["detail"]],
  ["hint", ["hint"]],
  ["position", ["position"]],
  ["internalPosition", ["internalPosition"]],
  ["internalQuery", ["internalQuery"]],
  ["where", ["where"]],
  ["schema", ["schema"]],
  ["table", ["table"]],
  ["column", ["column"]],
  ["dataType", ["dataType"]],
  ["constraint", ["constraint"]],
  ["file", ["file"]],
  ["line", ["line"]],
  ["routine", ["routine"]],
] as const;

const MAX_CAUSE_DEPTH = 5;
const REDACTED = "[REDACTED]";

function configuredSecrets(values: readonly string[]): readonly string[] {
  const secrets = new Set(values.filter((value) => value.length > 0));
  for (const value of values) {
    try {
      const url = new URL(value);
      if (url.password.length > 0) {
        secrets.add(url.password);
        secrets.add(decodeURIComponent(url.password));
      }
    } catch {
      // Configured secrets are commonly opaque strings rather than URLs.
    }
  }
  return [...secrets].sort((left, right) => right.length - left.length);
}

function redactValue(
  value: unknown,
  key: string | undefined,
  secrets: readonly string[],
  seen: WeakSet<object>,
  isSensitiveKey: (key: string) => boolean,
): unknown {
  if (key !== undefined && isSensitiveKey(key)) {
    return REDACTED;
  }
  if (value === undefined) {
    return "[undefined]";
  }
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (typeof value === "symbol") {
    return redactString(value.toString(), secrets);
  }
  if (typeof value === "function") {
    return "[Function]";
  }
  if (typeof value === "string") {
    return redactString(value, secrets);
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (value instanceof URL) {
    return redactString(value.toString(), secrets);
  }
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (seen.has(value)) {
    return "[Circular]";
  }
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((entry) =>
      redactValue(entry, undefined, secrets, seen, isSensitiveKey),
    );
  }
  return Object.fromEntries(
    Object.entries(value).map(([entryKey, entryValue]) => [
      entryKey,
      redactValue(
        entryValue,
        entryKey,
        secrets,
        seen,
        isSensitiveKey,
      ),
    ]),
  );
}

function redactString(value: string, secrets: readonly string[]): string {
  let redacted = value;
  for (const secret of secrets) {
    redacted = redacted.replaceAll(secret, REDACTED);
  }

  redacted = redacted.replace(URL_PATTERN, (candidate) =>
    sanitizeUrl(candidate),
  );
  redacted = redacted.replace(
    /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi,
    `$1 ${REDACTED}`,
  );
  redacted = redacted.replace(
    /\b(Cookie|Set-Cookie)\s*:\s*[^\r\n]*/gi,
    `$1: ${REDACTED}`,
  );
  redacted = redacted.replace(
    /\b(password|passphrase|(?:access|refresh|session|bearer)[\s_-]*token|token|api[\s_-]*key|secret[\s_-]*key|client[\s_-]*secret|cookies?|set[\s_-]*cookie|clerk[\s_-]*user[\s_-]*id)\s*([=:])\s*(?:"[^"]*"|'[^']*'|[^\s&,;]+)/gi,
    `$1$2${REDACTED}`,
  );
  return redacted.replace(CLERK_USER_ID_PATTERN, REDACTED);
}

function sanitizeUrl(candidate: string): string {
  try {
    const url = new URL(candidate);
    if (url.username.length > 0) {
      url.username = REDACTED;
    }
    if (url.password.length > 0) {
      url.password = REDACTED;
    }
    for (const key of url.searchParams.keys()) {
      if (isSignatureParameter(key)) {
        url.searchParams.set(key, REDACTED);
      }
    }
    return url.toString().replaceAll("%5BREDACTED%5D", REDACTED);
  } catch {
    return candidate;
  }
}

function isCredentialKey(key: string): boolean {
  const normalized = normalizeKey(key);
  return (
    normalized === "authorization" ||
    normalized === "proxyauthorization" ||
    normalized === "cookie" ||
    normalized === "cookies" ||
    normalized === "setcookie" ||
    normalized === "clerkuserid" ||
    normalized === "externaluserid" ||
    normalized === "externalidentityid" ||
    normalized === "authentication" ||
    normalized === "auth" ||
    normalized.includes("credential") ||
    normalized.includes("password") ||
    normalized.includes("passphrase") ||
    normalized.includes("token") ||
    normalized.includes("secret") ||
    normalized.endsWith("apikey") ||
    normalized.includes("secretkey") ||
    normalized === "accesskey" ||
    normalized === "accesskeyid" ||
    normalized === "privatekey" ||
    normalized === "signingkey" ||
    normalized === "encryptionkey" ||
    normalized === "databaseurl" ||
    normalized === "databaseuri" ||
    normalized === "connectionstring" ||
    normalized === "connectionurl" ||
    normalized === "connectionuri"
  );
}

function isSignatureParameter(key: string): boolean {
  const normalized = normalizeKey(key);
  return (
    isCredentialKey(key) ||
    normalized === "key" ||
    normalized === "signature" ||
    normalized === "sig" ||
    normalized === "xamzsignature" ||
    normalized === "xgoogsignature"
  );
}

function normalizeKey(key: string): string {
  return key.toLowerCase().replaceAll(/[^a-z0-9]/g, "");
}

const URL_PATTERN =
  /\b(?:https?|postgres(?:ql)?):\/\/[^\s<>"'`]+/gi;
const CLERK_USER_ID_PATTERN =
  /\buser_(?=[A-Za-z0-9]{12,}\b)(?=[A-Za-z0-9]*\d)[A-Za-z0-9]+\b/g;
