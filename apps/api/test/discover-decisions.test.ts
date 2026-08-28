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
import { drizzle } from "drizzle-orm/node-postgres";
import {
  Type,
  type DiscoverPreview,
  type DiscoverWorkspace,
  type Item,
  type KeepDiscoverCandidateResult,
} from "@unshelf/shared";
import type { YouTubeClient } from "../src/discover/youtube-client";
import { findOrCreateProviderItem } from "../src/items/provider-identities";
import * as schema from "../src/schema";
import {
  seedItemTombstone,
  startTestApp,
  TEST_USER_HEADER,
  type TestApp,
} from "./harness";

let harness: TestApp;
let app: Express;

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
    channel: {
      externalId: "UC_decisions",
      title: "Decision School",
      thumbnailUrl: null,
      canonicalUrl: "https://www.youtube.com/channel/UC_decisions",
      uploadsPlaylistId: "UU_decisions",
    },
  });
  fetchChannelVideos.mockResolvedValue({
    ok: true,
    videos: [
      {
        externalId: "decision-video",
        title: "Provider title",
        thumbnailUrl: null,
        publishedAt: "2026-08-22T12:00:00.000Z",
        durationSeconds: 601,
        source: "https://www.youtube.com/watch?v=decision-video",
      },
    ],
  });
});

afterAll(async () => {
  await harness?.stop();
});

async function followCandidate(clerkUserId: string) {
  const preview = await request(app)
    .post("/api/discover/preview")
    .set(TEST_USER_HEADER, clerkUserId)
    .send({ url: "https://youtube.com/@decisions" });
  const previewBody = preview.body as DiscoverPreview;
  await request(app)
    .post("/api/discover/follows")
    .set(TEST_USER_HEADER, clerkUserId)
    .send({ targetId: previewBody.targetId });
  const workspace = await request(app)
    .get("/api/discover")
    .set(TEST_USER_HEADER, clerkUserId);
  return (workspace.body as DiscoverWorkspace).candidates[0];
}

const capture = (clerkUserId: string, body: object) =>
  request(app).post("/api/items").set(TEST_USER_HEADER, clerkUserId).send(body);

async function seedProviderIdentityTombstone({
  user,
  externalId,
  title,
}: {
  user: string;
  externalId: string;
  title: string;
}) {
  const seeded = await harness.pool.query<{ id: string }>(
    `INSERT INTO items (user_id, title, type, source)
     SELECT id, $2, 'video', 'manual-source'
     FROM users WHERE clerk_user_id = $1
     RETURNING id`,
    [user, title],
  );
  await harness.pool.query(
    `INSERT INTO item_provider_identities
       (user_id, provider, external_id, item_id)
     SELECT id, 'youtube', $2, $3
     FROM users WHERE clerk_user_id = $1`,
    [user, externalId, seeded.rows[0].id],
  );
  await seedItemTombstone(harness.pool, seeded.rows[0].id);
  return seeded.rows[0].id;
}

const releaseProviderIdentity = ({
  user,
  externalId,
}: {
  user: string;
  externalId: string;
}) =>
  harness.pool.query(
    `DELETE FROM item_provider_identities
     WHERE user_id = (SELECT id FROM users WHERE clerk_user_id = $1)
       AND provider = 'youtube'
       AND external_id = $2`,
    [user, externalId],
  );

function useExactIdentityVideo({
  channelExternalId,
  videoExternalId,
}: {
  channelExternalId: string;
  videoExternalId: string;
}) {
  resolveChannel.mockResolvedValueOnce({
    ok: true,
    channel: {
      externalId: channelExternalId,
      title: "Exact Identity School",
      thumbnailUrl: null,
      canonicalUrl: `https://www.youtube.com/channel/${channelExternalId}`,
      uploadsPlaylistId: `UU_${channelExternalId}`,
    },
  });
  fetchChannelVideos.mockResolvedValueOnce({
    ok: true,
    videos: [
      {
        externalId: videoExternalId,
        title: "Exact identity video",
        thumbnailUrl: null,
        publishedAt: "2026-08-22T12:00:00.000Z",
        durationSeconds: 601,
        source: `https://www.youtube.com/watch?v=${videoExternalId}`,
      },
    ],
  });
}

