import { expect, it } from "vitest";
import { startTestApp } from "./harness";

it("isolates each test harness in its own database", async () => {
  const first = await startTestApp();
  const second = await startTestApp();

  try {
    await first.pool.query("CREATE TABLE database_isolation_probe (id int)");
    const result = await second.pool.query<{ table_name: string | null }>(
      "SELECT to_regclass('public.database_isolation_probe') AS table_name",
    );

    expect(result.rows).toEqual([{ table_name: null }]);
  } finally {
    await Promise.all([first.stop(), second.stop()]);
  }
});
