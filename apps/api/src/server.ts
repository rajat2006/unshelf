import { createApp } from "./app";
import { createPool } from "./db";
import { applySchema } from "./schema";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required");
}

const port = Number(process.env.PORT ?? 3001);
const pool = createPool(connectionString);

await applySchema(pool);
const app = createApp(pool);

app.listen(port, () => {
  console.log(`unshelf api listening on :${port}`);
});
