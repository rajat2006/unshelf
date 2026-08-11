import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { LearningWorkspacesPrototype } from "./LearningWorkspacesPrototype";
import "./learning-workspaces.css";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("#root element not found");
}

createRoot(rootElement).render(
  <StrictMode>
    <BrowserRouter>
      <LearningWorkspacesPrototype />
    </BrowserRouter>
  </StrictMode>,
);
