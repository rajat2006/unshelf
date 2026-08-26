import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { App } from "./App";
import { AuthProvider } from "./auth";
import { ItemDeletionPrototype } from "./prototype/ItemDeletionPrototype";
import { initializeThemePreference } from "./themePreference";
import "./styles/globals.css";

initializeThemePreference();

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("#root element not found");
}

const deletionPrototype =
  import.meta.env.DEV &&
  window.location.pathname === "/prototype/item-deletion";

createRoot(rootElement).render(
  <StrictMode>
    {deletionPrototype ? (
      <BrowserRouter>
        <main className="mx-auto min-h-svh w-full min-w-0 max-w-[80rem] bg-background px-4 py-8 text-foreground md:px-6 md:py-10">
          <ItemDeletionPrototype />
        </main>
      </BrowserRouter>
    ) : (
      <AuthProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </AuthProvider>
    )}
  </StrictMode>,
);
