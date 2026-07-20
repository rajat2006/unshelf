import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import { createPool } from "../src/db";
import { applySchema } from "../src/schema";

/**
 * The implicit-Trail migration at the database boundary (issue #93, ADR-0014).
 *
 * Before this ticket a User's Stops and edges *were* their one Trail with no row
 * of its own (ADR-0010). Promotion must mint exactly that row and adopt the
 * orphaned Stops into it, losing nothing, and be safe to run on every boot. These
 * drive `applySchema` directly: seed a legacy-shaped space (Stops on no Trail),
 * run the migration by re-applying the schema, and assert one Trail appears and
 * everything it should own is intact — then re-run and assert nothing changes.
 */
let container: StartedPostgreSqlContainer;
let pool: Pool;

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:16-alpine").start();
  pool = createPool(container.getConnectionUri());
  await applySchema(pool);
}, 120_000);

afterAll(async () => {
  await pool.end();
  await container.stop();
}, 120_000);

/** Seed a User with Stops, an edge, and an Item membership — but no Trail row. */
async function seedLegacySpace(clerkUserId: string): Promise<{
  userId: string;
  stopIds: string[];
  itemId: string;
}> {
  // Recreate the pre-#94 migration window. The current schema closes this path
  // with NOT NULL after backfilling, so a legacy fixture must explicitly reopen
  // it before inserting the orphaned rows that an upgrade would encounter.
  await pool.query(
    `ALTER TABLE trail_edges ALTER COLUMN trail_id DROP NOT NULL;
     ALTER TABLE stops ALTER COLUMN trail_id DROP NOT NULL;`,
  );

  const { rows: userRows } = await pool.query<{ id: string }>(
    `INSERT INTO users (clerk_user_id) VALUES ($1) RETURNING id`,
    [clerkUserId],
  );
  const userId = userRows[0]!.id;

  const stopIds: string[] = [];
  for (const name of ["Learn", "Build"]) {
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO stops (user_id, name) VALUES ($1, $2) RETURNING id`,
      [userId, name],
    );
    stopIds.push(rows[0]!.id);
  }

  await pool.query(
    `INSERT INTO trail_edges (user_id, from_stop_id, to_stop_id)
     VALUES ($1, $2, $3)`,
    [userId, stopIds[0], stopIds[1]],
  );

  const { rows: itemRows } = await pool.query<{ id: string }>(
    `INSERT INTO items (user_id, title, type) VALUES ($1, 'A read', 'article')
     RETURNING id`,
    [userId],
  );
  const itemId = itemRows[0]!.id;
  await pool.query(
    `INSERT INTO stop_items (user_id, stop_id, item_id) VALUES ($1, $2, $3)`,
    [userId, stopIds[0], itemId],
  );

  return { userId, stopIds, itemId };
}

const trailCountFor = async (userId: string): Promise<number> => {
  const { rows } = await pool.query<{ count: string }>(
    `SELECT count(*)::int AS count FROM trails WHERE user_id = $1`,
    [userId],
  );
  return Number(rows[0]!.count);
};

describe("Promoting the implicit Trail", () => {
  it("mints exactly one Trail per legacy space and adopts its Stops, keeping edges and memberships", async () => {
    const { userId, stopIds, itemId } = await seedLegacySpace(
      "migration-legacy-user",
    );

    await applySchema(pool);

    // Exactly one Trail for the User, and every Stop now belongs to it.
    expect(await trailCountFor(userId)).toBe(1);
    const { rows: trailRows } = await pool.query<{ id: string }>(
      `SELECT id FROM trails WHERE user_id = $1`,
      [userId],
    );
    const trailId = trailRows[0]!.id;
    const { rows: stopRows } = await pool.query<{ trail_id: string }>(
      `SELECT trail_id FROM stops WHERE user_id = $1`,
      [userId],
    );
    expect(stopRows).toHaveLength(2);
    expect(stopRows.every((row) => row.trail_id === trailId)).toBe(true);

    // The edge and the Item membership are untouched — nothing was lost.
    const { rows: edgeRows } = await pool.query(
      `SELECT from_stop_id, to_stop_id FROM trail_edges WHERE user_id = $1`,
      [userId],
    );
    expect(edgeRows).toEqual([
      { from_stop_id: stopIds[0], to_stop_id: stopIds[1] },
    ]);
    const { rows: membershipRows } = await pool.query(
      `SELECT stop_id, item_id FROM stop_items WHERE user_id = $1`,
      [userId],
    );
    expect(membershipRows).toEqual([{ stop_id: stopIds[0], item_id: itemId }]);
  });

  it("is idempotent — re-running the migration mints no further Trails", async () => {
    const { userId } = await seedLegacySpace("migration-idempotent-user");

    await applySchema(pool);
    expect(await trailCountFor(userId)).toBe(1);

    await applySchema(pool);
    await applySchema(pool);
    expect(await trailCountFor(userId)).toBe(1);
  });

  it("leaves a fresh User with no Stops out of the migration entirely", async () => {
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO users (clerk_user_id) VALUES ('migration-fresh-user')
       RETURNING id`,
    );
    const userId = rows[0]!.id;

    await applySchema(pool);

    expect(await trailCountFor(userId)).toBe(0);
  });
});
