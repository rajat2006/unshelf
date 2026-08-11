import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";
import type { Stage, LearningPlan, LearningPlanView } from "@unshelf/shared";
import { startTestApp, TEST_USER_HEADER, type TestApp } from "./harness";

/**
 * The first-class LearningPlan at the HTTP boundary (issue #93, ADR-0014), driven
 * against a real ephemeral Postgres. These pin what promoting the implicit LearningPlan
 * into a first-class, User-owned record buys: a User owns *many* named LearningPlans,
 * each with an opaque stable id; listing, creating, and reading resolve from the
 * authenticated User only — a foreign id is a 404, never a confirmation; and each
 * LearningPlan carries *derived* progress over its Stages' Items, never a stored count.
 */
let harness: TestApp;
let app: Express;

const createLearningPlan = (clerkUserId: string, body: object) =>
  request(app)
    .post("/api/learning-plans")
    .set(TEST_USER_HEADER, clerkUserId)
    .send(body);

const listLearningPlans = (clerkUserId: string) =>
  request(app).get("/api/learning-plans").set(TEST_USER_HEADER, clerkUserId);

const getLearningPlan = ({
  clerkUserId,
  learningPlanId,
}: {
  clerkUserId: string;
  learningPlanId: string;
}) =>
  request(app)
    .get(`/api/learning-plans/${learningPlanId}`)
    .set(TEST_USER_HEADER, clerkUserId);

beforeAll(async () => {
  harness = await startTestApp();
  app = harness.app;
});

afterAll(async () => {
  await harness.stop();
});

