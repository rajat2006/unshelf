import { Router, type RequestHandler } from "express";
import { sourceInspectionRequestSchema } from "@unshelf/shared/validation";
import { validateRequest } from "../middleware/validation";
import type { SourceInspectionService } from "./service";

export function createSourceInspectionsRouter(
  auth: RequestHandler[],
  service: SourceInspectionService,
): Router {
  const router = Router();
  router.post(
    "/",
    ...auth,
    validateRequest(
      { body: sourceInspectionRequestSchema },
      "invalid_source_inspection",
    ),
    async (req, res, next) => {
      if (req.user === undefined) {
        next(new Error("Authenticated Source inspection requires a User"));
        return;
      }

      const controller = new AbortController();
      const abort = () => controller.abort();
      req.once("aborted", abort);
      res.once("close", () => {
        if (!res.writableEnded) abort();
      });

      const result = await service.inspect({
        source: res.locals.validated.body.source,
        userId: req.user.id,
        signal: controller.signal,
      });
      if (!result.ok) {
        next(new Error(result.error));
        return;
      }
      res.json(result.response);
    },
  );
  return router;
}
