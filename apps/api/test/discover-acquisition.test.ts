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
  type FollowPreviewVideo,
  type PrepareFollowResponse,
} from "@unshelf/shared";
import type {
  ProviderPreview,
  ProviderPreviewResult,
  YouTubeAdapter,
} from "../src/discover/youtube-adapter";
import { startTestApp, TEST_USER_HEADER, type TestApp } from "./harness";

const baselineNow = new Date("2026-08-16T12:00:00.000Z");
let currentNow = baselineNow;
const originalVideo: FollowPreviewVideo = {
  provider: "youtube",
  providerIdentity: "video-original",
  title: "Stored before refresh",
  source: "https://www.youtube.com/watch?v=video-original",
  publisher: "Quiet Learning",
  publishedAt: "2026-08-15T10:00:00.000Z",
  durationSeconds: 601,
  type: Type.Video,
  thumbnailUrl: null,
};
const newVideo: FollowPreviewVideo = {
  ...originalVideo,
  providerIdentity: "video-new",
  title: "Accepted during refresh",
  source: "https://www.youtube.com/watch?v=video-new",
  publishedAt: "2026-08-16T10:00:00.000Z",
};

const successfulAcquisition = (
  videos: FollowPreviewVideo[],
  channelId = "UC_refresh",
): ProviderPreview => ({
  ok: true,
  outcome: videos.length === 0 ? "empty" : "preview",
  channelId,
  uploadsPlaylistId: "UU_refresh",
  publisher: "Quiet Learning",
  videos,
  rejectedCount: 0,
  coverageStartedAt: "2026-07-17T12:00:00.000Z",
});

const previewChannel = vi.fn<YouTubeAdapter["previewChannel"]>();
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

afterEach(async () => {
  currentNow = baselineNow;
  vi.clearAllMocks();
  await harness.pool.query("DELETE FROM discover_provider_gates");
});

afterAll(async () => {
  await harness?.stop();
});

async function createFollow({
  clerkUserId,
  channelId = `UC_${clerkUserId}`,
}: {
  clerkUserId: string;
  channelId?: string;
}) {
  previewChannel.mockResolvedValueOnce(
    successfulAcquisition([originalVideo], channelId),
  );
  const prepared = await request(app)
    .post("/api/discover/follow-previews")
    .set(TEST_USER_HEADER, clerkUserId)
    .send({
      provider: "youtube",
      target: {
        kind: "channel",
        url: "https://youtube.com/@quietlearning",
      },
    });
  const body = prepared.body as PrepareFollowResponse;
  if (!body.ok || !("preview" in body)) throw new Error("expected preview");
  const confirmed = await request(app)
    .post("/api/discover/follows")
    .set(TEST_USER_HEADER, clerkUserId)
    .set("Idempotency-Key", crypto.randomUUID())
    .send({ previewId: body.preview.previewId })
    .expect(201);
  return { followId: confirmed.body.follow.id as string, channelId };
}

