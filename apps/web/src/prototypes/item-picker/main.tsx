/**
 * PROTOTYPE — throwaway entry. Ticket #212, map #211.
 *
 * Three variants of the Item picker, each rendered in *both* hard frames — the
 * narrow open-Stop panel and the full-density Library row list — switchable with
 * `?variant=A|B|C`. Fixtures only: no api, no auth, no persistence.
 *
 *   pnpm --filter @unshelf/web dev  →  http://localhost:5173/prototype.html
 *
 * Served only in dev: `vite build` inputs `index.html`, so this never ships.
 */
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router";
import "../../theme.css";
import "../prototype.css";
import { PrototypeSwitcher, useVariant } from "../PrototypeSwitcher";
import { LibraryFrame, StopFrame } from "./frames";
import * as A from "./VariantA";
import * as B from "./VariantB";
import * as C from "./VariantC";

const VARIANTS = { A, B, C };
const KEYS = Object.keys(VARIANTS);

function Page() {
  const [, force] = useState(0);
  const [current, setVariant] = useVariant(KEYS);
  useEffect(() => {
    const rerender = () => force((n) => n + 1);
    window.addEventListener("prototype:variant", rerender);
    return () => window.removeEventListener("prototype:variant", rerender);
  }, []);

  const variant = VARIANTS[current as keyof typeof VARIANTS];

  return (
    <div className="proto-page">
      <header className="proto-page__head">
        <h1>Item picker — two frames</h1>
        <p className="quiet-copy">
          Ticket #212 · map #211 · throwaway prototype, fixtures only. Both
          frames below run the <strong>same variant</strong>. ← / → switch
          variants.
        </p>
        <p className="proto-variant-note">
          <strong>{current}</strong> — {variant.name}
        </p>
      </header>

      <StopFrame>
        <variant.StopPanel key={`${current}-panel`} />
      </StopFrame>

      <LibraryFrame>
        <variant.LibraryBody key={`${current}-library`} />
      </LibraryFrame>

      <PrototypeSwitcher
        variants={KEYS}
        current={current}
        label={variant.name}
        onSelect={setVariant}
      />
    </div>
  );
}

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("#root element not found");

createRoot(rootElement).render(
  <MemoryRouter>
    <Page />
  </MemoryRouter>,
);
