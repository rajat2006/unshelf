import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import request from "supertest";
import type { Express } from "express";
import {
  Status,
  StatusMode,
  Type,
  type ConfirmFollowResponse,
  type DiscoverWorkspace,
  type FollowPreviewVideo,
  type Item,
  type KeepDiscoveryResponse,
  type PrepareFollowResponse,
} from "@unshelf/shared";
import type { YouTubeAdapter } from "../src/discover/youtube-adapter";
import { startTestApp, TEST_USER_HEADER, type TestApp } from "./harness";

const now = new Date("2026-08-16T12:00:00.000Z");
let currentNow = now;
const videos: FollowPreviewVideo[] = [
  {
    provider: "youtube",
    providerIdentity: "keep-video-one",
    title: "Provider title",
    source: "https://www.youtube.com/watch?v=keep-video-one",
    publisher: "Quiet Learning",
    publishedAt: "2026-08-15T10:00:00.000Z",
    durationSeconds: 601,
    type: Type.Video,
    thumbnailUrl: null,
  },
  {
    provider: "youtube",
    providerIdentity: "keep-video-two",
    title: "Independent decision",
    source: "https://www.youtube.com/watch?v=keep-video-two",
    publisher: "Quiet Learning",
    publishedAt: "2026-08-14T10:00:00.000Z",
    durationSeconds: 602,
    type: Type.Video,
    thumbnailUrl: null,
  },
];

const previewChannel = vi.fn<YouTubeAdapter["previewChannel"]>(
  async ({ url }) => ({
    ok: true,
    outcome: "preview",
    channelId: url.includes("alternate") ? "UC_keep_alternate" : "UC_keep",
    uploadsPlaylistId: url.includes("alternate")
      ? "UU_keep_alternate"
      : "UU_keep",
    publisher: "Quiet Learning",
    videos,
    rejectedCount: 0,
    coverageStartedAt: "2026-07-17T12:00:00.000Z",
  }),
);
const adapter: YouTubeAdapter = {
  previewChannel,
  acquireChannel: vi.fn(),
};

let harness: TestApp;
let app: Express;

beforeAll(async () => {
  harness = await startTestApp(undefined, {
    discover: { enabled: true, adapter, now: () => currentNow },
  });
  app = harness.app;
});

afterAll(async () => {
  await harness?.stop();
});

afterEach(() => {
  currentNow = now;
});

async function createQueue({
  clerkUserId,
  channelUrl = "https://youtube.com/@quietlearning",
}: {
  clerkUserId: string;
  channelUrl?: string;
}) {
  const previewResponse = await request(app)
    .post("/api/discover/follow-previews")
    .set(TEST_USER_HEADER, clerkUserId)
    .send({
      provider: "youtube",
      target: {
        kind: "channel",
        url: channelUrl,
      },
    })
    .expect(201);
  const prepared = previewResponse.body as PrepareFollowResponse;
  if (!prepared.ok || !("preview" in prepared)) {
    throw new Error("expected preview");
  }
  const confirmationResponse = await request(app)
    .post("/api/discover/follows")
    .set(TEST_USER_HEADER, clerkUserId)
    .set("Idempotency-Key", crypto.randomUUID())
    .send({ previewId: prepared.preview.previewId })
    .expect(201);
  const confirmed = confirmationResponse.body as ConfirmFollowResponse;
  if (!confirmed.ok) throw new Error("expected confirmation");
  return confirmed.discoveries;
}

