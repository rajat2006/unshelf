import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { AuthProvider } from "./auth";
// PROTOTYPE (issue #21) — throwaway. Remove with the trail-prototype/ dir.
import { TrailPrototype } from "./trail-prototype/TrailPrototype";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("#root element not found");
}

// PROTOTYPE (issue #21) — the Trail design spike renders on `?prototype=trail`,
// ahead of Clerk, so it runs with no auth key and no backend. Delete this branch
// (and trail-prototype/) once T8 has consumed the decision.
const isTrailPrototype =
  new URLSearchParams(window.location.search).get("prototype") === "trail";

createRoot(rootElement).render(
  <StrictMode>
    {isTrailPrototype ? (
      <TrailPrototype />
    ) : (
      <AuthProvider>
        <App />
      </AuthProvider>
    )}
  </StrictMode>,
);
