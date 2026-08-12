import { Router, type RequestHandler } from "express";
import {
  addDailyFocusItemRequestSchema,
  dailyFocusIdSchema,
  itemIdSchema,
} from "@unshelf/shared/validation";
import type { Database } from "../db";
import { validateRequest } from "../middleware/validation";
import * as dailyFocusService from "./service";

/** Mount the authenticated current Daily Focus interface at `/api/daily-focus`. */
export function createDailyFocusRouter(
  db: Database,
  auth: RequestHandler[],
): Router {
  const router = Router();
  router.use(...auth);

  router.post(
    "/today/items",
    validateRequest(
      { body: addDailyFocusItemRequestSchema },
      "invalid_daily_focus_item",
    ),
    async (req, res) => {
      const result = await dailyFocusService.addTodayItem({
        db,
        userId: req.user!.id,
        itemId: res.locals.validated.body.itemId,
      });
      if (!result.ok) {
        res.status(404).json({ error: "item not found" });
        return;
      }
      res.status(result.added ? 201 : 200).json(result.focus);
    },
  );

  router.get("/today", async (req, res) => {
    res.json(
      await dailyFocusService.getTodayFocus({ db, userId: req.user!.id }),
    );
  });

  router.delete(
    "/:dailyFocusId/items/:itemId",
    validateRequest(
      {
        params: {
          dailyFocusId: dailyFocusIdSchema,
          itemId: itemIdSchema,
        },
      },
      "invalid_daily_focus_item",
    ),
    async (req, res) => {
      const { dailyFocusId, itemId } = res.locals.validated.params;
      const focus = await dailyFocusService.removeTodayItem({
        db,
        userId: req.user!.id,
        dailyFocusId,
        itemId,
      });
      if (!focus) {
        res.status(404).json({ error: "daily focus or item not found" });
        return;
      }
      res.json(focus);
    },
  );

  return router;
}
