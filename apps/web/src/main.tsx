import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router";
import { App } from "./App";
import { AuthProvider } from "./auth";
import { initializeThemePreference } from "./themePreference";
import "./styles/globals.css";

initializeThemePreference();

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("#root element not found");
}

// A data router supplies navigation blocking for temporary edited chapter previews.
const router = createBrowserRouter([{ path: "*", element: <App /> }]);

createRoot(rootElement).render(
  <StrictMode>
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  </StrictMode>,
);
