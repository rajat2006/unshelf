import { fileURLToPath } from "node:url";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createDatabase, type Database } from "../src/db";

const MIGRATIONS_FOLDER = fileURLToPath(new URL("../drizzle", import.meta.url));

describe("Learning Plan migration", () => {
  it("preserves a representative Trail as an ordered Stage-only Learning Plan", async () => {
    const container = await new PostgreSqlContainer(
      "postgres:16-alpine",
    ).start();
    const db = createDatabase(container.getConnectionUri());

    try {
      const migrations = readMigrationFiles({
        migrationsFolder: MIGRATIONS_FOLDER,
      });
      await applyMigrations(db, migrations.slice(0, 2));
      await seedLegacyTrail(db);

      const learningPlanMigration = migrations[2];
      expect(learningPlanMigration).toBeDefined();
      await applyMigrations(db, [learningPlanMigration]);

      const plans = await db.execute(sql`
        SELECT id, user_id, name, created_at
        FROM learning_plans
      `);
      expect(plans.rows).toEqual([
        {
          id: IDS.plan,
          user_id: IDS.user,
          name: "Distributed systems",
          created_at: "2026-01-02 03:04:05+00",
        },
      ]);

      const stages = await db.execute(sql`
        SELECT id, user_id, learning_plan_id, name
        FROM stages
        ORDER BY id
      `);
      expect(stages.rows).toEqual([
        {
          id: IDS.stageA,
          user_id: IDS.user,
          learning_plan_id: IDS.plan,
          name: "Foundations",
        },
        {
          id: IDS.stageB,
          user_id: IDS.user,
          learning_plan_id: IDS.plan,
          name: "Practice",
        },
      ]);

      const placements = await db.execute(sql`
        SELECT learning_plan_id, stage_id, item_id, position
        FROM stage_items
        ORDER BY stage_id, position
      `);
      expect(placements.rows).toEqual([
        {
          learning_plan_id: IDS.plan,
          stage_id: IDS.stageA,
          item_id: IDS.itemA,
          position: 0,
        },
        {
          learning_plan_id: IDS.plan,
          stage_id: IDS.stageA,
          item_id: IDS.itemB,
          position: 1,
        },
      ]);

      const edges = await db.execute(sql`
        SELECT learning_plan_id, from_node_id, to_node_id
        FROM learning_plan_edges
      `);
      expect(edges.rows).toEqual([
        {
          learning_plan_id: IDS.plan,
          from_node_id: IDS.stageA,
          to_node_id: IDS.stageB,
        },
      ]);

      const itemFacts = await db.execute(sql`
        SELECT id, user_id, title, source, type, status, target_date, completed_at
        FROM items
        ORDER BY id
      `);
      expect(itemFacts.rows).toEqual([
        {
          id: IDS.itemA,
          user_id: IDS.user,
          title: "Read the paper",
          source: "https://example.test/paper",
          type: "article",
          status: "done",
          target_date: "2026-02-03",
          completed_at: "2026-02-01 00:00:00+00",
        },
        {
          id: IDS.itemB,
          user_id: IDS.user,
          title: "Work the examples",
          source: null,
          type: "book",
          status: "in_progress",
          target_date: null,
          completed_at: null,
        },
      ]);

      const labels = await db.execute(sql`
        SELECT item_id, label_id FROM item_labels
      `);
      expect(labels.rows).toEqual([
        { item_id: IDS.itemA, label_id: IDS.label },
      ]);
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
  migrations: Migration[],
): Promise<void> {
  for (const migration of migrations) {
    for (const statement of migration.sql) {
      await db.execute(sql.raw(statement));
    }
  }
}

const IDS = {
  user: "10000000-0000-0000-0000-000000000000",
  plan: "20000000-0000-0000-0000-000000000000",
  stageA: "30000000-0000-0000-0000-000000000000",
  stageB: "30000000-0000-0000-0000-000000000001",
  itemA: "40000000-0000-0000-0000-000000000000",
  itemB: "40000000-0000-0000-0000-000000000001",
  label: "50000000-0000-0000-0000-000000000000",
} as const;

async function seedLegacyTrail(db: Database): Promise<void> {
  await db.execute(sql`
    INSERT INTO users (id, clerk_user_id)
    VALUES (${IDS.user}, 'legacy-user')
  `);
  await db.execute(sql`
    INSERT INTO trails (id, user_id, name, created_at)
    VALUES (
      ${IDS.plan},
      ${IDS.user},
      'Distributed systems',
      '2026-01-02T03:04:05.000Z'
    )
  `);
  await db.execute(sql`
    INSERT INTO stops (id, user_id, name, trail_id)
    VALUES
      (${IDS.stageA}, ${IDS.user}, 'Foundations', ${IDS.plan}),
      (${IDS.stageB}, ${IDS.user}, 'Practice', ${IDS.plan})
  `);
  await db.execute(sql`
    INSERT INTO items (
      id,
      user_id,
      title,
      source,
      type,
      status,
      target_date,
      completed_at
    )
    VALUES
      (
        ${IDS.itemB},
        ${IDS.user},
        'Work the examples',
        NULL,
        'book',
        'in_progress',
        NULL,
        NULL
      ),
      (
        ${IDS.itemA},
        ${IDS.user},
        'Read the paper',
        'https://example.test/paper',
        'article',
        'done',
        '2026-02-03',
        '2026-02-01T00:00:00.000Z'
      )
  `);
  await db.execute(sql`
    INSERT INTO stop_items (user_id, stop_id, item_id, trail_id)
    VALUES
      (${IDS.user}, ${IDS.stageA}, ${IDS.itemB}, ${IDS.plan}),
      (${IDS.user}, ${IDS.stageA}, ${IDS.itemA}, ${IDS.plan})
  `);
  await db.execute(sql`
    INSERT INTO trail_edges (user_id, trail_id, from_stop_id, to_stop_id)
    VALUES (${IDS.user}, ${IDS.plan}, ${IDS.stageA}, ${IDS.stageB})
  `);
  await db.execute(sql`
    INSERT INTO labels (id, user_id, name)
    VALUES (${IDS.label}, ${IDS.user}, 'Core')
  `);
  await db.execute(sql`
    INSERT INTO item_labels (user_id, item_id, label_id)
    VALUES (${IDS.user}, ${IDS.itemA}, ${IDS.label})
  `);
}
