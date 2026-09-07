import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import type { ItemDetail } from "@unshelf/shared";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "../src/schema";
import { createChapterDiscovery } from "../src/chapter-discovery";
import { startTestApp, TEST_USER_HEADER, type TestApp } from "./harness";

let harness: TestApp;
beforeAll(async () => {
  harness = await startTestApp();
});
afterAll(async () => {
  await harness?.stop();
});

const preview = {
  kind: "suggestions",
  reason: null,
  title: "A book",
  author: "An author",
  edition: null,
  coverage: "partial",
  chapters: [
    { title: "1. Café — Beadth-first search", evidence: ["contents"] },
    { title: "Chapter 2", evidence: ["contents"] },
    { title: "Chapter 2", evidence: ["contents"] },
  ],
  sources: [
    {
      id: "contents",
      title: "Publisher contents",
      url: "https://example.com/contents",
    },
  ],
};
function response() {
  return {
    status: "completed",
    model: "gpt-5.6-luna",
    usage: {
      input_tokens: 1000,
      input_tokens_details: { cached_tokens: 100 },
      output_tokens: 200,
    },
    output: [
      {
        type: "web_search_call",
        status: "completed",
        action: {
          type: "search",
          sources: [{ type: "url", url: "https://example.com/contents" }],
        },
      },
      {
        type: "message",
        content: [{ type: "output_text", text: JSON.stringify(preview) }],
      },
    ],
  };
}
async function book(user = "chapter_reader") {
  const result = await request(harness.app)
    .post("/api/items")
    .set(TEST_USER_HEADER, user)
    .send({ title: "Saved private title", type: "book" });
  return result.body as ItemDetail;
}
function discovery(modelCall = vi.fn().mockResolvedValue(response())) {
  // Reuse the harness-owned pool; independent module instances share durable admission.
  return createChapterDiscovery({
    db: drizzle(harness.pool, { schema }),
    logger: harness.logger,
    apiKey: "test-key",
    modelCall,
  });
}
it("researches the owned saved title and preserves evidenced headings without creating Parts", async () => {
  const item = await book();
  const modelCall = vi.fn().mockResolvedValue(response());
  const result = await discovery(modelCall)({
    userId: item.userId,
    itemId: item.id,
    signal: new AbortController().signal,
  });
  expect(result).toEqual({ ok: true, preview });
  expect(modelCall).toHaveBeenCalledTimes(1);
  expect(modelCall.mock.calls[0][0]).toMatchObject({
    request: {
      model: "gpt-5.6-luna",
      input: JSON.stringify({ title: item.title }),
      store: false,
      tools: [{ type: "web_search", return_token_budget: "default" }],
      max_tool_calls: 4,
      max_output_tokens: 8000,
      include: ["web_search_call.action.sources"],
      text: { format: { strict: true, type: "json_schema" } },
    },
  });
  const detail = await request(harness.app)
    .get(`/api/items/${item.id}`)
    .set(TEST_USER_HEADER, "chapter_reader");
  expect(detail.body.parts).toEqual([]);
});

it("rejects incomplete, refused, recall-only and invented evidence instead of showing a preview", async () => {
  const item = await book("chapter_validation");
  const cases: [unknown, string][] = [
    [{ ...response(), status: "incomplete" }, "incomplete_output"],
    [
      {
        ...response(),
        output: [
          {
            type: "message",
            content: [{ type: "refusal", refusal: "private provider text" }],
          },
        ],
      },
      "provider_refusal",
    ],
    [{ ...response(), output: response().output.slice(1) }, "malformed_output"],
    [
      {
        ...response(),
        output: [
          response().output[0],
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text: JSON.stringify({
                  ...preview,
                  sources: [
                    { ...preview.sources[0], url: "https://invented.example" },
                  ],
                }),
              },
            ],
          },
        ],
      },
      "malformed_output",
    ],
    [
      {
        ...response(),
        status: "failed",
        error: { code: "server_error", message: "PRIVATE_PROVIDER_FAILURE" },
      },
      "provider_failure",
    ],
    [null, "malformed_output"],
  ];
  for (const [raw, error] of cases) {
    expect(
      await discovery(vi.fn().mockResolvedValue(raw))({
        userId: item.userId,
        itemId: item.id,
        signal: new AbortController().signal,
      }),
    ).toEqual({ ok: false, error });
  }
});

