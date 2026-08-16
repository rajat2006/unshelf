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
  type DiscoverWorkspace,
  type FollowPreviewVideo,
  type PrepareFollowResponse,
  type SetFollowLifecycleResponse,
} from "@unshelf/shared";
import type { YouTubeAdapter } from "../src/discover/youtube-adapter";
import { startTestApp, TEST_USER_HEADER, type TestApp } from "./harness";

const baselineNow = new Date("2026-08-16T12:00:00.000Z");
let currentNow = baselineNow;
const videos: FollowPreviewVideo[] = [
  {
    provider: "youtube",
    providerIdentity: "video-newest",
    title: "The newest lesson",
    source: "https://www.youtube.com/watch?v=video-newest",
    publisher: "Quiet Learning",
    publishedAt: "2026-08-15T10:00:00.000Z",
    durationSeconds: 601,
    type: Type.Video,
    thumbnailUrl: "https://i.ytimg.com/vi/video-newest/mqdefault.jpg",
  },
  {
    provider: "youtube",
    providerIdentity: "video-older",
    title: "The older lesson",
    source: "https://www.youtube.com/watch?v=video-older",
    publisher: "Quiet Learning",
    publishedAt: "2026-08-14T10:00:00.000Z",
    durationSeconds: 302,
    type: Type.Video,
    thumbnailUrl: null,
  },
];

const previewChannel = vi.fn<YouTubeAdapter["previewChannel"]>(async () => ({
  ok: true,
  outcome: "preview",
  channelId: "UC_confirmed",
  uploadsPlaylistId: "UU_confirmed",
  publisher: "Quiet Learning",
  videos,
  rejectedCount: 0,
  coverageStartedAt: "2026-07-17T12:00:00.000Z",
}));
const acquireChannel = vi.fn<YouTubeAdapter["acquireChannel"]>();
const adapter: YouTubeAdapter = { previewChannel, acquireChannel };

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
  currentNow = baselineNow;
});

const owner = "clerk_confirm_owner";

async function prepare(clerkUserId = owner): Promise<PrepareFollowResponse> {
  const response = await request(app)
    .post("/api/discover/follow-previews")
    .set(TEST_USER_HEADER, clerkUserId)
    .send({
      provider: "youtube",
      target: {
        kind: "channel",
        url: "https://youtube.com/@quietlearning",
      },
    });
  expect(response.status).toBe(201);
  return response.body as PrepareFollowResponse;
}

function confirm({
  clerkUserId,
  previewId,
  idempotencyKey,
}: {
  clerkUserId: string;
  previewId: string;
  idempotencyKey: string;
}) {
  return request(app)
    .post("/api/discover/follows")
    .set(TEST_USER_HEADER, clerkUserId)
    .set("Idempotency-Key", idempotencyKey)
    .send({ previewId });
}

