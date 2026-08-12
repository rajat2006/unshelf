import { Router, type RequestHandler } from "express";
import {
  addDailyFocusItemRequestSchema,
  dailyFocusDateSchema,
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
      const { itemId, origin } = res.locals.validated.body;
      const result = await dailyFocusService.addTodayItem({
        db,
        userId: req.user!.id,
        itemId,
        origin,
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

  router.get(
    "/:date",
    validateRequest(
      { params: { date: dailyFocusDateSchema } },
      "invalid_daily_focus_date",
    ),
    async (req, res) => {
      const { date } = res.locals.validated.params;
      const focus = await dailyFocusService.getHistoricalFocus({
        db,
        userId: req.user!.id,
        date,
      });
      if (!focus) {
        res.status(404).json({ error: "daily focus not found" });
        return;
      }
      res.json(focus);
    },
  );

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
