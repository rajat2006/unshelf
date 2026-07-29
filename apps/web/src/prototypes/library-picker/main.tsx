/**
 * PROTOTYPE — throwaway entry, round 2. Ticket #212, map #211.
 *
 * Round 1 settled the Stop panel (variant C) and rejected the checkbox gutter in
 * the Library. This round re-prototypes only the Library — doors 1 and 2 — with
 * three flows that are not "a list with checkboxes".
 *
 *   pnpm --filter @unshelf/web dev  →  /prototype-library.html?variant=D|E|F
 */
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router";
import "../../theme.css";
import "../prototype.css";
import { PrototypeSwitcher, useVariant } from "../PrototypeSwitcher";
import { LibraryFrame } from "../item-picker/frames";
import * as D from "./VariantD";
import * as E from "./VariantE";
import * as F from "./VariantF";

const VARIANTS = { D, E, F };
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
        <h1>Library → Stop — round 2</h1>
        <p className="quiet-copy">
          Ticket #212 · map #211 · throwaway. Round 1 locked the Stop panel
          (variant C) and threw out the checkbox gutter. These are three ways
          the Library could point Items at a destination. ← / → switch.
        </p>
        <p className="proto-variant-note">
          <strong>{current}</strong> — {variant.name}
        </p>
      </header>

      <LibraryFrame>
        <variant.LibraryBody key={current} />
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