it("admits one active attempt across module instances and counts ten dispatched attempts per User", async () => {
  const item = await book("chapter_quota");
  let release!: (value: unknown) => void;
  let started!: () => void;
  const dispatched = new Promise<void>((resolve) => {
    started = resolve;
  });
  const slow = vi.fn().mockImplementation(() => {
    started();
    return new Promise((resolve) => {
      release = resolve;
    });
  });
  const input = {
    userId: item.userId,
    itemId: item.id,
    signal: new AbortController().signal,
  };
  const first = discovery(slow)(input);
  await dispatched;
  const nextCall = vi.fn().mockResolvedValue(response());
  const competing = await discovery(nextCall)(input);
  release(response());
  await first;
  expect(competing).toEqual({ ok: false, error: "usage_limit" });
  expect(nextCall).not.toHaveBeenCalled();
  for (let i = 0; i < 9; i++) expect((await discovery()(input)).ok).toBe(true);
  expect(await discovery(nextCall)(input)).toEqual({
    ok: false,
    error: "usage_limit",
  });
  expect(nextCall).not.toHaveBeenCalled();
});

it("maps provider errors and cancellation to safe counted failures and records unknown usage", async () => {
  const item = await book("chapter_failure");
  const input = {
    userId: item.userId,
    itemId: item.id,
    signal: new AbortController().signal,
  };
  expect(
    await discovery(
      vi.fn().mockRejectedValue(new Error("PRIVATE RESPONSE BODY")),
    )(input),
  ).toEqual({ ok: false, error: "provider_failure" });
  const controller = new AbortController();
  const call = vi.fn().mockImplementation(() => {
    controller.abort();
    return new Promise(() => {});
  });
  expect(
    await discovery(call)({ ...input, signal: controller.signal }),
  ).toEqual({ ok: false, error: "cancelled" });
  expect(JSON.stringify(harness.logger.records)).not.toContain(
    "PRIVATE RESPONSE BODY",
  );
  expect(
    harness.logger.records.some(
      (entry) =>
        entry.event === "unshelf.chapters.attempt.ended" &&
        entry.outcome === "cancelled" &&
        entry.estimatedUsd === null,
    ),
  ).toBe(true);
});

it("authenticates discovery and excludes spoofed body content from failed-request logs", async () => {
  const item = await book("chapter_http");
  const path = `/api/items/${item.id}/chapters/research`;
  expect((await request(harness.app).post(path).send({})).status).toBe(401);
  const foreign = await request(harness.app)
    .post(path)
    .set(TEST_USER_HEADER, "chapter_stranger")
    .send({});
  expect(foreign.status).toBe(404);
  const spoofed = await request(harness.app)
    .post(path)
    .set(TEST_USER_HEADER, "chapter_http")
    .send({ title: "PRIVATE SPOOF", userId: "PRIVATE SPOOF" });
  expect(spoofed.status).toBe(400);
  const missingConfiguration = await request(harness.app)
    .post(path)
    .set(TEST_USER_HEADER, "chapter_http")
    .send({});
  expect(missingConfiguration.body).toEqual({
    ok: false,
    error: "missing_configuration",
  });
  expect(JSON.stringify(harness.logger.records)).not.toContain("PRIVATE SPOOF");
});

