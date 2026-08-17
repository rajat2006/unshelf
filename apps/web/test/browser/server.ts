import {
  createServer as createHttpServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { readFile } from "node:fs/promises";
import {
  Type,
  type ClerkUserId,
  type FollowPreviewVideo,
} from "@unshelf/shared";
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
import type { YouTubeAdapter } from "../../../api/src/discover/youtube-adapter";

const discoverNow = new Date("2026-08-16T12:00:00.000Z");

function providerVideo({
  identity,
  title,
  publisher,
  publishedAt,
}: {
  identity: string;
  title: string;
  publisher: string;
  publishedAt: string;
}): FollowPreviewVideo {
  return {
    provider: "youtube",
    providerIdentity: identity,
    title,
    source: `https://www.youtube.com/watch?v=${identity}`,
    publisher,
    publishedAt,
    durationSeconds: 601,
    type: Type.Video,
    thumbnailUrl: null,
  };
}

const quietVideos = [
  providerVideo({
    identity: "quiet-deep-module",
    title: "A deep module",
    publisher: "Quiet Learning",
    publishedAt: "2026-08-15T10:00:00.000Z",
  }),
  providerVideo({
    identity: "quiet-boundaries",
    title: "Designing boundaries",
    publisher: "Quiet Learning",
    publishedAt: "2026-08-14T10:00:00.000Z",
  }),
  ...Array.from({ length: 6 }, (_, index) =>
    providerVideo({
      identity: `quiet-extra-${index + 1}`,
      title: `Quiet lesson ${index + 1}`,
      publisher: "Quiet Learning",
      publishedAt: `2026-08-${String(13 - index).padStart(2, "0")}T10:00:00.000Z`,
    }),
  ),
];
const systemsVideos = [
  providerVideo({
    identity: "systems-queues",
    title: "Understand queues",
    publisher: "Systems Studio",
    publishedAt: "2026-08-13T10:00:00.000Z",
  }),
  providerVideo({
    identity: "systems-retries",
    title: "Retries without surprises",
    publisher: "Systems Studio",
    publishedAt: "2026-08-12T10:00:00.000Z",
  }),
];

const browserDiscoverAdapter: YouTubeAdapter = {
  previewChannel: async ({ url }) => {
    const systems = url.includes("systemsstudio");
    return {
      ok: true,
      outcome: "preview",
      channelId: systems ? "UC_systems_studio" : "UC_quiet_learning",
      uploadsPlaylistId: systems ? "UU_systems_studio" : "UU_quiet_learning",
      publisher: systems ? "Systems Studio" : "Quiet Learning",
      videos: systems ? systemsVideos : quietVideos,
      rejectedCount: 0,
      coverageStartedAt: "2026-07-17T12:00:00.000Z",
    };
  },
  acquireChannel: async ({ channelId }) => {
    const systems = channelId === "UC_systems_studio";
    return {
      ok: true,
      outcome: systems ? "partial" : "preview",
      channelId,
      uploadsPlaylistId: systems ? "UU_systems_studio" : "UU_quiet_learning",
      publisher: systems ? "Systems Studio" : "Quiet Learning",
      videos: systems ? systemsVideos : quietVideos,
      rejectedCount: systems ? 1 : 0,
      coverageStartedAt: "2026-07-17T12:00:00.000Z",
    };
  },
  acquireChannelByUrl: async ({ url }) =>
    browserDiscoverAdapter.previewChannel({ url }),
};

const testApp = await startTestAppWithLegacyFixture(
  (req) => {
    const userId = testUserFromAuthorization(req.header("authorization"));
    return userId ? (userId as unknown as ClerkUserId) : null;
  },
  (db) => seedLegacyLearningPlanFixture(db, legacy),
  {
    discover: {
      enabled: true,
      adapter: browserDiscoverAdapter,
      now: () => discoverNow,
    },
  },
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
  const suppressionMatch = pathname.match(
    /^\/__test__\/daily-planning\/([0-9a-f-]+)\/elapse-suppression$/,
  );
  if (req.method === "POST" && suppressionMatch) {
    const user = testUserFromAuthorization(req.headers.authorization);
    if (!user) {
      res.writeHead(401).end();
      return;
    }
    const elapsed = await testApp.pool.query(
      `update daily_planning_suppressions
       set date = current_date - 1
       from users
       where daily_planning_suppressions.item_id = $1
         and daily_planning_suppressions.user_id = users.id
         and users.clerk_user_id = $2
         and daily_planning_suppressions.date = current_date`,
      [suppressionMatch[1], user],
    );
    if (elapsed.rowCount !== 1) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(204).end();
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

// Serve the production entry document for browser-harness navigation, replacing
// only its auth-owning module with the injected test-auth module. This keeps the
// real runtime-config ordering and Vite transformation seam under browser test.
async function serveBrowserHarnessEntry(
  req: IncomingMessage,
  res: ServerResponse,
  next: (error?: unknown) => void,
) {
  if (
    req.method === "GET" &&
    req.headers.accept?.includes("text/html") &&
    req.url
  ) {
    const url = new URL(req.url, BROWSER_HARNESS_WEB_ORIGIN);
    if (url.pathname.startsWith("/test/browser")) {
      const productionEntry = await readFile(
        new URL("../../index.html", import.meta.url),
        "utf8",
      );
      const harnessEntry = productionEntry.replace(
        'src="/src/main.tsx"',
        'src="/test/browser/main.tsx"',
      );
      const transformed = await vite.transformIndexHtml(req.url, harnessEntry);
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(transformed);
      return;
    }
  }
  next();
}
vite.middlewares.stack.unshift({
  route: "",
  handle: ((
    req: IncomingMessage,
    res: ServerResponse,
    next: (error?: unknown) => void,
  ) => {
    void serveBrowserHarnessEntry(req, res, next).catch(next);
  }) as never,
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
