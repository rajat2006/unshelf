import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "../../src/App";
import {
  ApplicationAuthProvider,
  type ApplicationAuth,
} from "../../src/application-auth";

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("#root element not found");

const testUser = new URLSearchParams(window.location.search).get("testUser");
if (!testUser) throw new Error("testUser query parameter is required");

const EmptyControl = () => null;
const auth: ApplicationAuth = {
  status: "signed-in",
  user: { getToken: async () => testUser },
  SignInButton: EmptyControl,
  UserButton: EmptyControl,
};

createRoot(rootElement).render(
  <StrictMode>
    <ApplicationAuthProvider auth={auth}>
      <App />
    </ApplicationAuthProvider>
  </StrictMode>,
);
