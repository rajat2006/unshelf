import { readMigrationFiles } from "drizzle-orm/migrator";
import type { DatabaseWithClient } from "./db";

type AppliedMigration = {
  hash: string;
  created_at: string;
};

export async function verifyMigrationHistory({
  database,
  migrationsFolder,
}: {
  database: DatabaseWithClient;
  migrationsFolder: string;
}): Promise<void> {
  const expected = readMigrationFiles({ migrationsFolder });
  const result = await database.$client.query<AppliedMigration>(`
    SELECT hash, created_at
    FROM drizzle.__drizzle_migrations
    ORDER BY created_at
  `);
  const matches =
    result.rows.length === expected.length &&
    result.rows.every(
      (applied, index) =>
        applied.hash === expected[index]?.hash &&
        Number(applied.created_at) === expected[index]?.folderMillis,
    );
  if (!matches) {
    throw new Error("Migration history verification failed");
  }
}
