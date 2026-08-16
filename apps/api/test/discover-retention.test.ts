import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { drizzle } from "drizzle-orm/node-postgres";
import request from "supertest";
import {
  Type,
  type DiscoverWorkspace,
  type PrepareFollowResponse,
} from "@unshelf/shared";
import { createDiscoverModule } from "../src/discover/module";
import type {
  ProviderPreview,
  ProviderPreviewResult,
  YouTubeAdapter,
} from "../src/discover/youtube-adapter";
import * as schema from "../src/schema";
import { startTestApp, TEST_USER_HEADER, type TestApp } from "./harness";

const fetchedAt = new Date("2026-08-16T12:00:00.000Z");
let currentNow = fetchedAt;
const previewChannel = vi.fn<YouTubeAdapter["previewChannel"]>();
const acquireChannel = vi.fn<YouTubeAdapter["acquireChannel"]>();
const acquireChannelByUrl = vi.fn<YouTubeAdapter["acquireChannelByUrl"]>();
const adapter: YouTubeAdapter = {
  previewChannel,
  acquireChannel,
  acquireChannelByUrl,
};
let harness: TestApp;

const providerPreview: ProviderPreview = {
  ok: true,
  outcome: "preview",
  channelId: "UC_retention",
  uploadsPlaylistId: "UU_retention",
  publisher: "Retention Channel",
  videos: [
    {
      provider: "youtube",
      providerIdentity: "video-kept",
      title: "Keep this title",
      source: "https://www.youtube.com/watch?v=video-kept",
      publisher: "Retention Channel",
      publishedAt: "2026-08-15T10:00:00.000Z",
      durationSeconds: 601,
      type: Type.Video,
      thumbnailUrl: "https://i.ytimg.com/vi/video-kept/hqdefault.jpg",
    },
    {
      provider: "youtube",
      providerIdentity: "video-unresolved",
      title: "Current Provider title",
      source: "https://www.youtube.com/watch?v=video-unresolved",
      publisher: "Retention Channel",
      publishedAt: "2026-08-14T10:00:00.000Z",
      durationSeconds: 602,
      type: Type.Video,
      thumbnailUrl: null,
    },
  ],
  rejectedCount: 0,
  coverageStartedAt: "2026-07-17T12:00:00.000Z",
};

beforeAll(async () => {
  previewChannel.mockResolvedValue(providerPreview);
  harness = await startTestApp(undefined, {
    discover: { enabled: true, adapter, now: () => currentNow },
  });
});

beforeEach(async () => {
  currentNow = fetchedAt;
  vi.clearAllMocks();
  previewChannel.mockResolvedValue(providerPreview);
  await harness.pool.query(
    "TRUNCATE discover_provider_targets, discover_provider_results, discover_provider_gates, users CASCADE",
  );
});

afterAll(async () => {
  await harness?.stop();
});

