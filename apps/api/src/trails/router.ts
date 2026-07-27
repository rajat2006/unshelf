import { Router, type RequestHandler } from "express";
import {
  connectStopsRequestSchema,
  createStopRequestSchema,
  createTrailRequestSchema,
  stopIdSchema,
  trailIdSchema,
} from "@unshelf/shared/validation";
import type { Database } from "../db";
import { createStop, getStopOnTrail } from "../stops/repository";
import {
  connectStops,
  disconnectStops,
  getTrail as getTrailTopology,
} from "../trail/repository";
import { createTrail, getTrail, listTrails } from "./repository";
import {
  recordValidationFailure,
  validateRequest,
} from "../validation";

/**
 * Mount the authenticated Trail HTTP interface at `/api/trails`.
 *
 * A first-class Trail is a plain owned resource (ADR-0014): `GET /` lists the
 * User's Trails with derived progress, `POST /` creates one, and `GET /:trailId`
 * reads one. Its Stops and its topology are addressed *under* it (ADR-0014, #94),
 * because both are now scoped to exactly one Trail:
 *
 * - `POST /:trailId/stops` creates a Stop on the Trail.
 * - `GET /:trailId/topology` reads the Trail's nodes and edges.
 * - `POST /:trailId/edges` draws one edge; `DELETE /:trailId/edges/:from/:to`
 *   erases one. Rewiring (fork, rejoin, move) is just erasing and drawing edges.
 *
 * A Trail — or a Stop on it — belonging to another User answers exactly as a
 * missing one does — 404, never 403 — so the boundary never confirms that someone
 * else's id is real. A link that would close a cycle is a 409: the request is
 * well-formed and authorised but conflicts with the Trail-is-a-DAG invariant
 * (ADR-0010).
 */
export function createTrailsRouter(
  db: Database,
  auth: RequestHandler[],
): Router {
  const router = Router();
  router.use(...auth);

  router.get("/", async (req, res) => {
    res.json(await listTrails(db, req.user!.id));
  });

  router.post(
    "/",
    validateRequest(
      { body: createTrailRequestSchema },
      "invalid_trail_name",
    ),
    async (req, res) => {
      const { body } = res.locals.validated;
      res.status(201).json(await createTrail(db, req.user!.id, body));
    },
  );

  router.get(
    "/:trailId",
    validateRequest({
      params: { trailId: trailIdSchema },
    }, "invalid_trail_name"),
    async (req, res) => {
      const { params } = res.locals.validated;
      const trail = await getTrail(db, req.user!.id, params.trailId);
      if (!trail) {
        res.status(404).json({ error: "trail not found" });
        return;
      }
      res.json(trail);
    },
  );

  router.post(
    "/:trailId/stops",
    validateRequest({
      body: createStopRequestSchema,
      params: { trailId: trailIdSchema },
    }, "invalid_stop_name"),
    async (req, res) => {
      const { body, params } = res.locals.validated;
      const stop = await createStop(db, req.user!.id, params.trailId, body);
      if (!stop) {
        res.status(404).json({ error: "trail not found" });
        return;
      }
      res.status(201).json(stop);
    },
  );

  router.get(
    "/:trailId/stops/:stopId",
    validateRequest({
      params: { trailId: trailIdSchema, stopId: stopIdSchema },
    }, "invalid_stop_name"),
    async (req, res) => {
      const { params } = res.locals.validated;
      const stop = await getStopOnTrail(
        db,
        req.user!.id,
        params.trailId,
        params.stopId,
      );
      if (!stop) {
        res.status(404).json({ error: "stop not found" });
        return;
      }
      res.json(stop);
    },
  );

  router.get(
    "/:trailId/topology",
    validateRequest({
      params: { trailId: trailIdSchema },
    }, "invalid_trail_name"),
    async (req, res) => {
      const { params } = res.locals.validated;
      const topology = await getTrailTopology(
        db,
        req.user!.id,
        params.trailId,
      );
      if (!topology) {
        res.status(404).json({ error: "trail not found" });
        return;
      }
      res.json(topology);
    },
  );

  router.post(
    "/:trailId/edges",
    validateRequest({
      body: connectStopsRequestSchema,
      params: { trailId: trailIdSchema },
    }, "invalid_edge_endpoints"),
    async (req, res) => {
      const { body, params } = res.locals.validated;
      if (body.fromStopId === body.toStopId) {
        recordValidationFailure(req, "self_edge");
        res.status(400).json({ error: "a stop cannot link to itself" });
        return;
      }

      const result = await connectStops(
        db,
        req.user!.id,
        params.trailId,
        body.fromStopId,
        body.toStopId,
      );
      switch (result.kind) {
        case "not_found":
          res.status(404).json({ error: "stop not found" });
          return;
        case "cycle":
          res
            .status(409)
            .json({ error: "that link would create a cycle in the trail" });
          return;
        case "ok":
          res.status(201).json(result.trail);
          return;
      }
    },
  );

  router.delete(
    "/:trailId/edges/:fromStopId/:toStopId",
    validateRequest({
      params: {
        trailId: trailIdSchema,
        fromStopId: stopIdSchema,
        toStopId: stopIdSchema,
      },
    }, "invalid_edge_endpoints"),
    async (req, res) => {
      const { params } = res.locals.validated;
      const topology = await disconnectStops(
        db,
        req.user!.id,
        params.trailId,
        params.fromStopId,
        params.toStopId,
      );
      if (!topology) {
        res.status(404).json({ error: "trail not found" });
        return;
      }
      res.json(topology);
    },
  );

  return router;
}
