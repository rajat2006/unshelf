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
  Type,
  type ConfirmFollowResponse,
  type DiscoverHistoryPage,
  type DiscoverWorkspace,
  type FollowPreviewVideo,
  type PrepareFollowResponse,
} from "@unshelf/shared";
import type { YouTubeAdapter } from "../src/discover/youtube-adapter";
import { startTestApp, TEST_USER_HEADER, type TestApp } from "./harness";

const now = new Date("2026-08-16T12:00:00.000Z");
let currentNow = now;
const videos: FollowPreviewVideo[] = [
  {
    provider: "youtube",
    providerIdentity: "decision-video-one",
    title: "One decision at a time",
    source: "https://www.youtube.com/watch?v=decision-video-one",
    publisher: "Quiet Learning",
    publishedAt: "2026-08-15T10:00:00.000Z",
    durationSeconds: 601,
    type: Type.Video,
    thumbnailUrl: null,
  },
  {
    provider: "youtube",
    providerIdentity: "decision-video-two",
    title: "Atomic review passes",
    source: "https://www.youtube.com/watch?v=decision-video-two",
    publisher: "Quiet Learning",
    publishedAt: "2026-08-14T10:00:00.000Z",
    durationSeconds: 602,
    type: Type.Video,
    thumbnailUrl: null,
  },
];

