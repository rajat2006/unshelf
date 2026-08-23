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
import type { DiscoverPreview } from "@unshelf/shared";
import type { YouTubeClient } from "../src/discover/youtube-client";
import { startTestApp, TEST_USER_HEADER, type TestApp } from "./harness";

let harness: TestApp;
let app: Express;

const channel = {
  externalId: "UC_immutable",
  title: "Quiet Learning",
  thumbnailUrl: "https://img.youtube.com/channel.jpg",
  canonicalUrl: "https://www.youtube.com/channel/UC_immutable",
  uploadsPlaylistId: "UU_uploads",
};
const videos = [
  {
    externalId: "video-new",
    title: "Newest lesson",
    thumbnailUrl: "https://img.youtube.com/video-new.jpg",
    publishedAt: "2026-08-20T12:00:00.000Z",
    durationSeconds: 901,
    source: "https://www.youtube.com/watch?v=video-new",
  },
  {
    externalId: "video-old",
    title: "Quiet channel classic",
    thumbnailUrl: null,
    publishedAt: "2026-01-10T12:00:00.000Z",
    durationSeconds: 241,
    source: "https://www.youtube.com/watch?v=video-old",
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
  resolveChannel.mockResolvedValue({
    ok: true,
    channel,
  });
  fetchChannelVideos.mockResolvedValue({
    ok: true,
    videos,
  });
});

afterAll(async () => {
  await harness?.stop();
});

describe("POST /api/discover/preview", () => {
  it("stores one shared channel and video set while returning a transient preview", async () => {
    const [first, second] = await Promise.all([
      request(app)
        .post("/api/discover/preview")
        .set(TEST_USER_HEADER, "clerk_preview_one")
        .send({ url: "https://youtube.com/@quietlearning" }),
      request(app)
        .post("/api/discover/preview")
        .set(TEST_USER_HEADER, "clerk_preview_two")
        .send({ url: "https://youtube.com/channel/UC_immutable" }),
    ]);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body).toEqual(first.body);
    const preview = first.body as DiscoverPreview;
    expect(typeof preview.targetId).toBe("string");
    expect(preview).toMatchObject({
      channel: {
        externalId: "UC_immutable",
        title: "Quiet Learning",
        thumbnailUrl: "https://img.youtube.com/channel.jpg",
        canonicalUrl: "https://www.youtube.com/channel/UC_immutable",
      },
      videos: [
        {
          externalId: "video-new",
          title: "Newest lesson",
          channelExternalId: "UC_immutable",
          channelTitle: "Quiet Learning",
        },
        {
          externalId: "video-old",
          title: "Quiet channel classic",
          channelExternalId: "UC_immutable",
          channelTitle: "Quiet Learning",
        },
      ],
    });
    expect(JSON.stringify(first.body)).not.toContain("userId");
    expect(resolveChannel).toHaveBeenCalledTimes(2);
    expect(fetchChannelVideos).toHaveBeenCalledTimes(2);
    expect(
      await harness.pool.query("SELECT id FROM discover_provider_targets"),
    ).toHaveProperty("rowCount", 1);
    expect(
      await harness.pool.query("SELECT id FROM discover_provider_results"),
    ).toHaveProperty("rowCount", 2);
  });

  it("requires authentication and validates the request without calling YouTube", async () => {
    expect(
      (
        await request(app)
          .post("/api/discover/preview")
          .send({ url: "https://youtube.com/@quietlearning" })
      ).status,
    ).toBe(401);
    const invalid = await request(app)
      .post("/api/discover/preview")
      .set(TEST_USER_HEADER, "clerk_preview_invalid")
      .send({ url: "   ", receipt: "not-a-protocol" });

    expect(invalid.status).toBe(400);
    expect(resolveChannel).not.toHaveBeenCalled();
  });

  it.each([
    ["invalid_url", 400, "invalid_channel_url"],
    ["not_found", 404, "channel_not_found"],
    ["throttled", 429, "youtube_throttled"],
    ["temporary_failure", 503, "youtube_unavailable"],
  ] as const)(
    "maps %s without exposing Provider details",
    async (error, status, publicError) => {
      resolveChannel.mockResolvedValue({
        ok: false,
        error,
      });

      const response = await request(app)
        .post("/api/discover/preview")
        .set(TEST_USER_HEADER, `clerk_preview_${error}`)
        .send({ url: "https://youtube.com/@quietlearning" });

      expect(response.status).toBe(status);
      expect(response.body).toEqual({ error: publicError });
    },
  );
});