describe("Keep a Discovery", () => {
  it("creates one approved Library Item and resolves only the selected occurrence", async () => {
    const clerkUserId = "clerk_keep_create";
    const discoveries = await createQueue({ clerkUserId });

    const kept = await request(app)
      .post(`/api/discover/discoveries/${discoveries[0].id}/keep`)
      .set(TEST_USER_HEADER, clerkUserId)
      .set("Idempotency-Key", crypto.randomUUID())
      .send({
        title: "My confirmed title",
        source: videos[0].source,
        type: Type.Course,
      })
      .expect(200);
    const keptBody = successfulKeep(kept.body);

    expect(kept.body).toMatchObject({
      ok: true,
      discovery: { id: discoveries[0].id, state: "kept" },
      item: {
        title: "My confirmed title",
        source: videos[0].source,
        type: Type.Course,
        status: Status.NotStarted,
        statusMode: StatusMode.Manual,
      },
    });
    const workspace = await request(app)
      .get("/api/discover")
      .set(TEST_USER_HEADER, clerkUserId)
      .expect(200);
    expect(workspace.body.discoveries).toEqual([
      expect.objectContaining({ id: discoveries[1].id, state: "new" }),
    ]);
    const library = await request(app)
      .get("/api/items")
      .set(TEST_USER_HEADER, clerkUserId)
      .expect(200);
    expect(library.body).toEqual([
      expect.objectContaining({ id: keptBody.item.id }),
    ]);
  });

  it("leaves another occurrence independently actionable and identifies its linked Item", async () => {
    const clerkUserId = "clerk_keep_shared_candidate";
    const firstQueue = await createQueue({ clerkUserId });
    const secondQueue = await createQueue({
      clerkUserId,
      channelUrl: "https://youtube.com/@alternate",
    });

    const kept = await request(app)
      .post(`/api/discover/discoveries/${firstQueue[0].id}/keep`)
      .set(TEST_USER_HEADER, clerkUserId)
      .set("Idempotency-Key", crypto.randomUUID())
      .send({
        title: videos[0].title,
        source: videos[0].source,
        type: Type.Video,
      })
      .expect(200);
    const keptBody = successfulKeep(kept.body);

    const workspace = await request(app)
      .get("/api/discover")
      .set(TEST_USER_HEADER, clerkUserId)
      .expect(200);
    const workspaceBody = workspace.body as DiscoverWorkspace;
    expect(
      workspaceBody.discoveries.find(({ id }) => id === secondQueue[0].id),
    ).toMatchObject({ itemId: keptBody.item.id, state: "new" });
    await request(app)
      .post(`/api/discover/discoveries/${secondQueue[0].id}/keep`)
      .set(TEST_USER_HEADER, clerkUserId)
      .set("Idempotency-Key", crypto.randomUUID())
      .send({
        title: videos[0].title,
        source: videos[0].source,
        type: Type.Video,
      })
      .expect(409, { ok: false, error: "already_in_library" });
  });

  it("blocks Keep after Provider metadata expires while leaving Dismiss available", async () => {
    const clerkUserId = "clerk_keep_expired";
    const discoveries = await createQueue({ clerkUserId });
    currentNow = new Date("2026-09-16T12:00:00.000Z");

    await request(app)
      .post(`/api/discover/discoveries/${discoveries[0].id}/keep`)
      .set(TEST_USER_HEADER, clerkUserId)
      .set("Idempotency-Key", crypto.randomUUID())
      .send({
        title: videos[0].title,
        source: videos[0].source,
        type: Type.Video,
      })
      .expect(409, { ok: false, error: "keep_metadata_unavailable" });
    const workspace = await request(app)
      .get("/api/discover")
      .set(TEST_USER_HEADER, clerkUserId)
      .expect(200);
    expect(workspace.body.discoveries[0]).toMatchObject({
      id: discoveries[0].id,
      itemId: null,
      title: null,
      source: null,
      type: null,
    });
    await request(app)
      .post("/api/discover/discovery-decisions")
      .set(TEST_USER_HEADER, clerkUserId)
      .set("Idempotency-Key", crypto.randomUUID())
      .send({ discoveryIds: [discoveries[0].id], decision: "dismissed" })
      .expect(200);
  });

  it("links canonical manual Capture by retained identity without deduplicating the Source", async () => {
    const clerkUserId = "clerk_keep_manual_capture";
    const discoveries = await createQueue({ clerkUserId });

    const firstCapture = await request(app)
      .post("/api/items")
      .set(TEST_USER_HEADER, clerkUserId)
      .send({
        title: "My manually captured version",
        source: videos[0].source,
        type: Type.Article,
      })
      .expect(201);
    const firstCaptureBody = firstCapture.body as Item;
    const workspace = await request(app)
      .get("/api/discover")
      .set(TEST_USER_HEADER, clerkUserId)
      .expect(200);
    expect(workspace.body.discoveries[0]).toMatchObject({
      id: discoveries[0].id,
      itemId: firstCaptureBody.id,
      state: "new",
    });

    const duplicateCapture = await request(app)
      .post("/api/items")
      .set(TEST_USER_HEADER, clerkUserId)
      .send({
        title: "A deliberate duplicate",
        source: videos[0].source,
        type: Type.Video,
      })
      .expect(201);
    const duplicateCaptureBody = duplicateCapture.body as Item;
    expect(duplicateCaptureBody.id).not.toBe(firstCaptureBody.id);
    const library = await request(app)
      .get("/api/items")
      .set(TEST_USER_HEADER, clerkUserId)
      .expect(200);
    expect(library.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: firstCaptureBody.id }),
        expect.objectContaining({ id: duplicateCaptureBody.id }),
      ]),
    );
  });

  it("replays one Keep safely and rejects changed, foreign, and terminal decisions", async () => {
    const clerkUserId = "clerk_keep_replay";
    const discoveries = await createQueue({ clerkUserId });
    const idempotencyKey = crypto.randomUUID();
    const payload = {
      title: videos[0].title,
      source: videos[0].source,
      type: Type.Video,
    };

    const kept = await request(app)
      .post(`/api/discover/discoveries/${discoveries[0].id}/keep`)
      .set(TEST_USER_HEADER, clerkUserId)
      .set("Idempotency-Key", idempotencyKey)
      .send(payload)
      .expect(200);
    const replay = await request(app)
      .post(`/api/discover/discoveries/${discoveries[0].id}/keep`)
      .set(TEST_USER_HEADER, clerkUserId)
      .set("Idempotency-Key", idempotencyKey)
      .send(payload)
      .expect(200);
    expect(replay.body).toEqual(kept.body);
    await request(app)
      .post(`/api/discover/discoveries/${discoveries[0].id}/keep`)
      .set(TEST_USER_HEADER, clerkUserId)
      .set("Idempotency-Key", idempotencyKey)
      .send({ ...payload, title: "A changed replay" })
      .expect(409, { ok: false, error: "idempotency_conflict" });
    await request(app)
      .post("/api/discover/discovery-decisions")
      .set(TEST_USER_HEADER, clerkUserId)
      .set("Idempotency-Key", crypto.randomUUID())
      .send({ discoveryIds: [discoveries[0].id], decision: "dismissed" })
      .expect(409, { ok: false, error: "decision_conflict" });
    await request(app)
      .post(`/api/discover/discoveries/${discoveries[1].id}/keep`)
      .set(TEST_USER_HEADER, "clerk_keep_intruder")
      .set("Idempotency-Key", crypto.randomUUID())
      .send({ ...payload, source: videos[1].source })
      .expect(404, { ok: false, error: "discovery_missing" });
  });

  it("requires valid confirmation input and coalesces concurrent replay", async () => {
    const clerkUserId = "clerk_keep_concurrent_replay";
    const discoveries = await createQueue({ clerkUserId });
    const payload = {
      title: videos[0].title,
      source: videos[0].source,
      type: Type.Video,
    };
    await request(app)
      .post(`/api/discover/discoveries/${discoveries[0].id}/keep`)
      .set(TEST_USER_HEADER, clerkUserId)
      .send(payload)
      .expect(400);
    await request(app)
      .post(`/api/discover/discoveries/${discoveries[0].id}/keep`)
      .set(TEST_USER_HEADER, clerkUserId)
      .set("Idempotency-Key", crypto.randomUUID())
      .send({ ...payload, title: "   " })
      .expect(400);

    const idempotencyKey = crypto.randomUUID();
    const [first, second] = await Promise.all([
      request(app)
        .post(`/api/discover/discoveries/${discoveries[0].id}/keep`)
        .set(TEST_USER_HEADER, clerkUserId)
        .set("Idempotency-Key", idempotencyKey)
        .send(payload),
      request(app)
        .post(`/api/discover/discoveries/${discoveries[0].id}/keep`)
        .set(TEST_USER_HEADER, clerkUserId)
        .set("Idempotency-Key", idempotencyKey)
        .send(payload),
    ]);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body).toEqual(first.body);
    const library = await request(app)
      .get("/api/items")
      .set(TEST_USER_HEADER, clerkUserId)
      .expect(200);
    expect(library.body).toHaveLength(1);
  });

  it("never rewrites approved Item fields when the Provider projection changes", async () => {
    const clerkUserId = "clerk_keep_projection_change";
    const discoveries = await createQueue({ clerkUserId });
    const kept = await request(app)
      .post(`/api/discover/discoveries/${discoveries[0].id}/keep`)
      .set(TEST_USER_HEADER, clerkUserId)
      .set("Idempotency-Key", crypto.randomUUID())
      .send({
        title: "Approved title",
        source: videos[0].source,
        type: Type.Book,
      })
      .expect(200);

    await harness.pool.query(
      `UPDATE discover_provider_result_projections projection
       SET title = 'Provider changed title',
           source = 'https://www.youtube.com/watch?v=provider-change'
       FROM discover_candidates candidate
       WHERE candidate.id = $1
         AND projection.provider_result_id = candidate.provider_result_id`,
      [discoveries[0].candidateId],
    );
    const item = await request(app)
      .get(`/api/items/${kept.body.item.id}`)
      .set(TEST_USER_HEADER, clerkUserId)
      .expect(200);
    expect(item.body).toMatchObject({
      title: "Approved title",
      source: videos[0].source,
      type: Type.Book,
    });
  });

  it("preserves Keep history and permits a new Item after the linked Item is removed", async () => {
    const clerkUserId = "clerk_keep_removed_item";
    const firstQueue = await createQueue({ clerkUserId });
    const laterQueue = await createQueue({
      clerkUserId,
      channelUrl: "https://youtube.com/@alternate",
    });
    const firstKeep = await request(app)
      .post(`/api/discover/discoveries/${firstQueue[0].id}/keep`)
      .set(TEST_USER_HEADER, clerkUserId)
      .set("Idempotency-Key", crypto.randomUUID())
      .send({
        title: "First retained Item",
        source: videos[0].source,
        type: Type.Video,
      })
      .expect(200);
    const firstKeepBody = successfulKeep(firstKeep.body);

    await request(app)
      .delete(`/api/items/${firstKeepBody.item.id}`)
      .set(TEST_USER_HEADER, "clerk_keep_remove_intruder")
      .expect(404, { error: "item not found" });
    await request(app)
      .delete(`/api/items/${firstKeepBody.item.id}`)
      .set(TEST_USER_HEADER, clerkUserId)
      .expect(204);
    const workspace = await request(app)
      .get("/api/discover")
      .set(TEST_USER_HEADER, clerkUserId)
      .expect(200);
    const workspaceBody = workspace.body as DiscoverWorkspace;
    expect(
      workspaceBody.discoveries.find(({ id }) => id === laterQueue[0].id),
    ).toMatchObject({ itemId: null, state: "new" });
    const history = await request(app)
      .get("/api/discover/history")
      .set(TEST_USER_HEADER, clerkUserId)
      .expect(200);
    expect(history.body.discoveries).toEqual([
      expect.objectContaining({ id: firstQueue[0].id, state: "kept" }),
    ]);

    const secondKeep = await request(app)
      .post(`/api/discover/discoveries/${laterQueue[0].id}/keep`)
      .set(TEST_USER_HEADER, clerkUserId)
      .set("Idempotency-Key", crypto.randomUUID())
      .send({
        title: "Replacement retained Item",
        source: videos[0].source,
        type: Type.Video,
      })
      .expect(200);
    const secondKeepBody = successfulKeep(secondKeep.body);
    expect(secondKeepBody.item.id).not.toBe(firstKeepBody.item.id);
  });
});

function successfulKeep(
  body: unknown,
): Extract<KeepDiscoveryResponse, { ok: true }> {
  const response = body as KeepDiscoveryResponse;
  expect(response.ok).toBe(true);
  if (!response.ok) throw new Error("expected successful Keep");
  return response;
}
