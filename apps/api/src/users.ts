import { sql } from "drizzle-orm";
import type { ClerkUserId, User, UserId } from "@unshelf/shared";
import type { Database } from "./db";

interface UserRow extends Record<string, unknown> {
  id: string;
  clerk_user_id: string;
  created_at: string;
}

const toUser = (row: UserRow): User => ({
  id: row.id as UserId,
  clerkUserId: row.clerk_user_id as ClerkUserId,
  createdAt: new Date(row.created_at).toISOString(),
});

/**
 * Resolve the `users` row for a Clerk identity, creating it on first sight.
 * Idempotent: the same `clerkUserId` always maps to the same anchor `id`, so a
 * User's rows survive re-provisioning across sign-ins. Clerk's id lives here as
 * the external reference and nowhere else in the domain (ADR-0009 guardrail).
 *
 * This is deliberately Clerk-free — it knows only an opaque external id — so the
 * auth middleware is the sole place Clerk is imported on the api.
 */
export async function provisionUser(
  db: Database,
  clerkUserId: ClerkUserId,
): Promise<User> {
  const { rows } = await db.execute<UserRow>(sql`
    INSERT INTO users (clerk_user_id)
    VALUES (${clerkUserId})
    ON CONFLICT (clerk_user_id) DO UPDATE SET clerk_user_id = EXCLUDED.clerk_user_id
    RETURNING id, clerk_user_id, created_at
  `);
  return toUser(rows[0]!);
}
