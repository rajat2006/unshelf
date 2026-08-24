import { fileURLToPath } from "node:url";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { sql } from "drizzle-orm";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { describe, expect, it } from "vitest";
import { createDatabase, type Database } from "../src/db";
import { verifyMigrationHistory } from "../src/migration-verifier";

const MIGRATIONS_FOLDER = fileURLToPath(new URL("../drizzle", import.meta.url));

describe("Discover migration", () => {
  it("upgrades the prototype Discover schema without losing user data", async () => {
    const container = await new PostgreSqlContainer(
      "postgres:18-alpine",
    ).start();
    const db = createDatabase({
      connectionString: container.getConnectionUri(),
      timeZone: "UTC",
    });

    try {
      const migrations = readMigrationFiles({
        migrationsFolder: MIGRATIONS_FOLDER,
      });
      const prototypeMigrationIndex = migrations.findIndex((migration) =>
        migration.sql.some((statement) =>
          statement.includes('CREATE TABLE "discover_discoveries"'),
        ),
      );
      expect(prototypeMigrationIndex).toBeGreaterThanOrEqual(0);
      const prototypeMigration = migrations[prototypeMigrationIndex];
      expect(prototypeMigration?.hash).toBe(
        "0bfa9be7b029f1b8037a91a019f4e47cf4aeb897d00c4654b0c068396e28f306",
      );
      await applyMigrations(
        db,
        migrations.slice(0, prototypeMigrationIndex + 1),
      );
      await recordMigrationHistory(
        db,
        migrations.slice(0, prototypeMigrationIndex + 1),
      );
      await seedPrototypeDiscoverData(db);

      const forwardMigration = migrations[prototypeMigrationIndex + 1];
      expect(forwardMigration).toBeDefined();
      await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
      await verifyMigrationHistory({
        database: db,
        migrationsFolder: MIGRATIONS_FOLDER,
      });

      const migrated = await db.execute(sql`
        SELECT
          target.id AS target_id,
          target.external_id,
          target.canonical_url,
          target.title AS target_title,
          target.uploads_playlist_id,
          target.last_fetched_at,
          result.id AS result_id,
          result.target_id AS result_target_id,
          result.external_id AS result_external_id,
          result.title AS result_title,
          follow.id AS follow_id,
          follow.target_id AS follow_target_id,
          follow.deleted_at,
          candidate.id AS candidate_id,
          candidate.result_id AS candidate_result_id,
          candidate.state,
          candidate.kept_at,
          candidate.rejected_at,
          identity.item_id
        FROM discover_provider_targets target
        JOIN discover_provider_results result ON result.target_id = target.id
        JOIN discover_follows follow ON follow.target_id = target.id
        JOIN discover_candidates candidate ON candidate.result_id = result.id
        LEFT JOIN item_provider_identities identity
          ON identity.user_id = candidate.user_id
         AND identity.provider = result.provider
         AND identity.external_id = result.external_id
        WHERE candidate.user_id = ${IDS.user}
        ORDER BY result.external_id
      `);
      expect(migrated.rows).toEqual([
        {
          target_id: IDS.target,
          external_id: "UC_migration",
          canonical_url: "https://www.youtube.com/channel/UC_migration",
          target_title: "Migration Channel",
          uploads_playlist_id: "UU_migration",
          last_fetched_at: "2026-08-01 10:00:00+00",
          result_id: IDS.result,
          result_target_id: IDS.target,
          result_external_id: "video-migration",
          result_title: "Migration video",
          follow_id: IDS.follow,
          follow_target_id: IDS.target,
          deleted_at: null,
          candidate_id: IDS.candidate,
          candidate_result_id: IDS.result,
          state: "kept",
          kept_at: "2026-08-03 12:00:00+00",
          rejected_at: null,
          item_id: IDS.item,
        },
        {
          target_id: IDS.target,
          external_id: "UC_migration",
          canonical_url: "https://www.youtube.com/channel/UC_migration",
          target_title: "Migration Channel",
          uploads_playlist_id: "UU_migration",
          last_fetched_at: "2026-08-01 10:00:00+00",
          result_id: IDS.rejectedResult,
          result_target_id: IDS.target,
          result_external_id: "video-rejected",
          result_title: "Rejected migration video",
          follow_id: IDS.follow,
          follow_target_id: IDS.target,
          deleted_at: null,
          candidate_id: IDS.rejectedCandidate,
          candidate_result_id: IDS.rejectedResult,
          state: "rejected",
          kept_at: null,
          rejected_at: "2026-08-04 12:00:00+00",
          item_id: null,
        },
      ]);

      const ownerData = await db.execute(sql`
        SELECT
          (SELECT clerk_user_id FROM users WHERE id = ${IDS.user}) AS owner,
          (SELECT title FROM items WHERE id = ${IDS.item}) AS item_title
      `);
      expect(ownerData.rows).toEqual([
        { owner: "prototype-owner", item_title: "Saved migration video" },
      ]);

      const retiredTables = await db.execute(sql`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name IN (
            'discover_discoveries',
            'discover_follow_candidate_presence',
            'discover_provider_snapshots'
          )
      `);
      expect(retiredTables.rows).toEqual([]);

      await expectUnmappableFollowToRollBack(
        db,
        container.getConnectionUri(),
        migrations,
        prototypeMigrationIndex,
      );
    } finally {
      await db.$client.end();
      await container.stop();
    }
  });
});

