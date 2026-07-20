import { Router, type RequestHandler } from "express";
import type { Pool } from "pg";
import type { CreateLabelRequest } from "@unshelf/shared";
import { createLabel, listLabels } from "./repository";

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
    const input = parseCreateLabel(req.body);
    if (!input) {
      res.status(400).json({ error: "a Label name is required" });
      return;
    }
    res.status(201).json(await createLabel(pool, req.user!.id, input));
  });

  return router;
}

function parseCreateLabel(body: unknown): CreateLabelRequest | null {
  if (typeof body !== "object" || body === null) return null;
  const { name } = body as Record<string, unknown>;
  if (typeof name !== "string" || name.trim().length === 0) return null;
  return { name };
}