describe("Discover Follow confirmation", () => {
  it("turns exactly the owned preview into one durable Follow and ordered new queue", async () => {
    const prepared = await prepare();
    if (!prepared.ok || !("preview" in prepared)) {
      throw new Error("expected preview");
    }

    const confirmation = await request(app)
      .post("/api/discover/follows")
      .set(TEST_USER_HEADER, owner)
      .set("Idempotency-Key", crypto.randomUUID())
      .send({ previewId: prepared.preview.previewId });

    expect(confirmation.status).toBe(201);
    const confirmed = confirmation.body as ConfirmFollowResponse;
    expect(confirmed).toMatchObject({
      ok: true,
      follow: {
        provider: "youtube",
        lifecycle: "active",
        name: "Quiet Learning",
      },
    });

    const workspaceResponse = await request(app)
      .get("/api/discover")
      .set(TEST_USER_HEADER, owner);
    expect(workspaceResponse.status).toBe(200);
    const workspace = workspaceResponse.body as DiscoverWorkspace;
    expect(workspace.follows).toHaveLength(1);
    expect(workspace.discoveries).toEqual([
      expect.objectContaining({
        state: "new",
        title: "The newest lesson",
        source: "https://www.youtube.com/watch?v=video-newest",
        followName: "Quiet Learning",
      }),
      expect.objectContaining({
        state: "new",
        title: "The older lesson",
        source: "https://www.youtube.com/watch?v=video-older",
        followName: "Quiet Learning",
        thumbnailUrl: null,
      }),
    ]);

    const persisted = await harness.pool.query<{
      follows: string;
      candidates: string;
      discoveries: string;
      consumed: boolean;
    }>(
      `SELECT
        (SELECT count(*) FROM discover_follows)::text AS follows,
        (SELECT count(*) FROM discover_candidates)::text AS candidates,
        (SELECT count(*) FROM discover_discoveries)::text AS discoveries,
        consumed_at IS NOT NULL AS consumed
       FROM discover_follow_previews
       WHERE id = $1`,
      [prepared.preview.previewId],
    );
    expect(persisted.rows[0]).toEqual({
      follows: "1",
      candidates: "2",
      discoveries: "2",
      consumed: true,
    });
  });

  it("reports an active duplicate without issuing another preview receipt", async () => {
    const prepared = await prepare("clerk_active_duplicate");
    if (!prepared.ok || !("preview" in prepared)) {
      throw new Error("expected preview");
    }
    await request(app)
      .post("/api/discover/follows")
      .set(TEST_USER_HEADER, "clerk_active_duplicate")
      .set("Idempotency-Key", crypto.randomUUID())
      .send({ previewId: prepared.preview.previewId })
      .expect(201);

    const duplicate = await request(app)
      .post("/api/discover/follow-previews")
      .set(TEST_USER_HEADER, "clerk_active_duplicate")
      .send({
        provider: "youtube",
        target: {
          kind: "channel",
          url: "https://youtube.com/@quietlearning-renamed",
        },
      });

    expect(duplicate.status).toBe(200);
    expect(duplicate.body).toMatchObject({
      ok: true,
      outcome: "already_following",
      follow: { lifecycle: "active", name: "Quiet Learning" },
    });
    const receipts = await harness.pool.query<{ count: string }>(
      `SELECT count(*)::text AS count
       FROM discover_follow_previews preview
       JOIN users ON users.id = preview.user_id
       WHERE users.clerk_user_id = $1`,
      ["clerk_active_duplicate"],
    );
    expect(receipts.rows[0]?.count).toBe("1");
  });

  it("replays one confirmation stably and rejects a reused key for another receipt", async () => {
    const clerkUserId = "clerk_confirmation_replay";
    const first = await prepare(clerkUserId);
    const second = await prepare(clerkUserId);
    if (
      !first.ok ||
      !("preview" in first) ||
      !second.ok ||
      !("preview" in second)
    ) {
      throw new Error("expected previews");
    }
    const idempotencyKey = crypto.randomUUID();
    const confirmed = await confirm({
      clerkUserId,
      previewId: first.preview.previewId,
      idempotencyKey,
    });
    const replayed = await confirm({
      clerkUserId,
      previewId: first.preview.previewId,
      idempotencyKey,
    });
    expect(replayed.status).toBe(201);
    expect(replayed.body).toEqual(confirmed.body);

    const conflict = await confirm({
      clerkUserId,
      previewId: second.preview.previewId,
      idempotencyKey,
    });
    expect(conflict.status).toBe(409);
    expect(conflict.body).toEqual({
      ok: false,
      error: "idempotency_conflict",
    });
  });

  it("retains a failed request key so different later input conflicts", async () => {
    const clerkUserId = "clerk_failed_key_reuse";
    const idempotencyKey = crypto.randomUUID();
    const missing = await confirm({
      clerkUserId,
      previewId: crypto.randomUUID(),
      idempotencyKey,
    });
    expect(missing.status).toBe(404);
    expect(missing.body.error).toBe("preview_missing");

    const prepared = await prepare(clerkUserId);
    if (!prepared.ok || !("preview" in prepared)) {
      throw new Error("expected preview");
    }
    const conflict = await confirm({
      clerkUserId,
      previewId: prepared.preview.previewId,
      idempotencyKey,
    });
    expect(conflict.status).toBe(409);
    expect(conflict.body.error).toBe("idempotency_conflict");
  });

  it("serializes concurrent consumption of one receipt", async () => {
    const clerkUserId = "clerk_concurrent_confirmation";
    const prepared = await prepare(clerkUserId);
    if (!prepared.ok || !("preview" in prepared)) {
      throw new Error("expected preview");
    }
    const responses = await Promise.all(
      [crypto.randomUUID(), crypto.randomUUID()].map((idempotencyKey) =>
        confirm({
          clerkUserId,
          previewId: prepared.preview.previewId,
          idempotencyKey,
        }),
      ),
    );
    expect(responses.map(({ status }) => status).sort()).toEqual([201, 409]);
    expect(responses.find(({ status }) => status === 409)?.body.error).toBe(
      "preview_consumed",
    );
    const workspace = await request(app)
      .get("/api/discover")
      .set(TEST_USER_HEADER, clerkUserId);
    expect(workspace.body.follows).toHaveLength(1);
    expect(workspace.body.discoveries).toHaveLength(2);
  });

  it("rechecks expiry after a confirmation waiting on the receipt lock", async () => {
    const clerkUserId = "clerk_expiry_race";
    const prepared = await prepare(clerkUserId);
    if (!prepared.ok || !("preview" in prepared)) {
      throw new Error("expected preview");
    }
    const lockClient = await harness.pool.connect();
    try {
      await lockClient.query("BEGIN");
      await lockClient.query(
        `SELECT id FROM discover_follow_previews WHERE id = $1 FOR UPDATE`,
        [prepared.preview.previewId],
      );
      const pendingConfirmation = Promise.resolve(
        confirm({
          clerkUserId,
          previewId: prepared.preview.previewId,
          idempotencyKey: crypto.randomUUID(),
        }),
      );
      await new Promise((resolve) => setTimeout(resolve, 25));
      currentNow = new Date(prepared.preview.expiresAt);
      await lockClient.query("COMMIT");

      const response = await pendingConfirmation;
      expect(response.status).toBe(410);
      expect(response.body.error).toBe("preview_expired");
      const workspace = await request(app)
        .get("/api/discover")
        .set(TEST_USER_HEADER, clerkUserId);
      expect(workspace.body).toEqual({ follows: [], discoveries: [] });
    } finally {
      await lockClient.query("ROLLBACK");
      lockClient.release();
    }
  });

  it("rejects expired, consumed, foreign, and unverifiable receipts without partial intake", async () => {
    const expired = await prepare("clerk_expired_preview");
    if (!expired.ok || !("preview" in expired)) {
      throw new Error("expected preview");
    }
    currentNow = new Date(baselineNow.getTime() + 16 * 60 * 1_000);
    const expiredResponse = await confirm({
      clerkUserId: "clerk_expired_preview",
      previewId: expired.preview.previewId,
      idempotencyKey: crypto.randomUUID(),
    });
    expect(expiredResponse.status).toBe(410);
    expect(expiredResponse.body.error).toBe("preview_expired");

    currentNow = baselineNow;
    const owned = await prepare("clerk_receipt_owner");
    if (!owned.ok || !("preview" in owned)) throw new Error("expected preview");
    const foreign = await confirm({
      clerkUserId: "clerk_receipt_intruder",
      previewId: owned.preview.previewId,
      idempotencyKey: crypto.randomUUID(),
    });
    expect(foreign.status).toBe(404);
    expect(foreign.body.error).toBe("preview_missing");

    const firstConfirmation = await confirm({
      clerkUserId: "clerk_receipt_owner",
      previewId: owned.preview.previewId,
      idempotencyKey: crypto.randomUUID(),
    });
    expect(firstConfirmation.status).toBe(201);
    const consumed = await confirm({
      clerkUserId: "clerk_receipt_owner",
      previewId: owned.preview.previewId,
      idempotencyKey: crypto.randomUUID(),
    });
    expect(consumed.status).toBe(409);
    expect(consumed.body.error).toBe("preview_consumed");

    const unverifiable = await prepare("clerk_unverifiable_preview");
    if (!unverifiable.ok || !("preview" in unverifiable)) {
      throw new Error("expected preview");
    }
    await harness.pool.query(
      `DELETE FROM discover_provider_result_projections
       WHERE provider_result_id = (
         SELECT provider_result_id
         FROM discover_follow_preview_results
         WHERE preview_id = $1
         ORDER BY position
         LIMIT 1
       )`,
      [unverifiable.preview.previewId],
    );
    const unverifiableResponse = await confirm({
      clerkUserId: "clerk_unverifiable_preview",
      previewId: unverifiable.preview.previewId,
      idempotencyKey: crypto.randomUUID(),
    });
    expect(unverifiableResponse.status).toBe(409);
    expect(unverifiableResponse.body.error).toBe("preview_unverifiable");

    for (const clerkUserId of [
      "clerk_expired_preview",
      "clerk_receipt_intruder",
      "clerk_unverifiable_preview",
    ]) {
      const workspace = await request(app)
        .get("/api/discover")
        .set(TEST_USER_HEADER, clerkUserId);
      expect(workspace.body).toEqual({ follows: [], discoveries: [] });
    }
  });

  it("rejects a receipt whose exact snapshot membership can no longer be proved", async () => {
    const clerkUserId = "clerk_drifted_membership";
    const prepared = await prepare(clerkUserId);
    if (!prepared.ok || !("preview" in prepared)) {
      throw new Error("expected preview");
    }
    await harness.pool.query(
      `DELETE FROM discover_follow_preview_results
       WHERE preview_id = $1 AND position = 1`,
      [prepared.preview.previewId],
    );

    const response = await confirm({
      clerkUserId,
      previewId: prepared.preview.previewId,
      idempotencyKey: crypto.randomUUID(),
    });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      ok: false,
      error: "preview_unverifiable",
    });
    const workspace = await request(app)
      .get("/api/discover")
      .set(TEST_USER_HEADER, clerkUserId);
    expect(workspace.body).toEqual({ follows: [], discoveries: [] });
  });

  it("requires a UUID idempotency key before consuming a receipt", async () => {
    const clerkUserId = "clerk_invalid_confirmation";
    const prepared = await prepare(clerkUserId);
    if (!prepared.ok || !("preview" in prepared)) {
      throw new Error("expected preview");
    }
    for (const key of [undefined, "not-a-uuid"]) {
      let confirmation = request(app)
        .post("/api/discover/follows")
        .set(TEST_USER_HEADER, clerkUserId);
      if (key !== undefined)
        confirmation = confirmation.set("Idempotency-Key", key);
      const response = await confirmation.send({
        previewId: prepared.preview.previewId,
      });
      expect(response.status).toBe(400);
      expect(response.body.error).toBe("invalid_request");
    }
    const workspace = await request(app)
      .get("/api/discover")
      .set(TEST_USER_HEADER, clerkUserId);
    expect(workspace.body).toEqual({ follows: [], discoveries: [] });
  });

  it("keeps workspace history readable with nullable Provider display metadata", async () => {
    const clerkUserId = "clerk_missing_projection";
    const prepared = await prepare(clerkUserId);
    if (!prepared.ok || !("preview" in prepared)) {
      throw new Error("expected preview");
    }
    await confirm({
      clerkUserId,
      previewId: prepared.preview.previewId,
      idempotencyKey: crypto.randomUUID(),
    }).expect(201);
    await harness.pool.query(
      `DELETE FROM discover_provider_result_projections
       WHERE provider_result_id IN (
         SELECT provider_result_id
         FROM discover_follow_preview_results
         WHERE preview_id = $1
       )`,
      [prepared.preview.previewId],
    );
    await harness.pool.query(
      `DELETE FROM discover_provider_target_projections
       WHERE provider_target_id = (
         SELECT provider_target_id
         FROM discover_follow_previews
         WHERE id = $1
       )`,
      [prepared.preview.previewId],
    );

    const workspace = await request(app)
      .get("/api/discover")
      .set(TEST_USER_HEADER, clerkUserId);
    expect(workspace.status).toBe(200);
    expect(workspace.body.follows[0].name).toBeNull();
    expect(workspace.body.discoveries).toHaveLength(2);
    expect(workspace.body.discoveries[0]).toMatchObject({
      followName: null,
      title: null,
      source: null,
      publisher: null,
      publishedAt: null,
      durationSeconds: null,
      type: null,
      thumbnailUrl: null,
    });
  });

  it("enforces Candidate-to-Item and Discovery ownership in PostgreSQL", async () => {
    const ownerClerkId = "clerk_constraint_owner";
    const otherClerkId = "clerk_constraint_other";
    const prepared = await prepare(ownerClerkId);
    if (!prepared.ok || !("preview" in prepared)) {
      throw new Error("expected preview");
    }
    const confirmed = await confirm({
      clerkUserId: ownerClerkId,
      previewId: prepared.preview.previewId,
      idempotencyKey: crypto.randomUUID(),
    });
    await request(app)
      .post("/api/items")
      .set(TEST_USER_HEADER, otherClerkId)
      .send({ title: "Someone else's Item", type: "video" })
      .expect(201);
    const rows = await harness.pool.query<{
      candidate_id: string;
      discovery_id: string;
      follow_id: string;
      other_user_id: string;
      other_item_id: string;
    }>(
      `SELECT
         candidate.id AS candidate_id,
         discovery.id AS discovery_id,
         discovery.follow_id,
         other_user.id AS other_user_id,
         other_item.id AS other_item_id
       FROM discover_candidates candidate
       JOIN discover_discoveries discovery
         ON discovery.candidate_id = candidate.id
       JOIN users other_user ON other_user.clerk_user_id = $1
       JOIN items other_item ON other_item.user_id = other_user.id
       WHERE discovery.id = $2`,
      [otherClerkId, confirmed.body.discoveries[0].id],
    );
    const row = rows.rows[0];

    await expect(
      harness.pool.query(
        `UPDATE discover_candidates SET item_id = $1 WHERE id = $2`,
        [row.other_item_id, row.candidate_id],
      ),
    ).rejects.toMatchObject({ code: "23503" });
    await expect(
      harness.pool.query(
        `UPDATE discover_discoveries SET user_id = $1 WHERE id = $2`,
        [row.other_user_id, row.discovery_id],
      ),
    ).rejects.toMatchObject({ code: "23503" });
    await expect(
      harness.pool.query(
        `UPDATE discover_follow_preview_results
         SET user_id = $1
         WHERE preview_id = $2 AND position = 0`,
        [row.other_user_id, prepared.preview.previewId],
      ),
    ).rejects.toMatchObject({ code: "23503" });
    await expect(
      harness.pool.query(
        `UPDATE discover_follow_candidate_presence
         SET user_id = $1
         WHERE follow_id = $2`,
        [row.other_user_id, row.follow_id],
      ),
    ).rejects.toMatchObject({ code: "23503" });
    await expect(
      harness.pool.query(
        `UPDATE discover_follows SET user_id = $1 WHERE id = $2`,
        [row.other_user_id, row.follow_id],
      ),
    ).rejects.toMatchObject({ code: "23503" });
  });

  it("offers Resume for a paused duplicate and restores a removed Follow with new exact occurrences", async () => {
    const clerkUserId = "clerk_follow_restore";
    const prepared = await prepare(clerkUserId);
    if (!prepared.ok || !("preview" in prepared)) {
      throw new Error("expected preview");
    }
    const first = await confirm({
      clerkUserId,
      previewId: prepared.preview.previewId,
      idempotencyKey: crypto.randomUUID(),
    });
    const firstFollowId = first.body.follow.id as string;
    await request(app)
      .patch(`/api/discover/follows/${firstFollowId}/lifecycle`)
      .set(TEST_USER_HEADER, clerkUserId)
      .set("Idempotency-Key", crypto.randomUUID())
      .send({ lifecycle: "paused" })
      .expect(200);

    const paused = await request(app)
      .post("/api/discover/follow-previews")
      .set(TEST_USER_HEADER, clerkUserId)
      .send({
        provider: "youtube",
        target: { kind: "channel", url: "https://youtube.com/@quietlearning" },
      });
    expect(paused.status).toBe(200);
    expect(paused.body).toMatchObject({
      ok: true,
      outcome: "resume_available",
      follow: { id: firstFollowId, lifecycle: "paused" },
    });

    await request(app)
      .patch(`/api/discover/follows/${firstFollowId}/lifecycle`)
      .set(TEST_USER_HEADER, clerkUserId)
      .set("Idempotency-Key", crypto.randomUUID())
      .send({ lifecycle: "removed" })
      .expect(200);
    const firstPresence = await harness.pool.query<{
      first_surfaced_snapshot_id: string;
    }>(
      `SELECT first_surfaced_snapshot_id
       FROM discover_follow_candidate_presence
       WHERE follow_id = $1
       ORDER BY candidate_id
       LIMIT 1`,
      [firstFollowId],
    );
    currentNow = new Date(baselineNow.getTime() + 16 * 60 * 1_000);
    const followAgain = await prepare(clerkUserId);
    if (!followAgain.ok || !("preview" in followAgain)) {
      throw new Error("expected Follow-again preview");
    }
    expect(followAgain.preview.restoresFollowId).toBe(firstFollowId);
    const restored = await confirm({
      clerkUserId,
      previewId: followAgain.preview.previewId,
      idempotencyKey: crypto.randomUUID(),
    });
    expect(restored.body.follow).toMatchObject({
      id: firstFollowId,
      lifecycle: "active",
    });
    const workspace = await request(app)
      .get("/api/discover")
      .set(TEST_USER_HEADER, clerkUserId);
    expect(workspace.body.follows).toHaveLength(1);
    expect(workspace.body.discoveries).toHaveLength(4);
    const restoredPresence = await harness.pool.query<{
      first_surfaced_snapshot_id: string;
      last_surfaced_snapshot_id: string;
    }>(
      `SELECT first_surfaced_snapshot_id, last_surfaced_snapshot_id
       FROM discover_follow_candidate_presence
       WHERE follow_id = $1
       ORDER BY candidate_id
       LIMIT 1`,
      [firstFollowId],
    );
    expect(restoredPresence.rows[0]?.first_surfaced_snapshot_id).toBe(
      firstPresence.rows[0]?.first_surfaced_snapshot_id,
    );
    expect(restoredPresence.rows[0]?.last_surfaced_snapshot_id).not.toBe(
      firstPresence.rows[0]?.first_surfaced_snapshot_id,
    );
  });

  it("mutates an owned Follow lifecycle with replay-safe conflict handling", async () => {
    const clerkUserId = "clerk_follow_lifecycle";
    const prepared = await prepare(clerkUserId);
    if (!prepared.ok || !("preview" in prepared)) {
      throw new Error("expected preview");
    }
    const confirmed = await confirm({
      clerkUserId,
      previewId: prepared.preview.previewId,
      idempotencyKey: crypto.randomUUID(),
    });
    const followId = confirmed.body.follow.id as string;
    const key = crypto.randomUUID();

    const pause = () =>
      request(app)
        .patch(`/api/discover/follows/${followId}/lifecycle`)
        .set(TEST_USER_HEADER, clerkUserId)
        .set("Idempotency-Key", key)
        .send({ lifecycle: "paused" });
    const concurrentReplay = await Promise.all([
      pause().expect(200),
      pause().expect(200),
    ]);
    for (const response of concurrentReplay) {
      const body = response.body as SetFollowLifecycleResponse;
      expect(body.ok).toBe(true);
      if (body.ok) {
        expect(body.follow.id).toBe(followId);
        expect(body.follow.lifecycle).toBe("paused");
      }
    }
    expect(
      (
        await request(app)
          .patch(`/api/discover/follows/${followId}/lifecycle`)
          .set(TEST_USER_HEADER, clerkUserId)
          .set("Idempotency-Key", key)
          .send({ lifecycle: "active" })
          .expect(409)
      ).body,
    ).toEqual({ ok: false, error: "idempotency_conflict" });
    await request(app)
      .patch(`/api/discover/follows/${followId}/lifecycle`)
      .set(TEST_USER_HEADER, "clerk_follow_lifecycle_intruder")
      .set("Idempotency-Key", crypto.randomUUID())
      .send({ lifecycle: "active" })
      .expect(404, { ok: false, error: "follow_missing" });
    await request(app)
      .patch(`/api/discover/follows/${followId}/lifecycle`)
      .set(TEST_USER_HEADER, clerkUserId)
      .send({ lifecycle: "active" })
      .expect(400);

    const resumed = await request(app)
      .patch(`/api/discover/follows/${followId}/lifecycle`)
      .set(TEST_USER_HEADER, clerkUserId)
      .set("Idempotency-Key", crypto.randomUUID())
      .send({ lifecycle: "active" })
      .expect(200);
    expect(resumed.body.follow.lifecycle).toBe("active");
    const workspace = await request(app)
      .get("/api/discover")
      .set(TEST_USER_HEADER, clerkUserId)
      .expect(200);
    expect(workspace.body.discoveries).toHaveLength(videos.length);
  });
});