interface Migration {
  sql: string[];
  folderMillis: number;
  hash: string;
}

async function applyMigrations(
  db: Database,
  migrations: (Migration | undefined)[],
): Promise<void> {
  for (const migration of migrations) {
    if (migration === undefined) throw new Error("expected migration");
    for (const statement of migration.sql) {
      await db.execute(sql.raw(statement));
    }
  }
}

async function recordMigrationHistory(
  db: Database,
  migrations: Migration[],
): Promise<void> {
  await db.execute(sql`CREATE SCHEMA drizzle`);
  await db.execute(sql`
    CREATE TABLE drizzle.__drizzle_migrations (
      id serial PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    )
  `);
  for (const migration of migrations) {
    await db.execute(sql`
      INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
      VALUES (${migration.hash}, ${migration.folderMillis})
    `);
  }
}

async function expectUnmappableFollowToRollBack(
  adminDb: Database,
  connectionUri: string,
  migrations: Migration[],
  prototypeMigrationIndex: number,
): Promise<void> {
  await adminDb.execute(sql.raw('CREATE DATABASE "discover_unmappable"'));
  const failureUrl = new URL(connectionUri);
  failureUrl.pathname = "/discover_unmappable";
  const failureDb = createDatabase({
    connectionString: failureUrl.toString(),
    timeZone: "UTC",
  });

  try {
    const prototypeMigrations = migrations.slice(
      0,
      prototypeMigrationIndex + 1,
    );
    await applyMigrations(failureDb, prototypeMigrations);
    await recordMigrationHistory(failureDb, prototypeMigrations);
    await failureDb.execute(sql`
      INSERT INTO users (id, clerk_user_id)
      VALUES (${IDS.unmappableUser}, 'unmappable-owner')
    `);
    await failureDb.execute(sql`
      INSERT INTO discover_provider_targets (
        id, provider, target_kind, acquisition_scope
      ) VALUES (${IDS.unmappableTarget}, 'youtube', 'channel', 'system')
    `);
    await failureDb.execute(sql`
      INSERT INTO discover_follows (
        id, user_id, provider_target_id, target_url, lifecycle
      ) VALUES (
        ${IDS.unmappableFollow}, ${IDS.unmappableUser},
        ${IDS.unmappableTarget}, 'https://youtube.com/@expired', 'active'
      )
    `);

    await expect(
      migrate(failureDb, { migrationsFolder: MIGRATIONS_FOLDER }),
    ).rejects.toThrow(
      "Cannot migrate a Follow whose YouTube channel identity or metadata has expired",
    );

    const preserved = await failureDb.execute(sql`
      SELECT
        (SELECT count(*)::integer FROM discover_follows) AS follows,
        (SELECT count(*)::integer FROM discover_provider_targets) AS targets,
        (
          SELECT count(*)::integer
          FROM drizzle.__drizzle_migrations
          WHERE created_at > 1786898198962
        ) AS later_migrations,
        to_regnamespace('discover_prototype_536') AS temporary_schema
    `);
    expect(preserved.rows).toEqual([
      {
        follows: 1,
        targets: 1,
        later_migrations: 0,
        temporary_schema: null,
      },
    ]);
  } finally {
    await failureDb.$client.end();
  }
}

