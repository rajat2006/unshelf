import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { DiscoverIntakePrototype } from "./DiscoverIntakePrototype";
import "../../styles/globals.css";

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("#root element not found");

createRoot(rootElement).render(
  <StrictMode>
    <BrowserRouter>
      <DiscoverIntakePrototype />
    </BrowserRouter>
  </StrictMode>,
);
