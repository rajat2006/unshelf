/**
 * PROTOTYPE — throwaway entry. Ticket #208, map #211.
 *
 * Three variants for how the open Stop panel transitions from empty to
 * populated, switchable through `?variant=A|B|C` on the real Trail/sidebar
 * frame. Fixtures only: no api, no auth, no persistence.
 *
 *   pnpm --filter @unshelf/web dev
 *   http://localhost:5173/prototype-empty-stop.html
 *
 * Served only in dev: `vite build` inputs `index.html`, so this never ships.
 */
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router";
import "../../theme.css";
import "../prototype.css";
import "./prototype-empty-stop.css";
import { PrototypeSwitcher, useVariant } from "../PrototypeSwitcher";
import { VARIANT_NAMES, VariantA, VariantB, VariantC } from "./variants";

const VARIANTS = {
  A: VariantA,
  B: VariantB,
  C: VariantC,
};
const KEYS = Object.keys(VARIANTS);

function Page() {
  const [, forceRender] = useState(0);
  const [current, setVariant] = useVariant(KEYS);

  useEffect(() => {
    const rerender = () => forceRender((count) => count + 1);
    window.addEventListener("prototype:variant", rerender);
    return () => window.removeEventListener("prototype:variant", rerender);
  }, []);

  const key = current as keyof typeof VARIANTS;
  const Variant = VARIANTS[key];
  const label = VARIANT_NAMES[key];

  return (
    <main className="proto-page empty-proto-page">
      <header className="proto-page__head">
        <p className="empty-proto-eyebrow">Throwaway prototype · ticket #208</p>
        <h1>What happens after an empty Stop gets its first Item?</h1>
        <p className="quiet-copy">
          Add two or three Items, then compare variants with the bar below or
          the ← / → keys. Each switch resets the Stop so you can feel the
          transition again.
        </p>
        <p className="proto-variant-note">
          <strong>{current}</strong> — {label}
        </p>
      </header>

      <Variant key={current} />

      <PrototypeSwitcher
        variants={KEYS}
        current={current}
        label={label}
        onSelect={setVariant}
      />
    </main>
  );
}

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("#root element not found");

createRoot(rootElement).render(
  <MemoryRouter>
    <Page />
  </MemoryRouter>,
);
