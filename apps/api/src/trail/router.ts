import { Router, type RequestHandler } from "express";
import type { Pool } from "pg";
import type { ConnectStopsRequest, StopId } from "@unshelf/shared";
import { connectStops, disconnectStops, getTrail } from "./repository";

/**
 * Mount the authenticated Trail HTTP interface at `/api/trail`.
 *
 * The Trail is a topology of the User's Stops, so it is addressed as its edges:
 * `GET /` reads the whole edge set, a `POST /edges` draws one, and a
 * `DELETE /edges/:from/:to` erases one. There is no Trail to create — it exists
 * as soon as the User has Stops — and rewiring (US 37) is just erasing and
 * drawing edges, so these two writes cover placing in sequence, forking, and
 * moving Stops alike.
 *
 * A Stop belonging to another User answers exactly as a missing one does — 404,
 * never 403 — so the boundary never confirms a foreign id. A link that would
 * close a cycle is a 409: the request is well-formed and authorised but conflicts
 * with the Trail-is-a-DAG invariant (ADR-0010).
 */
export function createTrailRouter(pool: Pool, auth: RequestHandler[]): Router {
  const router = Router();
  router.use(...auth);

  router.get("/", async (req, res) => {
    res.json(await getTrail(pool, req.user!.id));
  });

  router.post("/edges", async (req, res) => {
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
      pool,
      req.user!.id,
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

  router.delete("/edges/:fromStopId/:toStopId", async (req, res) => {
    const trail = await disconnectStops(
      pool,
      req.user!.id,
      req.params.fromStopId as StopId,
      req.params.toStopId as StopId,
    );
    res.json(trail);
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
