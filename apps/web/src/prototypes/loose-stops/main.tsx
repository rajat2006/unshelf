/**
 * PROTOTYPE — throwaway entry. Ticket #219, map #211.
 *
 * Three treatments of loose Stops on a populated Trail, switchable through
 * `?variant=A|B|C&count=1|5|15`. Fixtures only: no api, auth, or persistence.
 *
 *   pnpm --filter @unshelf/web dev
 *   http://localhost:5173/prototype-loose-stops.html?variant=A&count=5
 *
 * Served only in dev: `vite build` inputs `index.html`, so this never ships.
 */
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "../../theme.css";
import "../prototype.css";
import "./prototype-loose-stops.css";
import { PrototypeSwitcher, useVariant } from "../PrototypeSwitcher";
import { type LooseCount } from "./fixtures";
import { VARIANT_NAMES, VariantA, VariantB, VariantC } from "./variants";

const VARIANTS = {
  A: VariantA,
  B: VariantB,
  C: VariantC,
};
const VARIANT_KEYS = Object.keys(VARIANTS);
const COUNTS: readonly LooseCount[] = [1, 5, 15];

function countFromUrl(): LooseCount {
  const value = Number(
    new URLSearchParams(window.location.search).get("count"),
  );
  return COUNTS.includes(value as LooseCount) ? (value as LooseCount) : 5;
}

function Page() {
  const [, forceRender] = useState(0);
  const [current, setVariant] = useVariant(VARIANT_KEYS);
  const count = countFromUrl();

  useEffect(() => {
    const rerender = () => forceRender((value) => value + 1);
    window.addEventListener("prototype:variant", rerender);
    return () => window.removeEventListener("prototype:variant", rerender);
  }, []);

  const setCount = (nextCount: LooseCount) => {
    const params = new URLSearchParams(window.location.search);
    params.set("count", String(nextCount));
    window.history.replaceState(null, "", `?${params.toString()}`);
    window.dispatchEvent(new Event("prototype:variant"));
  };

  const key = current as keyof typeof VARIANTS;
  const Variant = VARIANTS[key];
  const label = VARIANT_NAMES[key];

  return (
    <main className="proto-page loose-proto-page">
      <header className="proto-page__head loose-proto-page-heading">
        <p className="loose-proto-eyebrow">Throwaway prototype · ticket #219</p>
        <h1>Do loose Stops read as a staging area—or canvas clutter?</h1>
        <p className="quiet-copy">
          Compare the untreated canvas with two lightweight treatments. Open a
          loose Stop, then try “Sequence this Stop.” Use ← / → to switch
          treatments.
        </p>

        <div className="loose-proto-scenario" aria-label="Loose Stop scenario">
          <span>Loose Stops</span>
          <div>
            {COUNTS.map((candidate) => (
              <button
                key={candidate}
                type="button"
                aria-pressed={candidate === count}
                onClick={() => setCount(candidate)}
              >
                {candidate}
              </button>
            ))}
          </div>
        </div>

        <p className="proto-variant-note">
          <strong>{current}</strong> — {label} · {count} loose{" "}
          {count === 1 ? "Stop" : "Stops"}
        </p>
      </header>

      <Variant key={`${current}-${count}`} looseCount={count} />

      <PrototypeSwitcher
        variants={VARIANT_KEYS}
        current={current}
        label={label}
        onSelect={setVariant}
      />
    </main>
  );
}

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("#root element not found");

createRoot(rootElement).render(<Page />);
