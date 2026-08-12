import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";
import type {
  Item,
  Stage,
  StageDetail,
  StageItemDisposition,
  LearningPlan,
} from "@unshelf/shared";
import { startTestApp, TEST_USER_HEADER, type TestApp } from "./harness";

/**
 * Stages at the HTTP boundary (issue #20), driven against a real ephemeral
 * Postgres. These pin ADR-0018's optional Stage model: a Stage owns a locally
 * ordered set of references to the Item spine, so one Item lives in many Learning
 * Plans without being copied and its one Status is read through every placement.
 * Per-User isolation runs
 * through the same auth seam T2 established — a header names the acting User.
 */
let harness: TestApp;
let app: Express;

const capture = (clerkUserId: string, body: object) =>
  request(app).post("/api/items").set(TEST_USER_HEADER, clerkUserId).send(body);

const setStatus = ({
  clerkUserId,
  itemId,
  status,
}: {
  clerkUserId: string;
  itemId: string;
  status: string;
}) =>
  request(app)
    .patch(`/api/items/${itemId}/status`)
    .set(TEST_USER_HEADER, clerkUserId)
    .send({ status });

/**
 * Each User's single LearningPlan, minted lazily. A Stage belongs to exactly one LearningPlan
 * (#94), so creating one names the LearningPlan it lands on; these tests care about the
 * Stage, not which LearningPlan holds it, so one LearningPlan per User is plenty.
 */
const learningPlanIds = new Map<string, Promise<string>>();
const learningPlanFor = (clerkUserId: string): Promise<string> => {
  let existing = learningPlanIds.get(clerkUserId);
  if (!existing) {
    existing = request(app)
      .post("/api/learning-plans")
      .set(TEST_USER_HEADER, clerkUserId)
      .send({ name: "Test LearningPlan" })
      .then((res) => (res.body as LearningPlan).id);
    learningPlanIds.set(clerkUserId, existing);
  }
  return existing;
};

const createStage = async (clerkUserId: string, body: object) => {
  const learningPlanId = await learningPlanFor(clerkUserId);
  return request(app)
    .post(`/api/learning-plans/${learningPlanId}/stages`)
    .set(TEST_USER_HEADER, clerkUserId)
    .send(body);
};

const createLearningPlan = ({
  clerkUserId,
  name,
}: {
  clerkUserId: string;
  name: string;
}) =>
  request(app)
    .post("/api/learning-plans")
    .set(TEST_USER_HEADER, clerkUserId)
    .send({ name });

const createStageOn = ({
  clerkUserId,
  learningPlanId,
  body,
}: {
  clerkUserId: string;
  learningPlanId: string;
  body: object;
}) =>
  request(app)
    .post(`/api/learning-plans/${learningPlanId}/stages`)
    .set(TEST_USER_HEADER, clerkUserId)
    .send(body);

const listStages = (clerkUserId: string) =>
  request(app).get("/api/stages").set(TEST_USER_HEADER, clerkUserId);

const viewStage = ({
  clerkUserId,
  stageId,
}: {
  clerkUserId: string;
  stageId: string;
}) =>
  request(app).get(`/api/stages/${stageId}`).set(TEST_USER_HEADER, clerkUserId);

const viewLearningPlanStage = ({
  clerkUserId,
  learningPlanId,
  stageId,
}: {
  clerkUserId: string;
  learningPlanId: string;
  stageId: string;
}) =>
  request(app)
    .get(`/api/learning-plans/${learningPlanId}/stages/${stageId}`)
    .set(TEST_USER_HEADER, clerkUserId);

const addToStage = ({
  clerkUserId,
  stageId,
  body,
}: {
  clerkUserId: string;
  stageId: string;
  body: object;
}) =>
  request(app)
    .post(`/api/stages/${stageId}/items`)
    .set(TEST_USER_HEADER, clerkUserId)
    .send(body);

const removeFromStage = ({
  clerkUserId,
  stageId,
  itemId,
}: {
  clerkUserId: string;
  stageId: string;
  itemId: string;
}) =>
  request(app)
    .delete(`/api/stages/${stageId}/items/${itemId}`)
    .set(TEST_USER_HEADER, clerkUserId);

const reorderStageItems = ({
  clerkUserId,
  stageId,
  itemIds,
}: {
  clerkUserId: string;
  stageId: string;
  itemIds: string[];
}) =>
  request(app)
    .put(`/api/stages/${stageId}/items/order`)
    .set(TEST_USER_HEADER, clerkUserId)
    .send({ itemIds });

const movePlanItem = ({
  clerkUserId,
  learningPlanId,
  itemId,
  stageId,
}: {
  clerkUserId: string;
  learningPlanId: string;
  itemId: string;
  stageId: string | null;
}) =>
  request(app)
    .put(`/api/learning-plans/${learningPlanId}/items/${itemId}/placement`)
    .set(TEST_USER_HEADER, clerkUserId)
    .send({ stageId });

const removeStage = ({
  clerkUserId,
  stageId,
  itemDisposition,
}: {
  clerkUserId: string;
  stageId: string;
  itemDisposition: StageItemDisposition;
}) =>
  request(app)
    .delete(`/api/stages/${stageId}`)
    .set(TEST_USER_HEADER, clerkUserId)
    .send({ itemDisposition });

/** Capture an Item and create a Stage for one User — the setup most tests need. */
const givenItemAndStage = async ({
  clerkUserId,
  title = "An item",
  name = "A stage",
}: {
  clerkUserId: string;
  title?: string;
  name?: string;
}): Promise<{ item: Item; stage: Stage }> => ({
  item: (await capture(clerkUserId, { title, type: "article" })).body as Item,
  stage: (await createStage(clerkUserId, { name })).body as Stage,
});