it("records versioned token/tool estimates without content, including over-target and missing usage", async () => {
  const item = await book("chapter_usage");
  const input = {
    userId: item.userId,
    itemId: item.id,
    signal: new AbortController().signal,
  };
  await discovery()(input);
  const event = harness.logger.records
    .filter((entry) => entry.event === "unshelf.chapters.attempt.ended")
    .at(-1);
  expect(event).toMatchObject({
    inputTokens: 1000,
    cachedTokens: 100,
    outputTokens: 200,
    searchCalls: 1,
    estimatedUsd: 0.010422,
    pricingVersion: "openai-2026-09-07",
    requestedModel: "gpt-5.6-luna",
    returnedModel: "gpt-5.6-luna",
    outcome: "suggestions",
  });
  const costly = {
    ...response(),
    usage: {
      input_tokens: 600000,
      input_tokens_details: { cached_tokens: 0 },
      output_tokens: 1000,
    },
  };
  expect((await discovery(vi.fn().mockResolvedValue(costly))(input)).ok).toBe(
    true,
  );
  expect(
    harness.logger.records.some(
      (entry) => entry.event === "unshelf.chapters.cost.over_target",
    ),
  ).toBe(true);
  await discovery(vi.fn().mockResolvedValue({ ...response(), usage: null }))(
    input,
  );
  expect(
    harness.logger.records
      .filter((entry) => entry.event === "unshelf.chapters.attempt.ended")
      .at(-1),
  ).toMatchObject({ estimatedUsd: null, inputTokens: null });
  const serialized = JSON.stringify(
    harness.logger.records.filter((entry) =>
      entry.event.startsWith("unshelf.chapters."),
    ),
  );
  for (const content of [
    item.title,
    preview.title,
    preview.chapters[0].title,
    preview.sources[0].url,
    "test-key",
  ])
    expect(serialized).not.toContain(content);
});

it("preserves inconclusive reasons, editions, coverage and fidelity while rejecting invalid structures", async () => {
  const item = await book("chapter_fixtures");
  const input = {
    userId: item.userId,
    itemId: item.id,
    signal: new AbortController().signal,
  };
  function fixture(value: unknown) {
    const raw = response();
    raw.output[1] = {
      type: "message",
      content: [{ type: "output_text", text: JSON.stringify(value) }],
    };
    return raw;
  }
  for (const reason of [
    "ambiguous_identity",
    "conflicting_evidence",
    "no_usable_contents",
  ]) {
    const value = {
      ...preview,
      kind: "inconclusive",
      reason,
      chapters: [],
      sources: [],
    };
    expect(
      await discovery(vi.fn().mockResolvedValue(fixture(value)))(input),
    ).toEqual({ ok: true, preview: value });
  }
  for (const edition of ["2016", "Second edition"]) {
    const value = { ...preview, edition, coverage: "unknown" };
    expect(
      await discovery(vi.fn().mockResolvedValue(fixture(value)))(input),
    ).toEqual({ ok: true, preview: value });
  }
  for (const value of [
    { ...preview, chapters: [{ title: " ", evidence: ["contents"] }] },
    { ...preview, chapters: [{ title: "Chapter", evidence: ["invented"] }] },
    {
      ...preview,
      sources: [{ ...preview.sources[0], url: "javascript:alert(1)" }],
    },
    { ...preview, coverage: "probably" },
    { ...preview, title: "x".repeat(1001) },
  ])
    expect(
      await discovery(vi.fn().mockResolvedValue(fixture(value)))(input),
    ).toEqual({ ok: false, error: "malformed_output" });
});

it("recovers an expired claim without letting its late completion release a newer claim", async () => {
  const item = await book("chapter_expiry");
  let time = new Date("2026-09-07T23:59:00Z");
  const now = () => time;
  const db = drizzle(harness.pool, { schema });
  const input = {
    userId: item.userId,
    itemId: item.id,
    signal: new AbortController().signal,
  };
  const resolvers: ((value: unknown) => void)[] = [];
  const calls = vi
    .fn()
    .mockImplementation(
      () => new Promise((resolve) => resolvers.push(resolve)),
    );
  const create = () =>
    createChapterDiscovery({
      db,
      logger: harness.logger,
      apiKey: "test",
      modelCall: calls,
      now,
    });
  const first = create()(input);
  await vi.waitFor(() => expect(calls).toHaveBeenCalledTimes(1));
  time = new Date("2026-09-08T00:00:06Z");
  const second = create()(input);
  await vi.waitFor(() => expect(calls).toHaveBeenCalledTimes(2));
  resolvers[0](response());
  await first;
  expect(await create()(input)).toEqual({ ok: false, error: "usage_limit" });
  resolvers[1](response());
  await second;
  const fast = createChapterDiscovery({
    db,
    logger: harness.logger,
    apiKey: "test",
    modelCall: vi.fn().mockResolvedValue(response()),
    now,
  });
  for (let i = 0; i < 9; i++) expect((await fast(input)).ok).toBe(true);
  expect(await fast(input)).toEqual({ ok: false, error: "usage_limit" });
  time = new Date("2026-09-09T00:00:00Z");
  expect((await fast(input)).ok).toBe(true);
});

