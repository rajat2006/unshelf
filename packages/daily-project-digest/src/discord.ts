import type { DiscordPayload } from "./index.js";
import { asRecord, sleep } from "./provider-support.js";

type DiscordWebhookInput = {
  webhookUrl: string;
};

const maximumAttempts = 3;
const transientBackoffMilliseconds = [1_000, 2_000] as const;

export function createDiscordWebhookAdapter(input: DiscordWebhookInput): {
  deliver(payload: DiscordPayload): Promise<void>;
} {
  const webhookUrl = parseWebhookUrl(input.webhookUrl);

  return {
    deliver: (payload) => deliver({ webhookUrl, payload }),
  };
}

async function deliver({
  webhookUrl,
  payload,
}: {
  webhookUrl: URL;
  payload: DiscordPayload;
}): Promise<void> {
  for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch {
      await retryTransientFailure({ attempt });
      continue;
    }

    if (response.ok) {
      const message = await readJson(response);
      if (!message.ok) {
        if (message.failure === "network") {
          await retryTransientFailure({ attempt });
          continue;
        }
        throw deliveryFailure();
      }
      if (!isDiscordMessage(message.value)) {
        throw deliveryFailure();
      }
      return;
    }

    if (response.status === 429) {
      const body = await readJson(response);
      if (!body.ok) {
        if (body.failure === "network") {
          await retryTransientFailure({ attempt });
          continue;
        }
        throw deliveryFailure();
      }
      const retryAfter = retryAfterMilliseconds(body.value);
      if (retryAfter === undefined || attempt === maximumAttempts) {
        throw deliveryFailure();
      }
      await sleep(retryAfter);
      continue;
    }

    if (response.status >= 500 && response.status <= 599) {
      await retryTransientFailure({ attempt });
      continue;
    }

    throw deliveryFailure();
  }

  throw deliveryFailure();
}

async function retryTransientFailure({ attempt }: { attempt: number }) {
  if (attempt === maximumAttempts) {
    throw deliveryFailure();
  }
  await sleep(transientBackoffMilliseconds[attempt - 1] ?? 2_000);
}

function parseWebhookUrl(value: string): URL {
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username !== "" ||
      url.password !== ""
    ) {
      throw deliveryFailure();
    }
    url.searchParams.set("wait", "true");
    url.hash = "";
    return url;
  } catch {
    throw new Error("Daily Project Digest delivery configuration is invalid.");
  }
}

async function readJson(
  response: Response,
): Promise<
  | { ok: true; value: unknown }
  | { ok: false; failure: "network" | "invalid-json" }
> {
  let body: string;
  try {
    body = await response.text();
  } catch {
    return { ok: false, failure: "network" };
  }
  try {
    return { ok: true, value: JSON.parse(body) as unknown };
  } catch {
    return { ok: false, failure: "invalid-json" };
  }
}

function retryAfterMilliseconds(value: unknown): number | undefined {
  const retryAfter = asRecord(value)?.retry_after;
  return typeof retryAfter === "number" &&
    Number.isFinite(retryAfter) &&
    retryAfter >= 0
    ? Math.ceil(retryAfter * 1_000)
    : undefined;
}

function isDiscordMessage(value: unknown): boolean {
  const message = asRecord(value);
  const author = asRecord(message?.author);
  return (
    isSnowflake(message?.id) &&
    isSnowflake(message?.channel_id) &&
    isSnowflake(message?.webhook_id) &&
    isSnowflake(author?.id) &&
    typeof message?.content === "string" &&
    typeof message?.timestamp === "string" &&
    !Number.isNaN(new Date(message.timestamp).getTime()) &&
    typeof message?.type === "number" &&
    Number.isInteger(message.type)
  );
}

function isSnowflake(value: unknown): value is string {
  return typeof value === "string" && /^\d{17,20}$/.test(value);
}

function deliveryFailure(): Error {
  return new Error("Daily Project Digest delivery failed safely.");
}
