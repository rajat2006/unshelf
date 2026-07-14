import { clerkMiddleware, getAuth } from "@clerk/express";
import type { Request, RequestHandler } from "express";
import type { Pool } from "pg";
import type { User } from "@unshelf/shared";
import { provisionUser } from "./users";

/**
 * The one place Clerk is imported on the api (ADR-0009 guardrail). It is also the
 * test-injection seam: everything below is built around an `Identify` function
 * that turns a request into an external Clerk user id, and only the *production*
 * implementation of that function touches Clerk. A test supplies its own
 * `Identify` (e.g. reading a header) and drives the exact same middleware without
 * a Clerk dependency — so per-User isolation is directly testable.
 */

declare global {
  namespace Express {
    interface Request {
      /** The current User, set by the auth middleware. */
      user?: User;
    }
  }
}

/** Extract the external Clerk user id for a request, or null if unauthenticated. */
export type Identify = (req: Request) => string | null | Promise<string | null>;

/**
 * Build the middleware that turns an authenticated request into a current User:
 * identify the external id, provision our `users` row, and set `req.user`.
 * Unauthenticated requests are refused with 401 — the code-side half of the
 * invite gate (Clerk's allowlist + invitations decide *who* ever authenticates).
 */
export function createAuthMiddleware(
  pool: Pool,
  identify: Identify,
): RequestHandler {
  return (req, res, next) => {
    void (async () => {
      const clerkUserId = await identify(req);
      if (!clerkUserId) {
        res.status(401).json({ error: "unauthenticated" });
        return;
      }
      req.user = await provisionUser(pool, clerkUserId);
      next();
    })().catch(next);
  };
}

/** Production `Identify` — reads the Clerk session established by `clerkMiddleware`. */
const clerkIdentify: Identify = (req) => getAuth(req).userId ?? null;

/**
 * Production auth chain: Clerk parses the session/token, then our middleware
 * maps it to a current User. `apps/api`'s server mounts these on protected
 * routes; tests substitute a single `createAuthMiddleware(pool, testIdentify)`.
 */
export function createClerkAuth(pool: Pool): RequestHandler[] {
  return [clerkMiddleware(), createAuthMiddleware(pool, clerkIdentify)];
}
