import { Router, type RequestHandler } from "express";
import { createLabelRequestSchema } from "@unshelf/shared/validation";
import type { Database } from "../db";
import { createLabel, listLabels } from "./repository";
import { validateRequest } from "../validation";

export function createLabelsRouter(
  db: Database,
  auth: RequestHandler[],
): Router {
  const router = Router();
  router.use(...auth);

  router.get("/", async (req, res) => {
    res.json(await listLabels(db, req.user!.id));
  });

  router.post(
    "/",
    validateRequest({ body: createLabelRequestSchema }),
    async (req, res) => {
      const { body } = res.locals.validated;
      res.status(201).json(await createLabel(db, req.user!.id, body));
    },
  );

  return router;
}
