import type { Pool } from "pg";

export interface TrackedTestPool {
  close: () => Promise<void>;
}

export interface TestPostgresContainer {
  stop: (options: { timeout: number }) => Promise<unknown>;
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
