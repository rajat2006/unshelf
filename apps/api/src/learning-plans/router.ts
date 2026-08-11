import { Router, type RequestHandler } from "express";
import {
  connectLearningPlanNodesRequestSchema,
  createStageRequestSchema,
  createLearningPlanRequestSchema,
  stageIdSchema,
  learningPlanIdSchema,
  updateLearningPlanRequestSchema,
} from "@unshelf/shared/validation";
import type { Database } from "../db";
import { createStage, getStageOnLearningPlan } from "../stages/repository";
import {
  connectLearningPlanNodes,
  disconnectLearningPlanNodes,
  getLearningPlan as getLearningPlanTopology,
} from "../learning-plan/repository";
import {
  createLearningPlan,
  getLearningPlan,
  listLearningPlans,
  updateLearningPlan,
} from "./repository";
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
    res.json(await listLearningPlans(db, req.user!.id));
  });

  router.post(
    "/",
    validateRequest(
      { body: createLearningPlanRequestSchema },
      "invalid_learning_plan_name",
    ),
    async (req, res) => {
      const { body } = res.locals.validated;
      res.status(201).json(await createLearningPlan(db, req.user!.id, body));
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
      const learningPlan = await getLearningPlan(
        db,
        req.user!.id,
        params.learningPlanId,
      );
      if (!learningPlan) {
        res.status(404).json({ error: "learningPlan not found" });
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
      const learningPlan = await updateLearningPlan(
        db,
        req.user!.id,
        params.learningPlanId,
        body,
      );
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
      const stage = await createStage(
        db,
        req.user!.id,
        params.learningPlanId,
        body,
      );
      if (!stage) {
        res.status(404).json({ error: "learningPlan not found" });
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
      const stage = await getStageOnLearningPlan(
        db,
        req.user!.id,
        params.learningPlanId,
        params.stageId,
      );
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
      const topology = await getLearningPlanTopology(
        db,
        req.user!.id,
        params.learningPlanId,
      );
      if (!topology) {
        res.status(404).json({ error: "learningPlan not found" });
        return;
      }
      res.json(topology);
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
      if (body.fromNodeId === body.toNodeId) {
        recordValidationFailure(req, "self_edge");
        res.status(400).json({ error: "a stage cannot link to itself" });
        return;
      }

      const result = await connectLearningPlanNodes(
        db,
        req.user!.id,
        params.learningPlanId,
        body.fromNodeId,
        body.toNodeId,
      );
      switch (result.kind) {
        case "not_found":
          res.status(404).json({ error: "stage not found" });
          return;
        case "cycle":
          res
            .status(409)
            .json({
              error: "that link would create a cycle in the learningPlan",
            });
          return;
        case "ok":
          res.status(201).json(result.learningPlan);
          return;
      }
    },
  );

  router.delete(
    "/:learningPlanId/edges/:fromNodeId/:toNodeId",
    validateRequest(
      {
        params: {
          learningPlanId: learningPlanIdSchema,
          fromNodeId: stageIdSchema,
          toNodeId: stageIdSchema,
        },
      },
      "invalid_edge_endpoints",
    ),
    async (req, res) => {
      const { params } = res.locals.validated;
      const topology = await disconnectLearningPlanNodes(
        db,
        req.user!.id,
        params.learningPlanId,
        params.fromNodeId,
        params.toNodeId,
      );
      if (!topology) {
        res.status(404).json({ error: "learningPlan not found" });
        return;
      }
      res.json(topology);
    },
  );

  return router;
}
