import {
  createServer as createHttpServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import type { ClerkUserId } from "@unshelf/shared";
import { createServer as createViteServer } from "vite";
import {
  seedLegacyLearningPlanFixture,
  startTestAppWithLegacyFixture,
} from "../../../api/test/harness";
import {
  BROWSER_HARNESS_API_ORIGIN,
  BROWSER_HARNESS_API_PORT,
  BROWSER_HARNESS_HOST,
  BROWSER_HARNESS_WEB_ORIGIN,
  BROWSER_HARNESS_WEB_PORT,
  testUserFromAuthorization,
} from "./harness";
import { LEGACY_LEARNING_PLAN_FIXTURE as legacy } from "./legacy-learning-plan-fixture";

const testApp = await startTestAppWithLegacyFixture(
  (req) => {
    const userId = testUserFromAuthorization(req.header("authorization"));
    return userId ? (userId as unknown as ClerkUserId) : null;
  },
  (db) => seedLegacyLearningPlanFixture(db, legacy),
);
const apiServer = createHttpServer((req, res) => {
  void handleApiRequest(req, res).catch((error: unknown) => {
    res.writeHead(500, { "Content-Type": "text/plain" });
    res.end(String(error));
  });
});

async function handleApiRequest(req: IncomingMessage, res: ServerResponse) {
  const pathname = req.url
    ? new URL(req.url, BROWSER_HARNESS_API_ORIGIN).pathname
    : "";
  const match = pathname.match(
    /^\/__test__\/daily-focus\/([0-9a-f-]+)\/elapse$/,
  );
  if (req.method === "POST" && match) {
    const user = testUserFromAuthorization(req.headers.authorization);
    if (!user) {
      res.writeHead(401).end();
      return;
    }
    const elapsed = await testApp.pool.query<{ date: string }>(
      `update daily_focuses
       set date = current_date - 1
       from users
       where daily_focuses.id = $1
         and daily_focuses.user_id = users.id
         and users.clerk_user_id = $2
       returning daily_focuses.date::text`,
      [match[1], user],
    );
    if (!elapsed.rows[0]) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(elapsed.rows[0]));
    return;
  }
  testApp.app(req, res);
}

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

let stageping = false;
async function stop() {
  if (stageping) return;
  stageping = true;
  await vite.close();
  await new Promise<void>((resolve, reject) => {
    apiServer.close((error) => (error ? reject(error) : resolve()));
  });
  await testApp.stop();
}

process.once("SIGINT", () => void stop());
process.once("SIGTERM", () => void stop());