async function candidateAfterReleasedTombstone({
  user,
  externalId,
}: {
  user: string;
  externalId: string;
}) {
  const tombstone = (
    await capture(user, {
      title: "Ended before rediscovery",
      type: Type.Video,
      source: `https://youtu.be/${externalId}`,
    })
  ).body as Item;
  await seedItemTombstone(harness.pool, tombstone.id);
  await releaseProviderIdentity({ user, externalId });
  useExactIdentityVideo({
    channelExternalId: `UC_${externalId}`,
    videoExternalId: externalId,
  });
  return { candidate: await followCandidate(user), tombstone };
}

describe("Discover Candidate decisions", () => {
  it("Keeps a pending Candidate with confirmed fields and canonical identity", async () => {
    const user = "clerk_keep_candidate";
    const candidate = await followCandidate(user);

    const kept = await request(app)
      .post(`/api/discover/candidates/${candidate.id}/keep`)
      .set(TEST_USER_HEADER, user)
      .send({ title: "My learning title", type: Type.Course });
    const library = await request(app)
      .get("/api/items")
      .set(TEST_USER_HEADER, user);
    const workspace = await request(app)
      .get("/api/discover")
      .set(TEST_USER_HEADER, user);

    expect(kept.status).toBe(200);
    expect(kept.body).toMatchObject({
      candidate: { id: candidate.id, state: "kept" },
      item: {
        title: "My learning title",
        type: Type.Course,
        source: "https://www.youtube.com/watch?v=decision-video",
      },
    });
    expect(library.body).toHaveLength(1);
    expect((workspace.body as DiscoverWorkspace).candidates).toEqual([]);

    const identity = await harness.pool.query(
      `SELECT provider, external_id, item_id, user_id
       FROM item_provider_identities
       WHERE external_id = 'decision-video'`,
    );
    expect(identity.rows).toHaveLength(1);
    expect(identity.rows[0]).toMatchObject({ provider: "youtube" });
  });

  it("derives Already in Library from identity and reuses the owned Item", async () => {
    const user = "clerk_reuse_candidate";
    const candidate = await followCandidate(user);
    const seeded = await harness.pool.query<{ id: string }>(
      `INSERT INTO items (user_id, title, type, source)
       SELECT id, 'Existing Library title', 'video', 'manual-source'
       FROM users WHERE clerk_user_id = $1
       RETURNING id`,
      [user],
    );
    await harness.pool.query(
      `INSERT INTO item_provider_identities
         (user_id, provider, external_id, item_id)
       SELECT id, 'youtube', 'decision-video', $2
       FROM users WHERE clerk_user_id = $1`,
      [user, seeded.rows[0].id],
    );

    const beforeKeep = await request(app)
      .get("/api/discover")
      .set(TEST_USER_HEADER, user);
    const kept = await request(app)
      .post(`/api/discover/candidates/${candidate.id}/keep`)
      .set(TEST_USER_HEADER, user)
      .send({ title: "Ignored replacement", type: Type.Book });
    const library = await request(app)
      .get("/api/items")
      .set(TEST_USER_HEADER, user);

    expect((beforeKeep.body as DiscoverWorkspace).candidates[0]).toMatchObject({
      libraryItem: {
        id: seeded.rows[0].id,
        title: "Existing Library title",
      },
    });
    expect(kept.status).toBe(200);
    expect(kept.body.item).toMatchObject({
      id: seeded.rows[0].id,
      title: "Existing Library title",
      type: Type.Video,
      source: "manual-source",
    });
    expect(library.body).toHaveLength(1);
  });

  it("does not present a tombstone as already in the Library", async () => {
    const user = "clerk_tombstone_workspace";
    await followCandidate(user);
    await seedProviderIdentityTombstone({
      user,
      externalId: "decision-video",
      title: "Ended Library title",
    });

    const workspace = await request(app)
      .get("/api/discover")
      .set(TEST_USER_HEADER, user);

    expect(workspace.status).toBe(200);
    expect((workspace.body as DiscoverWorkspace).candidates[0]).toMatchObject({
      state: "pending",
      libraryItem: null,
    });
  });

  it("does not let Keep commit against a tombstone identity", async () => {
    const user = "clerk_tombstone_keep";
    const candidate = await followCandidate(user);
    await seedProviderIdentityTombstone({
      user,
      externalId: "decision-video",
      title: "Ended Keep title",
    });

    const kept = await request(app)
      .post(`/api/discover/candidates/${candidate.id}/keep`)
      .set(TEST_USER_HEADER, user)
      .send({ title: "Fresh confirmation", type: Type.Video });
    const workspace = await request(app)
      .get("/api/discover")
      .set(TEST_USER_HEADER, user);

    expect(kept.status).toBe(500);
    expect((workspace.body as DiscoverWorkspace).candidates).toContainEqual(
      expect.objectContaining({
        id: candidate.id,
        state: "pending",
        libraryItem: null,
      }),
    );
  });

  it("does not let Capture return a still-mapped tombstone", async () => {
    const user = "clerk_tombstone_capture";
    await request(app).get("/api/items").set(TEST_USER_HEADER, user);
    await seedProviderIdentityTombstone({
      user,
      externalId: "mappd_CAP-1",
      title: "Ended Capture title",
    });

    const captured = await capture(user, {
      title: "Must not reuse",
      type: Type.Course,
      source: "https://youtu.be/mappd_CAP-1",
    });
    const library = await request(app)
      .get("/api/items")
      .set(TEST_USER_HEADER, user);

    expect(captured.status).toBe(500);
    expect(library.body).toEqual([]);
  });

  it("shows a Capture-first Candidate as Already in Library without resolving it", async () => {
    const user = "clerk_capture_before_discovery";
    const captured = (
      await capture(user, {
        title: "My manual title",
        type: Type.Course,
        source: "https://youtu.be/cap_DEF-123?t=45",
      })
    ).body as Item;
    useExactIdentityVideo({
      channelExternalId: "UC_capture_first",
      videoExternalId: "cap_DEF-123",
    });

    const candidate = await followCandidate(user);

    expect(candidate).toMatchObject({
      state: "pending",
      libraryItem: { id: captured.id, title: "My manual title" },
    });
  });

  it("reuses only a fresh active Capture after a tombstone identity is released", async () => {
    const user = "clerk_capture_after_tombstone";
    const source = "https://youtu.be/fresh_CAP-1";
    const tombstone = (
      await capture(user, {
        title: "Ended capture",
        type: Type.Video,
        source,
      })
    ).body as Item;
    await seedItemTombstone(harness.pool, tombstone.id);
    await releaseProviderIdentity({ user, externalId: "fresh_CAP-1" });

    const fresh = (
      await capture(user, {
        title: "Fresh active capture",
        type: Type.Course,
        source,
      })
    ).body as Item;
    useExactIdentityVideo({
      channelExternalId: "UC_capture_after_tombstone",
      videoExternalId: "fresh_CAP-1",
    });
    const candidate = await followCandidate(user);
    const kept = await request(app)
      .post(`/api/discover/candidates/${candidate.id}/keep`)
      .set(TEST_USER_HEADER, user)
      .send({ title: "Ignored replacement", type: Type.Book });
    const library = await request(app)
      .get("/api/items")
      .set(TEST_USER_HEADER, user);

    expect(fresh.id).not.toBe(tombstone.id);
    expect(candidate).toMatchObject({
      state: "pending",
      libraryItem: { id: fresh.id, title: "Fresh active capture" },
    });
    expect(kept.status).toBe(200);
    expect((kept.body as KeepDiscoverCandidateResult).item.id).toBe(fresh.id);
    expect(library.body).toEqual([fresh]);
  });

  it("creates a fresh active Item when Keep follows a released tombstone identity", async () => {
    const user = "clerk_keep_after_tombstone";
    const { candidate, tombstone } = await candidateAfterReleasedTombstone({
      user,
      externalId: "fresh_KEEP-1",
    });
    const kept = await request(app)
      .post(`/api/discover/candidates/${candidate.id}/keep`)
      .set(TEST_USER_HEADER, user)
      .send({ title: "Fresh Keep", type: Type.Course });
    const library = await request(app)
      .get("/api/items")
      .set(TEST_USER_HEADER, user);
    const workspace = await request(app)
      .get("/api/discover")
      .set(TEST_USER_HEADER, user);

    expect(candidate).toMatchObject({
      state: "pending",
      libraryItem: null,
    });
    expect(kept.status).toBe(200);
    expect((kept.body as KeepDiscoverCandidateResult).item).toMatchObject({
      title: "Fresh Keep",
      type: Type.Course,
    });
    expect((kept.body as KeepDiscoverCandidateResult).item.id).not.toBe(
      tombstone.id,
    );
    expect((library.body as Item[]).map((item) => item.id)).toEqual([
      (kept.body as KeepDiscoverCandidateResult).item.id,
    ]);
    expect((workspace.body as DiscoverWorkspace).candidates).toEqual([]);
  });

  it("converges concurrent Keeps after a tombstone identity is released", async () => {
    const user = "clerk_concurrent_keep_after_tombstone";
    const { candidate, tombstone } = await candidateAfterReleasedTombstone({
      user,
      externalId: "race_KEEP-1",
    });

    const responses = await Promise.all([
      request(app)
        .post(`/api/discover/candidates/${candidate.id}/keep`)
        .set(TEST_USER_HEADER, user)
        .send({ title: "First confirmation", type: Type.Video }),
      request(app)
        .post(`/api/discover/candidates/${candidate.id}/keep`)
        .set(TEST_USER_HEADER, user)
        .send({ title: "Concurrent confirmation", type: Type.Book }),
    ]);

    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    expect(responses[0].body.item.id).toBe(responses[1].body.item.id);
    expect(responses[0].body.item.id).not.toBe(tombstone.id);
  });

  it("replays Keep against the fresh active Item after a tombstone", async () => {
    const user = "clerk_replay_keep_after_tombstone";
    const { candidate } = await candidateAfterReleasedTombstone({
      user,
      externalId: "replay_KEEP",
    });
    const kept = await request(app)
      .post(`/api/discover/candidates/${candidate.id}/keep`)
      .set(TEST_USER_HEADER, user)
      .send({ title: "Initial Keep", type: Type.Course });

    const replayed = await request(app)
      .post(`/api/discover/candidates/${candidate.id}/keep`)
      .set(TEST_USER_HEADER, user)
      .send({ title: "Replay Keep", type: Type.Video });

    expect(replayed.status).toBe(200);
    expect(replayed.body.item.id).toBe(kept.body.item.id);
  });

  it("preserves the opposite-decision conflict after a tombstone", async () => {
    const user = "clerk_conflict_after_tombstone";
    const { candidate } = await candidateAfterReleasedTombstone({
      user,
      externalId: "oppose_KEEP",
    });
    await request(app)
      .post(`/api/discover/candidates/${candidate.id}/keep`)
      .set(TEST_USER_HEADER, user)
      .send({ title: "Initial Keep", type: Type.Course });

    const opposite = await request(app)
      .post(`/api/discover/candidates/${candidate.id}/reject`)
      .set(TEST_USER_HEADER, user)
      .send({});

    expect(opposite.status).toBe(409);
  });

  it("keeps a foreign tombstone private during another User's Keep", async () => {
    const user = "clerk_tombstone_private_owner";
    const foreignUser = "clerk_tombstone_private_foreign";
    const candidate = await followCandidate(user);
    await request(app).get("/api/items").set(TEST_USER_HEADER, foreignUser);
    const foreignTombstoneId = await seedProviderIdentityTombstone({
      user: foreignUser,
      externalId: "decision-video",
      title: "Foreign ended title",
    });

    const workspace = await request(app)
      .get("/api/discover")
      .set(TEST_USER_HEADER, user);
    const kept = await request(app)
      .post(`/api/discover/candidates/${candidate.id}/keep`)
      .set(TEST_USER_HEADER, user)
      .send({ title: "Owned fresh Keep", type: Type.Video });
    const foreignLibrary = await request(app)
      .get("/api/items")
      .set(TEST_USER_HEADER, foreignUser);

    expect((workspace.body as DiscoverWorkspace).candidates[0]).toMatchObject({
      id: candidate.id,
      libraryItem: null,
    });
    expect(kept.status).toBe(200);
    expect((kept.body as KeepDiscoverCandidateResult).item.id).not.toBe(
      foreignTombstoneId,
    );
    expect(foreignLibrary.body).toEqual([]);
  });

  it("reuses a Keep-first Item during later manual Capture", async () => {
    const user = "clerk_keep_before_capture";
    useExactIdentityVideo({
      channelExternalId: "UC_keep_first",
      videoExternalId: "keep_DEF123",
    });
    const candidate = await followCandidate(user);
    const kept = await request(app)
      .post(`/api/discover/candidates/${candidate.id}/keep`)
      .set(TEST_USER_HEADER, user)
      .send({ title: "Kept title", type: Type.Video });

    const captured = await capture(user, {
      title: "Manual replacement",
      type: Type.Book,
      source: "https://m.youtube.com/watch?v=keep_DEF123&feature=share",
    });
    const library = await request(app)
      .get("/api/items")
      .set(TEST_USER_HEADER, user);
    const keptBody = kept.body as KeepDiscoverCandidateResult;
    const capturedBody = captured.body as Item;

    expect(captured.status).toBe(201);
    expect(capturedBody).toMatchObject({
      id: keptBody.item.id,
      title: "Kept title",
      type: Type.Video,
      source: "https://www.youtube.com/watch?v=keep_DEF123",
    });
    expect(capturedBody).not.toHaveProperty("parts");
    expect(library.body).toHaveLength(1);
  });

  it("Rejects only the owned Candidate and enforces terminal decisions", async () => {
    const user = "clerk_reject_candidate";
    const candidate = await followCandidate(user);

    const foreign = await request(app)
      .post(`/api/discover/candidates/${candidate.id}/reject`)
      .set(TEST_USER_HEADER, "clerk_reject_intruder")
      .send({});
    const rejected = await request(app)
      .post(`/api/discover/candidates/${candidate.id}/reject`)
      .set(TEST_USER_HEADER, user)
      .send({});
    const replayed = await request(app)
      .post(`/api/discover/candidates/${candidate.id}/reject`)
      .set(TEST_USER_HEADER, user)
      .send({});
    const opposite = await request(app)
      .post(`/api/discover/candidates/${candidate.id}/keep`)
      .set(TEST_USER_HEADER, user)
      .send({ title: "Too late", type: Type.Video });
    const library = await request(app)
      .get("/api/items")
      .set(TEST_USER_HEADER, user);
    const workspace = await request(app)
      .get("/api/discover")
      .set(TEST_USER_HEADER, user);

    expect(foreign.status).toBe(404);
    expect(rejected.status).toBe(200);
    expect(rejected.body).toMatchObject({
      id: candidate.id,
      state: "rejected",
      video: { externalId: "decision-video" },
      libraryItem: null,
    });
    expect(replayed.status).toBe(200);
    expect(replayed.body).toEqual(rejected.body);
    expect(opposite.status).toBe(409);
    expect(library.body).toEqual([]);
    expect((workspace.body as DiscoverWorkspace).candidates).toEqual([]);
  });

  it("rejects malformed decision input before changing a Candidate", async () => {
    const user = "clerk_invalid_candidate_decision";
    const candidate = await followCandidate(user);

    expect(
      (
        await request(app)
          .post(`/api/discover/candidates/${candidate.id}/keep`)
          .set(TEST_USER_HEADER, user)
          .send({
            title: "Valid",
            type: Type.Video,
            source: "client-must-not-control-this",
          })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(app)
          .post(`/api/discover/candidates/${candidate.id}/reject`)
          .set(TEST_USER_HEADER, user)
          .send({ reason: "not-supported" })
      ).status,
    ).toBe(400);
    const workspace = await request(app)
      .get("/api/discover")
      .set(TEST_USER_HEADER, user);
    expect((workspace.body as DiscoverWorkspace).candidates).toHaveLength(1);
  });

  it("serializes concurrent Keep replays into one Item and rejects the opposite decision", async () => {
    const user = "clerk_concurrent_keep";
    const candidate = await followCandidate(user);

    const responses = await Promise.all([
      request(app)
        .post(`/api/discover/candidates/${candidate.id}/keep`)
        .set(TEST_USER_HEADER, user)
        .send({ title: "First confirmation", type: Type.Video }),
      request(app)
        .post(`/api/discover/candidates/${candidate.id}/keep`)
        .set(TEST_USER_HEADER, user)
        .send({ title: "Concurrent confirmation", type: Type.Book }),
    ]);
    const opposite = await request(app)
      .post(`/api/discover/candidates/${candidate.id}/reject`)
      .set(TEST_USER_HEADER, user)
      .send({});
    const persisted = await harness.pool.query<{
      item_count: string;
      identity_count: string;
      state: string;
    }>(
      `SELECT
         (SELECT count(*) FROM items WHERE user_id = users.id) AS item_count,
         (SELECT count(*) FROM item_provider_identities
          WHERE user_id = users.id) AS identity_count,
         (SELECT state FROM discover_candidates
          WHERE user_id = users.id AND id = $2) AS state
       FROM users WHERE clerk_user_id = $1`,
      [user, candidate.id],
    );

    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    expect(responses[0].body.item.id).toBe(responses[1].body.item.id);
    expect(opposite.status).toBe(409);
    expect(persisted.rows[0]).toEqual({
      item_count: "1",
      identity_count: "1",
      state: "kept",
    });
  });

  it("enforces composite Item ownership on Library identity mappings", async () => {
    await request(app)
      .get("/api/items")
      .set(TEST_USER_HEADER, "clerk_identity_owner");
    await request(app)
      .get("/api/items")
      .set(TEST_USER_HEADER, "clerk_identity_intruder");
    const item = await harness.pool.query<{ id: string }>(
      `INSERT INTO items (user_id, title, type)
       SELECT id, 'Owned item', 'video' FROM users WHERE clerk_user_id = $1
       RETURNING id`,
      ["clerk_identity_owner"],
    );

    await expect(
      harness.pool.query(
        `INSERT INTO item_provider_identities
           (user_id, provider, external_id, item_id)
         SELECT id, 'youtube', 'foreign-identity', $2
         FROM users WHERE clerk_user_id = $1`,
        ["clerk_identity_intruder", item.rows[0].id],
      ),
    ).rejects.toMatchObject({
      constraint: "item_provider_identities_item_owner_fk",
    });
  });

  it("serializes competing Library claims for one Provider identity", async () => {
    const user = "clerk_identity_race";
    await request(app).get("/api/items").set(TEST_USER_HEADER, user);
    const owner = await harness.pool.query<{ id: string }>(
      "SELECT id FROM users WHERE clerk_user_id = $1",
      [user],
    );
    const db = drizzle(harness.pool, { schema });
    const userId = owner.rows[0].id as Parameters<
      typeof findOrCreateProviderItem
    >[0]["userId"];

    const itemIds = await Promise.all(
      ["First claim", "Concurrent claim"].map((title) =>
        db.transaction((tx) =>
          findOrCreateProviderItem({
            tx,
            userId,
            identity: { provider: "youtube", externalId: "raced-video" },
            title,
            type: Type.Video,
            source: "https://www.youtube.com/watch?v=raced-video",
          }),
        ),
      ),
    );
    const persisted = await harness.pool.query<{ item_count: string }>(
      `SELECT count(DISTINCT item_id) AS item_count
       FROM item_provider_identities
       WHERE user_id = $1 AND provider = 'youtube' AND external_id = $2`,
      [userId, "raced-video"],
    );

    expect(itemIds[0]).toBe(itemIds[1]);
    expect(persisted.rows[0].item_count).toBe("1");
  });
});
