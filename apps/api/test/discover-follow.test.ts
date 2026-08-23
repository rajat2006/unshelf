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

const resolveChannel = vi.fn<YouTubeClient["resolveChannel"]>();
const fetchChannelVideos = vi.fn<YouTubeClient["fetchChannelVideos"]>();
const youtubeClient: YouTubeClient = {
  resolveChannel: (input) => resolveChannel(input),
  fetchChannelVideos: (input) => fetchChannelVideos(input),
};

beforeAll(async () => {
  harness = await startTestApp({
    youtubeClient,
    now: () => new Date("2026-08-23T12:00:00.000Z"),
  });
  app = harness.app;
});

beforeEach(() => {
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
});
