/**
 * PROTOTYPE — throwaway entry. Ticket #218, map #211.
 *
 * Three phone-width treatments of the settled open-Stop structure, switchable
 * through `?variant=A|B|C`. All use fixtures and in-memory mutations.
 *
 *   pnpm --filter @unshelf/web dev
 *   http://localhost:5173/prototype-phone-stop.html
 *
 * Served only by Vite in development. The production build inputs index.html,
 * so this entry cannot ship.
 */
import { createRoot } from "react-dom/client";
import "../../theme.css";
import { PrototypeSwitcher, useVariant } from "../PrototypeSwitcher";
import "./prototype-phone-stop.css";
import {
  VARIANT_NAMES,
  VariantA,
  VariantB,
  VariantC,
} from "./variants";

const VARIANTS = {
  A: VariantA,
  B: VariantB,
  C: VariantC,
};
const VARIANT_KEYS = Object.keys(VARIANTS);

function PrototypePage() {
  const [current, setCurrent] = useVariant(VARIANT_KEYS);
  const variantKey = current as keyof typeof VARIANTS;
  const Variant = VARIANTS[variantKey];
  const label = VARIANT_NAMES[variantKey];

  return (
    <>
      <Variant key={current} />
      <PrototypeSwitcher
        current={current}
        label={label}
        onSelect={setCurrent}
        variants={VARIANT_KEYS}
      />
    </>
  );
}

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("#root element not found");

createRoot(rootElement).render(<PrototypePage />);
