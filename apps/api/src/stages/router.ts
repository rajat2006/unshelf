import { Router, type RequestHandler } from "express";
import {
  addStageItemRequestSchema,
  itemIdSchema,
  reorderStageItemsRequestSchema,
  removeStageRequestSchema,
  stageItemSearchQuerySchema,
  stageIdSchema,
  updateStageRequestSchema,
} from "@unshelf/shared/validation";
import type { Database } from "../db";
import { validateRequest } from "../middleware/validation";
import { respondToPlacementFailure } from "../placements/http";
import * as stagesService from "./service";

/**
 * Mount the authenticated Stage HTTP interface at `/api/stages`.
 *
 * Membership is addressed as a sub-resource of the Stage it belongs to
 * (`/api/stages/:stageId/items/:itemId`) because that pairing *is* the record
 * (ADR-0004) — there is no membership id to hand out, and nothing else on it to
 * address. Both writes answer with the Stage's new contents rather than the
 * membership: what the User changed is what the Stage now holds, and it saves the
 * client a re-read to find out.
 *
 * A Stage is *created* under its owning LearningPlan (`POST /api/learning-plans/:learningPlanId/stages`,
 * #94), because a Stage belongs to exactly one LearningPlan — there is no LearningPlan-less Stage
 * to create here. This router keeps the reads and the membership writes: listing
 * every Stage the User owns (across their LearningPlans), reading one, and pulling Items
 * into and out of it.
 *
 * A Stage or Item belonging to another User answers exactly as a missing one does
 * — 404, never 403 — so the boundary never confirms that someone else's id is a
 * real id.
 */
export function createStagesRouter(
  db: Database,
  auth: RequestHandler[],
): Router {
  const router = Router();
  router.use(...auth);

  router.get("/", async (req, res) => {
    res.json(await stagesService.listStages({ db, userId: req.user!.id }));
  });

  router.get(
    "/:stageId",
    validateRequest(
      {
        params: { stageId: stageIdSchema },
      },
      "invalid_stage_name",
    ),
    async (req, res) => {
      const { params } = res.locals.validated;
      const stage = await stagesService.getStage({
        db,
        userId: req.user!.id,
        stageId: params.stageId,
      });
      if (!stage) {
        res.status(404).json({ error: "stage not found" });
        return;
      }
      res.json(stage);
    },
  );

  router.put(
    "/:stageId/items/order",
    validateRequest(
      {
        body: reorderStageItemsRequestSchema,
        params: { stageId: stageIdSchema },
      },
      "invalid_stage_item_order",
    ),
    async (req, res) => {
      const { body, params } = res.locals.validated;
      const result = await stagesService.reorderItems({
        db,
        userId: req.user!.id,
        stageId: params.stageId,
        request: body,
      });
      if (!result.ok) {
        if (result.error === "not_found") {
          res.status(404).json({ error: "stage not found" });
        } else {
          res
            .status(409)
            .json({
              error: "item order must contain every stage item exactly once",
            });
        }
        return;
      }
      res.json(result.stage);
    },
  );

  router.patch(
    "/:stageId",
    validateRequest(
      {
        body: updateStageRequestSchema,
        params: { stageId: stageIdSchema },
      },
      "invalid_stage_name",
    ),
    async (req, res) => {
      const { body, params } = res.locals.validated;
      const stage = await stagesService.updateStage({
        db,
        userId: req.user!.id,
        stageId: params.stageId,
        request: body,
      });
      if (!stage) {
        res.status(404).json({ error: "stage not found" });
        return;
      }
      res.json(stage);
    },
  );

  router.delete(
    "/:stageId",
    validateRequest(
      {
        body: removeStageRequestSchema,
        params: { stageId: stageIdSchema },
      },
      "missing_stage_item_disposition",
    ),
    async (req, res) => {
      const { body, params } = res.locals.validated;
      const learningPlan = await stagesService.removeStage({
        db,
        userId: req.user!.id,
        stageId: params.stageId,
        request: body,
      });
      if (!learningPlan) {
        res.status(404).json({ error: "stage not found" });
        return;
      }
      res.json(learningPlan);
    },
  );

  router.post(
    "/:stageId/items",
    validateRequest(
      {
        body: addStageItemRequestSchema,
        params: { stageId: stageIdSchema },
      },
      "missing_item_id",
    ),
    async (req, res) => {
      const { body, params } = res.locals.validated;
      const result = await stagesService.addItem({
        db,
        userId: req.user!.id,
        stageId: params.stageId,
        request: body,
      });
      if (!result.ok) {
        respondToPlacementFailure({
          response: res,
          failure: result,
          notFoundMessage: "stage or item not found",
        });
        return;
      }
      res.json(result.stage);
    },
  );

  router.get(
    "/:stageId/items",
    validateRequest(
      {
        params: { stageId: stageIdSchema },
        query: stageItemSearchQuerySchema,
      },
      "invalid_stage_item_search",
    ),
    async (req, res) => {
      const { params, query } = res.locals.validated;
      const results = await stagesService.searchItemCandidates({
        db,
        userId: req.user!.id,
        stageId: params.stageId,
        query: query.query ?? "",
      });
      if (!results) {
        res.status(404).json({ error: "stage not found" });
        return;
      }
      res.json(results);
    },
  );

  router.delete(
    "/:stageId/items/:itemId",
    validateRequest(
      {
        params: { stageId: stageIdSchema, itemId: itemIdSchema },
      },
      "missing_item_id",
    ),
    async (req, res) => {
      const { params } = res.locals.validated;
      const stage = await stagesService.removeItem({
        db,
        userId: req.user!.id,
        stageId: params.stageId,
        itemId: params.itemId,
      });
      if (!stage) {
        res.status(404).json({ error: "stage not found" });
        return;
      }
      res.json(stage);
    },
  );

  return router;
}
