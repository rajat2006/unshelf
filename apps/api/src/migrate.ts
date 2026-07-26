import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDatabase } from "./db";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required");
}

const migrationsFolder = fileURLToPath(new URL("../drizzle", import.meta.url));
const db = createDatabase(connectionString);

try {
  await migrate(db, { migrationsFolder });
} finally {
  await db.$client.end();
}