it("bounds a hung model to sixty seconds even when the dependency ignores abort", async () => {
  const item = await book("chapter_timeout");
  const call = vi.fn().mockImplementation(() => new Promise(() => {}));
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  try {
    const result = discovery(call)({
      userId: item.userId,
      itemId: item.id,
      signal: new AbortController().signal,
    });
    await vi.waitFor(() => expect(call).toHaveBeenCalledTimes(1));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(await result).toEqual({ ok: false, error: "timeout" });
    expect(call.mock.calls[0][0].signal.aborted).toBe(true);
  } finally {
    vi.useRealTimers();
  }
});

describe("authenticated chapter research", () => {
  const call = vi.fn().mockResolvedValue(response());
  let http: TestApp;
  beforeAll(async () => {
    http = await startTestApp({ chapterModelCall: call });
  });
  afterAll(async () => {
    await http?.stop();
  });
  it("drives preview through authenticated HTTP with a controlled model and no unauthorized paid calls", async () => {
    const captured = await request(http.app)
      .post("/api/items")
      .set(TEST_USER_HEADER, "owner")
      .send({ title: "Saved HTTP title", type: "book" });
    const item = captured.body as ItemDetail;
    const path = `/api/items/${item.id}/chapters/research`;
    const post = (user: string) =>
      request(http.app).post(path).set(TEST_USER_HEADER, user).send({});
    expect((await post("foreign")).status).toBe(404);
    expect((await request(http.app).post(path).send({})).status).toBe(401);
    expect(call).not.toHaveBeenCalled();
    expect((await post("owner")).body).toEqual({ ok: true, preview });
    expect(call.mock.calls[0][0].request.input).toBe(
      JSON.stringify({ title: "Saved HTTP title" }),
    );
    expect(call.mock.calls[0][0].request.instructions).toContain(
      "never mix editions",
    );
    expect(
      call.mock.calls[0][0].request.text.format.schema.additionalProperties,
    ).toBe(false);
    const malformed = await request(http.app)
      .post(path)
      .set(TEST_USER_HEADER, "owner")
      .set("Content-Type", "application/json")
      .send('{"PRIVATE_CONTENT":');
    expect(malformed.status).toBe(400);
    const invalid = await request(http.app)
      .post(
        "/api/items/PRIVATE_CONTENT/chapters/research?title=PRIVATE_CONTENT",
      )
      .set(TEST_USER_HEADER, "owner")
      .send({ title: "PRIVATE_CONTENT" });
    expect(invalid.status).toBe(400);
    const encodedId = await request(http.app)
      .post("/api/items/bad%2Fid/chapters/research")
      .set(TEST_USER_HEADER, "owner")
      .send({ title: "PRIVATE_CONTENT" });
    expect(encodedId.status).toBe(400);
    const oversized = await request(http.app)
      .post(path)
      .set(TEST_USER_HEADER, "owner")
      .send({ title: "PRIVATE_CONTENT".repeat(10000) });
    expect(oversized.status).toBeGreaterThanOrEqual(400);
    expect(JSON.stringify(http.logger.records)).not.toContain(
      "PRIVATE_CONTENT",
    );
    expect(call).toHaveBeenCalledTimes(1);
    await request(http.app)
      .post(`/api/items/${item.id}/parts`)
      .set(TEST_USER_HEADER, "owner")
      .send({ titles: ["Manual chapter"] });
    expect((await post("owner")).body).toEqual({
      ok: false,
      error: "ineligible",
    });
    expect(call).toHaveBeenCalledTimes(1);
  });
  it("finds chapters, confirms edited titles, and replays without another model call", async () => {
    const user = "complete-chapter-flow";
    const captured = await request(http.app)
      .post("/api/items")
      .set(TEST_USER_HEADER, user)
      .send({ title: "A book", type: "book" });
    const item = captured.body as ItemDetail;
    const callsBefore = call.mock.calls.length;
    const researched = await request(http.app)
      .post(`/api/items/${item.id}/chapters/research`)
      .set(TEST_USER_HEADER, user)
      .send({});
    expect(researched.body).toEqual({ ok: true, preview });
    const before = await request(http.app)
      .get(`/api/items/${item.id}`)
      .set(TEST_USER_HEADER, user);
    expect(before.body.parts).toEqual([]);
    const payload = {
      confirmationKey: "00000000-0000-4000-8000-000000000009",
      titles: [
        " User's correction ",
        "",
        ...preview.chapters.map((chapter) => chapter.title),
      ],
    };
    const save = () =>
      request(http.app)
        .post(`/api/items/${item.id}/chapters/confirm`)
        .set(TEST_USER_HEADER, user)
        .send(payload);
    const saved = await save();
    expect(saved.status).toBe(200);
    expect((saved.body as ItemDetail).parts.map((part) => part.title)).toEqual([
      "User's correction",
      ...preview.chapters.map((chapter) => chapter.title),
    ]);
    expect((await save()).body).toEqual(saved.body);
    expect(call).toHaveBeenCalledTimes(callsBefore + 1);
    expect(JSON.stringify(http.logger.records)).not.toContain(
      "User's correction",
    );
  });
  it("aborts disconnected HTTP research and omits content from the terminal snapshot", async () => {
    const captured = await request(http.app)
      .post("/api/items")
      .set(TEST_USER_HEADER, "disconnect_owner")
      .send({ title: "PRIVATE_DISCONNECT", type: "book" });
    const item = captured.body as ItemDetail;
    let started!: () => void;
    const dispatched = new Promise<void>((resolve) => {
      started = resolve;
    });
    call.mockImplementationOnce(() => {
      started();
      return new Promise(() => {});
    });
    const pending = request(http.app)
      .post(`/api/items/${item.id}/chapters/research?title=PRIVATE_DISCONNECT`)
      .set(TEST_USER_HEADER, "disconnect_owner")
      .set("X-Private", "PRIVATE_DISCONNECT")
      .send({});
    pending.end(() => undefined);
    await dispatched;
    pending.abort();
    await vi.waitFor(() =>
      expect(
        http.logger.records.some(
          (entry) =>
            entry.event === "unshelf.chapters.attempt.ended" &&
            entry.outcome === "cancelled",
        ),
      ).toBe(true),
    );
    expect(
      http.logger.records.some(
        (entry) =>
          entry.termination === "aborted" && entry.request !== undefined,
      ),
    ).toBe(true);
    expect(JSON.stringify(http.logger.records)).not.toContain(
      "PRIVATE_DISCONNECT",
    );
  });
});

