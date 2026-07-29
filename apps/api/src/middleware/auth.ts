import { clerkMiddleware, getAuth } from "@clerk/express";
import type { Request, RequestHandler } from "express";
import type { ClerkUserId, User } from "@unshelf/shared";
import type { Database } from "../db";
import { provisionUser } from "../users";

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
export type Identify = (
  req: Request,
) => ClerkUserId | null | Promise<ClerkUserId | null>;

/**
 * Build the middleware that turns an authenticated request into a current User:
 * identify the external id, provision our `users` row, and set `req.user`.
 * Unauthenticated requests are refused with 401. Admission is open (ADR-0001):
 * anyone Clerk authenticates gets a User row provisioned on first request —
 * sign-up is sign-in, and there is no allowlist to consult.
 */
export function createAuthMiddleware(
  db: Database,
  identify: Identify,
): RequestHandler {
  // Express 5 routes a rejected promise from an async handler to `next` itself.
  return async (req, res, next) => {
    const clerkUserId = await identify(req);
    if (!clerkUserId) {
      req.logger.warn({
        event: "unshelf.api.authentication.failed",
        msg: "Authentication failed",
        reason: "unauthenticated",
      });
      res.status(401).json({ error: "unauthenticated" });
      return;
    }
    req.user = await provisionUser(db, clerkUserId);
    req.logger = req.logger.child({ userId: req.user.id });
    next();
  };
}

/** Production `Identify` — reads the Clerk session established by `clerkMiddleware`. */
const clerkIdentify: Identify = (req) =>
  (getAuth(req).userId as ClerkUserId | null) ?? null;

/**
 * Production auth chain: Clerk parses the session/token, then our middleware
 * maps it to a current User. `apps/api`'s server mounts these on protected
 * routes; tests substitute a single `createAuthMiddleware(db, testIdentify)`.
 */
export function createClerkAuth(db: Database): RequestHandler[] {
  return [clerkMiddleware(), createAuthMiddleware(db, clerkIdentify)];
}