const IDS = {
  user: "10000000-0000-0000-0000-000000000000",
  item: "20000000-0000-0000-0000-000000000000",
  target: "30000000-0000-0000-0000-000000000000",
  result: "40000000-0000-0000-0000-000000000000",
  rejectedResult: "40000000-0000-0000-0000-000000000001",
  snapshot: "50000000-0000-0000-0000-000000000000",
  follow: "60000000-0000-0000-0000-000000000000",
  candidate: "70000000-0000-0000-0000-000000000000",
  rejectedCandidate: "70000000-0000-0000-0000-000000000001",
  discovery: "80000000-0000-0000-0000-000000000000",
  rejectedDiscovery: "80000000-0000-0000-0000-000000000001",
  unmappableUser: "90000000-0000-0000-0000-000000000000",
  unmappableTarget: "a0000000-0000-0000-0000-000000000000",
  unmappableFollow: "b0000000-0000-0000-0000-000000000000",
} as const;

async function seedPrototypeDiscoverData(db: Database): Promise<void> {
  await db.execute(sql`
    INSERT INTO users (id, clerk_user_id, created_at)
    VALUES (${IDS.user}, 'prototype-owner', '2026-07-31T09:00:00Z')
  `);
  await db.execute(sql`
    INSERT INTO items (
      id, user_id, title, source, type, status, status_mode, created_at
    ) VALUES (
      ${IDS.item}, ${IDS.user}, 'Saved migration video',
      'https://www.youtube.com/watch?v=video-migration', 'video', 'not_started',
      'manual', '2026-08-03T12:00:00Z'
    )
  `);
  await db.execute(sql`
    INSERT INTO discover_provider_targets (
      id, provider, target_kind, acquisition_scope, external_reference,
      target_payload, data_generation, acquisition_generation, next_eligible_at,
      fetched_at, expires_at
    ) VALUES (
      ${IDS.target}, 'youtube', 'channel', 'system', 'UC_migration',
      ${JSON.stringify({ schemaVersion: 1, uploadsPlaylistId: "UU_migration" })}::jsonb,
      1, 1, '2026-08-02T10:00:00Z', '2026-08-01T10:00:00Z',
      '2026-09-01T10:00:00Z'
    )
  `);
  await db.execute(sql`
    INSERT INTO discover_provider_target_projections (
      provider_target_id, publisher, generation, fetched_at, expires_at
    ) VALUES (
      ${IDS.target}, 'Migration Channel', 1, '2026-08-01T10:00:00Z',
      '2026-09-01T10:00:00Z'
    )
  `);
  await db.execute(sql`
    INSERT INTO discover_provider_results (
      id, provider, external_reference, data_generation, fetched_at, expires_at
    ) VALUES
      (
        ${IDS.result}, 'youtube', 'video-migration', 1,
        '2026-08-01T10:00:00Z', '2026-09-01T10:00:00Z'
      ),
      (
        ${IDS.rejectedResult}, 'youtube', 'video-rejected', 1,
        '2026-08-01T10:00:00Z', '2026-09-01T10:00:00Z'
      )
  `);
  await db.execute(sql`
    INSERT INTO discover_provider_result_projections (
      provider_result_id, title, source, publisher, published_at,
      duration_seconds, type, thumbnail_url, generation, fetched_at, expires_at
    ) VALUES (
      ${IDS.result}, 'Migration video',
      'https://www.youtube.com/watch?v=video-migration', 'Migration Channel',
      '2026-07-30T08:00:00Z', 600, 'video',
      'https://img.youtube.com/migration.jpg', 1,
      '2026-08-01T10:00:00Z', '2026-09-01T10:00:00Z'
    ), (
      ${IDS.rejectedResult}, 'Rejected migration video',
      'https://www.youtube.com/watch?v=video-rejected', 'Migration Channel',
      '2026-07-29T08:00:00Z', 300, 'video', NULL, 1,
      '2026-08-01T10:00:00Z', '2026-09-01T10:00:00Z'
    )
  `);
  await db.execute(sql`
    INSERT INTO discover_provider_snapshots (
      id, provider_target_id, sequence, outcome, rejected_count,
      coverage_started_at, published_at
    ) VALUES (
      ${IDS.snapshot}, ${IDS.target}, 1, 'partial', 0,
      '2026-07-01T00:00:00Z', '2026-08-01T10:00:00Z'
    )
  `);
  await db.execute(sql`
    INSERT INTO discover_provider_snapshot_results (
      snapshot_id, provider_result_id, position
    ) VALUES
      (${IDS.snapshot}, ${IDS.result}, 0),
      (${IDS.snapshot}, ${IDS.rejectedResult}, 1)
  `);
  await db.execute(sql`
    INSERT INTO discover_follows (
      id, user_id, provider_target_id, target_url, lifecycle,
      last_applied_provider_snapshot_id, created_at, updated_at
    ) VALUES (
      ${IDS.follow}, ${IDS.user}, ${IDS.target},
      'https://www.youtube.com/channel/UC_migration', 'active', ${IDS.snapshot},
      '2026-08-02T11:00:00Z', '2026-08-02T11:00:00Z'
    )
  `);
  await db.execute(sql`
    INSERT INTO discover_candidates (
      id, user_id, provider_result_id, item_id, created_at
    ) VALUES (
      ${IDS.candidate}, ${IDS.user}, ${IDS.result}, ${IDS.item},
      '2026-08-02T11:00:00Z'
    ), (
      ${IDS.rejectedCandidate}, ${IDS.user}, ${IDS.rejectedResult}, NULL,
      '2026-08-02T11:00:00Z'
    )
  `);
  await db.execute(sql`
    INSERT INTO discover_follow_candidate_presence (
      user_id, follow_id, candidate_id, appearance_sequence, present,
      first_surfaced_snapshot_id, last_surfaced_snapshot_id
    ) VALUES (
      ${IDS.user}, ${IDS.follow}, ${IDS.candidate}, 1, true,
      ${IDS.snapshot}, ${IDS.snapshot}
    ), (
      ${IDS.user}, ${IDS.follow}, ${IDS.rejectedCandidate}, 1, true,
      ${IDS.snapshot}, ${IDS.snapshot}
    )
  `);
  await db.execute(sql`
    INSERT INTO discover_discoveries (
      id, user_id, follow_id, candidate_id, appearance_sequence, position,
      state, discovered_at, decided_at
    ) VALUES (
      ${IDS.discovery}, ${IDS.user}, ${IDS.follow}, ${IDS.candidate}, 1, 0,
      'kept', '2026-08-02T11:00:00Z', '2026-08-03T12:00:00Z'
    ), (
      ${IDS.rejectedDiscovery}, ${IDS.user}, ${IDS.follow},
      ${IDS.rejectedCandidate}, 1, 1, 'dismissed',
      '2026-08-02T11:00:00Z', '2026-08-04T12:00:00Z'
    )
  `);
}
