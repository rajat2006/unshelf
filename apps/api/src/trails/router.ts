import { Router, type RequestHandler } from "express";
import type { ConnectStopsRequest, StopId, TrailId } from "@unshelf/shared";
import type { Database } from "../db";
import { createStop, getStopOnTrail } from "../stops/repository";
import {
  connectStops,
  disconnectStops,
  getTrail as getTrailTopology,
} from "../trail/repository";
import { createTrail, getTrail, listTrails } from "./repository";
import { parseRequiredName } from "../validation";

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
export function createTrailsRouter(db: Database, auth: RequestHandler[]): Router {
  const router = Router();
  router.use(...auth);
  const uuidPattern =
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

  // A `:trailId` that is not even shaped like our opaque id names no Trail, so it
  // answers as a missing one — a 404 — rather than reaching a uuid column that
  // would error on the malformed value. Runs after auth, so an unauthenticated
  // request is still a 401 first.
  router.param("trailId", (_req, res, next, value) => {
    if (!uuidPattern.test(value)) {
      res.status(404).json({ error: "trail not found" });
      return;
    }
    next();
  });

  router.param("stopId", (_req, res, next, value) => {
    if (!uuidPattern.test(value)) {
      res.status(404).json({ error: "stop not found" });
      return;
    }
    next();
  });

  router.get("/", async (req, res) => {
    res.json(await listTrails(db, req.user!.id));
  });

  router.post("/", async (req, res) => {
    const input = parseRequiredName(req.body);
    if (!input) {
      res.status(400).json({ error: "a name is required" });
      return;
    }
    res.status(201).json(await createTrail(db, req.user!.id, input));
  });

  router.get("/:trailId", async (req, res) => {
    const trail = await getTrail(
      db,
      req.user!.id,
      req.params.trailId as TrailId,
    );
    if (!trail) {
      res.status(404).json({ error: "trail not found" });
      return;
    }
    res.json(trail);
  });

  router.post("/:trailId/stops", async (req, res) => {
    const input = parseRequiredName(req.body);
    if (!input) {
      res.status(400).json({ error: "a name is required" });
      return;
    }
    const stop = await createStop(
      db,
      req.user!.id,
      req.params.trailId as TrailId,
      input,
    );
    if (!stop) {
      res.status(404).json({ error: "trail not found" });
      return;
    }
    res.status(201).json(stop);
  });

  router.get("/:trailId/stops/:stopId", async (req, res) => {
    const stop = await getStopOnTrail(
      db,
      req.user!.id,
      req.params.trailId as TrailId,
      req.params.stopId as StopId,
    );
    if (!stop) {
      res.status(404).json({ error: "stop not found" });
      return;
    }
    res.json(stop);
  });

  router.get("/:trailId/topology", async (req, res) => {
    const topology = await getTrailTopology(
      db,
      req.user!.id,
      req.params.trailId as TrailId,
    );
    if (!topology) {
      res.status(404).json({ error: "trail not found" });
      return;
    }
    res.json(topology);
  });

  router.post("/:trailId/edges", async (req, res) => {
    const input = parseConnectStops(req.body);
    if (!input) {
      res.status(400).json({ error: "fromStopId and toStopId are required" });
      return;
    }
    if (input.fromStopId === input.toStopId) {
      res.status(400).json({ error: "a stop cannot link to itself" });
      return;
    }

    const result = await connectStops(
      db,
      req.user!.id,
      req.params.trailId as TrailId,
      input.fromStopId,
      input.toStopId,
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
  });

  router.delete("/:trailId/edges/:fromStopId/:toStopId", async (req, res) => {
    const topology = await disconnectStops(
      db,
      req.user!.id,
      req.params.trailId as TrailId,
      req.params.fromStopId as StopId,
      req.params.toStopId as StopId,
    );
    if (!topology) {
      res.status(404).json({ error: "trail not found" });
      return;
    }
    res.json(topology);
  });

  return router;
}

/** Validate a connect payload at the HTTP seam: two Stop ids, and nothing else. */
function parseConnectStops(body: unknown): ConnectStopsRequest | null {
  if (typeof body !== "object" || body === null) return null;
  const { fromStopId, toStopId } = body as Record<string, unknown>;
  if (typeof fromStopId !== "string" || fromStopId.length === 0) return null;
  if (typeof toStopId !== "string" || toStopId.length === 0) return null;
  return { fromStopId: fromStopId as StopId, toStopId: toStopId as StopId };
}
