import { Router, type RequestHandler } from "express";
import type { Database } from "../db";
import { getServerCalendar } from "./repository";

/** Mount the authenticated, read-only database calendar resource. */
export function createServerCalendarRouter(
  db: Database,
  auth: RequestHandler[],
): Router {
  const router = Router();
  router.use(...auth);

  router.get("/", async (_req, res) => {
    res.set("Cache-Control", "private, no-store");
    res.json(await getServerCalendar(db));
  });

  return router;
}
