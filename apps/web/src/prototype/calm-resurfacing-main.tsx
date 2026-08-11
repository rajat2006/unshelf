import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Link, useSearchParams } from "react-router";
import { Wordmark } from "../shell/Wordmark";
import "../theme.css";
import { CalmResurfacingPrototype } from "./CalmResurfacingPrototype";

/** Standalone no-auth entry so the throwaway prototype starts with one command. */
function PrototypeFrame() {
  const [searchParams] = useSearchParams();
  const libraryActive = searchParams.get("surface") === "library";

  return (
    <>
      <header className="top-bar">
        <span className="top-bar__home">
          <Wordmark />
        </span>
        <nav aria-label="Prototype context" className="top-bar__nav">
          <Link
            to="?surface=focus"
            className={`top-bar__door${libraryActive ? "" : " active"}`}
            aria-current={libraryActive ? undefined : "page"}
          >
            Daily Planning
          </Link>
          <Link
            to="?surface=library"
            className={`top-bar__door${libraryActive ? " active" : ""}`}
            aria-current={libraryActive ? "page" : undefined}
          >
            Library
          </Link>
        </nav>
        <div className="top-bar__actions">
          <Link
            to="?surface=focus"
            className={`prototype-top-bar__today${libraryActive ? "" : " is-active"}`}
          >
            Today
          </Link>
          <button type="button" disabled className="top-bar__capture">
            Capture
          </button>
        </div>
      </header>
      <main className="app-main">
        <CalmResurfacingPrototype />
      </main>
    </>
  );
}

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("#root element not found");

createRoot(rootElement).render(
  <StrictMode>
    <BrowserRouter>
      <PrototypeFrame />
    </BrowserRouter>
  </StrictMode>,
);
