import { createServer as createHttpServer } from "node:http";
import type { ClerkUserId } from "@unshelf/shared";
import { createServer as createViteServer } from "vite";
import { startTestApp } from "../../../api/test/harness";
import {
  BROWSER_HARNESS_API_ORIGIN,
  BROWSER_HARNESS_API_PORT,
  BROWSER_HARNESS_HOST,
  BROWSER_HARNESS_WEB_PORT,
  testUserFromAuthorization,
} from "./harness";

const testApp = await startTestApp((req) => {
  const userId = testUserFromAuthorization(req.header("authorization"));
  return userId ? (userId as unknown as ClerkUserId) : null;
});
const apiServer = createHttpServer(testApp.app);

await new Promise<void>((resolve, reject) => {
  apiServer.once("error", reject);
  apiServer.listen(BROWSER_HARNESS_API_PORT, BROWSER_HARNESS_HOST, resolve);
});

const vite = await createViteServer({
  configFile: "vite.config.ts",
  server: {
    host: BROWSER_HARNESS_HOST,
    port: BROWSER_HARNESS_WEB_PORT,
    strictPort: true,
    proxy: {
      "/api": BROWSER_HARNESS_API_ORIGIN,
    },
  },
});
await vite.listen();

let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  await vite.close();
  await new Promise<void>((resolve, reject) => {
    apiServer.close((error) => (error ? reject(error) : resolve()));
  });
  await testApp.stop();
}

process.once("SIGINT", () => void stop());
process.once("SIGTERM", () => void stop());