const titlesIn = (stage: StageDetail) => stage.items.map((item) => item.title);

beforeAll(async () => {
  harness = await startTestApp();
  app = harness.app;
});

afterAll(async () => {
  await harness?.stop();
});

describe("POST /api/stages — create a Stage", () => {
  it("creates a named, empty Stage scoped to the User", async () => {
    const res = await createStage("clerk_stage_create", { name: "Learn CSS" });

    expect(res.status).toBe(201);
    const stage = res.body as Stage;
    expect(stage.id).toBeTruthy();
    expect(stage.name).toBe("Learn CSS");
    expect(typeof stage.userId).toBe("string");
    expect(stage.userId).not.toBe("clerk_stage_create"); // our anchor id, not Clerk's

    expect(
      titlesIn(
        (
          await viewStage({
            clerkUserId: "clerk_stage_create",
            stageId: stage.id,
          })
        ).body,
      ),
    ).toEqual([]);
  });

  it("serves a topic to learn and a project to build with one uniform Stage", async () => {
    const clerkUserId = "clerk_stage_uniform";
    const topic = (await createStage(clerkUserId, { name: "Learn CSS" }))
      .body as Stage;
    const project = (await createStage(clerkUserId, { name: "Build the API" }))
      .body as Stage;

    // The two differ by name and nothing else: there is no kind to choose.
    expect(Object.keys(topic).sort()).toEqual(Object.keys(project).sort());
    expect(topic).not.toHaveProperty("kind");
    expect(topic).not.toHaveProperty("type");
  });

  it("trims the name boundary while preserving internal whitespace", async () => {
    const res = await createStage("clerk_stage_verbatim", {
      name: "  Spaces   kept  ",
    });

    expect((res.body as Stage).name).toBe("Spaces   kept");
  });

  it("renames an owned Stage without changing its identity or contents", async () => {
    const user = "clerk-stage-rename";
    const { item, stage } = await givenItemAndStage({ clerkUserId: user });
    await addToStage({
      clerkUserId: user,
      stageId: stage.id,
      body: { itemId: item.id },
    });

    const renamed = await request(app)
      .patch(`/api/stages/${stage.id}`)
      .set(TEST_USER_HEADER, user)
      .send({ name: "  Practice   deeply  " });

    expect(renamed.status).toBe(200);
    expect(renamed.body).toMatchObject({
      id: stage.id,
      name: "Practice   deeply",
    });
    expect(titlesIn(renamed.body as StageDetail)).toEqual([item.title]);
  });

  it("requires a name", async () => {
    expect((await createStage("clerk_stage_bad", {})).status).toBe(400);
    expect((await createStage("clerk_stage_bad", { name: "   " })).status).toBe(
      400,
    );
    expect((await createStage("clerk_stage_bad", { name: 42 })).status).toBe(
      400,
    );
  });

  it("refuses an unauthenticated create", async () => {
    const learningPlanId = await learningPlanFor(
      "clerk_stage_create_anon_owner",
    );
    expect(
      (
        await request(app)
          .post(`/api/learning-plans/${learningPlanId}/stages`)
          .send({ name: "Anon" })
      ).status,
    ).toBe(401);
  });
});

