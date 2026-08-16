import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import type { Express } from "express";
import {
  Type,
  type FollowPreviewVideo,
  type PrepareFollowResponse,
} from "@unshelf/shared";
import type { YouTubeAdapter } from "../src/discover/youtube-adapter";
import { startTestApp, TEST_USER_HEADER, type TestApp } from "./harness";

const now = new Date("2026-08-16T12:00:00.000Z");
const video: FollowPreviewVideo = {
  provider: "youtube" as const,
  providerIdentity: "video-1",
  title: "A deep module",
  source: "https://www.youtube.com/watch?v=video-1",
  publisher: "Quiet Learning",
  publishedAt: "2026-08-15T10:00:00.000Z",
  durationSeconds: 601,
  type: Type.Video,
  thumbnailUrl: "https://i.ytimg.com/vi/video-1/mqdefault.jpg",
};

const previewChannel = vi.fn<YouTubeAdapter["previewChannel"]>(async () => ({
  ok: true,
  outcome: "preview",
  channelId: "UC_immutable",
  uploadsPlaylistId: "UU_uploads",
  publisher: "Quiet Learning",
  videos: [video],
  rejectedCount: 0,
  coverageStartedAt: "2026-07-17T12:00:00.000Z",
}));
const acquireChannel = vi.fn<YouTubeAdapter["acquireChannel"]>();
const adapter: YouTubeAdapter = { previewChannel, acquireChannel };

let harness: TestApp;
let app: Express;

beforeAll(async () => {
  harness = await startTestApp(undefined, {
    discover: { enabled: true, adapter, now: () => now },
  });
  app = harness.app;
});

afterAll(async () => {
  await harness?.stop();
});

const prepare = (clerkUserId: string, body: object) =>
  request(app)
    .post("/api/discover/follow-previews")
    .set(TEST_USER_HEADER, clerkUserId)
    .send(body);

describe("POST /api/discover/follow-previews", () => {
  it("stores an exact expiring receipt without creating a Follow or intake", async () => {
    const response = await prepare("clerk_preview_owner", {
      provider: "youtube",
      target: { kind: "channel", url: "https://youtube.com/@quietlearning" },
    });

    expect(response.status).toBe(201);
    const body = response.body as PrepareFollowResponse;
    expect(body).toMatchObject({
      ok: true,
      preview: {
        outcome: "preview",
        provider: "youtube",
        target: {
          kind: "channel",
          channelId: "UC_immutable",
          publisher: "Quiet Learning",
        },
        videos: [video],
        rejectedCount: 0,
        coverageStartedAt: "2026-07-17T12:00:00.000Z",
        expiresAt: "2026-08-16T12:15:00.000Z",
      },
    });
    if (!body.ok || !("preview" in body)) throw new Error("expected preview");
    expect(body.preview.previewId).toMatch(/^[0-9a-f-]{36}$/);

    const persisted = await harness.pool.query<{
      previews: string;
      memberships: string;
      snapshots: string;
      results: string;
    }>(`SELECT
      (SELECT count(*) FROM discover_follow_previews)::text AS previews,
      (SELECT count(*) FROM discover_follow_preview_results)::text AS memberships,
      (SELECT count(*) FROM discover_provider_snapshots)::text AS snapshots,
      (SELECT count(*) FROM discover_provider_results)::text AS results`);
    expect(persisted.rows[0]).toEqual({
      previews: "1",
      memberships: "1",
      snapshots: "1",
      results: "1",
    });
  });

  it("shares one published snapshot while issuing separate User receipts", async () => {
    const first = await prepare("clerk_preview_shared_a", {
      provider: "youtube",
      target: { kind: "channel", url: "https://youtube.com/@quietlearning" },
    });
    const second = await prepare("clerk_preview_shared_b", {
      provider: "youtube",
      target: { kind: "channel", url: "https://youtube.com/@quietlearning" },
    });
    expect(first.body.preview.previewId).not.toBe(
      second.body.preview.previewId,
    );

    const rows = await harness.pool.query<{
      snapshots: string;
      receipts: string;
    }>(
      `SELECT
      count(DISTINCT snapshot_id)::text AS snapshots,
      count(*)::text AS receipts
      FROM discover_follow_previews
      WHERE id IN ($1, $2)`,
      [first.body.preview.previewId, second.body.preview.previewId],
    );
    expect(rows.rows[0]).toEqual({ snapshots: "1", receipts: "2" });
  });

  it("requires authentication and rejects client-owned identity or credentials", async () => {
    const unauthenticated = await request(app)
      .post("/api/discover/follow-previews")
      .send({
        provider: "youtube",
        target: { kind: "channel", url: "https://youtube.com/@quietlearning" },
      });
    expect(unauthenticated.status).toBe(401);

    for (const extra of [
      { userId: crypto.randomUUID() },
      { apiKey: "user-secret" },
    ]) {
      const invalid = await prepare("clerk_preview_validation", {
        provider: "youtube",
        target: { kind: "channel", url: "https://youtube.com/@quietlearning" },
        ...extra,
      });
      expect(invalid.status).toBe(400);
      expect(invalid.body.error).toBe("invalid_request");
    }
  });

  it("maps expected Provider failures without leaking diagnostics", async () => {
    previewChannel.mockResolvedValueOnce({
      ok: false,
      error: "provider_unavailable",
    });
    const response = await prepare("clerk_preview_failure", {
      provider: "youtube",
      target: { kind: "channel", url: "https://youtube.com/@unavailable" },
    });

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ ok: false, error: "provider_unavailable" });
  });
});
