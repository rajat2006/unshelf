import { Router, type RequestHandler } from "express";
import type { Pool } from "pg";
import type { CreateTrailRequest, TrailId } from "@unshelf/shared";
import { createTrail, getTrail, listTrails } from "./repository";

/**
 * Mount the authenticated Trail HTTP interface at `/api/trails`.
 *
 * A first-class Trail is a plain owned resource (ADR-0014): `GET /` lists the
 * User's Trails with derived progress, `POST /` creates one, and `GET /:trailId`
 * reads one. This is distinct from `/api/trail` (singular), which addresses the
 * edge-list *topology* of a Trail (ADR-0010); the two coexist until the topology
 * is scoped under a Trail id downstream (#94).
 *
 * A Trail belonging to another User answers exactly as a missing one does — 404,
 * never 403 — so the boundary never confirms that someone else's id is real.
 */
export function createTrailsRouter(pool: Pool, auth: RequestHandler[]): Router {
  const router = Router();
  router.use(...auth);

  router.get("/", async (req, res) => {
    res.json(await listTrails(pool, req.user!.id));
  });

  router.post("/", async (req, res) => {
    const input = parseCreateTrail(req.body);
    if (!input) {
      res.status(400).json({ error: "a name is required" });
      return;
    }
    res.status(201).json(await createTrail(pool, req.user!.id, input));
  });

  router.get("/:trailId", async (req, res) => {
    const trail = await getTrail(
      pool,
      req.user!.id,
      req.params.trailId as TrailId,
    );
    if (!trail) {
      res.status(404).json({ error: "trail not found" });
      return;
    }
    res.json(trail);
  });

  return router;
}

/** Validate a create payload at the HTTP seam: a non-empty name, and nothing else. */
function parseCreateTrail(body: unknown): CreateTrailRequest | null {
  if (typeof body !== "object" || body === null) return null;
  const { name } = body as Record<string, unknown>;
  if (typeof name !== "string" || name.length === 0) return null;
  return { name };
}
