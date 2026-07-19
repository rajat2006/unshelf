import { createServer as createHttpServer } from "node:http";
import type { ClerkUserId } from "@unshelf/shared";
import { createServer as createViteServer } from "vite";
import { startTestApp } from "../../../api/test/harness";

const apiPort = 3101;
const webPort = 4173;
const testApp = await startTestApp((req) => {
  const authorization = req.header("authorization");
  const token = authorization?.match(/^Bearer (.+)$/)?.[1];
  return token ? (token as ClerkUserId) : null;
});
const apiServer = createHttpServer(testApp.app);

await new Promise<void>((resolve, reject) => {
  apiServer.once("error", reject);
  apiServer.listen(apiPort, "127.0.0.1", resolve);
});

const vite = await createViteServer({
  configFile: "vite.config.ts",
  server: {
    host: "127.0.0.1",
    port: webPort,
    strictPort: true,
    proxy: {
      "/api": `http://127.0.0.1:${apiPort}`,
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
