import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router";

import { ArchitecturePrototype } from "./ArchitecturePrototype";
import "./prototype.css";

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("#root element not found");

createRoot(rootElement).render(
  <StrictMode>
    <BrowserRouter basename="/prototype">
      <Routes>
        <Route path="/" element={<ArchitecturePrototype />} />
        <Route path="/items/:itemId" element={<ArchitecturePrototype />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