it("never dispatches ineligible, foreign, unconfigured or already cancelled requests or consumes their quota", async () => {
  const item = await book("chapter_rejection");
  const other = await book("chapter_other_user");
  const call = vi.fn().mockResolvedValue(response());
  const db = drizzle(harness.pool, { schema });
  const input = {
    userId: item.userId,
    itemId: item.id,
    signal: new AbortController().signal,
  };
  const withoutKey = createChapterDiscovery({
    db,
    logger: harness.logger,
    modelCall: call,
  });
  expect(await withoutKey(input)).toEqual({
    ok: false,
    error: "missing_configuration",
  });
  expect(await discovery(call)({ ...input, userId: other.userId })).toEqual({
    ok: false,
    error: "not_found",
  });
  const cancelled = new AbortController();
  cancelled.abort();
  expect(await discovery(call)({ ...input, signal: cancelled.signal })).toEqual(
    { ok: false, error: "cancelled" },
  );
  const article = await request(harness.app)
    .post("/api/items")
    .set(TEST_USER_HEADER, "chapter_rejection")
    .send({ title: "Article", type: "article" });
  expect(
    await discovery(call)({
      ...input,
      itemId: (article.body as ItemDetail).id,
    }),
  ).toEqual({
    ok: false,
    error: "ineligible",
  });
  expect(call).not.toHaveBeenCalled();
  for (let i = 0; i < 10; i++)
    expect((await discovery(call)(input)).ok).toBe(true);
});

