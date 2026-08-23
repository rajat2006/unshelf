import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import request from "supertest";
import type { Express } from "express";
import type {
  DiscoverFollow,
  DiscoverPreview,
  DiscoverWorkspace,
} from "@unshelf/shared";
import type { YouTubeClient } from "../src/discover/youtube-client";
import { startTestApp, TEST_USER_HEADER, type TestApp } from "./harness";

let harness: TestApp;
let app: Express;

const channel = {
  externalId: "UC_follow",
  title: "Focused Learning",
  thumbnailUrl: "https://img.youtube.com/channel.jpg",
  canonicalUrl: "https://www.youtube.com/channel/UC_follow",
  uploadsPlaylistId: "UU_follow",
};
const videos = [
  {
    externalId: "video-recent",
    title: "Recent lesson",
    thumbnailUrl: "https://img.youtube.com/video-recent.jpg",
    publishedAt: "2026-08-20T12:00:00.000Z",
    durationSeconds: 901,
    source: "https://www.youtube.com/watch?v=video-recent",
  },
  {
    externalId: "video-boundary",
    title: "Boundary lesson",
    thumbnailUrl: null,
    publishedAt: "2026-07-24T12:00:00.000Z",
    durationSeconds: 241,
    source: "https://www.youtube.com/watch?v=video-boundary",
  },
  {
    externalId: "video-stale",
    title: "Archive lesson",
    thumbnailUrl: null,
    publishedAt: "2026-07-24T11:59:59.999Z",
    durationSeconds: 301,
    source: "https://www.youtube.com/watch?v=video-stale",
  },
];
const secondChannel = {
  externalId: "UC_second_follow",
  title: "Systems School",
  thumbnailUrl: null,
  canonicalUrl: "https://www.youtube.com/channel/UC_second_follow",
  uploadsPlaylistId: "UU_second_follow",
};
const secondVideos = [
  {
    externalId: "systems-newest",
    title: "Systems newest",
    thumbnailUrl: null,
    publishedAt: "2026-08-22T12:00:00.000Z",
    durationSeconds: 1_202,
    source: "https://www.youtube.com/watch?v=systems-newest",
  },
  {
    externalId: "systems-older",
    title: "Systems older",
    thumbnailUrl: null,
    publishedAt: "2026-08-19T12:00:00.000Z",
    durationSeconds: 605,
    source: "https://www.youtube.com/watch?v=systems-older",
  },
];

const resolveChannel = vi.fn<YouTubeClient["resolveChannel"]>();
const fetchChannelVideos = vi.fn<YouTubeClient["fetchChannelVideos"]>();
const youtubeClient: YouTubeClient = {
  resolveChannel: (input) => resolveChannel(input),
  fetchChannelVideos: (input) => fetchChannelVideos(input),
};
let currentTime = new Date("2026-08-23T12:00:00.000Z");

beforeAll(async () => {
  harness = await startTestApp({
    youtubeClient,
    now: () => currentTime,
  });
  app = harness.app;
});

beforeEach(() => {
  currentTime = new Date("2026-08-23T12:00:00.000Z");
  resolveChannel.mockReset();
  fetchChannelVideos.mockReset();
  resolveChannel.mockResolvedValue({ ok: true, channel });
  fetchChannelVideos.mockResolvedValue({ ok: true, videos });
});

afterAll(async () => {
  await harness?.stop();
});

