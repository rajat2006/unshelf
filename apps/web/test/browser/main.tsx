import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "../../src/App";
import {
  ApplicationAuthProvider,
  type ApplicationAuth,
} from "../../src/application-auth";
import { selectedTestUser, testBearerToken } from "./harness";

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("#root element not found");

const testUser = selectedTestUser(window.location.search);

const EmptyControl = () => null;
const auth: ApplicationAuth = {
  status: "signed-in",
  user: { getToken: async () => testBearerToken(testUser) },
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