describe("LearningPlans at the HTTP boundary", () => {
  it("creates a named LearningPlan with a stable opaque id and starts it empty", async () => {
    const user = "learningPlans-create-user";

    const created = await createLearningPlan(user, { name: "Learn Rust" });
    expect(created.status).toBe(201);
    const learningPlan = created.body as LearningPlan;
    expect(learningPlan.id).toMatch(/[0-9a-f-]{36}/);
    expect(learningPlan.name).toBe("Learn Rust");
    expect(learningPlan.done).toBe(0);
    expect(learningPlan.total).toBe(0);

    // The id is the LearningPlan's identity: reading it back returns the same record.
    const read = await getLearningPlan({
      clerkUserId: user,
      learningPlanId: learningPlan.id,
    });
    expect(read.status).toBe(200);
    expect((read.body as LearningPlan).id).toBe(learningPlan.id);
    expect((read.body as LearningPlan).name).toBe("Learn Rust");
  });

  it("trims only the LearningPlan name boundary", async () => {
    const created = await createLearningPlan("learningPlans-trim-user", {
      name: "  Learn   Rust  ",
    });

    expect(created.status).toBe(201);
    expect((created.body as LearningPlan).name).toBe("Learn   Rust");
  });

  it("renames an owned Learning Plan without changing its identity", async () => {
    const user = "learning-plan-rename-user";
    const created = (await createLearningPlan(user, { name: "Old outcome" }))
      .body as LearningPlan;

    const renamed = await request(app)
      .patch(`/api/learning-plans/${created.id}`)
      .set(TEST_USER_HEADER, user)
      .send({ name: "  New   outcome  " });

    expect(renamed.status).toBe(200);
    expect(renamed.body).toMatchObject({
      id: created.id,
      name: "New   outcome",
    });
    expect(
      (await getLearningPlan({ clerkUserId: user, learningPlanId: created.id }))
        .body,
    ).toMatchObject({
      id: created.id,
      name: "New   outcome",
    });
  });

  it("rejects a LearningPlan with no name", async () => {
    const user = "learningPlans-invalid-user";
    expect((await createLearningPlan(user, {})).status).toBe(400);
    expect((await createLearningPlan(user, { name: "" })).status).toBe(400);
    expect((await createLearningPlan(user, { name: "   " })).status).toBe(400);
    expect((await listLearningPlans(user)).body).toEqual([]);
  });

  it("lets a User own many LearningPlans and lists only that User's, oldest first", async () => {
    const owner = "learningPlans-owner-user";
    const other = "learningPlans-other-user";

    const first = (await createLearningPlan(owner, { name: "First journey" }))
      .body as LearningPlan;
    const second = (await createLearningPlan(owner, { name: "Second journey" }))
      .body as LearningPlan;
    await createLearningPlan(other, { name: "A stranger's LearningPlan" });

    const listed = (await listLearningPlans(owner)).body as LearningPlan[];
    expect(listed.map((t) => t.name)).toEqual([
      "First journey",
      "Second journey",
    ]);
    expect(listed.map((t) => t.id)).toEqual([first.id, second.id]);
  });

  it("treats another User's LearningPlan id as missing", async () => {
    const owner = "learningPlans-tenancy-owner";
    const intruder = "learningPlans-tenancy-intruder";

    const learningPlan = (
      await createLearningPlan(owner, { name: "Private journey" })
    ).body as LearningPlan;

    // A foreign id answers exactly as an unknown one does — 404, never 403.
    expect(
      (
        await getLearningPlan({
          clerkUserId: intruder,
          learningPlanId: learningPlan.id,
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await getLearningPlan({
          clerkUserId: owner,
          learningPlanId: "00000000-0000-0000-0000-000000000000",
        })
      ).status,
    ).toBe(404);
    expect((await listLearningPlans(intruder)).body).toEqual([]);
  });

  it("rejects malformed LearningPlan ids with the shared request contract", async () => {
    const res = await getLearningPlan({
      clerkUserId: "learningPlans-malformed-user",
      learningPlanId: "not-a-learningPlan-id",
    });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: "invalid_request",
      issues: [
        { path: "path.learningPlanId", message: "Must be a valid UUID" },
      ],
    });
  });

  it("derives LearningPlan progress from its Stages' Items", async () => {
    const user = "learningPlans-progress-user";
    const learningPlan = (
      await createLearningPlan(user, { name: "Progress journey" })
    ).body as LearningPlan;

    // Two Stages created directly on this LearningPlan; one Item is done and one is not.
    const stageA = (
      await request(app)
        .post(`/api/learning-plans/${learningPlan.id}/stages`)
        .set(TEST_USER_HEADER, user)
        .send({ name: "Stage A" })
    ).body as Stage;
    const stageB = (
      await request(app)
        .post(`/api/learning-plans/${learningPlan.id}/stages`)
        .set(TEST_USER_HEADER, user)
        .send({ name: "Stage B" })
    ).body as Stage;

    const doneItem = (
      await request(app)
        .post("/api/items")
        .set(TEST_USER_HEADER, user)
        .send({ title: "Done thing", type: "article" })
    ).body as { id: string };
    const openItem = (
      await request(app)
        .post("/api/items")
        .set(TEST_USER_HEADER, user)
        .send({ title: "Open thing", type: "article" })
    ).body as { id: string };

    await addItemToStage({
      clerkUserId: user,
      stageId: stageA.id,
      itemId: doneItem.id,
    });
    await addItemToStage({
      clerkUserId: user,
      stageId: stageB.id,
      itemId: openItem.id,
    });
    await request(app)
      .patch(`/api/items/${doneItem.id}/status`)
      .set(TEST_USER_HEADER, user)
      .send({ status: "done" });

    const read = (
      await getLearningPlan({
        clerkUserId: user,
        learningPlanId: learningPlan.id,
      })
    ).body as LearningPlan;
    expect(read.total).toBe(2);
    expect(read.done).toBe(1);
  });

  it("archives and restores a Learning Plan while deriving live progress from every placement", async () => {
    const user = "learning-plans-lifecycle-user";
    const learningPlan = (
      await createLearningPlan(user, { name: "Lifecycle journey" })
    ).body as LearningPlan;
    const stage = (
      await request(app)
        .post(`/api/learning-plans/${learningPlan.id}/stages`)
        .set(TEST_USER_HEADER, user)
        .send({ name: "Grouped work" })
    ).body as Stage;
    const groupedItem = (
      await request(app)
        .post("/api/items")
        .set(TEST_USER_HEADER, user)
        .send({ title: "Grouped Item", type: "article" })
    ).body as { id: string };
    const directItem = (
      await request(app)
        .post("/api/items")
        .set(TEST_USER_HEADER, user)
        .send({ title: "Direct Item", type: "book" })
    ).body as { id: string };
    await addItemToStage({
      clerkUserId: user,
      stageId: stage.id,
      itemId: groupedItem.id,
    });
    await request(app)
      .post(`/api/learning-plans/${learningPlan.id}/items`)
      .set(TEST_USER_HEADER, user)
      .send({ itemId: directItem.id });

    const archived = await request(app)
      .post(`/api/learning-plans/${learningPlan.id}/archive`)
      .set(TEST_USER_HEADER, user);

    expect(archived.status).toBe(200);
    expect((archived.body as LearningPlan).archivedAt).toMatch(
      /^\d{4}-\d{2}-\d{2}T/,
    );
    expect(archived.body).toMatchObject({ done: 0, total: 2 });

    await request(app)
      .patch(`/api/items/${directItem.id}/status`)
      .set(TEST_USER_HEADER, user)
      .send({ status: "done" })
      .expect(200);
    const liveArchived = (
      await getLearningPlan({
        clerkUserId: user,
        learningPlanId: learningPlan.id,
      })
    ).body as LearningPlan;
    expect(liveArchived).toMatchObject({ done: 1, total: 2 });
    expect(liveArchived.archivedAt).not.toBeNull();

    await request(app)
      .patch(`/api/items/${groupedItem.id}/status`)
      .set(TEST_USER_HEADER, user)
      .send({ status: "done" })
      .expect(200);
    const archivedTopology = (
      await request(app)
        .get(`/api/learning-plans/${learningPlan.id}/topology`)
        .set(TEST_USER_HEADER, user)
    ).body as LearningPlanView;
    expect(archivedTopology.nodes).toContainEqual(
      expect.objectContaining({ id: stage.id, done: 1, total: 1 }),
    );
    expect(
      (
        await getLearningPlan({
          clerkUserId: user,
          learningPlanId: learningPlan.id,
        })
      ).body,
    ).toMatchObject({ done: 2, total: 2 });

    const restored = await request(app)
      .post(`/api/learning-plans/${learningPlan.id}/restore`)
      .set(TEST_USER_HEADER, user);
    expect(restored.status).toBe(200);
    expect((restored.body as LearningPlan).archivedAt).toBeNull();
  });

  it("treats foreign and stale lifecycle requests as unavailable", async () => {
    const owner = "learning-plans-lifecycle-owner";
    const intruder = "learning-plans-lifecycle-intruder";
    const learningPlan = (
      await createLearningPlan(owner, { name: "Private lifecycle" })
    ).body as LearningPlan;

    await request(app)
      .post(`/api/learning-plans/${learningPlan.id}/archive`)
      .set(TEST_USER_HEADER, intruder)
      .expect(404);
    await request(app)
      .post("/api/learning-plans/00000000-0000-0000-0000-000000000000/restore")
      .set(TEST_USER_HEADER, owner)
      .expect(404);
    await request(app)
      .post(`/api/learning-plans/${learningPlan.id}/restore`)
      .set(TEST_USER_HEADER, owner)
      .expect(404);
    await request(app)
      .post(`/api/learning-plans/${learningPlan.id}/archive`)
      .set(TEST_USER_HEADER, owner)
      .expect(200);
    await request(app)
      .post(`/api/learning-plans/${learningPlan.id}/archive`)
      .set(TEST_USER_HEADER, owner)
      .expect(404);
    await request(app)
      .post(`/api/learning-plans/${learningPlan.id}/restore`)
      .set(TEST_USER_HEADER, owner)
      .expect(200);
    await request(app)
      .post(`/api/learning-plans/${learningPlan.id}/restore`)
      .set(TEST_USER_HEADER, owner)
      .expect(404);
  });

  it("refuses structural edits to an archived Learning Plan at the API and database boundaries", async () => {
    const user = "learning-plans-archive-protection-user";
    const learningPlan = (
      await createLearningPlan(user, { name: "Protected journey" })
    ).body as LearningPlan;
    const firstStage = (
      await request(app)
        .post(`/api/learning-plans/${learningPlan.id}/stages`)
        .set(TEST_USER_HEADER, user)
        .send({ name: "First Stage" })
    ).body as Stage;
    const secondStage = (
      await request(app)
        .post(`/api/learning-plans/${learningPlan.id}/stages`)
        .set(TEST_USER_HEADER, user)
        .send({ name: "Second Stage" })
    ).body as Stage;
    const item = (
      await request(app)
        .post("/api/items")
        .set(TEST_USER_HEADER, user)
        .send({ title: "Still shared", type: "course" })
    ).body as { id: string };
    await request(app)
      .post(`/api/learning-plans/${learningPlan.id}/edges`)
      .set(TEST_USER_HEADER, user)
      .send({ fromNodeId: firstStage.id, toNodeId: secondStage.id })
      .expect(201);
    await request(app)
      .post(`/api/learning-plans/${learningPlan.id}/archive`)
      .set(TEST_USER_HEADER, user)
      .expect(200);

    const attempts = await Promise.all([
      request(app)
        .patch(`/api/learning-plans/${learningPlan.id}`)
        .set(TEST_USER_HEADER, user)
        .send({ name: "Changed" }),
      request(app)
        .post(`/api/learning-plans/${learningPlan.id}/stages`)
        .set(TEST_USER_HEADER, user)
        .send({ name: "Third Stage" }),
      request(app)
        .patch(`/api/stages/${firstStage.id}`)
        .set(TEST_USER_HEADER, user)
        .send({ name: "Changed Stage" }),
      request(app)
        .post(`/api/learning-plans/${learningPlan.id}/items`)
        .set(TEST_USER_HEADER, user)
        .send({ itemId: item.id }),
      request(app)
        .delete(
          `/api/learning-plans/${learningPlan.id}/edges/${firstStage.id}/${secondStage.id}`,
        )
        .set(TEST_USER_HEADER, user),
    ]);
    expect(attempts.map(({ status }) => status)).toEqual([
      409, 409, 409, 409, 409,
    ]);
    for (const attempt of attempts) {
      expect(attempt.body).toEqual({ error: "learning plan is archived" });
    }

    await expect(
      harness.pool.query(`UPDATE stages SET name = 'Bypass' WHERE id = $1`, [
        firstStage.id,
      ]),
    ).rejects.toThrow(/archived Learning Plan structure is read-only/);

    await request(app)
      .post(`/api/learning-plans/${learningPlan.id}/restore`)
      .set(TEST_USER_HEADER, user)
      .expect(200);
    await request(app)
      .patch(`/api/learning-plans/${learningPlan.id}`)
      .set(TEST_USER_HEADER, user)
      .send({ name: "Changed after restore" })
      .expect(200);
  });
});

