import { StrictMode, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { App } from "../../src/App";
import {
  ApplicationAuthProvider,
  type ApplicationAuth,
} from "../../src/application-auth";
import "../../src/theme.css";
import { selectedTestUser, testBearerToken } from "./harness";

/**
 * The browser-test application seam. It mounts the real `App` behind the
 * application-auth boundary with an injected test User, so behaviour is verified
 * as a User experiences it without a live Clerk/OAuth dependency (#90).
 *
 * `authState` selects the starting authentication status so a test can exercise
 * the gate: `signed-in` (default — the existing capture path), `signed-out` (the
 * chrome-less sign-in screen; the injected sign-in trigger resolves to
 * signed-in, standing in for Clerk's modal succeeding), or `loading` (the neutral
 * first-load placeholder). The router `basename` matches where the harness is
 * served, so in-app URLs read as the production route contract.
 */

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("#root element not found");

const testUser = selectedTestUser(window.location.search);
const initialStatus =
  (new URLSearchParams(window.location.search).get("authState") as
    ApplicationAuth["status"] | null) ?? "signed-in";

const EmptyControl = () => null;

function TestApplication() {
  const [status, setStatus] =
    useState<ApplicationAuth["status"]>(initialStatus);

  const auth: ApplicationAuth = {
    status,
    user:
      status === "signed-in"
        ? { getToken: async () => testBearerToken(testUser) }
        : null,
    SignInButton: ({ children }: { children: ReactNode }) => (
      <span
        style={{ display: "contents" }}
        onClick={() => setStatus("signed-in")}
      >
        {children}
      </span>
    ),
    UserButton: EmptyControl,
  };

  return (
    <ApplicationAuthProvider auth={auth}>
      <BrowserRouter basename="/test/browser">
        <App />
      </BrowserRouter>
    </ApplicationAuthProvider>
  );
}

createRoot(rootElement).render(
  <StrictMode>
    <TestApplication />
  </StrictMode>,
);