describe("POST /api/discover/acquisitions", () => {
  it("joins one shared acquisition while applying its snapshot privately for each User", async () => {
    const channelId = "UC_shared_acquisition";
    const first = await createFollow({
      clerkUserId: "clerk_shared_first",
      channelId,
    });
    const second = await createFollow({
      clerkUserId: "clerk_shared_second",
      channelId,
    });
    let finishProviderCall!: (result: ProviderPreviewResult) => void;
    const callsBeforeRefresh = acquireChannel.mock.calls.length;
    acquireChannel.mockReturnValueOnce(
      new Promise((resolve) => {
        finishProviderCall = resolve;
      }),
    );

    const firstRequest = request(app)
      .post("/api/discover/acquisitions")
      .set(TEST_USER_HEADER, "clerk_shared_first")
      .send({ trigger: "manual_follow", followId: first.followId })
      .then((response) => response);
    const secondRequest = request(app)
      .post("/api/discover/acquisitions")
      .set(TEST_USER_HEADER, "clerk_shared_second")
      .send({ trigger: "manual_follow", followId: second.followId })
      .then((response) => response);
    await vi.waitFor(() =>
      expect(acquireChannel).toHaveBeenCalledTimes(callsBeforeRefresh + 1),
    );
    finishProviderCall(successfulAcquisition([newVideo], channelId));

    const responses = await Promise.all([firstRequest, secondRequest]);
    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    expect(
      responses.map((response) => response.body.acquisition.outcome).sort(),
    ).toEqual(["complete", "joined"]);
    expect(acquireChannel).toHaveBeenCalledTimes(callsBeforeRefresh + 1);

    for (const clerkUserId of ["clerk_shared_first", "clerk_shared_second"]) {
      const workspace = await request(app)
        .get("/api/discover")
        .set(TEST_USER_HEADER, clerkUserId)
        .expect(200);
      expect(workspace.body.discoveries).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ title: "Accepted during refresh" }),
        ]),
      );
      expect(workspace.body.follows).toHaveLength(1);
    }

    const shared = await harness.pool.query<{
      attempts: string;
      snapshots: string;
      candidates: string;
      discoveries: string;
    }>(
      `SELECT
         (SELECT count(*) FROM discover_acquisition_attempts
          WHERE provider_target_id = target.id)::text AS attempts,
         (SELECT count(*) FROM discover_provider_snapshots
          WHERE provider_target_id = target.id
            AND acquisition_attempt_id IS NOT NULL)::text AS snapshots,
         (SELECT count(*) FROM discover_candidates candidate
          JOIN discover_provider_results result
            ON result.id = candidate.provider_result_id
          WHERE result.external_reference = 'video-new')::text AS candidates,
         (SELECT count(*) FROM discover_discoveries discovery
          JOIN discover_candidates candidate ON candidate.id = discovery.candidate_id
          JOIN discover_provider_results result
            ON result.id = candidate.provider_result_id
          WHERE result.external_reference = 'video-new')::text AS discoveries
       FROM discover_provider_targets target
       WHERE target.external_reference = $1`,
      [channelId],
    );
    expect(shared.rows[0]).toEqual({
      attempts: "1",
      snapshots: "1",
      candidates: "2",
      discoveries: "2",
    });
    expect(
      harness.logger.records.find(
        (record) =>
          record.event === "unshelf.discover.acquisition.metric" &&
          record.acceptedCount === 1,
      ),
    ).toMatchObject({
      retryCount: 0,
      leaseRecovered: false,
      coverageStartedAt: "2026-07-17T12:00:00.000Z",
      previousCoverageStartedAt: null,
      coverageMoved: false,
    });
  });

  it("shares a Provider quota gate across targets and manual requests", async () => {
    const first = await createFollow({
      clerkUserId: "clerk_gate_first",
      channelId: "UC_gate_first",
    });
    const second = await createFollow({
      clerkUserId: "clerk_gate_second",
      channelId: "UC_gate_second",
    });
    const callsBeforeQuota = acquireChannel.mock.calls.length;
    acquireChannel.mockResolvedValueOnce({
      ok: false,
      error: "quota_exceeded",
    });

    const exhausted = await request(app)
      .post("/api/discover/acquisitions")
      .set(TEST_USER_HEADER, "clerk_gate_first")
      .send({ trigger: "manual_follow", followId: first.followId })
      .expect(200);
    expect(exhausted.body.acquisition).toMatchObject({
      outcome: "throttled",
      nextEligibleAt: "2026-08-16T12:15:00.000Z",
    });

    const gated = await request(app)
      .post("/api/discover/acquisitions")
      .set(TEST_USER_HEADER, "clerk_gate_second")
      .send({ trigger: "manual_follow", followId: second.followId })
      .expect(200);
    expect(gated.body.acquisition).toMatchObject({
      outcome: "throttled",
      nextEligibleAt: "2026-08-16T12:15:00.000Z",
    });
    expect(acquireChannel).toHaveBeenCalledTimes(callsBeforeQuota + 1);
    const acquisitionLog = harness.logger.records.find(
      (record) =>
        record.event === "unshelf.discover.acquisition.ended" &&
        record.errorClass === "quota_exceeded",
    );
    expect(acquisitionLog).toMatchObject({
      outcome: "throttled",
      acceptedCount: 0,
      rejectedCount: 0,
      retryCount: 0,
      errorClass: "quota_exceeded",
    });
    expect(JSON.stringify(acquisitionLog)).not.toMatch(
      /clerk_gate|UC_gate|Quiet Learning|video-original|youtube\.com/,
    );
  });

  it("bounds Provider work while allowing distinct targets to progress", async () => {
    const follows: Array<{
      clerkUserId: string;
      followId: string;
      channelId: string;
    }> = [];
    for (let index = 0; index < 5; index += 1) {
      follows.push({
        clerkUserId: `clerk_bounded_${index}`,
        ...(await createFollow({
          clerkUserId: `clerk_bounded_${index}`,
          channelId: `UC_bounded_${index}`,
        })),
      });
    }
    const callsBeforeRefresh = acquireChannel.mock.calls.length;
    const finishCalls: Array<(result: ProviderPreviewResult) => void> = [];
    acquireChannel.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishCalls.push(resolve);
        }),
    );

    const requests = follows.map(({ clerkUserId, followId }) =>
      request(app)
        .post("/api/discover/acquisitions")
        .set(TEST_USER_HEADER, clerkUserId)
        .send({ trigger: "manual_follow", followId })
        .then((response) => response),
    );
    await vi.waitFor(() =>
      expect(acquireChannel).toHaveBeenCalledTimes(callsBeforeRefresh + 4),
    );
    finishCalls[0]?.(
      successfulAcquisition([newVideo], "UC_bounded_0"),
    );
    await vi.waitFor(() =>
      expect(acquireChannel).toHaveBeenCalledTimes(callsBeforeRefresh + 5),
    );
    for (let index = 1; index < finishCalls.length; index += 1) {
      finishCalls[index]?.(
        successfulAcquisition([newVideo], `UC_bounded_${index}`),
      );
    }

    expect((await Promise.all(requests)).map(({ status }) => status)).toEqual([
      200, 200, 200, 200, 200,
    ]);
  });

  it("rechecks a queued attempt after lease recovery before spending Provider quota", async () => {
    const follows: Array<{
      clerkUserId: string;
      followId: string;
      channelId: string;
    }> = [];
    for (let index = 0; index < 5; index += 1) {
      follows.push({
        clerkUserId: `clerk_queued_${index}`,
        ...(await createFollow({
          clerkUserId: `clerk_queued_${index}`,
          channelId: `UC_queued_${index}`,
        })),
      });
    }
    const finishByChannel = new Map<
      string,
      (result: ProviderPreviewResult) => void
    >();
    acquireChannel.mockImplementation(
      ({ channelId }) =>
        new Promise((resolve) => {
          finishByChannel.set(channelId, resolve);
        }),
    );
    const callsBeforeRefresh = acquireChannel.mock.calls.length;
    const requests = follows.slice(0, 4).map(({ clerkUserId, followId }) =>
      request(app)
        .post("/api/discover/acquisitions")
        .set(TEST_USER_HEADER, clerkUserId)
        .send({ trigger: "manual_follow", followId })
        .then((response) => response),
    );
    await vi.waitFor(() =>
      expect(acquireChannel).toHaveBeenCalledTimes(callsBeforeRefresh + 4),
    );
    const queuedRequest = request(app)
      .post("/api/discover/acquisitions")
      .set(TEST_USER_HEADER, follows[4].clerkUserId)
      .send({ trigger: "manual_follow", followId: follows[4].followId })
      .then((response) => response);
    await vi.waitFor(async () => {
      const queued = await harness.pool.query<{ running: string }>(
        `SELECT count(*) FILTER (WHERE outcome = 'running')::text AS running
         FROM discover_acquisition_attempts
         WHERE provider_target_id = (
           SELECT provider_target_id FROM discover_follows WHERE id = $1
         )`,
        [follows[4]?.followId],
      );
      expect(queued.rows[0]?.running).toBe("1");
    });

    currentNow = new Date("2026-08-16T12:01:00.000Z");
    const reclaimed = request(app)
      .post("/api/discover/acquisitions")
      .set(TEST_USER_HEADER, follows[4].clerkUserId)
      .send({ trigger: "manual_follow", followId: follows[4].followId })
      .then((response) => response);
    await vi.waitFor(async () => {
      const attempts = await harness.pool.query<{ attempts: string }>(
        `SELECT count(*)::text AS attempts
         FROM discover_acquisition_attempts
         WHERE provider_target_id = (
           SELECT provider_target_id FROM discover_follows WHERE id = $1
         )`,
        [follows[4]?.followId],
      );
      expect(attempts.rows[0]?.attempts).toBe("2");
    });
    finishByChannel.get("UC_queued_0")?.(
      successfulAcquisition([newVideo], "UC_queued_0"),
    );
    await vi.waitFor(() =>
      expect(
        acquireChannel.mock.calls.filter(
          ([{ channelId }]) => channelId === "UC_queued_4",
        ),
      ).toHaveLength(1),
    );
    for (let index = 1; index < 5; index += 1) {
      finishByChannel.get(`UC_queued_${index}`)?.(
        successfulAcquisition([newVideo], `UC_queued_${index}`),
      );
    }

    const responses = await Promise.all([
      ...requests,
      queuedRequest,
      reclaimed,
    ]);
    expect(
      [
        responses[4]?.body.acquisition.outcome,
        responses[5]?.body.acquisition.outcome,
      ].sort(),
    ).toEqual(["complete", "skipped"]);
  });

  it("keeps stored intake readable during Provider I/O and applies accepted results after publication", async () => {
    const clerkUserId = "clerk_manual_refresh";
    const { followId, channelId } = await createFollow({ clerkUserId });
    let finishProviderCall!: (result: ProviderPreviewResult) => void;
    acquireChannel.mockReturnValueOnce(
      new Promise((resolve) => {
        finishProviderCall = resolve;
      }),
    );

    const acquisition = request(app)
      .post("/api/discover/acquisitions")
      .set(TEST_USER_HEADER, clerkUserId)
      .send({ trigger: "manual_follow", followId });
    const pendingResponse = acquisition.then((response) => response);
    await vi.waitFor(() => expect(acquireChannel).toHaveBeenCalledTimes(1));
    expect(acquireChannel).toHaveBeenCalledWith({ channelId });

    const stored = await request(app)
      .get("/api/discover")
      .set(TEST_USER_HEADER, clerkUserId)
      .expect(200);
    expect(stored.body.discoveries).toEqual([
      expect.objectContaining({ title: "Stored before refresh" }),
    ]);

    finishProviderCall(
      successfulAcquisition([newVideo, originalVideo], channelId),
    );
    const refreshed = await pendingResponse;
    expect(refreshed.status).toBe(200);
    expect(refreshed.body).toMatchObject({
      ok: true,
      acquisition: {
        followId,
        outcome: "complete",
        acceptedCount: 2,
        rejectedCount: 0,
      },
    });

    const reread = await request(app)
      .get("/api/discover")
      .set(TEST_USER_HEADER, clerkUserId)
      .expect(200);
    expect(reread.body.discoveries).toEqual([
      expect.objectContaining({ title: "Stored before refresh" }),
      expect.objectContaining({ title: "Accepted during refresh" }),
    ]);
  });

  it("commits publication before Follow application and terminal outcome", async () => {
    const clerkUserId = "clerk_transaction_boundaries";
    const { followId, channelId } = await createFollow({ clerkUserId });
    let finishProviderCall!: (result: ProviderPreviewResult) => void;
    acquireChannel.mockReturnValueOnce(
      new Promise((resolve) => {
        finishProviderCall = resolve;
      }),
    );
    const pending = request(app)
      .post("/api/discover/acquisitions")
      .set(TEST_USER_HEADER, clerkUserId)
      .send({ trigger: "manual_follow", followId })
      .then((response) => response);
    await vi.waitFor(() => expect(finishProviderCall).toBeTypeOf("function"));

    const lockClient = await harness.pool.connect();
    try {
      await lockClient.query("BEGIN");
      await lockClient.query(
        `SELECT id FROM discover_follows WHERE id = $1 FOR UPDATE`,
        [followId],
      );
      finishProviderCall(
        successfulAcquisition([newVideo, originalVideo], channelId),
      );

      await vi.waitFor(async () => {
        const published = await harness.pool.query<{
          snapshots: string;
          outcome: string;
        }>(
          `SELECT
             count(snapshot.id)::text AS snapshots,
             attempt.outcome
           FROM discover_acquisition_attempts attempt
           LEFT JOIN discover_provider_snapshots snapshot
             ON snapshot.acquisition_attempt_id = attempt.id
           WHERE attempt.provider_target_id = (
             SELECT provider_target_id FROM discover_follows WHERE id = $1
           )
           GROUP BY attempt.id
           ORDER BY attempt.generation DESC
           LIMIT 1`,
          [followId],
        );
        expect(published.rows[0]).toEqual({
          snapshots: "1",
          outcome: "running",
        });
      });
      await lockClient.query("COMMIT");
      expect((await pending).body.acquisition.outcome).toBe("complete");
    } finally {
      await lockClient.query("ROLLBACK");
      lockClient.release();
    }
  });

  it("accepts partial records without hiding prior presence or replacing verified coverage", async () => {
    const clerkUserId = "clerk_partial_refresh";
    const { followId, channelId } = await createFollow({ clerkUserId });

    currentNow = new Date("2026-08-16T12:01:00.000Z");
    acquireChannel.mockResolvedValueOnce(
      successfulAcquisition([originalVideo], channelId),
    );
    await request(app)
      .post("/api/discover/acquisitions")
      .set(TEST_USER_HEADER, clerkUserId)
      .send({ trigger: "manual_follow", followId })
      .expect(200);

    currentNow = new Date("2026-08-16T12:02:00.000Z");
    acquireChannel.mockResolvedValueOnce({
      ...successfulAcquisition([newVideo], channelId),
      outcome: "partial",
      rejectedCount: 1,
      coverageStartedAt: "2026-07-18T12:00:00.000Z",
    });
    const partial = await request(app)
      .post("/api/discover/acquisitions")
      .set(TEST_USER_HEADER, clerkUserId)
      .send({ trigger: "manual_follow", followId })
      .expect(200);

    expect(partial.body.acquisition).toMatchObject({
      outcome: "partial",
      acceptedCount: 1,
      rejectedCount: 1,
      latestAttemptAt: "2026-08-16T12:02:00.000Z",
      latestCompleteAt: "2026-08-16T12:01:00.000Z",
      verifiedCoverageStartedAt: "2026-07-17T12:00:00.000Z",
    });
    const workspace = await request(app)
      .get("/api/discover")
      .set(TEST_USER_HEADER, clerkUserId)
      .expect(200);
    expect(workspace.body.discoveries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: "Stored before refresh" }),
        expect.objectContaining({ title: "Accepted during refresh" }),
      ]),
    );
    expect(workspace.body.follows[0].health).toMatchObject({
      latestAttemptOutcome: "partial",
      latestCompleteAt: "2026-08-16T12:01:00.000Z",
      verifiedCoverageStartedAt: "2026-07-17T12:00:00.000Z",
    });

    currentNow = new Date("2026-08-16T12:03:00.000Z");
    acquireChannel.mockResolvedValueOnce({
      ...successfulAcquisition([newVideo, originalVideo], channelId),
      coverageStartedAt: "2026-07-18T12:00:00.000Z",
    });
    const recovered = await request(app)
      .post("/api/discover/acquisitions")
      .set(TEST_USER_HEADER, clerkUserId)
      .send({ trigger: "manual_follow", followId })
      .expect(200);
    expect(recovered.body.acquisition).toMatchObject({
      outcome: "complete",
      latestCompleteAt: "2026-08-16T12:03:00.000Z",
      verifiedCoverageStartedAt: "2026-07-18T12:00:00.000Z",
    });
  });

  it("makes an older failed Provider call harmless after a newer publication", async () => {
    const clerkUserId = "clerk_late_acquisition";
    const { followId, channelId } = await createFollow({ clerkUserId });
    const priorAcquisitionCalls = acquireChannel.mock.calls.length;
    let finishOlder!: (result: ProviderPreviewResult) => void;
    acquireChannel.mockReturnValueOnce(
      new Promise((resolve) => {
        finishOlder = resolve;
      }),
    );
    currentNow = new Date("2026-08-16T12:03:00.000Z");
    const olderRequest = request(app)
      .post("/api/discover/acquisitions")
      .set(TEST_USER_HEADER, clerkUserId)
      .send({ trigger: "manual_follow", followId })
      .then((response) => response);
    await vi.waitFor(() =>
      expect(acquireChannel).toHaveBeenCalledTimes(priorAcquisitionCalls + 1),
    );

    currentNow = new Date("2026-08-16T12:04:00.000Z");
    acquireChannel.mockResolvedValueOnce(
      successfulAcquisition([newVideo], channelId),
    );
    const newer = await request(app)
      .post("/api/discover/acquisitions")
      .set(TEST_USER_HEADER, clerkUserId)
      .send({ trigger: "manual_follow", followId })
      .expect(200);
    expect(newer.body.acquisition.outcome).toBe("complete");

    currentNow = new Date("2026-08-16T12:05:00.000Z");
    finishOlder({ ok: false, error: "provider_unavailable" });
    const older = await olderRequest;
    expect(older.body.acquisition).toMatchObject({
      outcome: "skipped",
      latestAttemptOutcome: "complete",
      latestAttemptAt: "2026-08-16T12:04:00.000Z",
    });
    const attempts = await harness.pool.query<{
      running: string;
      recovered: string;
    }>(
      `SELECT
         count(*) FILTER (WHERE outcome = 'running')::text AS running,
         count(*) FILTER (WHERE error_class = 'lease_expired')::text AS recovered
       FROM discover_acquisition_attempts
       WHERE provider_target_id = (
         SELECT provider_target_id FROM discover_follows WHERE id = $1
       )`,
      [followId],
    );
    expect(attempts.rows[0]).toEqual({ running: "0", recovered: "1" });
  });

  it("skips an older successful Provider result after a newer publication", async () => {
    const clerkUserId = "clerk_late_success";
    const { followId, channelId } = await createFollow({ clerkUserId });
    const priorAcquisitionCalls = acquireChannel.mock.calls.length;
    let finishOlder!: (result: ProviderPreviewResult) => void;
    acquireChannel.mockReturnValueOnce(
      new Promise((resolve) => {
        finishOlder = resolve;
      }),
    );
    const olderRequest = request(app)
      .post("/api/discover/acquisitions")
      .set(TEST_USER_HEADER, clerkUserId)
      .send({ trigger: "manual_follow", followId })
      .then((response) => response);
    await vi.waitFor(() =>
      expect(acquireChannel).toHaveBeenCalledTimes(priorAcquisitionCalls + 1),
    );

    currentNow = new Date("2026-08-16T12:06:00.000Z");
    acquireChannel.mockResolvedValueOnce(
      successfulAcquisition([newVideo], channelId),
    );
    await request(app)
      .post("/api/discover/acquisitions")
      .set(TEST_USER_HEADER, clerkUserId)
      .send({ trigger: "manual_follow", followId })
      .expect(200);

    currentNow = new Date("2026-08-16T12:07:00.000Z");
    finishOlder({
      ...successfulAcquisition([originalVideo], channelId),
      publisher: "Stale publisher",
    });
    const older = await olderRequest;
    expect(older.body.acquisition).toMatchObject({
      outcome: "skipped",
      latestAttemptOutcome: "complete",
      latestAttemptAt: "2026-08-16T12:06:00.000Z",
    });
    const workspace = await request(app)
      .get("/api/discover")
      .set(TEST_USER_HEADER, clerkUserId)
      .expect(200);
    expect(workspace.body.follows[0].name).toBe("Quiet Learning");
  });

  it("does not duplicate continuous presence and resurfaces only after a complete disappearance", async () => {
    const clerkUserId = "clerk_reappearance";
    const { followId, channelId } = await createFollow({ clerkUserId });
    acquireChannel.mockResolvedValueOnce(
      successfulAcquisition([originalVideo], channelId),
    );
    await request(app)
      .post("/api/discover/acquisitions")
      .set(TEST_USER_HEADER, clerkUserId)
      .send({ trigger: "manual_follow", followId })
      .expect(200);
    let workspace = await request(app)
      .get("/api/discover")
      .set(TEST_USER_HEADER, clerkUserId)
      .expect(200);
    expect(workspace.body.discoveries).toHaveLength(1);

    acquireChannel.mockResolvedValueOnce({ ok: false, error: "unverifiable" });
    const malformed = await request(app)
      .post("/api/discover/acquisitions")
      .set(TEST_USER_HEADER, clerkUserId)
      .send({ trigger: "manual_follow", followId })
      .expect(200);
    expect(malformed.body.acquisition.outcome).toBe("failed");
    workspace = await request(app)
      .get("/api/discover")
      .set(TEST_USER_HEADER, clerkUserId)
      .expect(200);
    expect(workspace.body.discoveries).toHaveLength(1);

    acquireChannel.mockResolvedValueOnce(successfulAcquisition([], channelId));
    await request(app)
      .post("/api/discover/acquisitions")
      .set(TEST_USER_HEADER, clerkUserId)
      .send({ trigger: "manual_follow", followId })
      .expect(200);
    acquireChannel.mockResolvedValueOnce(
      successfulAcquisition([originalVideo], channelId),
    );
    await request(app)
      .post("/api/discover/acquisitions")
      .set(TEST_USER_HEADER, clerkUserId)
      .send({ trigger: "manual_follow", followId })
      .expect(200);

    workspace = await request(app)
      .get("/api/discover")
      .set(TEST_USER_HEADER, clerkUserId)
      .expect(200);
    expect(workspace.body.discoveries).toHaveLength(2);
    expect(workspace.body.discoveries).toEqual([
      expect.objectContaining({ title: "Stored before refresh" }),
      expect.objectContaining({ title: "Stored before refresh" }),
    ]);
  });

  it("preserves intake on Provider failure and hides a foreign Follow as missing", async () => {
    const clerkUserId = "clerk_failed_refresh";
    const { followId } = await createFollow({ clerkUserId });
    acquireChannel.mockResolvedValueOnce({
      ok: false,
      error: "provider_unavailable",
    });
    const failed = await request(app)
      .post("/api/discover/acquisitions")
      .set(TEST_USER_HEADER, clerkUserId)
      .send({ trigger: "manual_follow", followId })
      .expect(200);
    expect(failed.body.acquisition.outcome).toBe("provider_unavailable");

    const workspace = await request(app)
      .get("/api/discover")
      .set(TEST_USER_HEADER, clerkUserId)
      .expect(200);
    expect(workspace.body.discoveries).toEqual([
      expect.objectContaining({ title: "Stored before refresh", state: "new" }),
    ]);
    expect(workspace.body.follows[0]).toMatchObject({
      lifecycle: "active",
      health: { latestAttemptOutcome: "provider_unavailable" },
    });

    const callsBeforeForeignRequest = acquireChannel.mock.calls.length;
    const foreign = await request(app)
      .post("/api/discover/acquisitions")
      .set(TEST_USER_HEADER, "clerk_refresh_intruder")
      .send({ trigger: "manual_follow", followId })
      .expect(404);
    expect(foreign.body).toEqual({ ok: false, error: "follow_missing" });
    expect(acquireChannel).toHaveBeenCalledTimes(callsBeforeForeignRequest);
  });
});
