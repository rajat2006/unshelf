import type { Plugin } from "vite";

/** Keep direct prototype Item URLs owned by the disposable prototype entry. */
export function prototypeHistoryFallback(): Plugin {
  return {
    name: "unshelf-prototype-history-fallback",
    configureServer(server) {
      server.middlewares.use((request, _response, next) => {
        if (
          request.method === "GET" &&
          request.url &&
          request.headers.accept?.includes("text/html")
        ) {
          const url = new URL(request.url, "http://unshelf.local");
          if (
            url.pathname.startsWith("/prototype/") &&
            url.pathname !== "/prototype/"
          ) {
            request.url = `/prototype/${url.search}`;
          }
        }
        next();
      });
    },
  };
}
