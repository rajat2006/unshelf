import { Router, type RequestHandler } from "express";
import {
  connectLearningPlanNodesRequestSchema,
  createStageRequestSchema,
  createLearningPlanRequestSchema,
  itemIdSchema,
  placeLearningPlanItemRequestSchema,
  planNodeIdSchema,
  stageItemSearchQuerySchema,
  stageIdSchema,
  learningPlanIdSchema,
  updateLearningPlanRequestSchema,
} from "@unshelf/shared/validation";
import type { Database } from "../db";
import * as learningPlansService from "./service";
import {
  recordValidationFailure,
  validateRequest,
} from "../middleware/validation";

/**
 * Mount the authenticated LearningPlan HTTP interface at `/api/learning-plans`.
 *
 * A first-class LearningPlan is a plain owned resource (ADR-0014): `GET /` lists the
 * User's LearningPlans with derived progress, `POST /` creates one, and `GET /:learningPlanId`
 * reads one. Its Stages and its topology are addressed *under* it (ADR-0014, #94),
 * because both are now scoped to exactly one LearningPlan:
 *
 * - `POST /:learningPlanId/stages` creates a Stage on the LearningPlan.
 * - `GET /:learningPlanId/topology` reads the LearningPlan's nodes and edges.
 * - `POST /:learningPlanId/edges` draws one edge; `DELETE /:learningPlanId/edges/:from/:to`
 *   erases one. Rewiring (fork, rejoin, move) is just erasing and drawing edges.
 *
 * A LearningPlan — or a Stage on it — belonging to another User answers exactly as a
 * missing one does — 404, never 403 — so the boundary never confirms that someone
 * else's id is real. A link that would close a cycle is a 409: the request is
 * well-formed and authorised but conflicts with the LearningPlan-is-a-DAG invariant
 * (ADR-0010).
 */
