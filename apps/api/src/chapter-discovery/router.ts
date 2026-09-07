import { Router, type RequestHandler } from "express";
import {
  chapterDiscoveryRequestSchema,
  itemIdSchema,
} from "@unshelf/shared/validation";
import { validateRequest } from "../middleware/validation";
import type { ChapterDiscovery } from "./index";

export function createChapterRouter({
  auth,
  discover,
}: {
  auth: RequestHandler[];
  discover: ChapterDiscovery;
}): Router {
  const router = Router();
  router.post(
    "/:itemId/chapters/research",
    ...auth,
    validateRequest(
      { params: { itemId: itemIdSchema }, body: chapterDiscoveryRequestSchema },
      "invalid_chapter_research",
    ),
    async (req, res) => {
      const controller = new AbortController();
      const abort = () => {
        if (!res.writableFinished) controller.abort();
      };
      res.once("close", abort);
      try {
        const result = await discover({
          userId: req.user!.id,
          itemId: res.locals.validated.params.itemId,
          signal: controller.signal,
          requestId: req.requestId,
        });
        if (!controller.signal.aborted)
          res
            .status(!result.ok && result.error === "not_found" ? 404 : 200)
            .json(result);
      } finally {
        res.removeListener("close", abort);
      }
    },
  );
  return router;
}
