import { Router, type RequestHandler } from "express";
import {
  createItemRequestSchema,
  createStageWithItemRequestSchema,
  itemIdSchema,
  labelIdSchema,
  updateItemStatusRequestSchema,
  updateItemTargetDateRequestSchema,
} from "@unshelf/shared/validation";
import type { Database } from "../db";
import { validateRequest } from "../middleware/validation";
import { respondToPlacementFailure } from "../placements/http";
import {
  createStageWithItem,
  getItemPlacementCatalog,
} from "../placements/service";
import {
  createItem,
  applyLabelToItem,
  getItem,
  listItems,
  removeLabelFromItem,
  updateItemStatus,
  updateItemTargetDate,
} from "./repository";

/** Mount the authenticated Item HTTP interface at `/api/items`. */
export function createItemsRouter(
  db: Database,
  auth: RequestHandler[],
): Router {
  const router = Router();
  router.use(...auth);

  router.post(
    "/",
    validateRequest({ body: createItemRequestSchema }, "invalid_item_create"),
    async (req, res) => {
      const { body } = res.locals.validated;
      const item = await createItem(db, req.user!.id, body);
      res.status(201).json(item);
    },
  );

  router.get("/", async (req, res) => {
    const items = await listItems(db, req.user!.id);
    res.json(items);
  });

  router.get(
    "/:itemId/placements",
    validateRequest({ params: { itemId: itemIdSchema } }, "missing_item_id"),
    async (req, res) => {
      const { params } = res.locals.validated;
      const catalog = await getItemPlacementCatalog(db, {
        userId: req.user!.id,
        itemId: params.itemId,
      });
      if (!catalog) {
        res.status(404).json({ error: "item not found" });
        return;
      }
      res.json(catalog);
    },
  );

  router.post(
    "/:itemId/placements",
    validateRequest(
      {
        body: createStageWithItemRequestSchema,
        params: { itemId: itemIdSchema },
      },
      "invalid_stage_name",
    ),
    async (req, res) => {
      const { body, params } = res.locals.validated;
      const result = await createStageWithItem(db, {
        userId: req.user!.id,
        itemId: params.itemId,
        placement: body,
      });
      if (!result.ok) {
        respondToPlacementFailure({
          response: res,
          failure: result,
          notFoundMessage: "item or learning plan not found",
        });
        return;
      }
      res.status(201).json(result.stage);
    },
  );

  router.get(
    "/:itemId",
    validateRequest({ params: { itemId: itemIdSchema } }, "missing_item_id"),
    async (req, res) => {
      const { params } = res.locals.validated;
      const item = await getItem(db, req.user!.id, params.itemId);
      if (!item) {
        res.status(404).json({ error: "item not found" });
        return;
      }
      res.json(item);
    },
  );

  router.post(
    "/:itemId/labels/:labelId",
    validateRequest(
      {
        params: { itemId: itemIdSchema, labelId: labelIdSchema },
      },
      "missing_item_id",
    ),
    async (req, res) => {
      const { params } = res.locals.validated;
      const item = await applyLabelToItem(
        db,
        req.user!.id,
        params.itemId,
        params.labelId,
      );
      if (!item) {
        res.status(404).json({ error: "item or label not found" });
        return;
      }
      res.json(item);
    },
  );

  router.delete(
    "/:itemId/labels/:labelId",
    validateRequest(
      {
        params: { itemId: itemIdSchema, labelId: labelIdSchema },
      },
      "missing_item_id",
    ),
    async (req, res) => {
      const { params } = res.locals.validated;
      const item = await removeLabelFromItem(
        db,
        req.user!.id,
        params.itemId,
        params.labelId,
      );
      if (!item) {
        res.status(404).json({ error: "item or label not found" });
        return;
      }
      res.json(item);
    },
  );

  router.patch(
    "/:itemId/status",
    validateRequest(
      {
        body: updateItemStatusRequestSchema,
        params: { itemId: itemIdSchema },
      },
      "invalid_item_status",
    ),
    async (req, res) => {
      const { body, params } = res.locals.validated;
      const item = await updateItemStatus(
        db,
        req.user!.id,
        params.itemId,
        body.status,
      );
      if (!item) {
        res.status(404).json({ error: "item not found" });
        return;
      }
      res.json(item);
    },
  );

  router.patch(
    "/:itemId/target-date",
    validateRequest(
      {
        body: updateItemTargetDateRequestSchema,
        params: { itemId: itemIdSchema },
      },
      "invalid_target_date",
    ),
    async (req, res) => {
      const { body, params } = res.locals.validated;
      const item = await updateItemTargetDate(
        db,
        req.user!.id,
        params.itemId,
        body.targetDate,
      );
      if (!item) {
        res.status(404).json({ error: "item not found" });
        return;
      }
      res.json(item);
    },
  );

  return router;
}