describe("Discover Provider retention", () => {
  it("expires due YouTube data while preserving User history and confirmed Item fields", async () => {
    const clerkUserId = "clerk_retention_due";
    const prepared = await request(harness.app)
      .post("/api/discover/follow-previews")
      .set(TEST_USER_HEADER, clerkUserId)
      .send({
        provider: "youtube",
        target: {
          kind: "channel",
          url: "https://youtube.com/@retention",
        },
      })
      .expect(201);
    const preparedBody = prepared.body as PrepareFollowResponse;
    if (!preparedBody.ok || !("preview" in preparedBody)) {
      throw new Error("expected preview");
    }
    await request(harness.app)
      .post("/api/discover/follows")
      .set(TEST_USER_HEADER, clerkUserId)
      .set("Idempotency-Key", crypto.randomUUID())
      .send({ previewId: preparedBody.preview.previewId })
      .expect(201);

    const beforeCleanup = await readWorkspace(clerkUserId);
    const keptDiscovery = beforeCleanup.discoveries.find(
      ({ title }) => title === "Keep this title",
    );
    const unresolvedDiscovery = beforeCleanup.discoveries.find(
      ({ title }) => title === "Current Provider title",
    );
    if (keptDiscovery === undefined || unresolvedDiscovery === undefined) {
      throw new Error("expected seeded Discoveries");
    }
    const kept = await request(harness.app)
      .post(`/api/discover/discoveries/${keptDiscovery.id}/keep`)
      .set(TEST_USER_HEADER, clerkUserId)
      .set("Idempotency-Key", crypto.randomUUID())
      .send({
        title: "My confirmed title",
        source: keptDiscovery.source,
        type: Type.Video,
      })
      .expect(200);

    currentNow = new Date("2026-09-14T12:00:00.000Z");
    const db = drizzle(harness.pool, { schema });
    const discover = createDiscoverModule({
      db,
      youtube: adapter,
      now: () => currentNow,
      logger: harness.logger,
    });
    const logOffset = harness.logger.records.length;
    const report = await discover.purgeProviderData({
      kind: "expire_due",
      batchSize: 1,
    });

    expect(report).toEqual({
      kind: "expire_due",
      provider: "youtube",
      clearedRows: 6,
      skippedGenerationRows: 0,
      failedOperations: 0,
      dueRows: 6,
    });
    const retentionLogs = harness.logger.records.slice(logOffset);
    expect(retentionLogs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: "unshelf.discover.retention.metric",
          kind: "expire_due",
          provider: "youtube",
          clearedRows: 6,
          dueRows: 6,
          skippedGenerationRows: 0,
          failedOperations: 0,
        }),
      ]),
    );
    const retentionMetric = retentionLogs.find(
      ({ event }) => event === "unshelf.discover.retention.metric",
    );
    expect(typeof retentionMetric?.durationMs).toBe("number");
    const serializedLogs = JSON.stringify(retentionLogs);
    expect(serializedLogs).not.toContain(clerkUserId);
    expect(serializedLogs).not.toContain("Retention Channel");
    expect(serializedLogs).not.toContain("video-kept");
    expect(serializedLogs).not.toContain("youtube.com");
    const afterCleanup = await readWorkspace(clerkUserId);
    expect(afterCleanup.follows).toEqual([
      expect.objectContaining({ lifecycle: "active", name: null }),
    ]);
    expect(afterCleanup.discoveries).toEqual([
      expect.objectContaining({
        id: unresolvedDiscovery.id,
        title: null,
        source: null,
        publisher: null,
        publishedAt: null,
        durationSeconds: null,
        type: null,
        thumbnailUrl: null,
      }),
    ]);
    await request(harness.app)
      .post(`/api/discover/discoveries/${unresolvedDiscovery.id}/keep`)
      .set(TEST_USER_HEADER, clerkUserId)
      .set("Idempotency-Key", crypto.randomUUID())
      .send({
        title: "Cannot keep stale data",
        source: providerPreview.videos[1]?.source,
        type: Type.Video,
      })
      .expect(409, { ok: false, error: "keep_metadata_unavailable" });
    await request(harness.app)
      .post("/api/discover/discovery-decisions")
      .set(TEST_USER_HEADER, clerkUserId)
      .set("Idempotency-Key", crypto.randomUUID())
      .send({ discoveryIds: [unresolvedDiscovery.id], decision: "dismissed" })
      .expect(200);
    const history = await request(harness.app)
      .get("/api/discover/history")
      .set(TEST_USER_HEADER, clerkUserId)
      .expect(200);
    expect(history.body.discoveries).toHaveLength(2);
    expect(history.body.discoveries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          state: "kept",
          title: null,
          source: null,
        }),
        expect.objectContaining({
          state: "dismissed",
          title: null,
          source: null,
        }),
      ]),
    );
    const item = await request(harness.app)
      .get(`/api/items/${kept.body.item.id}`)
      .set(TEST_USER_HEADER, clerkUserId)
      .expect(200);
    expect(item.body).toMatchObject({
      title: "My confirmed title",
      source: providerPreview.videos[0]?.source,
      type: Type.Video,
    });
    const retained = await harness.pool.query<{
      targets: string;
      target_external_references: string;
      results: string;
      result_external_references: string;
      candidates: string;
      linked_candidates: string;
      discoveries: string;
      items: string;
    }>(`SELECT
      (SELECT count(*)::text FROM discover_provider_targets) AS targets,
      (SELECT count(*)::text FROM discover_provider_targets WHERE external_reference IS NOT NULL) AS target_external_references,
      (SELECT count(*)::text FROM discover_provider_results) AS results,
      (SELECT count(*)::text FROM discover_provider_results WHERE external_reference IS NOT NULL) AS result_external_references,
      (SELECT count(*)::text FROM discover_candidates) AS candidates,
      (SELECT count(*)::text FROM discover_candidates WHERE item_id IS NOT NULL) AS linked_candidates,
      (SELECT count(*)::text FROM discover_discoveries) AS discoveries,
      (SELECT count(*)::text FROM items) AS items`);
    expect(retained.rows[0]).toEqual({
      targets: "1",
      target_external_references: "0",
      results: "2",
      result_external_references: "0",
      candidates: "2",
      linked_candidates: "1",
      discoveries: "2",
      items: "1",
    });
    await expect(
      discover.purgeProviderData({ kind: "expire_due", batchSize: 1 }),
    ).resolves.toEqual({
      kind: "expire_due",
      provider: "youtube",
      clearedRows: 0,
      skippedGenerationRows: 0,
      failedOperations: 0,
      dueRows: 0,
    });
  });

  it("waits until the 29-day safety boundary before expiring data", async () => {
    const clerkUserId = "clerk_retention_boundary";
    await createFollow({
      clerkUserId,
      channelId: "UC_retention_boundary",
    });
    const db = drizzle(harness.pool, { schema });
    const discover = createDiscoverModule({
      db,
      youtube: adapter,
      now: () => currentNow,
      logger: harness.logger,
    });

    currentNow = new Date("2026-09-14T11:59:59.999Z");
    await expect(
      discover.purgeProviderData({ kind: "expire_due", batchSize: 1 }),
    ).resolves.toMatchObject({
      clearedRows: 0,
      skippedGenerationRows: 0,
      failedOperations: 0,
      dueRows: 0,
    });
    expect((await readWorkspace(clerkUserId)).discoveries[0]?.title).toBe(
      "Keep this title",
    );

    currentNow = new Date("2026-09-14T12:00:00.000Z");
    await expect(
      discover.purgeProviderData({ kind: "expire_due", batchSize: 1 }),
    ).resolves.toMatchObject({
      clearedRows: 6,
      skippedGenerationRows: 0,
      failedOperations: 0,
      dueRows: 6,
    });
  });

  it("does not extend a complete checkpoint during a later partial acquisition", async () => {
    currentNow = fetchedAt;
    const clerkUserId = "clerk_retention_checkpoint";
    const prepared = await createFollow({
      clerkUserId,
      channelId: "UC_retention_checkpoint",
    });
    acquireChannel.mockResolvedValueOnce({
      ...providerPreview,
      channelId: prepared.channelId,
      outcome: "preview",
    });
    await request(harness.app)
      .post("/api/discover/acquisitions")
      .set(TEST_USER_HEADER, clerkUserId)
      .send({ trigger: "manual_follow", followId: prepared.followId })
      .expect(200);
    const beforePartial = await harness.pool.query<{
      checkpoint_fetched_at: Date;
      checkpoint_expires_at: Date;
    }>(
      `SELECT checkpoint_fetched_at, checkpoint_expires_at
       FROM discover_provider_targets
       WHERE external_reference = $1`,
      [prepared.channelId],
    );

    currentNow = new Date("2026-08-17T12:00:00.000Z");
    acquireChannel.mockResolvedValueOnce({
      ...providerPreview,
      channelId: prepared.channelId,
      outcome: "partial",
      rejectedCount: 1,
    });
    await request(harness.app)
      .post("/api/discover/acquisitions")
      .set(TEST_USER_HEADER, clerkUserId)
      .send({ trigger: "manual_follow", followId: prepared.followId })
      .expect(200);
    const afterPartial = await harness.pool.query<{
      checkpoint_fetched_at: Date;
      checkpoint_expires_at: Date;
    }>(
      `SELECT checkpoint_fetched_at, checkpoint_expires_at
       FROM discover_provider_targets
       WHERE external_reference = $1`,
      [prepared.channelId],
    );

    expect(afterPartial.rows[0]).toEqual(beforePartial.rows[0]);
  });

  it("creates new Candidates when reacquisition cannot prove purged result identity", async () => {
    currentNow = fetchedAt;
    const clerkUserId = "clerk_retention_reacquire";
    const created = await createFollow({
      clerkUserId,
      channelId: "UC_retention_reacquire",
    });
    const before = await readWorkspace(clerkUserId);
    const originalCandidateIds = before.discoveries.map(({ candidateId }) =>
      String(candidateId),
    );
    currentNow = new Date("2026-09-14T12:00:00.000Z");
    const db = drizzle(harness.pool, { schema });
    const discover = createDiscoverModule({
      db,
      youtube: adapter,
      now: () => currentNow,
      logger: harness.logger,
    });
    await discover.purgeProviderData({ kind: "expire_due", batchSize: 1 });

    acquireChannelByUrl.mockResolvedValueOnce({
      ...providerPreview,
      channelId: created.channelId,
    });
    const refreshed = await request(harness.app)
      .post("/api/discover/acquisitions")
      .set(TEST_USER_HEADER, clerkUserId)
      .send({ trigger: "manual_follow", followId: created.followId })
      .expect(200);
    expect(refreshed.body).toMatchObject({
      ok: true,
      acquisition: { outcome: "complete", acceptedCount: 2 },
    });
    const after = await readWorkspace(clerkUserId);
    expect(after.discoveries).toHaveLength(4);
    const restored = after.discoveries.filter(({ title }) => title !== null);
    expect(restored).toHaveLength(2);
    expect(
      restored.every(
        ({ candidateId }) =>
          !originalCandidateIds.includes(String(candidateId)),
      ),
    ).toBe(true);
  });

  it("skips cleanup selected before a newer Provider generation commits", async () => {
    const clerkUserId = "clerk_retention_race";
    const created = await createFollow({
      clerkUserId,
      channelId: "UC_retention_race",
    });
    currentNow = new Date("2026-09-14T12:00:00.000Z");
    const discover = createDiscoverModule({
      db: drizzle(harness.pool, { schema }),
      youtube: adapter,
      now: () => currentNow,
      logger: harness.logger,
    });
    let finishAcquisition!: (result: ProviderPreviewResult) => void;
    acquireChannel.mockReturnValueOnce(
      new Promise((resolve) => {
        finishAcquisition = resolve;
      }),
    );
    const refresh = request(harness.app)
      .post("/api/discover/acquisitions")
      .set(TEST_USER_HEADER, clerkUserId)
      .send({ trigger: "manual_follow", followId: created.followId })
      .then((response) => response);
    await vi.waitFor(() => expect(acquireChannel).toHaveBeenCalledTimes(1));

    const publicationLock = await harness.pool.connect();
    let lockCommitted = false;
    try {
      await publicationLock.query("BEGIN");
      await publicationLock.query(
        `SELECT id
         FROM discover_provider_targets
         WHERE external_reference = $1
         FOR UPDATE`,
        [created.channelId],
      );

      finishAcquisition({
        ...providerPreview,
        channelId: created.channelId,
        videos: providerPreview.videos.map((video, index) =>
          index === 0 ? { ...video, title: "Fresh Provider title" } : video,
        ),
      });
      await vi.waitFor(
        async () => {
          const waiting = await harness.pool.query(
            `SELECT 1
             FROM pg_stat_activity
             WHERE pid <> pg_backend_pid()
               AND wait_event_type = 'Lock'
               AND query ILIKE '%discover_provider_targets%'`,
          );
          expect(waiting.rowCount).toBeGreaterThan(0);
        },
        { timeout: 2_000, interval: 10 },
      );

      const cleanup = discover.purgeProviderData({
        kind: "expire_due",
        batchSize: 1,
      });
      await vi.waitFor(
        async () => {
          const waiting = await harness.pool.query(
            `SELECT 1
             FROM pg_stat_activity
             WHERE pid <> pg_backend_pid()
               AND wait_event_type = 'Lock'
               AND query ILIKE '%discover_provider_targets%'`,
          );
          expect(waiting.rowCount).toBeGreaterThan(1);
        },
        { timeout: 2_000, interval: 10 },
      );

      await publicationLock.query("COMMIT");
      lockCommitted = true;
      expect((await refresh).body).toMatchObject({
        ok: true,
        acquisition: { outcome: "complete" },
      });

      await expect(cleanup).resolves.toEqual({
        kind: "expire_due",
        provider: "youtube",
        clearedRows: 0,
        skippedGenerationRows: 1,
        failedOperations: 0,
        dueRows: 1,
      });
    } finally {
      if (!lockCommitted) await publicationLock.query("ROLLBACK");
      publicationLock.release();
    }
    expect(await readWorkspace(clerkUserId)).toMatchObject({
      follows: [{ name: "Retention Channel" }],
      discoveries: [
        { title: "Fresh Provider title" },
        { title: "Current Provider title" },
      ],
    });
  });

  it("preserves each User's private decisions and Items over shared cleanup", async () => {
    const channelId = "UC_retention_shared_users";
    await createFollow({ clerkUserId: "clerk_retention_user_a", channelId });
    await createFollow({ clerkUserId: "clerk_retention_user_b", channelId });
    const workspaceA = await readWorkspace("clerk_retention_user_a");
    const workspaceB = await readWorkspace("clerk_retention_user_b");
    const discoveryA = workspaceA.discoveries[0];
    const discoveryB = workspaceB.discoveries[0];
    if (discoveryA === undefined || discoveryB === undefined) {
      throw new Error("expected private Discoveries");
    }
    expect(discoveryA.candidateId).not.toBe(discoveryB.candidateId);
    await request(harness.app)
      .post("/api/discover/discovery-decisions")
      .set(TEST_USER_HEADER, "clerk_retention_user_a")
      .set("Idempotency-Key", crypto.randomUUID())
      .send({ discoveryIds: [discoveryA.id], decision: "dismissed" })
      .expect(200);
    await request(harness.app)
      .post(`/api/discover/discoveries/${discoveryB.id}/keep`)
      .set(TEST_USER_HEADER, "clerk_retention_user_b")
      .set("Idempotency-Key", crypto.randomUUID())
      .send({
        title: "User B's confirmed Item",
        source: discoveryB.source,
        type: Type.Video,
      })
      .expect(200);

    currentNow = new Date("2026-09-14T12:00:00.000Z");
    const discover = createDiscoverModule({
      db: drizzle(harness.pool, { schema }),
      youtube: adapter,
      now: () => currentNow,
      logger: harness.logger,
    });
    await discover.purgeProviderData({ kind: "expire_due", batchSize: 1 });

    const [historyA, historyB, itemsA, itemsB] = await Promise.all([
      request(harness.app)
        .get("/api/discover/history")
        .set(TEST_USER_HEADER, "clerk_retention_user_a")
        .expect(200),
      request(harness.app)
        .get("/api/discover/history")
        .set(TEST_USER_HEADER, "clerk_retention_user_b")
        .expect(200),
      request(harness.app)
        .get("/api/items")
        .set(TEST_USER_HEADER, "clerk_retention_user_a")
        .expect(200),
      request(harness.app)
        .get("/api/items")
        .set(TEST_USER_HEADER, "clerk_retention_user_b")
        .expect(200),
    ]);
    expect(historyA.body.discoveries).toEqual([
      expect.objectContaining({
        id: discoveryA.id,
        state: "dismissed",
        title: null,
      }),
    ]);
    expect(historyB.body.discoveries).toEqual([
      expect.objectContaining({
        id: discoveryB.id,
        state: "kept",
        title: null,
      }),
    ]);
    expect(itemsA.body).toEqual([]);
    expect(itemsB.body).toEqual([
      expect.objectContaining({ title: "User B's confirmed Item" }),
    ]);
  });

  it("gates acquisition before an idempotent complete YouTube purge", async () => {
    currentNow = fetchedAt;
    const clerkUserId = "clerk_retention_complete";
    const created = await createFollow({
      clerkUserId,
      channelId: "UC_retention_complete",
    });
    acquireChannel.mockResolvedValueOnce({
      ...providerPreview,
      channelId: created.channelId,
    });
    await request(harness.app)
      .post("/api/discover/acquisitions")
      .set(TEST_USER_HEADER, clerkUserId)
      .send({ trigger: "manual_follow", followId: created.followId })
      .expect(200);
    const db = drizzle(harness.pool, { schema });
    const discover = createDiscoverModule({
      db,
      youtube: adapter,
      now: () => currentNow,
      logger: harness.logger,
    });

    const first = await discover.purgeProviderData({
      kind: "complete",
      provider: "youtube",
      batchSize: 1,
    });
    expect(first).toEqual({
      kind: "complete",
      provider: "youtube",
      clearedRows: 7,
      skippedGenerationRows: 0,
      failedOperations: 0,
      dueRows: 0,
    });
    const callsBeforeRefresh = acquireChannel.mock.calls.length;
    const refresh = await request(harness.app)
      .post("/api/discover/acquisitions")
      .set(TEST_USER_HEADER, clerkUserId)
      .send({ trigger: "manual_follow", followId: created.followId })
      .expect(200);
    expect(refresh.body).toMatchObject({
      ok: true,
      acquisition: { outcome: "provider_unavailable" },
    });
    expect(acquireChannel).toHaveBeenCalledTimes(callsBeforeRefresh);
    const previewCallsBefore = previewChannel.mock.calls.length;
    await request(harness.app)
      .post("/api/discover/follow-previews")
      .set(TEST_USER_HEADER, "clerk_retention_after_suspension")
      .send({
        provider: "youtube",
        target: {
          kind: "channel",
          url: "https://youtube.com/@suspended",
        },
      })
      .expect(503, { ok: false, error: "provider_unavailable" });
    expect(previewChannel).toHaveBeenCalledTimes(previewCallsBefore);
    const workspace = await readWorkspace(clerkUserId);
    expect(workspace.follows).toEqual([
      expect.objectContaining({ lifecycle: "active", name: null }),
    ]);
    expect(workspace.discoveries).toHaveLength(2);
    expect(workspace.discoveries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: null, source: null }),
        expect.objectContaining({ title: null, source: null }),
      ]),
    );

    await expect(
      discover.purgeProviderData({
        kind: "complete",
        provider: "youtube",
        batchSize: 1,
      }),
    ).resolves.toEqual({
      kind: "complete",
      provider: "youtube",
      clearedRows: 0,
      skippedGenerationRows: 0,
      failedOperations: 0,
      dueRows: 0,
    });
  });

  it("does not publish an in-flight preview behind a complete purge", async () => {
    let finishPreview!: (result: ProviderPreviewResult) => void;
    previewChannel.mockReturnValueOnce(
      new Promise((resolve) => {
        finishPreview = resolve;
      }),
    );
    const preview = request(harness.app)
      .post("/api/discover/follow-previews")
      .set(TEST_USER_HEADER, "clerk_retention_preview_race")
      .send({
        provider: "youtube",
        target: {
          kind: "channel",
          url: "https://youtube.com/@preview-race",
        },
      })
      .then((response) => response);
    await vi.waitFor(() => expect(previewChannel).toHaveBeenCalledTimes(1));

    const targetLock = await harness.pool.connect();
    let lockCommitted = false;
    try {
      await targetLock.query("BEGIN");
      await targetLock.query(
        `INSERT INTO discover_provider_targets (
           provider,
           target_kind,
           acquisition_scope,
           external_reference,
           target_payload,
           fetched_at,
           expires_at
         ) VALUES ('youtube', 'channel', 'system', $1, $2, $3, $4)`,
        [
          providerPreview.channelId,
          JSON.stringify({
            schemaVersion: 1,
            uploadsPlaylistId: providerPreview.uploadsPlaylistId,
          }),
          fetchedAt,
          new Date("2026-09-15T12:00:00.000Z"),
        ],
      );
      finishPreview(providerPreview);
      await vi.waitFor(async () => {
        const waiting = await harness.pool.query(
          `SELECT 1
           FROM pg_stat_activity
           WHERE pid <> pg_backend_pid()
             AND wait_event_type = 'Lock'`,
        );
        expect(waiting.rowCount).toBeGreaterThan(0);
      });

      const discover = createDiscoverModule({
        db: drizzle(harness.pool, { schema }),
        youtube: adapter,
        now: () => currentNow,
        logger: harness.logger,
      });
      const purge = discover.purgeProviderData({
        kind: "complete",
        provider: "youtube",
      });
      await vi.waitFor(
        async () => {
          const waiting = await harness.pool.query(
            `SELECT 1
             FROM pg_stat_activity
             WHERE pid <> pg_backend_pid()
               AND wait_event_type = 'Lock'`,
          );
          expect(waiting.rowCount).toBeGreaterThan(1);
        },
        { timeout: 2_000, interval: 10 },
      );

      await targetLock.query("COMMIT");
      lockCommitted = true;
      expect((await preview).status).toBe(201);
      await purge;
    } finally {
      if (!lockCommitted) await targetLock.query("ROLLBACK");
      targetLock.release();
    }

    const providerData = await harness.pool.query(
      `SELECT
         (SELECT count(*)::int FROM discover_provider_targets
          WHERE external_reference IS NOT NULL OR target_payload IS NOT NULL) AS targets,
         (SELECT count(*)::int FROM discover_provider_target_projections) AS target_projections,
         (SELECT count(*)::int FROM discover_provider_results
          WHERE external_reference IS NOT NULL) AS results,
         (SELECT count(*)::int FROM discover_provider_result_projections) AS result_projections`,
    );
    expect(providerData.rows[0]).toEqual({
      targets: 0,
      target_projections: 0,
      results: 0,
      result_projections: 0,
    });
  });
});

