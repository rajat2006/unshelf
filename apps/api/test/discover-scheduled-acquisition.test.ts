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
import type { DiscoverPreview, DiscoverWorkspace } from "@unshelf/shared";
import type { YouTubeClient } from "../src/discover/youtube-client";
import { startTestApp, TEST_USER_HEADER, type TestApp } from "./harness";

const channel = {
  externalId: "UC_scheduled",
  title: "Scheduled Learning",
  thumbnailUrl: null,
  canonicalUrl: "https://www.youtube.com/channel/UC_scheduled",
  uploadsPlaylistId: "UU_scheduled",
};
const scheduledVideo = {
  externalId: "scheduled-video",
  title: "Fetched once",
  thumbnailUrl: null,
  publishedAt: "2026-08-22T12:00:00.000Z",
  durationSeconds: 601,
  source: "https://www.youtube.com/watch?v=scheduled-video",
};

const resolveChannel = vi.fn<YouTubeClient["resolveChannel"]>();
const fetchChannelVideos = vi.fn<YouTubeClient["fetchChannelVideos"]>();
const youtubeClient: YouTubeClient = {
  resolveChannel: (input) => resolveChannel(input),
  fetchChannelVideos: (input) => fetchChannelVideos(input),
};
let harness: TestApp;
let app: Express;
let currentTime = new Date("2026-08-23T00:00:00.000Z");

beforeAll(async () => {
  harness = await startTestApp({
    youtubeClient,
    now: () => currentTime,
  });
  app = harness.app;
});

beforeEach(async () => {
  currentTime = new Date("2026-08-23T00:00:00.000Z");
  await harness.pool.query(
    `TRUNCATE
       discover_candidates,
       discover_follows,
       discover_provider_results,
       discover_provider_targets`,
  );
  resolveChannel.mockReset();
  fetchChannelVideos.mockReset();
  resolveChannel.mockResolvedValue({ ok: true, channel });
  fetchChannelVideos
    .mockResolvedValueOnce({ ok: true, videos: [] })
    .mockResolvedValue({ ok: true, videos: [scheduledVideo] });
});

afterAll(async () => {
  await harness?.stop();
});