describe("Discover Follow confirmation", () => {
  it("turns shared preview data into one private Follow and recent Candidate", async () => {
    const previewResponse = await request(app)
      .post("/api/discover/preview")
      .set(TEST_USER_HEADER, "clerk_follow_owner")
      .send({ url: "https://youtube.com/@focusedlearning" });
    const preview = previewResponse.body as DiscoverPreview;

    const followed = await request(app)
      .post("/api/discover/follows")
      .set(TEST_USER_HEADER, "clerk_follow_owner")
      .send({ targetId: preview.targetId });
    const workspace = await request(app)
      .get("/api/discover")
      .set(TEST_USER_HEADER, "clerk_follow_owner");

    expect(followed.status).toBe(201);
    const follow = followed.body as DiscoverFollow;
    expect(follow).toMatchObject({
      targetId: preview.targetId,
      channel: {
        title: "Focused Learning",
        canonicalUrl: "https://www.youtube.com/channel/UC_follow",
      },
    });
    expect(workspace.status).toBe(200);
    expect(workspace.body as DiscoverWorkspace).toMatchObject({
      follows: [{ id: follow.id, targetId: preview.targetId }],
      candidates: [
        {
          state: "pending",
          video: {
            externalId: "video-recent",
            title: "Recent lesson",
            durationSeconds: 901,
            channelTitle: "Focused Learning",
          },
        },
        {
          state: "pending",
          video: {
            externalId: "video-boundary",
            title: "Boundary lesson",
            durationSeconds: 241,
            channelTitle: "Focused Learning",
          },
        },
      ],
    });
    expect(fetchChannelVideos).toHaveBeenCalledTimes(1);
  });

  it("is idempotent and keeps each User's workspace private", async () => {
    const previewResponse = await request(app)
      .post("/api/discover/preview")
      .set(TEST_USER_HEADER, "clerk_idempotent_owner")
      .send({ url: "https://youtube.com/channel/UC_follow" });
    const preview = previewResponse.body as DiscoverPreview;

    const first = await request(app)
      .post("/api/discover/follows")
      .set(TEST_USER_HEADER, "clerk_idempotent_owner")
      .send({ targetId: preview.targetId });
    const repeated = await request(app)
      .post("/api/discover/follows")
      .set(TEST_USER_HEADER, "clerk_idempotent_owner")
      .send({ targetId: preview.targetId });
    const ownerWorkspace = await request(app)
      .get("/api/discover")
      .set(TEST_USER_HEADER, "clerk_idempotent_owner");
    const otherWorkspace = await request(app)
      .get("/api/discover")
      .set(TEST_USER_HEADER, "clerk_other_user");

    expect(first.status).toBe(201);
    expect(repeated.status).toBe(200);
    expect((repeated.body as DiscoverFollow).id).toBe(
      (first.body as DiscoverFollow).id,
    );
    const owner = ownerWorkspace.body as DiscoverWorkspace;
    expect(owner.follows).toHaveLength(1);
    expect(owner.candidates).toHaveLength(2);
    expect(otherWorkspace.body as DiscoverWorkspace).toEqual({
      follows: [],
      candidates: [],
    });
    expect(fetchChannelVideos).toHaveBeenCalledTimes(1);
  });

  it("requires authentication and rejects invalid or missing shared targets", async () => {
    expect((await request(app).get("/api/discover")).status).toBe(401);
    expect(
      (
        await request(app)
          .post("/api/discover/follows")
          .set(TEST_USER_HEADER, "clerk_invalid_follow")
          .send({ targetId: "not-a-uuid", receipt: "not-supported" })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(app)
          .post("/api/discover/follows")
          .set(TEST_USER_HEADER, "clerk_missing_follow")
          .send({ targetId: "00000000-0000-4000-8000-000000000999" })
      ).status,
    ).toBe(404);
    expect(resolveChannel).not.toHaveBeenCalled();
    expect(fetchChannelVideos).not.toHaveBeenCalled();
  });

  it("manages several Follows as one filterable intake without losing durable Candidate state", async () => {
    const user = "clerk_several_follows";
    const otherUser = "clerk_foreign_follow";
    fetchChannelVideos.mockResolvedValueOnce({
      ok: true,
      videos: [
        ...videos,
        {
          externalId: "video-untouched",
          title: "Untouched lesson",
          thumbnailUrl: null,
          publishedAt: "2026-08-18T12:00:00.000Z",
          durationSeconds: 777,
          source: "https://www.youtube.com/watch?v=video-untouched",
        },
      ],
    });
    const firstPreviewResponse = await request(app)
      .post("/api/discover/preview")
      .set(TEST_USER_HEADER, user)
      .send({ url: "https://youtube.com/@focusedlearning" });
    const firstPreview = firstPreviewResponse.body as DiscoverPreview;
    const firstFollowResponse = await request(app)
      .post("/api/discover/follows")
      .set(TEST_USER_HEADER, user)
      .send({ targetId: firstPreview.targetId });
    const firstFollow = firstFollowResponse.body as DiscoverFollow;

    resolveChannel.mockResolvedValueOnce({ ok: true, channel: secondChannel });
    fetchChannelVideos.mockResolvedValueOnce({
      ok: true,
      videos: secondVideos,
    });
    const secondPreviewResponse = await request(app)
      .post("/api/discover/preview")
      .set(TEST_USER_HEADER, user)
      .send({ url: "https://youtube.com/@systemsschool" });
    const secondPreview = secondPreviewResponse.body as DiscoverPreview;
    const secondFollowResponse = await request(app)
      .post("/api/discover/follows")
      .set(TEST_USER_HEADER, user)
      .send({ targetId: secondPreview.targetId });
    const secondFollow = secondFollowResponse.body as DiscoverFollow;

    const combined = await request(app)
      .get("/api/discover")
      .set(TEST_USER_HEADER, user);
    const focused = await request(app)
      .get(`/api/discover?followId=${firstFollow.id}`)
      .set(TEST_USER_HEADER, user);

    expect(combined.status).toBe(200);
    expect((combined.body as DiscoverWorkspace).follows).toHaveLength(2);
    expect(
      (combined.body as DiscoverWorkspace).candidates.map(
        (candidate) => candidate.video.title,
      ),
    ).toEqual([
      "Systems newest",
      "Recent lesson",
      "Systems older",
      "Untouched lesson",
      "Boundary lesson",
    ]);
    expect(focused.status).toBe(200);
    expect(
      (focused.body as DiscoverWorkspace).candidates.map(
        (candidate) => candidate.video.title,
      ),
    ).toEqual(["Recent lesson", "Untouched lesson", "Boundary lesson"]);
    expect((focused.body as DiscoverWorkspace).follows).toHaveLength(2);

    expect(
      (
        await request(app)
          .get("/api/discover?followId=not-a-uuid")
          .set(TEST_USER_HEADER, user)
      ).status,
    ).toBe(400);
    expect(
      (
        await request(app)
          .get(`/api/discover?followId=${firstFollow.id}`)
          .set(TEST_USER_HEADER, otherUser)
      ).status,
    ).toBe(404);
    expect(
      (
        await request(app)
          .get("/api/discover?followId=00000000-0000-4000-8000-000000000999")
          .set(TEST_USER_HEADER, user)
      ).status,
    ).toBe(404);

    await harness.pool.query(
      `UPDATE discover_candidates
       SET state = CASE
             WHEN discover_provider_results.external_id = 'video-recent'
               THEN 'kept'
             ELSE 'rejected'
           END,
           kept_at = CASE
             WHEN discover_provider_results.external_id = 'video-recent'
               THEN $1::timestamptz
             ELSE NULL::timestamptz
           END,
           rejected_at = CASE
             WHEN discover_provider_results.external_id = 'video-boundary'
               THEN $1::timestamptz
             ELSE NULL::timestamptz
           END,
           updated_at = $1
       FROM discover_provider_results
       WHERE user_id = (SELECT id FROM users WHERE clerk_user_id = $2)
         AND result_id = discover_provider_results.id
         AND discover_provider_results.external_id IN ($3, $4)`,
      [currentTime, user, "video-recent", "video-boundary"],
    );

    const foreignUnfollow = await request(app)
      .delete(`/api/discover/follows/${firstFollow.id}`)
      .set(TEST_USER_HEADER, otherUser);
    const firstUnfollow = await request(app)
      .delete(`/api/discover/follows/${firstFollow.id}`)
      .set(TEST_USER_HEADER, user);
    const repeatedUnfollow = await request(app)
      .delete(`/api/discover/follows/${firstFollow.id}`)
      .set(TEST_USER_HEADER, user);
    const afterUnfollow = await request(app)
      .get("/api/discover")
      .set(TEST_USER_HEADER, user);

    expect(foreignUnfollow.status).toBe(404);
    expect(firstUnfollow.status).toBe(204);
    expect(repeatedUnfollow.status).toBe(204);
    expect((afterUnfollow.body as DiscoverWorkspace).follows).toEqual([
      secondFollow,
    ]);
    expect(
      (afterUnfollow.body as DiscoverWorkspace).candidates.map(
        (candidate) => candidate.video.title,
      ),
    ).toEqual(["Systems newest", "Systems older"]);

    const reFollowResponse = await request(app)
      .post("/api/discover/follows")
      .set(TEST_USER_HEADER, user)
      .send({ targetId: firstPreview.targetId });
    const afterReFollow = await request(app)
      .get(`/api/discover?followId=${firstFollow.id}`)
      .set(TEST_USER_HEADER, user);

    expect(reFollowResponse.status).toBe(200);
    expect((reFollowResponse.body as DiscoverFollow).id).toBe(firstFollow.id);
    expect(
      (afterReFollow.body as DiscoverWorkspace).candidates.map(
        (candidate) => candidate.video.title,
      ),
    ).toEqual(["Untouched lesson"]);

    await request(app)
      .delete(`/api/discover/follows/${firstFollow.id}`)
      .set(TEST_USER_HEADER, user);
    currentTime = new Date("2026-09-23T12:00:00.000Z");
    const staleReFollowResponse = await request(app)
      .post("/api/discover/follows")
      .set(TEST_USER_HEADER, user)
      .send({ targetId: firstPreview.targetId });
    const afterStaleReFollow = await request(app)
      .get(`/api/discover?followId=${firstFollow.id}`)
      .set(TEST_USER_HEADER, user);
    const persisted = await harness.pool.query<{
      follow_count: string;
      result_count: string;
      candidate_count: string;
      kept_count: string;
      rejected_count: string;
    }>(
      `SELECT
         (SELECT count(*) FROM discover_follows
          WHERE user_id = (SELECT id FROM users WHERE clerk_user_id = $1)
            AND target_id = $2) AS follow_count,
         (SELECT count(*) FROM discover_provider_results
          WHERE target_id = $2) AS result_count,
         (SELECT count(*) FROM discover_candidates
          WHERE user_id = (SELECT id FROM users WHERE clerk_user_id = $1)
            AND result_id IN (
              SELECT id FROM discover_provider_results WHERE target_id = $2
            )) AS candidate_count,
         (SELECT count(*) FROM discover_candidates
          WHERE user_id = (SELECT id FROM users WHERE clerk_user_id = $1)
            AND state = 'kept'
            AND result_id IN (
              SELECT id FROM discover_provider_results WHERE target_id = $2
            )) AS kept_count,
         (SELECT count(*) FROM discover_candidates
          WHERE user_id = (SELECT id FROM users WHERE clerk_user_id = $1)
            AND state = 'rejected'
            AND result_id IN (
              SELECT id FROM discover_provider_results WHERE target_id = $2
            )) AS rejected_count`,
      [user, firstPreview.targetId],
    );

    expect(staleReFollowResponse.status).toBe(200);
    expect((staleReFollowResponse.body as DiscoverFollow).id).toBe(
      firstFollow.id,
    );
    expect((afterStaleReFollow.body as DiscoverWorkspace).candidates).toEqual(
      [],
    );
    expect(persisted.rows[0]).toEqual({
      follow_count: "1",
      result_count: "4",
      candidate_count: "3",
      kept_count: "1",
      rejected_count: "1",
    });
    expect(fetchChannelVideos).toHaveBeenCalledTimes(2);
  });
});
