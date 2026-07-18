import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ThemePrototype } from "./ThemePrototype";

// THROWAWAY prototype entry (Unshelf issue #55). Deliberately does NOT go through
// AuthProvider/App — the theme moodboard needs no sign-in, no API, no router. It
// mounts standalone so `pnpm --filter @unshelf/web dev` → /prototype-theme.html
// renders the three theme directions with mock data. Never merged to main.

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("#root element not found");
}

createRoot(rootElement).render(
  <StrictMode>
    <ThemePrototype />
  </StrictMode>,
);