export function createLearningPlansRouter(
  db: Database,
  auth: RequestHandler[],
): Router {
  const router = Router();
  router.use(...auth);

  router.get("/", async (req, res) => {
    res.json(
      await learningPlansService.listLearningPlans({
        db,
        userId: req.user!.id,
      }),
    );
  });

  router.post(
    "/",
    validateRequest(
      { body: createLearningPlanRequestSchema },
      "invalid_learning_plan_name",
    ),
    async (req, res) => {
      const { body } = res.locals.validated;
      res.status(201).json(
        await learningPlansService.createLearningPlan({
          db,
          userId: req.user!.id,
          request: body,
        }),
      );
    },
  );

  router.get(
    "/:learningPlanId",
    validateRequest(
      {
        params: { learningPlanId: learningPlanIdSchema },
      },
      "invalid_learning_plan_name",
    ),
    async (req, res) => {
      const { params } = res.locals.validated;
      const learningPlan = await learningPlansService.getLearningPlan({
        db,
        userId: req.user!.id,
        learningPlanId: params.learningPlanId,
      });
      if (!learningPlan) {
        res.status(404).json({ error: "learning plan not found" });
        return;
      }
      res.json(learningPlan);
    },
  );

  router.patch(
    "/:learningPlanId",
    validateRequest(
      {
        body: updateLearningPlanRequestSchema,
        params: { learningPlanId: learningPlanIdSchema },
      },
      "invalid_learning_plan_name",
    ),
    async (req, res) => {
      const { body, params } = res.locals.validated;
      const learningPlan = await learningPlansService.updateLearningPlan({
        db,
        userId: req.user!.id,
        learningPlanId: params.learningPlanId,
        request: body,
      });
      if (!learningPlan) {
        res.status(404).json({ error: "learning plan not found" });
        return;
      }
      res.json(learningPlan);
    },
  );

  router.post(
    "/:learningPlanId/stages",
    validateRequest(
      {
        body: createStageRequestSchema,
        params: { learningPlanId: learningPlanIdSchema },
      },
      "invalid_stage_name",
    ),
    async (req, res) => {
      const { body, params } = res.locals.validated;
      const stage = await learningPlansService.createStage({
        db,
        userId: req.user!.id,
        learningPlanId: params.learningPlanId,
        request: body,
      });
      if (!stage) {
        res.status(404).json({ error: "learning plan not found" });
        return;
      }
      res.status(201).json(stage);
    },
  );

  router.get(
    "/:learningPlanId/stages/:stageId",
    validateRequest(
      {
        params: {
          learningPlanId: learningPlanIdSchema,
          stageId: stageIdSchema,
        },
      },
      "invalid_stage_name",
    ),
    async (req, res) => {
      const { params } = res.locals.validated;
      const stage = await learningPlansService.getStage({
        db,
        userId: req.user!.id,
        learningPlanId: params.learningPlanId,
        stageId: params.stageId,
      });
      if (!stage) {
        res.status(404).json({ error: "stage not found" });
        return;
      }
      res.json(stage);
    },
  );

  router.get(
    "/:learningPlanId/topology",
    validateRequest(
      {
        params: { learningPlanId: learningPlanIdSchema },
      },
      "invalid_learning_plan_name",
    ),
    async (req, res) => {
      const { params } = res.locals.validated;
      const topology = await learningPlansService.getTopology({
        db,
        userId: req.user!.id,
        learningPlanId: params.learningPlanId,
      });
      if (!topology) {
        res.status(404).json({ error: "learning plan not found" });
        return;
      }
      res.json(topology);
    },
  );

  router.post(
    "/:learningPlanId/items",
    validateRequest(
      {
        body: placeLearningPlanItemRequestSchema,
        params: { learningPlanId: learningPlanIdSchema },
      },
      "missing_item_id",
    ),
    async (req, res) => {
      const { body, params } = res.locals.validated;
      const result = await learningPlansService.placeDirectItem({
        db,
        userId: req.user!.id,
        learningPlanId: params.learningPlanId,
        itemId: body.itemId,
      });
      if (!result.ok) {
        if (result.error === "not_found") {
          res.status(404).json({ error: "learning plan or item not found" });
        } else {
          res
            .status(409)
            .json({ error: "item already placed on this learning plan" });
        }
        return;
      }
      res.status(201).json(result.learningPlan);
    },
  );

  router.get(
    "/:learningPlanId/items",
    validateRequest(
      {
        params: { learningPlanId: learningPlanIdSchema },
        query: stageItemSearchQuerySchema,
      },
      "invalid_stage_item_search",
    ),
    async (req, res) => {
      const { params, query } = res.locals.validated;
      const candidates = await learningPlansService.searchItemCandidates({
        db,
        userId: req.user!.id,
        learningPlanId: params.learningPlanId,
        query: query.query ?? "",
      });
      if (!candidates) {
        res.status(404).json({ error: "learning plan not found" });
        return;
      }
      res.json(candidates);
    },
  );

  router.delete(
    "/:learningPlanId/items/:itemId",
    validateRequest(
      {
        params: {
          learningPlanId: learningPlanIdSchema,
          itemId: itemIdSchema,
        },
      },
      "missing_item_id",
    ),
    async (req, res) => {
      const { params } = res.locals.validated;
      const result = await learningPlansService.removeDirectItem({
        db,
        userId: req.user!.id,
        learningPlanId: params.learningPlanId,
        itemId: params.itemId,
      });
      if (!result.ok) {
        if (result.error === "not_found") {
          res.status(404).json({ error: "learning plan or item not found" });
        } else {
          res.status(409).json({ error: "item is placed inside a stage" });
        }
        return;
      }
      res.json(result.learningPlan);
    },
  );

  router.post(
    "/:learningPlanId/edges",
    validateRequest(
      {
        body: connectLearningPlanNodesRequestSchema,
        params: { learningPlanId: learningPlanIdSchema },
      },
      "invalid_edge_endpoints",
    ),
    async (req, res) => {
      const { body, params } = res.locals.validated;
      const result = await learningPlansService.connectNodes({
        db,
        userId: req.user!.id,
        learningPlanId: params.learningPlanId,
        endpoints: body,
      });
      if (!result.ok) {
        switch (result.error) {
          case "self_edge":
            recordValidationFailure(req, "self_edge");
            res.status(400).json({ error: "a stage cannot link to itself" });
            return;
          case "not_found":
            res.status(404).json({ error: "stage not found" });
            return;
          case "cycle":
            res.status(409).json({
              error: "that link would create a cycle in the learning plan",
            });
            return;
        }
      }
      res.status(201).json(result.learningPlan);
    },
  );

  router.delete(
    "/:learningPlanId/edges/:fromNodeId/:toNodeId",
    validateRequest(
      {
        params: {
          learningPlanId: learningPlanIdSchema,
          fromNodeId: planNodeIdSchema,
          toNodeId: planNodeIdSchema,
        },
      },
      "invalid_edge_endpoints",
    ),
    async (req, res) => {
      const { params } = res.locals.validated;
      const topology = await learningPlansService.disconnectNodes({
        db,
        userId: req.user!.id,
        learningPlanId: params.learningPlanId,
        endpoints: {
          fromNodeId: params.fromNodeId,
          toNodeId: params.toNodeId,
        },
      });
      if (!topology) {
        res.status(404).json({ error: "learning plan not found" });
        return;
      }
      res.json(topology);
    },
  );

  return router;
}