describe("GET /api/stages — list Stages", () => {
  it("lists every Stage belonging to the current User", async () => {
    const clerkUserId = "clerk_stage_list";
    await createStage(clerkUserId, { name: "One" });
    await createStage(clerkUserId, { name: "Two" });

    const res = await listStages(clerkUserId);

    expect(res.status).toBe(200);
    const names = (res.body as Stage[]).map((stage) => stage.name);
    expect(names).toContain("One");
    expect(names).toContain("Two");
  });

  it("lists nothing for a User with no Stages", async () => {
    const res = await listStages("clerk_stage_list_empty");

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("refuses an unauthenticated list", async () => {
    expect((await request(app).get("/api/stages")).status).toBe(401);
  });
});

describe("POST /api/stages/:stageId/items — pull an Item from All into a Stage", () => {
  it("adds an Item from All to a Stage", async () => {
    const clerkUserId = "clerk_stage_add";
    const { item, stage } = await givenItemAndStage({
      clerkUserId,
      title: "Flexbox guide",
    });

    const res = await addToStage({
      clerkUserId: clerkUserId,
      stageId: stage.id,
      body: { itemId: item.id },
    });

    expect(res.status).toBe(200);
    expect(titlesIn(res.body as StageDetail)).toEqual(["Flexbox guide"]);
    expect(
      titlesIn(
        (await viewStage({ clerkUserId: clerkUserId, stageId: stage.id })).body,
      ),
    ).toEqual(["Flexbox guide"]);
  });

  it("references the Item rather than copying it — it stays in All", async () => {
    const clerkUserId = "clerk_stage_reference";
    const { item, stage } = await givenItemAndStage({
      clerkUserId,
      title: "Still in All",
    });
    await addToStage({
      clerkUserId: clerkUserId,
      stageId: stage.id,
      body: { itemId: item.id },
    });

    const all = (
      await request(app).get("/api/items").set(TEST_USER_HEADER, clerkUserId)
    ).body as Item[];

    expect(all.map((listed) => listed.id)).toEqual([item.id]);
    const inStage = (
      (await viewStage({ clerkUserId: clerkUserId, stageId: stage.id }))
        .body as StageDetail
    ).items[0];
    expect(inStage.id).toBe(item.id); // the same record, not a copy
  });

  it("holds Items as a set — adding the same Item twice is not a duplicate", async () => {
    const clerkUserId = "clerk_stage_set";
    const { item, stage } = await givenItemAndStage({
      clerkUserId: clerkUserId,
      title: "Added twice",
    });

    await addToStage({
      clerkUserId: clerkUserId,
      stageId: stage.id,
      body: { itemId: item.id },
    });
    const again = await addToStage({
      clerkUserId: clerkUserId,
      stageId: stage.id,
      body: { itemId: item.id },
    });

    expect(again.status).toBe(200);
    expect(titlesIn(again.body as StageDetail)).toEqual(["Added twice"]);
  });

  it("keeps Stage Items in their persisted local insertion order", async () => {
    const user = "clerk-stage-item-order";
    const stage = (await createStage(user, { name: "Ordered work" }))
      .body as Stage;
    const zulu = (await capture(user, { title: "Zulu first", type: "article" }))
      .body as Item;
    const alpha = (
      await capture(user, { title: "Alpha second", type: "article" })
    ).body as Item;

    await addToStage({
      clerkUserId: user,
      stageId: stage.id,
      body: { itemId: zulu.id },
    });
    await addToStage({
      clerkUserId: user,
      stageId: stage.id,
      body: { itemId: alpha.id },
    });

    expect(
      titlesIn(
        (await viewStage({ clerkUserId: user, stageId: stage.id })).body,
      ),
    ).toEqual(["Zulu first", "Alpha second"]);
  });

  it("rejects placing an Item into a second Stage on the same LearningPlan", async () => {
    const clerkUserId = "clerk_stage_multi";
    const item = (
      await capture(clerkUserId, { title: "Shared item", type: "course" })
    ).body as Item;
    const css = (await createStage(clerkUserId, { name: "Learn CSS" }))
      .body as Stage;
    const api = (await createStage(clerkUserId, { name: "Build the API" }))
      .body as Stage;

    expect(
      (
        await addToStage({
          clerkUserId: clerkUserId,
          stageId: css.id,
          body: { itemId: item.id },
        })
      ).status,
    ).toBe(200);
    const conflict = await addToStage({
      clerkUserId: clerkUserId,
      stageId: api.id,
      body: {
        itemId: item.id,
      },
    });

    expect(conflict.status).toBe(409);
    expect(conflict.body).toEqual({
      error: "item already placed on this learning plan",
    });
    expect(
      (
        (await viewStage({ clerkUserId: clerkUserId, stageId: css.id }))
          .body as StageDetail
      ).items.map((member) => member.id),
    ).toEqual([item.id]);
    expect(
      (
        (await viewStage({ clerkUserId: clerkUserId, stageId: api.id }))
          .body as StageDetail
      ).items,
    ).toEqual([]);
  });

  it("places the same Item into Stages on different LearningPlans", async () => {
    const user = "clerk_stage_cross_learningPlan";
    const item = (
      await capture(user, {
        title: "Shared across LearningPlans",
        type: "course",
      })
    ).body as Item;
    const firstLearningPlan = (
      await createLearningPlan({
        clerkUserId: user,
        name: "First LearningPlan",
      })
    ).body as LearningPlan;
    const secondLearningPlan = (
      await createLearningPlan({
        clerkUserId: user,
        name: "Second LearningPlan",
      })
    ).body as LearningPlan;
    const first = (
      await createStageOn({
        clerkUserId: user,
        learningPlanId: firstLearningPlan.id,
        body: { name: "Foundations" },
      })
    ).body as Stage;
    const second = (
      await createStageOn({
        clerkUserId: user,
        learningPlanId: secondLearningPlan.id,
        body: { name: "Foundations" },
      })
    ).body as Stage;

    expect(
      (
        await addToStage({
          clerkUserId: user,
          stageId: first.id,
          body: { itemId: item.id },
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await addToStage({
          clerkUserId: user,
          stageId: second.id,
          body: { itemId: item.id },
        })
      ).status,
    ).toBe(200);
    for (const stage of [first, second]) {
      expect(
        (
          (await viewStage({ clerkUserId: user, stageId: stage.id }))
            .body as StageDetail
        ).items.map((member) => member.id),
      ).toEqual([item.id]);
    }
  });

  it("rejects an add with no valid itemId", async () => {
    const clerkUserId = "clerk_stage_add_bad";
    const { stage } = await givenItemAndStage({ clerkUserId: clerkUserId });

    expect(
      (
        await addToStage({
          clerkUserId: clerkUserId,
          stageId: stage.id,
          body: {},
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await addToStage({
          clerkUserId: clerkUserId,
          stageId: stage.id,
          body: { itemId: 42 },
        })
      ).status,
    ).toBe(400);
    const unknown = await addToStage({
      clerkUserId: clerkUserId,
      stageId: stage.id,
      body: {
        itemId: "00000000-0000-0000-0000-000000000000",
        extra: "not reflected",
      },
    });
    expect(unknown.status).toBe(400);
    expect(unknown.body).toEqual({
      error: "invalid_request",
      issues: [
        {
          path: "body.$unknown",
          message: "Contains unrecognized fields",
        },
      ],
    });
    expect(
      (await viewStage({ clerkUserId: clerkUserId, stageId: stage.id })).body
        .items,
    ).toEqual([]);
  });

  it("cannot add an Item that does not exist", async () => {
    const clerkUserId = "clerk_stage_add_missing";
    const { stage } = await givenItemAndStage({ clerkUserId: clerkUserId });

    const res = await addToStage({
      clerkUserId: clerkUserId,
      stageId: stage.id,
      body: {
        itemId: "00000000-0000-0000-0000-000000000000",
      },
    });

    expect(res.status).toBe(404);
  });

  it("refuses an unauthenticated add", async () => {
    const { item, stage } = await givenItemAndStage({
      clerkUserId: "clerk_stage_add_anon",
    });

    const res = await request(app)
      .post(`/api/stages/${stage.id}/items`)
      .send({ itemId: item.id });

    expect(res.status).toBe(401);
  });
});

describe("PUT /api/stages/:stageId/items/order — reorder Stage Items", () => {
  it("persists a complete local order without changing shared Item facts", async () => {
    const user = "clerk-stage-reorder";
    const stage = (await createStage(user, { name: "Ordered phase" }))
      .body as Stage;
    const first = (await capture(user, { title: "First", type: "article" }))
      .body as Item;
    const second = (await capture(user, { title: "Second", type: "course" }))
      .body as Item;
    await addToStage({
      clerkUserId: user,
      stageId: stage.id,
      body: { itemId: first.id },
    });
    await addToStage({
      clerkUserId: user,
      stageId: stage.id,
      body: { itemId: second.id },
    });
    await setStatus({
      clerkUserId: user,
      itemId: first.id,
      status: "in_progress",
    });

    const reordered = await reorderStageItems({
      clerkUserId: user,
      stageId: stage.id,
      itemIds: [second.id, first.id],
    });

    expect(reordered.status).toBe(200);
    expect(titlesIn(reordered.body as StageDetail)).toEqual([
      "Second",
      "First",
    ]);
    expect((reordered.body as StageDetail).items[1]).toMatchObject({
      id: first.id,
      status: "in_progress",
      type: "article",
    });
    expect(
      titlesIn(
        (await viewStage({ clerkUserId: user, stageId: stage.id })).body,
      ),
    ).toEqual(["Second", "First"]);
  });

  it("refuses a partial order and leaves the persisted order unchanged", async () => {
    const user = "clerk-stage-reorder-partial";
    const stage = (await createStage(user, { name: "Whole order" }))
      .body as Stage;
    const first = (await capture(user, { title: "One", type: "book" }))
      .body as Item;
    const second = (await capture(user, { title: "Two", type: "book" }))
      .body as Item;
    await addToStage({
      clerkUserId: user,
      stageId: stage.id,
      body: { itemId: first.id },
    });
    await addToStage({
      clerkUserId: user,
      stageId: stage.id,
      body: { itemId: second.id },
    });

    const partial = await reorderStageItems({
      clerkUserId: user,
      stageId: stage.id,
      itemIds: [second.id],
    });

    expect(partial.status).toBe(409);
    expect(
      titlesIn(
        (await viewStage({ clerkUserId: user, stageId: stage.id })).body,
      ),
    ).toEqual(["One", "Two"]);
  });
});

describe("PUT /api/learning-plans/:learningPlanId/items/:itemId/placement — move a placement", () => {
  it("moves one shared Item between direct and staged placement without changing its facts", async () => {
    const user = "clerk-stage-move-placement";
    const learningPlan = (
      await createLearningPlan({ clerkUserId: user, name: "Compiler study" })
    ).body as LearningPlan;
    const parsing = (
      await createStageOn({
        clerkUserId: user,
        learningPlanId: learningPlan.id,
        body: { name: "Parsing" },
      })
    ).body as Stage;
    const optimization = (
      await createStageOn({
        clerkUserId: user,
        learningPlanId: learningPlan.id,
        body: { name: "Optimization" },
      })
    ).body as Stage;
    const item = (
      await capture(user, { title: "Crafting Interpreters", type: "book" })
    ).body as Item;
    await setStatus({
      clerkUserId: user,
      itemId: item.id,
      status: "in_progress",
    });
    expect(
      (
        await request(app)
          .post(`/api/learning-plans/${learningPlan.id}/items`)
          .set(TEST_USER_HEADER, user)
          .send({ itemId: item.id })
      ).status,
    ).toBe(201);

    expect(
      (
        await movePlanItem({
          clerkUserId: user,
          learningPlanId: learningPlan.id,
          itemId: item.id,
          stageId: parsing.id,
        })
      ).status,
    ).toBe(200);
    expect(
      titlesIn(
        (await viewStage({ clerkUserId: user, stageId: parsing.id })).body,
      ),
    ).toEqual([item.title]);

    expect(
      (
        await movePlanItem({
          clerkUserId: user,
          learningPlanId: learningPlan.id,
          itemId: item.id,
          stageId: optimization.id,
        })
      ).status,
    ).toBe(200);
    expect(
      titlesIn(
        (await viewStage({ clerkUserId: user, stageId: parsing.id })).body,
      ),
    ).toEqual([]);
    expect(
      titlesIn(
        (await viewStage({ clerkUserId: user, stageId: optimization.id })).body,
      ),
    ).toEqual([item.title]);

    const direct = await movePlanItem({
      clerkUserId: user,
      learningPlanId: learningPlan.id,
      itemId: item.id,
      stageId: null,
    });
    expect(direct.status).toBe(200);
    const directNode = (
      direct.body as { nodes: Array<{ kind: string; item?: Item }> }
    ).nodes.find((node) => node.item?.id === item.id);
    expect(directNode?.kind).toBe("item");
    expect(directNode?.item).toMatchObject({
      id: item.id,
      title: item.title,
      status: "in_progress",
      type: "book",
    });
  });

  it("treats cross-Plan and cross-User Stage destinations as unavailable", async () => {
    const owner = "clerk-stage-move-private-owner";
    const learningPlan = (
      await createLearningPlan({ clerkUserId: owner, name: "Owner Plan" })
    ).body as LearningPlan;
    const item = (await capture(owner, { title: "Private", type: "book" }))
      .body as Item;
    await request(app)
      .post(`/api/learning-plans/${learningPlan.id}/items`)
      .set(TEST_USER_HEADER, owner)
      .send({ itemId: item.id });
    const otherPlan = (
      await createLearningPlan({ clerkUserId: owner, name: "Other Plan" })
    ).body as LearningPlan;
    const otherStage = (
      await createStageOn({
        clerkUserId: owner,
        learningPlanId: otherPlan.id,
        body: { name: "Wrong Plan" },
      })
    ).body as Stage;

    expect(
      (
        await movePlanItem({
          clerkUserId: owner,
          learningPlanId: learningPlan.id,
          itemId: item.id,
          stageId: otherStage.id,
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await movePlanItem({
          clerkUserId: "clerk-stage-move-private-intruder",
          learningPlanId: learningPlan.id,
          itemId: item.id,
          stageId: null,
        })
      ).status,
    ).toBe(404);
  });
});

describe("DELETE /api/stages/:stageId — remove a Stage", () => {
  it("requires and applies an explicit outcome for the Stage's Items", async () => {
    const user = "clerk-stage-remove-structure";
    const learningPlan = (
      await createLearningPlan({ clerkUserId: user, name: "Systems" })
    ).body as LearningPlan;
    const keepStage = (
      await createStageOn({
        clerkUserId: user,
        learningPlanId: learningPlan.id,
        body: { name: "Keep these" },
      })
    ).body as Stage;
    const removeStageNode = (
      await createStageOn({
        clerkUserId: user,
        learningPlanId: learningPlan.id,
        body: { name: "Uncommit these" },
      })
    ).body as Stage;
    const keptItem = (
      await capture(user, { title: "Kept in plan", type: "book" })
    ).body as Item;
    const uncommittedItem = (
      await capture(user, { title: "Only in Library", type: "video" })
    ).body as Item;
    await addToStage({
      clerkUserId: user,
      stageId: keepStage.id,
      body: { itemId: keptItem.id },
    });
    await addToStage({
      clerkUserId: user,
      stageId: removeStageNode.id,
      body: { itemId: uncommittedItem.id },
    });

    expect(
      (
        await request(app)
          .delete(`/api/stages/${keepStage.id}`)
          .set(TEST_USER_HEADER, user)
      ).status,
    ).toBe(400);
    const kept = await removeStage({
      clerkUserId: user,
      stageId: keepStage.id,
      itemDisposition: "place_directly",
    });
    expect(kept.status).toBe(200);
    expect(
      (kept.body as { nodes: Array<{ item?: Item }> }).nodes.some(
        (node) => node.item?.id === keptItem.id,
      ),
    ).toBe(true);

    const removed = await removeStage({
      clerkUserId: user,
      stageId: removeStageNode.id,
      itemDisposition: "remove_from_plan",
    });
    expect(removed.status).toBe(200);
    expect(
      (removed.body as { nodes: Array<{ item?: Item }> }).nodes.some(
        (node) => node.item?.id === uncommittedItem.id,
      ),
    ).toBe(false);
    const library = (
      await request(app).get("/api/items").set(TEST_USER_HEADER, user)
    ).body as Item[];
    expect(library.map(({ id }) => id)).toEqual(
      expect.arrayContaining([keptItem.id, uncommittedItem.id]),
    );
  });
});

describe("DELETE /api/stages/:stageId/items/:itemId — remove an Item from a Stage", () => {
  it("removes the Item from the Stage", async () => {
    const clerkUserId = "clerk_stage_remove";
    const { item, stage } = await givenItemAndStage({
      clerkUserId: clerkUserId,
      title: "Remove me",
    });
    await addToStage({
      clerkUserId: clerkUserId,
      stageId: stage.id,
      body: { itemId: item.id },
    });

    const res = await removeFromStage({
      clerkUserId: clerkUserId,
      stageId: stage.id,
      itemId: item.id,
    });

    expect(res.status).toBe(200);
    expect(titlesIn(res.body as StageDetail)).toEqual([]);
    expect(
      titlesIn(
        (await viewStage({ clerkUserId: clerkUserId, stageId: stage.id })).body,
      ),
    ).toEqual([]);
  });

  it("leaves the Item itself in All — removal unfiles, it does not delete", async () => {
    const clerkUserId = "clerk_stage_remove_keeps_item";
    const { item, stage } = await givenItemAndStage({
      clerkUserId: clerkUserId,
      title: "Survivor",
    });
    await addToStage({
      clerkUserId: clerkUserId,
      stageId: stage.id,
      body: { itemId: item.id },
    });
    await setStatus({
      clerkUserId: clerkUserId,
      itemId: item.id,
      status: "in_progress",
    });

    await removeFromStage({
      clerkUserId: clerkUserId,
      stageId: stage.id,
      itemId: item.id,
    });

    const all = (
      await request(app).get("/api/items").set(TEST_USER_HEADER, clerkUserId)
    ).body as Item[];
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe(item.id);
    expect(all[0].status).toBe("in_progress"); // and its progress is untouched
  });

  it("leaves the Item's other Stage memberships alone", async () => {
    const clerkUserId = "clerk_stage_remove_one_membership";
    const item = (await capture(clerkUserId, { title: "In two", type: "book" }))
      .body as Item;
    const first = (await createStage(clerkUserId, { name: "First" }))
      .body as Stage;
    const otherLearningPlan = (
      await createLearningPlan({ clerkUserId, name: "Other LearningPlan" })
    ).body as LearningPlan;
    const second = (
      await createStageOn({
        clerkUserId,
        learningPlanId: otherLearningPlan.id,
        body: { name: "Second" },
      })
    ).body as Stage;
    await addToStage({
      clerkUserId: clerkUserId,
      stageId: first.id,
      body: { itemId: item.id },
    });
    await addToStage({
      clerkUserId: clerkUserId,
      stageId: second.id,
      body: { itemId: item.id },
    });

    await removeFromStage({
      clerkUserId: clerkUserId,
      stageId: first.id,
      itemId: item.id,
    });

    expect(
      titlesIn(
        (await viewStage({ clerkUserId: clerkUserId, stageId: first.id })).body,
      ),
    ).toEqual([]);
    expect(
      titlesIn(
        (await viewStage({ clerkUserId: clerkUserId, stageId: second.id }))
          .body,
      ),
    ).toEqual(["In two"]);
  });

  it("removes only the named Item, leaving the Stage's other Items", async () => {
    const clerkUserId = "clerk_stage_remove_only_named";
    const stage = (await createStage(clerkUserId, { name: "Mixed" }))
      .body as Stage;
    const goes = (await capture(clerkUserId, { title: "Goes", type: "video" }))
      .body as Item;
    const stays = (
      await capture(clerkUserId, { title: "Stays", type: "video" })
    ).body as Item;
    await addToStage({
      clerkUserId: clerkUserId,
      stageId: stage.id,
      body: { itemId: goes.id },
    });
    await addToStage({
      clerkUserId: clerkUserId,
      stageId: stage.id,
      body: { itemId: stays.id },
    });

    await removeFromStage({
      clerkUserId: clerkUserId,
      stageId: stage.id,
      itemId: goes.id,
    });

    expect(
      titlesIn(
        (await viewStage({ clerkUserId: clerkUserId, stageId: stage.id })).body,
      ),
    ).toEqual(["Stays"]);
  });

  it("refuses an unauthenticated removal", async () => {
    const clerkUserId = "clerk_stage_remove_anon";
    const { item, stage } = await givenItemAndStage({
      clerkUserId: clerkUserId,
      title: "Anon remove",
    });
    await addToStage({
      clerkUserId: clerkUserId,
      stageId: stage.id,
      body: { itemId: item.id },
    });

    const res = await request(app).delete(
      `/api/stages/${stage.id}/items/${item.id}`,
    );

    expect(res.status).toBe(401);
    expect(
      titlesIn(
        (await viewStage({ clerkUserId: clerkUserId, stageId: stage.id })).body,
      ),
    ).toEqual(["Anon remove"]);
  });

  it("rejects malformed identifiers without removing the membership", async () => {
    const user = "clerk_stage_remove_invalid";
    const { item, stage } = await givenItemAndStage({
      clerkUserId: user,
      title: "Still here",
    });
    await addToStage({
      clerkUserId: user,
      stageId: stage.id,
      body: { itemId: item.id },
    });

    const res = await removeFromStage({
      clerkUserId: user,
      stageId: stage.id,
      itemId: "not-an-item-id",
    });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: "invalid_request",
      issues: [{ path: "path.itemId", message: "Must be a valid UUID" }],
    });
    expect(
      titlesIn(
        (await viewStage({ clerkUserId: user, stageId: stage.id })).body,
      ),
    ).toEqual(["Still here"]);
  });
});

describe("GET /api/stages/:stageId — view a Stage's contents", () => {
  it("shows each Item with its Status", async () => {
    const clerkUserId = "clerk_stage_view_status";
    const stage = (await createStage(clerkUserId, { name: "Progress" }))
      .body as Stage;
    const started = (
      await capture(clerkUserId, { title: "Started", type: "article" })
    ).body as Item;
    const fresh = (
      await capture(clerkUserId, { title: "Fresh", type: "article" })
    ).body as Item;
    await addToStage({
      clerkUserId: clerkUserId,
      stageId: stage.id,
      body: { itemId: started.id },
    });
    await addToStage({
      clerkUserId: clerkUserId,
      stageId: stage.id,
      body: { itemId: fresh.id },
    });
    await setStatus({
      clerkUserId: clerkUserId,
      itemId: started.id,
      status: "in_progress",
    });

    const detail = (
      await viewStage({ clerkUserId: clerkUserId, stageId: stage.id })
    ).body as StageDetail;

    const statusOf = (title: string) =>
      detail.items.find((item) => item.title === title)?.status;
    expect(statusOf("Started")).toBe("in_progress");
    expect(statusOf("Fresh")).toBe("not_started");
  });

  it("shows an Item's derived past target inside a Stage, exactly as All does", async () => {
    const clerkUserId = "clerk_stage_view_past_target";
    const { item, stage } = await givenItemAndStage({
      clerkUserId: clerkUserId,
      title: "Slipped",
    });
    await addToStage({
      clerkUserId: clerkUserId,
      stageId: stage.id,
      body: { itemId: item.id },
    });
    await request(app)
      .patch(`/api/items/${item.id}/target-date`)
      .set(TEST_USER_HEADER, clerkUserId)
      .send({ targetDate: "2000-01-01" });

    const detail = (
      await viewStage({ clerkUserId: clerkUserId, stageId: stage.id })
    ).body as StageDetail;

    expect(detail.items[0].targetDate).toBe("2000-01-01");
    expect(detail.items[0].pastTarget).toBe(true);
  });

  it("404s on a Stage that does not exist", async () => {
    const res = await viewStage({
      clerkUserId: "clerk_stage_view_missing",
      stageId: "00000000-0000-0000-0000-000000000000",
    });

    expect(res.status).toBe(404);
  });

  it("rejects a malformed Stage id before repository work", async () => {
    const res = await viewStage({
      clerkUserId: "clerk_stage_read_invalid",
      stageId: "not-a-stage-id",
    });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: "invalid_request",
      issues: [{ path: "path.stageId", message: "Must be a valid UUID" }],
    });
  });

  it("refuses an unauthenticated view", async () => {
    const { stage } = await givenItemAndStage({
      clerkUserId: "clerk_stage_view_anon",
    });

    expect((await request(app).get(`/api/stages/${stage.id}`)).status).toBe(
      401,
    );
  });
});

describe("GET /api/learning-plans/:learningPlanId/stages/:stageId — view a Stage in its route context", () => {
  it("treats mismatched and foreign LearningPlan/Stage pairs exactly like missing ones", async () => {
    const owner = "clerk_stage_route_context_owner";
    const owningLearningPlanId = await learningPlanFor(owner);
    const stage = (await createStage(owner, { name: "Contextual Stage" }))
      .body as Stage;
    const otherLearningPlanId = (
      await request(app)
        .post("/api/learning-plans")
        .set(TEST_USER_HEADER, owner)
        .send({ name: "Other LearningPlan" })
    ).body.id as string;

    expect(
      (
        await viewLearningPlanStage({
          clerkUserId: owner,
          learningPlanId: owningLearningPlanId,
          stageId: stage.id,
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await viewLearningPlanStage({
          clerkUserId: owner,
          learningPlanId: otherLearningPlanId,
          stageId: stage.id,
        })
      ).status,
    ).toBe(404);
    const malformed = await viewLearningPlanStage({
      clerkUserId: owner,
      learningPlanId: owningLearningPlanId,
      stageId: "not-a-stage-id",
    });
    expect(malformed.status).toBe(400);
    expect(malformed.body).toEqual({
      error: "invalid_request",
      issues: [{ path: "path.stageId", message: "Must be a valid UUID" }],
    });
    expect(
      (
        await viewLearningPlanStage({
          clerkUserId: "clerk_stage_route_context_intruder",
          learningPlanId: owningLearningPlanId,
          stageId: stage.id,
        })
      ).status,
    ).toBe(404);
  });

  it("rejects a malformed parent LearningPlan id before reading a Stage", async () => {
    const user = "clerk_stage_route_invalid_parent";
    const stage = (await createStage(user, { name: "Valid Stage" }))
      .body as Stage;

    const res = await viewLearningPlanStage({
      clerkUserId: user,
      learningPlanId: "not-a-learningPlan-id",
      stageId: stage.id,
    });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: "invalid_request",
      issues: [
        { path: "path.learningPlanId", message: "Must be a valid UUID" },
      ],
    });
  });
});

describe("one Status, read through every Stage that holds the Item", () => {
  it("reflects a single Status change through every Stage containing the Item", async () => {
    const clerkUserId = "clerk_stage_shared_status";
    const item = (
      await capture(clerkUserId, { title: "Tracked once", type: "course" })
    ).body as Item;
    const stages: Stage[] = [];
    for (const name of ["Learn CSS", "Build the API", "Reading list"]) {
      const learningPlan = (
        await createLearningPlan({ clerkUserId, name: `${name} LearningPlan` })
      ).body as LearningPlan;
      const stage = (
        await createStageOn({
          clerkUserId,
          learningPlanId: learningPlan.id,
          body: { name },
        })
      ).body as Stage;
      await addToStage({
        clerkUserId: clerkUserId,
        stageId: stage.id,
        body: { itemId: item.id },
      });
      stages.push(stage);
    }

    // Changed once, on the Item — not per Stage, because there is nowhere else
    // for a Status to live (ADR-0004: the membership carries none).
    await setStatus({
      clerkUserId: clerkUserId,
      itemId: item.id,
      status: "done",
    });

    for (const stage of stages) {
      const detail = (
        await viewStage({ clerkUserId: clerkUserId, stageId: stage.id })
      ).body as StageDetail;
      expect(detail.items[0].status, `Status in ${stage.name}`).toBe("done");
    }
    const all = (
      await request(app).get("/api/items").set(TEST_USER_HEADER, clerkUserId)
    ).body as Item[];
    expect(all[0].status).toBe("done");
  });
});

describe("StageItem — membership with database invariant anchors", () => {
  it("carries its User, Learning Plan, and local-order facts but no Status", async () => {
    const { rows } = await harness.pool.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'stage_items'`,
    );
    const columns = rows.map((row) => row.column_name).sort();

    expect(columns).toEqual([
      "item_id",
      "learning_plan_id",
      "placement_id",
      "position",
      "stage_id",
      "user_id",
    ]);
  });

  it("cannot hold the same Item in the same Stage twice, at the database", async () => {
    const clerkUserId = "clerk_stage_item_unique";
    const { item, stage } = await givenItemAndStage({
      clerkUserId: clerkUserId,
      title: "Only once",
    });
    await addToStage({
      clerkUserId: clerkUserId,
      stageId: stage.id,
      body: { itemId: item.id },
    });

    // Set semantics are the schema's guarantee, not just the route's.
    await expect(
      harness.pool.query(
        `INSERT INTO stage_items
           (placement_id, user_id, stage_id, item_id, learning_plan_id, position)
         SELECT id, user_id, stage_id, item_id, learning_plan_id, 0
         FROM learning_plan_item_placements
         WHERE stage_id = $2 AND item_id = $3`,
        [stage.userId, stage.id, item.id],
      ),
    ).rejects.toThrow();
  });

  it("cannot place one Item into two Stages on the same LearningPlan at the database", async () => {
    const user = "clerk_stage_item_learningPlan_unique";
    const { item, stage: first } = await givenItemAndStage({
      clerkUserId: user,
      title: "One place per LearningPlan",
      name: "First",
    });
    const second = (await createStage(user, { name: "Second" })).body as Stage;
    await addToStage({
      clerkUserId: user,
      stageId: first.id,
      body: { itemId: item.id },
    });

    await expect(
      harness.pool.query(
        `INSERT INTO learning_plan_item_placements
           (user_id, learning_plan_id, item_id, stage_id)
         SELECT $1, learning_plan_id, $3, $2 FROM stages WHERE id = $2`,
        [first.userId, second.id, item.id],
      ),
    ).rejects.toThrow(/learning_plan_item_placements_item_plan_unique/);
  });

  it("rejects a cross-User membership at the database boundary", async () => {
    const alice = await givenItemAndStage({
      clerkUserId: "clerk_stage_item_tenant_alice",
      title: "Alice's item",
      name: "Alice's stage",
    });
    const bob = await givenItemAndStage({
      clerkUserId: "clerk_stage_item_tenant_bob",
      title: "Bob's item",
      name: "Bob's stage",
    });

    await expect(
      harness.pool.query(
        `INSERT INTO learning_plan_item_placements
           (user_id, learning_plan_id, item_id, stage_id)
         SELECT $1, learning_plan_id, $3, $2 FROM stages WHERE id = $2`,
        [alice.stage.userId, alice.stage.id, bob.item.id],
      ),
    ).rejects.toThrow(/learning_plan_item_placements_item_owner_fk/);
  });
});

describe("per-User isolation", () => {
  it("shows a User only their own Stages — never another User's", async () => {
    await createStage("clerk_stage_iso_alice", { name: "Alice's stage" });
    await createStage("clerk_stage_iso_bob", { name: "Bob's stage" });

    const aliceStages = (await listStages("clerk_stage_iso_alice"))
      .body as Stage[];
    const bobStages = (await listStages("clerk_stage_iso_bob")).body as Stage[];

    expect(aliceStages.map((stage) => stage.name)).toEqual(["Alice's stage"]);
    expect(bobStages.map((stage) => stage.name)).toEqual(["Bob's stage"]);
    expect(aliceStages[0].userId).not.toBe(bobStages[0].userId);
  });

  it("cannot view another User's Stage", async () => {
    const { stage } = await givenItemAndStage({
      clerkUserId: "clerk_stage_iso_view_owner",
    });

    const res = await viewStage({
      clerkUserId: "clerk_stage_iso_view_intruder",
      stageId: stage.id,
    });

    expect(res.status).toBe(404);
  });

  it("cannot add an Item to another User's Stage", async () => {
    const { stage } = await givenItemAndStage({
      clerkUserId: "clerk_stage_iso_add_owner",
    });
    const intruderItem = (
      await capture("clerk_stage_iso_add_intruder", {
        title: "Intruder's item",
        type: "article",
      })
    ).body as Item;

    const res = await addToStage({
      clerkUserId: "clerk_stage_iso_add_intruder",
      stageId: stage.id,
      body: {
        itemId: intruderItem.id,
      },
    });

    expect(res.status).toBe(404);
    expect(
      titlesIn(
        (
          await viewStage({
            clerkUserId: "clerk_stage_iso_add_owner",
            stageId: stage.id,
          })
        ).body,
      ),
    ).toEqual([]);
  });

  it("cannot add another User's Item to your own Stage", async () => {
    const ownerItem = (
      await capture("clerk_stage_iso_item_owner", {
        title: "Owner's item",
        type: "book",
      })
    ).body as Item;
    const stage = (
      await createStage("clerk_stage_iso_item_taker", { name: "My stage" })
    ).body as Stage;

    const res = await addToStage({
      clerkUserId: "clerk_stage_iso_item_taker",
      stageId: stage.id,
      body: {
        itemId: ownerItem.id,
      },
    });

    expect(res.status).toBe(404);
    expect(
      titlesIn(
        (
          await viewStage({
            clerkUserId: "clerk_stage_iso_item_taker",
            stageId: stage.id,
          })
        ).body,
      ),
    ).toEqual([]);
  });

  it("cannot remove an Item from another User's Stage", async () => {
    const clerkUserId = "clerk_stage_iso_remove_owner";
    const { item, stage } = await givenItemAndStage({
      clerkUserId,
      title: "Owner's only",
    });
    await addToStage({
      clerkUserId: clerkUserId,
      stageId: stage.id,
      body: { itemId: item.id },
    });

    const res = await removeFromStage({
      clerkUserId: "clerk_stage_iso_remove_intruder",
      stageId: stage.id,
      itemId: item.id,
    });

    expect(res.status).toBe(404);
    expect(
      titlesIn(
        (await viewStage({ clerkUserId: clerkUserId, stageId: stage.id })).body,
      ),
    ).toEqual(["Owner's only"]);
  });
});
