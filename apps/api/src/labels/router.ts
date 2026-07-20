import { Router, type RequestHandler } from "express";
import type { Pool } from "pg";
import { createLabel, listLabels } from "./repository";
import { parseRequiredName } from "../validation";

export function createLabelsRouter(
  pool: Pool,
  auth: RequestHandler[],
): Router {
  const router = Router();
  router.use(...auth);

  router.get("/", async (req, res) => {
    res.json(await listLabels(pool, req.user!.id));
  });

  router.post("/", async (req, res) => {
    const input = parseRequiredName(req.body);
    if (!input) {
      res.status(400).json({ error: "a Label name is required" });
      return;
    }
    res.status(201).json(await createLabel(pool, req.user!.id, input));
  });

  return router;
}