const previewChannel = vi.fn<YouTubeAdapter["previewChannel"]>(async () => ({
  ok: true,
  outcome: "preview",
  channelId: "UC_decisions",
  uploadsPlaylistId: "UU_decisions",
  publisher: "Quiet Learning",
  videos,
  rejectedCount: 0,
  coverageStartedAt: "2026-07-17T12:00:00.000Z",
}));
const acquireChannel = vi.fn<YouTubeAdapter["acquireChannel"]>();
const adapter: YouTubeAdapter = {
  previewChannel,
  acquireChannel,
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

async function createQueue(clerkUserId: string) {
  const preview = await request(app)
    .post("/api/discover/follow-previews")
    .set(TEST_USER_HEADER, clerkUserId)
    .send({
      provider: "youtube",
      target: {
        kind: "channel",
        url: "https://youtube.com/@quietlearning",
      },
    })
    .expect(201);
  const prepared = preview.body as PrepareFollowResponse;
  if (!prepared.ok || !("preview" in prepared)) {
    throw new Error("expected preview");
  }
  const confirmation = await request(app)
    .post("/api/discover/follows")
    .set(TEST_USER_HEADER, clerkUserId)
    .set("Idempotency-Key", crypto.randomUUID())
    .send({ previewId: prepared.preview.previewId })
    .expect(201);
  const confirmed = confirmation.body as ConfirmFollowResponse;
  if (!confirmed.ok) throw new Error("expected confirmation");
  return confirmed.discoveries as Array<{
    id: string;
    state: "new" | "seen";
  }>;
}

describe("Discover decisions and history", () => {
  it("acknowledges one owned new Discovery and keeps it in intake", async () => {
    const clerkUserId = "clerk_decision_seen";
    const discoveries = await createQueue(clerkUserId);

    const decision = await request(app)
      .post("/api/discover/discovery-decisions")
      .set(TEST_USER_HEADER, clerkUserId)
      .set("Idempotency-Key", crypto.randomUUID())
      .send({ discoveryIds: [discoveries[0].id], decision: "seen" });

    expect(decision.status).toBe(200);
    expect(decision.body).toMatchObject({
      ok: true,
      discoveries: [{ id: discoveries[0].id, state: "seen" }],
    });
    const workspace = await request(app)
      .get("/api/discover")
      .set(TEST_USER_HEADER, clerkUserId)
      .expect(200);
    expect(workspace.body.discoveries).toEqual([
      expect.objectContaining({ id: discoveries[0].id, state: "seen" }),
      expect.objectContaining({ id: discoveries[1].id, state: "new" }),
    ]);

    currentNow = new Date("2026-08-16T12:06:00.000Z");
    const repeated = await request(app)
      .post("/api/discover/discovery-decisions")
      .set(TEST_USER_HEADER, clerkUserId)
      .set("Idempotency-Key", crypto.randomUUID())
      .send({ discoveryIds: [discoveries[0].id], decision: "seen" })
      .expect(200);
    expect(repeated.body.discoveries[0]).toMatchObject({
      state: "seen",
      seenAt: now.toISOString(),
    });
    currentNow = now;
  });

  it("dismisses an exact owned set atomically with replay and conflict safety", async () => {
    const clerkUserId = "clerk_decision_dismiss";
    const discoveries = await createQueue(clerkUserId);
    const idempotencyKey = crypto.randomUUID();
    const payload = {
      discoveryIds: [discoveries[0].id],
      decision: "dismissed",
    };

    const dismissed = await request(app)
      .post("/api/discover/discovery-decisions")
      .set(TEST_USER_HEADER, clerkUserId)
      .set("Idempotency-Key", idempotencyKey)
      .send(payload)
      .expect(200);
    expect(dismissed.body).toMatchObject({
      ok: true,
      discoveries: [{ id: discoveries[0].id, state: "dismissed" }],
    });
    const replay = await request(app)
      .post("/api/discover/discovery-decisions")
      .set(TEST_USER_HEADER, clerkUserId)
      .set("Idempotency-Key", idempotencyKey)
      .send(payload)
      .expect(200);
    expect(replay.body).toEqual(dismissed.body);
    const changedPayload = await request(app)
      .post("/api/discover/discovery-decisions")
      .set(TEST_USER_HEADER, clerkUserId)
      .set("Idempotency-Key", idempotencyKey)
      .send({ discoveryIds: [discoveries[1].id], decision: "seen" })
      .expect(409);
    expect(changedPayload.body).toEqual({
      ok: false,
      error: "idempotency_conflict",
    });
    const terminalConflict = await request(app)
      .post("/api/discover/discovery-decisions")
      .set(TEST_USER_HEADER, clerkUserId)
      .set("Idempotency-Key", crypto.randomUUID())
      .send({ discoveryIds: [discoveries[0].id], decision: "seen" })
      .expect(409);
    expect(terminalConflict.body).toEqual({
      ok: false,
      error: "decision_conflict",
    });

    const mixedInvalid = await request(app)
      .post("/api/discover/discovery-decisions")
      .set(TEST_USER_HEADER, clerkUserId)
      .set("Idempotency-Key", crypto.randomUUID())
      .send({
        discoveryIds: [discoveries[1].id, crypto.randomUUID()],
        decision: "dismissed",
      })
      .expect(404);
    expect(mixedInvalid.body).toEqual({
      ok: false,
      error: "discovery_missing",
    });
    const workspace = await request(app)
      .get("/api/discover")
      .set(TEST_USER_HEADER, clerkUserId)
      .expect(200);
    expect(workspace.body.discoveries).toEqual([
      expect.objectContaining({ id: discoveries[1].id, state: "new" }),
    ]);
  });

  it("rejects empty and foreign decision sets without mutating intake", async () => {
    const owner = "clerk_decision_owner";
    const intruder = "clerk_decision_intruder";
    const discoveries = await createQueue(owner);

    await request(app)
      .post("/api/discover/discovery-decisions")
      .set(TEST_USER_HEADER, owner)
      .set("Idempotency-Key", crypto.randomUUID())
      .send({ discoveryIds: [], decision: "seen" })
      .expect(400);
    const foreign = await request(app)
      .post("/api/discover/discovery-decisions")
      .set(TEST_USER_HEADER, intruder)
      .set("Idempotency-Key", crypto.randomUUID())
      .send({ discoveryIds: [discoveries[0].id], decision: "dismissed" })
      .expect(404);
    expect(foreign.body).toEqual({
      ok: false,
      error: "discovery_missing",
    });
    const workspace = await request(app)
      .get("/api/discover")
      .set(TEST_USER_HEADER, owner)
      .expect(200);
    expect(workspace.body.discoveries).toHaveLength(2);
  });

  it("reads only owned terminal history with unavailable Provider data kept honest", async () => {
    const owner = "clerk_history_owner";
    const otherUser = "clerk_history_other";
    const ownerDiscoveries = await createQueue(owner);
    const otherDiscoveries = await createQueue(otherUser);
    await request(app)
      .post("/api/discover/discovery-decisions")
      .set(TEST_USER_HEADER, owner)
      .set("Idempotency-Key", crypto.randomUUID())
      .send({
        discoveryIds: [ownerDiscoveries[0].id],
        decision: "dismissed",
      })
      .expect(200);
    await request(app)
      .post("/api/discover/discovery-decisions")
      .set(TEST_USER_HEADER, otherUser)
      .set("Idempotency-Key", crypto.randomUUID())
      .send({
        discoveryIds: [otherDiscoveries[1].id],
        decision: "dismissed",
      })
      .expect(200);
    await harness.pool.query(
      `UPDATE discover_provider_result_projections
       SET fetched_at = CURRENT_TIMESTAMP - INTERVAL '2 days',
           expires_at = CURRENT_TIMESTAMP - INTERVAL '1 day'
       WHERE provider_result_id = (
         SELECT candidate.provider_result_id
         FROM discover_candidates candidate
         JOIN discover_discoveries discovery
           ON discovery.candidate_id = candidate.id
          AND discovery.user_id = candidate.user_id
         WHERE discovery.id = $1
       )`,
      [ownerDiscoveries[0].id],
    );
    await harness.pool.query(
      `UPDATE discover_provider_target_projections
       SET fetched_at = CURRENT_TIMESTAMP - INTERVAL '2 days',
           expires_at = CURRENT_TIMESTAMP - INTERVAL '1 day'
       WHERE provider_target_id = (
         SELECT follow.provider_target_id
         FROM discover_follows follow
         JOIN discover_discoveries discovery
           ON discovery.follow_id = follow.id
          AND discovery.user_id = follow.user_id
         WHERE discovery.id = $1
       )`,
      [ownerDiscoveries[0].id],
    );

    const history = await request(app)
      .get("/api/discover/history")
      .set(TEST_USER_HEADER, owner);

    expect(history.status).toBe(200);
    expect(history.body).toEqual({
      discoveries: [
        expect.objectContaining({
          id: ownerDiscoveries[0].id,
          state: "dismissed",
          title: null,
          source: null,
          publisher: null,
          followName: null,
          decidedAt: now.toISOString(),
        }),
      ],
      nextCursor: null,
    });
  });

  it("pages kept and dismissed history with a stable opaque cursor", async () => {
    const owner = "clerk_history_cursor";
    const discoveries = await createQueue(owner);
    await request(app)
      .post("/api/discover/discovery-decisions")
      .set(TEST_USER_HEADER, owner)
      .set("Idempotency-Key", crypto.randomUUID())
      .send({ discoveryIds: [discoveries[0].id], decision: "dismissed" })
      .expect(200);
    const occurrence = await harness.pool.query<{
      user_id: string;
      follow_id: string;
      candidate_id: string;
    }>(
      `SELECT user_id, follow_id, candidate_id
       FROM discover_discoveries
       WHERE id = $1`,
      [discoveries[0].id],
    );
    const row = occurrence.rows[0];
    for (let sequence = 2; sequence <= 21; sequence += 1) {
      await harness.pool.query(
        `INSERT INTO discover_discoveries (
           user_id, follow_id, candidate_id, appearance_sequence, position,
           state, discovered_at, decided_at
         ) VALUES ($1, $2, $3, $4, 0, $5, $6, $6)`,
        [
          row.user_id,
          row.follow_id,
          row.candidate_id,
          sequence,
          sequence === 21 ? "kept" : "dismissed",
          new Date(now.getTime() - sequence * 1_000),
        ],
      );
    }

    const firstPage = await request(app)
      .get("/api/discover/history")
      .set(TEST_USER_HEADER, owner)
      .expect(200);
    const firstHistory = firstPage.body as DiscoverHistoryPage;
    expect(firstHistory.discoveries).toHaveLength(20);
    expect(firstHistory.discoveries[0]).toMatchObject({
      id: discoveries[0].id,
      state: "dismissed",
    });
    expect(firstHistory.nextCursor).toEqual(expect.any(String));
    if (firstHistory.nextCursor === null) throw new Error("expected cursor");

    const secondPage = await request(app)
      .get("/api/discover/history")
      .query({ cursor: firstHistory.nextCursor })
      .set(TEST_USER_HEADER, owner)
      .expect(200);
    const secondHistory = secondPage.body as DiscoverHistoryPage;
    expect(secondHistory.discoveries).toHaveLength(1);
    expect(secondHistory.discoveries[0]?.state).toBe("kept");
    expect(secondHistory.nextCursor).toBeNull();
    expect(
      firstHistory.discoveries.some(
        ({ id }) => id === secondHistory.discoveries[0]?.id,
      ),
    ).toBe(false);
    await request(app)
      .get("/api/discover/history")
      .query({ cursor: "not-an-opaque-cursor" })
      .set(TEST_USER_HEADER, owner)
      .expect(400, { error: "invalid_cursor" });
  });

  it("shows prior dismissal history when the Candidate appears again", async () => {
    const owner = "clerk_decision_reappearance";
    const discoveries = await createQueue(owner);
    const workspaceBefore = await request(app)
      .get("/api/discover")
      .set(TEST_USER_HEADER, owner)
      .expect(200);
    const followId = workspaceBefore.body.follows[0].id as string;
    await request(app)
      .post("/api/discover/discovery-decisions")
      .set(TEST_USER_HEADER, owner)
      .set("Idempotency-Key", crypto.randomUUID())
      .send({ discoveryIds: [discoveries[0].id], decision: "dismissed" })
      .expect(200);
    currentNow = new Date("2026-08-16T12:10:00.000Z");
    acquireChannel.mockResolvedValueOnce({
      ok: true,
      outcome: "empty",
      channelId: "UC_decisions",
      uploadsPlaylistId: "UU_decisions",
      publisher: "Quiet Learning",
      videos: [],
      rejectedCount: 0,
      coverageStartedAt: "2026-07-17T12:00:00.000Z",
    });
    await request(app)
      .post("/api/discover/acquisitions")
      .set(TEST_USER_HEADER, owner)
      .send({ trigger: "manual_follow", followId })
      .expect(200);
    acquireChannel.mockResolvedValueOnce({
      ok: true,
      outcome: "preview",
      channelId: "UC_decisions",
      uploadsPlaylistId: "UU_decisions",
      publisher: "Quiet Learning",
      videos: [videos[0]],
      rejectedCount: 0,
      coverageStartedAt: "2026-07-17T12:00:00.000Z",
    });
    await request(app)
      .post("/api/discover/acquisitions")
      .set(TEST_USER_HEADER, owner)
      .send({ trigger: "manual_follow", followId })
      .expect(200);

    const workspace = await request(app)
      .get("/api/discover")
      .set(TEST_USER_HEADER, owner)
      .expect(200);
    const workspaceBody = workspace.body as DiscoverWorkspace;
    const workspaceBeforeBody = workspaceBefore.body as DiscoverWorkspace;
    const resurfaced = workspaceBody.discoveries.find(
      ({ candidateId }) =>
        candidateId === workspaceBeforeBody.discoveries[0]?.candidateId,
    );
    expect(resurfaced).toMatchObject({
      state: "new",
      priorDecisions: { kept: 0, dismissed: 1 },
    });
  });
});