async function createFollow({
  clerkUserId,
  channelId,
}: {
  clerkUserId: string;
  channelId: string;
}): Promise<{ followId: string; channelId: string }> {
  previewChannel.mockResolvedValueOnce({ ...providerPreview, channelId });
  const prepared = await request(harness.app)
    .post("/api/discover/follow-previews")
    .set(TEST_USER_HEADER, clerkUserId)
    .send({
      provider: "youtube",
      target: {
        kind: "channel",
        url: `https://youtube.com/@${clerkUserId}`,
      },
    })
    .expect(201);
  const body = prepared.body as PrepareFollowResponse;
  if (!body.ok || !("preview" in body)) throw new Error("expected preview");
  const confirmed = await request(harness.app)
    .post("/api/discover/follows")
    .set(TEST_USER_HEADER, clerkUserId)
    .set("Idempotency-Key", crypto.randomUUID())
    .send({ previewId: body.preview.previewId })
    .expect(201);
  return { followId: confirmed.body.follow.id as string, channelId };
}

async function readWorkspace(clerkUserId: string): Promise<DiscoverWorkspace> {
  const response = await request(harness.app)
    .get("/api/discover")
    .set(TEST_USER_HEADER, clerkUserId)
    .expect(200);
  return response.body as DiscoverWorkspace;
}
