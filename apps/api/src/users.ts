import type { ClerkUserId, User, UserId } from "@unshelf/shared";
import type { Database } from "./db";
import { users } from "./schema";

interface UserRow {
  id: string;
  clerk_user_id: string;
  created_at: Date;
}

const toUser = (row: UserRow): User => ({
  id: row.id as UserId,
  clerkUserId: row.clerk_user_id as ClerkUserId,
  createdAt: row.created_at.toISOString(),
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
  const [row] = await db
    .insert(users)
    .values({ clerkUserId })
    .onConflictDoUpdate({
      target: users.clerkUserId,
      set: { clerkUserId },
    })
    .returning({
      id: users.id,
      clerk_user_id: users.clerkUserId,
      created_at: users.createdAt,
    });
  return toUser(row!);
}