describe("a Stage belongs to exactly one LearningPlan (#94)", () => {
  const createStageOn = ({
    clerkUserId,
    learningPlanId,
    name,
  }: {
    clerkUserId: string;
    learningPlanId: string;
    name: string;
  }) =>
    request(app)
      .post(`/api/learning-plans/${learningPlanId}/stages`)
      .set(TEST_USER_HEADER, clerkUserId)
      .send({ name });

  const topologyOf = ({
    clerkUserId,
    learningPlanId,
  }: {
    clerkUserId: string;
    learningPlanId: string;
  }) =>
    request(app)
      .get(`/api/learning-plans/${learningPlanId}/topology`)
      .set(TEST_USER_HEADER, clerkUserId);

  it("lands a created Stage on its LearningPlan, and on no other", async () => {
    const user = "learningPlan-stage-scoped-user";
    const here = (await createLearningPlan(user, { name: "Here" }))
      .body as LearningPlan;
    const elsewhere = (await createLearningPlan(user, { name: "Elsewhere" }))
      .body as LearningPlan;

    const created = await createStageOn({
      clerkUserId: user,
      learningPlanId: here.id,
      name: "A waypoint",
    });
    expect(created.status).toBe(201);
    const stage = created.body as Stage;

    // It is a node on its own LearningPlan…
    const hereNodes = (
      (await topologyOf({ clerkUserId: user, learningPlanId: here.id }))
        .body as LearningPlanView
    ).nodes;
    expect(hereNodes.map((n) => n.id)).toEqual([stage.id]);
    // …and nowhere on another LearningPlan of the same User.
    const elsewhereNodes = (
      (await topologyOf({ clerkUserId: user, learningPlanId: elsewhere.id }))
        .body as LearningPlanView
    ).nodes;
    expect(elsewhereNodes).toEqual([]);
  });

  it("refuses creating a Stage on another User's LearningPlan — a 404, never a landing", async () => {
    const owner = "learningPlan-stage-owner";
    const intruder = "learningPlan-stage-intruder";
    const learningPlan = (
      await createLearningPlan(owner, { name: "Owner's LearningPlan" })
    ).body as LearningPlan;

    const res = await createStageOn({
      clerkUserId: intruder,
      learningPlanId: learningPlan.id,
      name: "Trespasser",
    });
    expect(res.status).toBe(404);

    // The Stage landed on no LearningPlan — the owner's LearningPlan is still empty.
    const ownerNodes = (
      (
        await topologyOf({
          clerkUserId: owner,
          learningPlanId: learningPlan.id,
        })
      ).body as LearningPlanView
    ).nodes;
    expect(ownerNodes).toEqual([]);
  });

  it("rejects a malformed parent LearningPlan id without creating a Stage", async () => {
    const user = "learningPlan-stage-invalid-parent";
    const res = await createStageOn({
      clerkUserId: user,
      learningPlanId: "not-a-learningPlan-id",
      name: "Nowhere",
    });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: "invalid_request",
      issues: [
        { path: "path.learningPlanId", message: "Must be a valid UUID" },
      ],
    });
    const listed = (
      await request(app).get("/api/stages").set(TEST_USER_HEADER, user)
    ).body as Stage[];
    expect(listed).toEqual([]);
  });

  it("rejects a LearningPlan-less Stage at the database boundary", async () => {
    const user = "learningPlan-stage-db-anchor";
    const learningPlan = (await createLearningPlan(user, { name: "Anchored" }))
      .body as LearningPlan;
    const stage = (
      await createStageOn({
        clerkUserId: user,
        learningPlanId: learningPlan.id,
        name: "On the LearningPlan",
      })
    ).body as Stage;

    await expect(
      harness.pool.query(
        `UPDATE stages SET learning_plan_id = NULL WHERE id = $1`,
        [stage.id],
      ),
    ).rejects.toThrow();
  });

  it("refuses a Stage with no name on a real LearningPlan", async () => {
    const user = "learningPlan-stage-noname-user";
    const learningPlan = (await createLearningPlan(user, { name: "Named" }))
      .body as LearningPlan;

    expect(
      (
        await createStageOn({
          clerkUserId: user,
          learningPlanId: learningPlan.id,
          name: "",
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await createStageOn({
          clerkUserId: user,
          learningPlanId: learningPlan.id,
          name: "   ",
        })
      ).status,
    ).toBe(400);
  });

  it("trims only the Stage name boundary", async () => {
    const user = "learningPlan-stage-trim-user";
    const learningPlan = (await createLearningPlan(user, { name: "Named" }))
      .body as LearningPlan;

    const res = await createStageOn({
      clerkUserId: user,
      learningPlanId: learningPlan.id,
      name: "  A   waypoint  ",
    });

    expect(res.status).toBe(201);
    expect((res.body as Stage).name).toBe("A   waypoint");
  });
});

async function addItemToStage({
  clerkUserId,
  stageId,
  itemId,
}: {
  clerkUserId: string;
  stageId: string;
  itemId: string;
}): Promise<void> {
  await request(app)
    .post(`/api/stages/${stageId}/items`)
    .set(TEST_USER_HEADER, clerkUserId)
    .send({ itemId });
}
