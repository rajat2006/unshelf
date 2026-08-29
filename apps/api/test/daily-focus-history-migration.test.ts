import { fileURLToPath } from "node:url";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { sql } from "drizzle-orm";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { describe, expect, it } from "vitest";
import { createDatabase, type Database } from "../src/db";

const MIGRATIONS_FOLDER = fileURLToPath(new URL("../drizzle", import.meta.url));

describe("Daily Focus history migration", () => {
  it("backfills complete Item snapshots and rolls back incomplete legacy data", async () => {
    const container = await new PostgreSqlContainer(
      "postgres:16-alpine",
    ).start();
    const db = createDatabase({
      connectionString: container.getConnectionUri(),
      timeZone: "UTC",
    });

    try {
      const migrations = readMigrationFiles({
        migrationsFolder: MIGRATIONS_FOLDER,
      });
      const historyMigrationIndex = migrations.findIndex((migration) =>
        migration.sql.some((statement) =>
          statement.includes('ALTER TABLE "items" ADD COLUMN "deleted_at"'),
        ),
      );
      expect(historyMigrationIndex).toBeGreaterThan(0);
      const historyMigration = migrations[historyMigrationIndex];
      expect(historyMigration).toBeDefined();
      const precedingMigrations = migrations.slice(0, historyMigrationIndex);

      await applyMigrations(db, precedingMigrations);
      await seedCompleteHistory(db);
      await applyMigrationTransactionally(db, historyMigration);

      const itemFacts = await db.execute(sql`
        SELECT id, deleted_at
        FROM items
        ORDER BY id
      `);
      expect(itemFacts.rows).toEqual([
        { id: IDS.itemWithParts, deleted_at: null },
        { id: IDS.itemWithoutParts, deleted_at: null },
      ]);

      const snapshots = await db.execute(sql`
        SELECT
          user_id,
          item_id,
          title_snapshot,
          type_snapshot,
          status_snapshot,
          part_percentage_snapshot
        FROM daily_focus_items
        ORDER BY user_id
      `);
      expect(snapshots.rows).toEqual([
        {
          user_id: IDS.userA,
          item_id: IDS.itemWithParts,
          title_snapshot: "Database internals",
          type_snapshot: "course",
          status_snapshot: "in_progress",
          part_percentage_snapshot: 50,
        },
        {
          user_id: IDS.userB,
          item_id: IDS.itemWithoutParts,
          title_snapshot: "A book without Parts",
          type_snapshot: "book",
          status_snapshot: "not_started",
          part_percentage_snapshot: null,
        },
      ]);

      await expect(
        db.execute(sql`
          UPDATE daily_focus_items
          SET type_snapshot = 'podcast'
          WHERE item_id = ${IDS.itemWithParts}
        `),
      ).rejects.toThrow();
      await expect(
        db.execute(sql`
          UPDATE daily_focus_items
          SET title_snapshot = NULL
          WHERE item_id = ${IDS.itemWithParts}
        `),
      ).rejects.toThrow();
      const snapshotConstraints = await db.execute(sql`
        SELECT
          column_name,
          is_nullable,
          (
            SELECT count(*)::integer
            FROM pg_constraint
            WHERE conname = 'daily_focus_items_type_snapshot_check'
          ) AS type_check_count
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'daily_focus_items'
          AND column_name IN ('title_snapshot', 'type_snapshot')
        ORDER BY column_name
      `);
      expect(snapshotConstraints.rows).toEqual([
        {
          column_name: "title_snapshot",
          is_nullable: "NO",
          type_check_count: 1,
        },
        {
          column_name: "type_snapshot",
          is_nullable: "NO",
          type_check_count: 1,
        },
      ]);

      await expectIncompleteHistoryToRollBack({
        adminDb: db,
        connectionUri: container.getConnectionUri(),
        precedingMigrations,
        historyMigration,
      });
    } finally {
      await db.$client.end();
      await container.stop();
    }
  });
});

interface Migration {
  sql: string[];
}

async function applyMigrations(
  db: Database,
  migrations: readonly Migration[],
): Promise<void> {
  for (const migration of migrations) {
    for (const statement of migration.sql) {
      await db.execute(sql.raw(statement));
    }
  }
}

async function applyMigrationTransactionally(
  db: Database,
  migration: Migration | undefined,
): Promise<void> {
  if (!migration) throw new Error("expected Daily Focus history migration");
  await db.transaction(async (tx) => {
    for (const statement of migration.sql) {
      await tx.execute(sql.raw(statement));
    }
  });
}