describe("scheduled Discover acquisition", () => {
  it("does not fetch a due channel without an active Follow", async () => {
    await request(app)
      .post("/api/discover/preview")
      .set(TEST_USER_HEADER, "clerk_preview_only")
      .send({ url: "https://youtube.com/@scheduled" })
      .expect(200);

    currentTime = new Date("2026-08-23T01:00:00.000Z");
    await harness.runDiscoverAcquisitionTick();

    expect(fetchChannelVideos).toHaveBeenCalledOnce();
  });

  it("fetches a followed channel once and fans out private Candidates", async () => {
    const previewResponse = await request(app)
      .post("/api/discover/preview")
      .set(TEST_USER_HEADER, "clerk_scheduled_first")
      .send({ url: "https://youtube.com/@scheduled" });
    const preview = previewResponse.body as DiscoverPreview;

    for (const user of ["clerk_scheduled_first", "clerk_scheduled_second"]) {
      await request(app)
        .post("/api/discover/follows")
        .set(TEST_USER_HEADER, user)
        .send({ targetId: preview.targetId })
        .expect(201);
    }

    await harness.runDiscoverAcquisitionTick();
    expect(fetchChannelVideos).toHaveBeenCalledOnce();

    currentTime = new Date("2026-08-23T01:00:00.000Z");
    await harness.runDiscoverAcquisitionTick();

    const workspaces = await Promise.all(
      ["clerk_scheduled_first", "clerk_scheduled_second"].map(async (user) => {
        const response = await request(app)
          .get("/api/discover")
          .set(TEST_USER_HEADER, user)
          .expect(200);
        return response.body as DiscoverWorkspace;
      }),
    );

    expect(fetchChannelVideos).toHaveBeenCalledTimes(2);
    expect(
      workspaces.map(({ candidates }) =>
        candidates.map(({ state, video }) => ({
          state,
          externalId: video.externalId,
        })),
      ),
    ).toEqual([
      [{ state: "pending", externalId: "scheduled-video" }],
      [{ state: "pending", externalId: "scheduled-video" }],
    ]);
    expect(workspaces[0].candidates[0].id).not.toBe(
      workspaces[1].candidates[0].id,
    );
  });

  it("preserves one Candidate when the same video is fetched again", async () => {
    const preview = await previewAndFollow("clerk_scheduled_replay");

    currentTime = new Date("2026-08-23T01:00:00.000Z");
    await harness.runDiscoverAcquisitionTick();
    const firstWorkspace = await readWorkspace("clerk_scheduled_replay");

    currentTime = new Date("2026-08-23T02:00:00.000Z");
    fetchChannelVideos.mockResolvedValueOnce({
      ok: true,
      videos: [{ ...scheduledVideo, title: "Updated shared title" }],
    });
    await harness.runDiscoverAcquisitionTick();
    const replayedWorkspace = await readWorkspace("clerk_scheduled_replay");

    expect(preview.videos).toEqual([]);
    expect(replayedWorkspace.candidates).toEqual([
      {
        ...firstWorkspace.candidates[0],
        video: {
          ...firstWorkspace.candidates[0].video,
          title: "Updated shared title",
        },
      },
    ]);
  });

  it("keeps stored Candidates visible when a scheduled fetch fails", async () => {
    fetchChannelVideos.mockReset();
    fetchChannelVideos
      .mockResolvedValueOnce({ ok: true, videos: [scheduledVideo] })
      .mockResolvedValueOnce({ ok: false, error: "temporary_failure" });
    await previewAndFollow("clerk_scheduled_failure");
    const beforeFailure = await readWorkspace("clerk_scheduled_failure");

    currentTime = new Date("2026-08-23T01:00:00.000Z");
    await harness.runDiscoverAcquisitionTick();
    const afterFailure = await readWorkspace("clerk_scheduled_failure");

    expect(afterFailure).toEqual(beforeFailure);
  });

  it("gives concurrent ticks one effective claim owner", async () => {
    await previewAndFollow("clerk_scheduled_race");
    currentTime = new Date("2026-08-23T01:00:00.000Z");
    let finishFetch!: () => void;
    fetchChannelVideos.mockReturnValueOnce(
      new Promise((resolve) => {
        finishFetch = () => resolve({ ok: true, videos: [scheduledVideo] });
      }),
    );

    const firstTick = harness.runDiscoverAcquisitionTick();
    const secondTick = harness.runDiscoverAcquisitionTick();
    await vi.waitFor(() => expect(fetchChannelVideos).toHaveBeenCalledTimes(2));
    finishFetch();
    await Promise.all([firstTick, secondTick]);

    expect(
      (await readWorkspace("clerk_scheduled_race")).candidates,
    ).toHaveLength(1);
  });

  it("recovers an expired lease without allowing the abandoned owner to publish", async () => {
    await previewAndFollow("clerk_scheduled_recovery");
    currentTime = new Date("2026-08-23T01:00:00.000Z");
    let finishAbandonedFetch!: () => void;
    fetchChannelVideos
      .mockReturnValueOnce(
        new Promise((resolve) => {
          finishAbandonedFetch = () =>
            resolve({
              ok: true,
              videos: [{ ...scheduledVideo, externalId: "abandoned-video" }],
            });
        }),
      )
      .mockResolvedValueOnce({ ok: true, videos: [scheduledVideo] });

    const abandonedTick = harness.runDiscoverAcquisitionTick();
    await vi.waitFor(() => expect(fetchChannelVideos).toHaveBeenCalledTimes(2));
    currentTime = new Date("2026-08-23T01:00:35.001Z");

    await harness.runDiscoverAcquisitionTick();
    finishAbandonedFetch();
    await abandonedTick;

    expect(
      (await readWorkspace("clerk_scheduled_recovery")).candidates.map(
        ({ video }) => video.externalId,
      ),
    ).toEqual(["scheduled-video"]);
  });

  it("fetches at most four channels concurrently", async () => {
    for (let index = 0; index < 5; index += 1) {
      const targetChannel = {
        ...channel,
        externalId: `UC_scheduled_${index}`,
        canonicalUrl: `https://www.youtube.com/channel/UC_scheduled_${index}`,
        uploadsPlaylistId: `UU_scheduled_${index}`,
      };
      resolveChannel.mockResolvedValueOnce({
        ok: true,
        channel: targetChannel,
      });
      fetchChannelVideos.mockResolvedValueOnce({ ok: true, videos: [] });
      await previewAndFollow(`clerk_scheduled_limit_${index}`, false);
    }

    currentTime = new Date("2026-08-23T01:00:00.000Z");
    fetchChannelVideos.mockReset();
    const finishFetches: Array<() => void> = [];
    fetchChannelVideos.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishFetches.push(() => resolve({ ok: true, videos: [] }));
        }),
    );
    const tick = harness.runDiscoverAcquisitionTick();

    await vi.waitFor(() => expect(fetchChannelVideos).toHaveBeenCalledTimes(4));
    finishFetches[0]();
    await vi.waitFor(() => expect(fetchChannelVideos).toHaveBeenCalledTimes(5));
    for (const finishFetch of finishFetches.slice(1)) finishFetch();
    await tick;
  });
});

async function previewAndFollow(
  user: string,
  prepareMocks = true,
): Promise<DiscoverPreview> {
  if (prepareMocks) {
    resolveChannel.mockResolvedValueOnce({ ok: true, channel });
  }
  const previewResponse = await request(app)
    .post("/api/discover/preview")
    .set(TEST_USER_HEADER, user)
    .send({ url: "https://youtube.com/@scheduled" })
    .expect(200);
  const preview = previewResponse.body as DiscoverPreview;
  await request(app)
    .post("/api/discover/follows")
    .set(TEST_USER_HEADER, user)
    .send({ targetId: preview.targetId })
    .expect(201);
  return preview;
}

async function readWorkspace(user: string): Promise<DiscoverWorkspace> {
  const response = await request(app)
    .get("/api/discover")
    .set(TEST_USER_HEADER, user)
    .expect(200);
  return response.body as DiscoverWorkspace;
}