it("counts dispatched failures and cancelled attempts toward daily admission", async () => {
  const item = await book("chapter_failed_quota");
  const input = {
    userId: item.userId,
    itemId: item.id,
    signal: new AbortController().signal,
  };
  for (let i = 0; i < 5; i++) {
    expect(
      await discovery(vi.fn().mockRejectedValue(new Error("private")))(input),
    ).toEqual({ ok: false, error: "provider_failure" });
    const controller = new AbortController();
    const call = vi.fn().mockImplementation(() => {
      controller.abort();
      return new Promise(() => {});
    });
    expect(
      await discovery(call)({ ...input, signal: controller.signal }),
    ).toEqual({ ok: false, error: "cancelled" });
  }
  const call = vi.fn().mockResolvedValue(response());
  expect(await discovery(call)(input)).toEqual({
    ok: false,
    error: "usage_limit",
  });
  expect(call).not.toHaveBeenCalled();
});

it("dispatches exactly one HTTP Responses request and never logs a provider error body", async () => {
  const item = await book("chapter_transport");
  const transport = vi
    .fn()
    .mockResolvedValueOnce(new Response(JSON.stringify(response())))
    .mockResolvedValueOnce(
      new Response("PRIVATE_PROVIDER_BODY", { status: 429 }),
    );
  vi.stubGlobal("fetch", transport);
  try {
    const discover = createChapterDiscovery({
      db: drizzle(harness.pool, { schema }),
      logger: harness.logger,
      apiKey: "server-secret",
    });
    const input = {
      userId: item.userId,
      itemId: item.id,
      signal: new AbortController().signal,
    };
    expect((await discover(input)).ok).toBe(true);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(transport.mock.calls[0][0]).toBe(
      "https://api.openai.com/v1/responses",
    );
    const options = transport.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(
      typeof options.body === "string" ? options.body : "null",
    ) as Record<string, unknown>;
    expect(body).not.toHaveProperty("conversation");
    expect(body).not.toHaveProperty("previous_response_id");
    expect(options.redirect).toBe("error");
    expect(await discover(input)).toEqual({
      ok: false,
      error: "provider_failure",
    });
    expect(transport).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(harness.logger.records)).not.toContain(
      "PRIVATE_PROVIDER_BODY",
    );
    expect(
      harness.logger.records
        .filter((entry) => entry.event === "unshelf.chapters.attempt.ended")
        .at(-1),
    ).toMatchObject({ providerCode: "http_rate_limit", estimatedUsd: null });
  } finally {
    vi.unstubAllGlobals();
  }
});

it("races first admission from independent module instances without dispatching twice", async () => {
  const item = await book("chapter_initial_race");
  let finish!: (value: unknown) => void;
  const call = vi.fn().mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const input = {
    userId: item.userId,
    itemId: item.id,
    signal: new AbortController().signal,
  };
  const attempts = [discovery(call)(input), discovery(call)(input)];
  expect(await Promise.race(attempts)).toEqual({
    ok: false,
    error: "usage_limit",
  });
  await vi.waitFor(() => expect(call).toHaveBeenCalledTimes(1));
  finish(response());
  const results = await Promise.all(attempts);
  expect(results.filter((result) => result.ok)).toHaveLength(1);
});
