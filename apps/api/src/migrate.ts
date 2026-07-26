import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createPool } from "./db";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required");
}

const migrationsFolder = fileURLToPath(
  new URL("../drizzle", import.meta.url),
);
const pool = createPool(connectionString);

try {
  await migrate(drizzle(pool), { migrationsFolder });
} finally {
  await pool.end();
}
