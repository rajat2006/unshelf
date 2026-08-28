import { randomUUID } from "node:crypto";
import { Pool } from "pg";

export interface TrackedTestPool {
  close: () => Promise<void>;
}

export interface TestPostgresContainer {
  stop: (options: { timeout: number }) => Promise<unknown>;
}

export interface IsolatedTestDatabase {
  connectionString: string;
  drop: () => Promise<void>;
}

export async function createIsolatedTestDatabase(
  postgresConnectionUri: string,
): Promise<IsolatedTestDatabase> {
  const databaseName = `unshelf_test_${randomUUID().replaceAll("-", "")}`;
  await runAdminQuery({
    postgresConnectionUri,
    query: `CREATE DATABASE ${quoteIdentifier(databaseName)}`,
  });

  const connectionUrl = new URL(postgresConnectionUri);
  connectionUrl.pathname = `/${databaseName}`;

  return {
    connectionString: connectionUrl.toString(),
    drop: () =>
      runAdminQuery({
        postgresConnectionUri,
        query: `DROP DATABASE ${quoteIdentifier(databaseName)}`,
      }),
  };
}

export function trackTestPool(pool: Pool): TrackedTestPool {
  const clientClosures: Promise<void>[] = [];

  pool.on("connect", (client) => {
    clientClosures.push(
      new Promise((resolve) => {
        client.once("end", resolve);
      }),
    );
  });

  return {
    close: async () => {
      await pool.end();
      // pg-pool can resolve end() after removing clients from its bookkeeping
      // but before their sockets emit end. PostgreSQL must outlive that gap.
      await Promise.all(clientClosures);
    },
  };
}

export async function stopTestPostgres({
  pool,
  container,
}: {
  pool: TrackedTestPool;
  container: TestPostgresContainer;
}): Promise<void> {
  try {
    await pool.close();
  } finally {
    await container.stop({ timeout: 10_000 });
  }
}

export async function stopIsolatedTestDatabase({
  pool,
  database,
}: {
  pool: TrackedTestPool;
  database: IsolatedTestDatabase;
}): Promise<void> {
  try {
    await pool.close();
  } finally {
    await database.drop();
  }
}

async function runAdminQuery({
  postgresConnectionUri,
  query,
}: {
  postgresConnectionUri: string;
  query: string;
}): Promise<void> {
  const pool = new Pool({ connectionString: postgresConnectionUri });
  const trackedPool = trackTestPool(pool);
  try {
    await pool.query(query);
  } finally {
    await trackedPool.close();
  }
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}