async function expectIncompleteHistoryToRollBack({
  adminDb,
  connectionUri,
  precedingMigrations,
  historyMigration,
}: {
  adminDb: Database;
  connectionUri: string;
  precedingMigrations: readonly Migration[];
  historyMigration: Migration | undefined;
}): Promise<void> {
  await adminDb.execute(sql.raw('CREATE DATABASE "daily_focus_incomplete"'));
  const failureUrl = new URL(connectionUri);
  failureUrl.pathname = "/daily_focus_incomplete";
  const failureDb = createDatabase({
    connectionString: failureUrl.toString(),
    timeZone: "UTC",
  });

  try {
    await applyMigrations(failureDb, precedingMigrations);
    await failureDb.execute(
      sql.raw(
        "ALTER TABLE daily_focus_items DROP CONSTRAINT daily_focus_items_item_owner_fk",
      ),
    );
    await failureDb.execute(sql`
      INSERT INTO users (id, clerk_user_id)
      VALUES (${IDS.incompleteUser}, 'incomplete-history-owner')
    `);
    await failureDb.execute(sql`
      INSERT INTO daily_focuses (id, user_id, date)
      VALUES (${IDS.incompleteFocus}, ${IDS.incompleteUser}, current_date - 1)
    `);
    await failureDb.execute(sql`
      INSERT INTO daily_focus_items (
        daily_focus_id,
        user_id,
        item_id,
        status_snapshot,
        part_percentage_snapshot
      ) VALUES (
        ${IDS.incompleteFocus},
        ${IDS.incompleteUser},
        ${IDS.missingItem},
        'not_started',
        NULL
      )
    `);

    await expect(
      applyMigrationTransactionally(failureDb, historyMigration),
    ).rejects.toThrow(/title_snapshot/);

    const columns = await failureDb.execute(sql`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND (
          (table_name = 'items' AND column_name = 'deleted_at')
          OR (
            table_name = 'daily_focus_items'
            AND column_name IN ('title_snapshot', 'type_snapshot')
          )
        )
    `);
    expect(columns.rows).toEqual([]);
    const membership = await failureDb.execute(sql`
      SELECT item_id, status_snapshot, part_percentage_snapshot
      FROM daily_focus_items
    `);
    expect(membership.rows).toEqual([
      {
        item_id: IDS.missingItem,
        status_snapshot: "not_started",
        part_percentage_snapshot: null,
      },
    ]);
  } finally {
    await failureDb.$client.end();
  }
}

const IDS = {
  userA: "10000000-0000-0000-0000-000000000000",
  userB: "10000000-0000-0000-0000-000000000001",
  itemWithParts: "20000000-0000-0000-0000-000000000000",
  itemWithoutParts: "20000000-0000-0000-0000-000000000001",
  partA: "30000000-0000-0000-0000-000000000000",
  partB: "30000000-0000-0000-0000-000000000001",
  focusA: "40000000-0000-0000-0000-000000000000",
  focusB: "40000000-0000-0000-0000-000000000001",
  incompleteUser: "50000000-0000-0000-0000-000000000000",
  incompleteFocus: "60000000-0000-0000-0000-000000000000",
  missingItem: "70000000-0000-0000-0000-000000000000",
} as const;

async function seedCompleteHistory(db: Database): Promise<void> {
  await db.execute(sql`
    INSERT INTO users (id, clerk_user_id)
    VALUES
      (${IDS.userA}, 'history-owner-a'),
      (${IDS.userB}, 'history-owner-b')
  `);
  await db.execute(sql`
    INSERT INTO items (
      id, user_id, title, type, status, status_mode
    ) VALUES
      (
        ${IDS.itemWithParts}, ${IDS.userA}, 'Database internals',
        'course', 'in_progress', 'automatic'
      ),
      (
        ${IDS.itemWithoutParts}, ${IDS.userB}, 'A book without Parts',
        'book', 'not_started', 'manual'
      )
  `);
  await db.execute(sql`
    INSERT INTO parts (id, user_id, item_id, title, position, completed)
    VALUES
      (${IDS.partA}, ${IDS.userA}, ${IDS.itemWithParts}, 'Storage', 0, true),
      (${IDS.partB}, ${IDS.userA}, ${IDS.itemWithParts}, 'Indexes', 1, false)
  `);
  await db.execute(sql`
    INSERT INTO daily_focuses (id, user_id, date)
    VALUES
      (${IDS.focusA}, ${IDS.userA}, current_date - 2),
      (${IDS.focusB}, ${IDS.userB}, current_date)
  `);
  await db.execute(sql`
    INSERT INTO daily_focus_items (
      daily_focus_id,
      user_id,
      item_id,
      status_snapshot,
      part_percentage_snapshot
    ) VALUES
      (
        ${IDS.focusA}, ${IDS.userA}, ${IDS.itemWithParts},
        'in_progress', 50
      ),
      (
        ${IDS.focusB}, ${IDS.userB}, ${IDS.itemWithoutParts},
        'not_started', NULL
      )
  `);
}
