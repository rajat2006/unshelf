import { createServer as createHttpServer } from "node:http";
import type { ClerkUserId } from "@unshelf/shared";
import { createServer as createViteServer } from "vite";
import { startTestApp } from "../../../api/test/harness";
import {
  BROWSER_HARNESS_API_ORIGIN,
  BROWSER_HARNESS_API_PORT,
  BROWSER_HARNESS_HOST,
  BROWSER_HARNESS_WEB_ORIGIN,
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

// The app is a client-routed SPA (react-router), so a deep link or a refresh on
// a nested route (e.g. /test/browser/library) must serve the harness entry
// document, not 404. Vite's own SPA fallback targets the root index.html; the
// harness is mounted under /test/browser, so rewrite navigation requests there
// before Vite's middleware chain resolves them.
function rewriteDeepLinksToHarnessEntry(
  req: { method?: string; url?: string; headers: { accept?: string } },
  _res: unknown,
  next: () => void,
) {
  if (
    req.method === "GET" &&
    req.headers.accept?.includes("text/html") &&
    req.url
  ) {
    const url = new URL(req.url, BROWSER_HARNESS_WEB_ORIGIN);
    if (url.pathname.startsWith("/test/browser")) {
      url.pathname = "/test/browser/";
      req.url = `${url.pathname}${url.search}`;
    }
  }
  next();
}
vite.middlewares.stack.unshift({
  route: "",
  handle: rewriteDeepLinksToHarnessEntry as never,
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
