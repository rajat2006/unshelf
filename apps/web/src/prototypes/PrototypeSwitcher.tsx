/**
 * PROTOTYPE — throwaway. Shared floating variant switcher.
 *
 * The selected variant lives in `?variant=` so each option is shareable and
 * reload-stable. The switcher is absent from production builds.
 */
import { useEffect, useState } from "react";

interface VariantSwitcherProps {
  current: string;
  label: string;
  onSelect: (key: string) => void;
  variants: string[];
}

export function useVariant(
  variants: string[],
): [string, (key: string) => void] {
  const readVariant = () => {
    const candidate = new URLSearchParams(window.location.search).get(
      "variant",
    );
    return candidate && variants.includes(candidate) ? candidate : variants[0];
  };
  const [current, setCurrent] = useState(readVariant);

  useEffect(() => {
    const syncFromUrl = () => setCurrent(readVariant());
    window.addEventListener("popstate", syncFromUrl);
    return () => window.removeEventListener("popstate", syncFromUrl);
  });

  const select = (key: string) => {
    const params = new URLSearchParams(window.location.search);
    params.set("variant", key);
    window.history.replaceState(null, "", `?${params.toString()}`);
    setCurrent(key);
  };

  return [current, select];
}

export function PrototypeSwitcher({
  current,
  label,
  onSelect,
  variants,
}: VariantSwitcherProps) {
  const currentIndex = variants.indexOf(current);
  const step = (delta: number) => {
    const nextIndex =
      (currentIndex + delta + variants.length) % variants.length;
    onSelect(variants[nextIndex]);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable
      ) {
        return;
      }
      if (event.key === "ArrowLeft") step(-1);
      if (event.key === "ArrowRight") step(1);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  if (import.meta.env.PROD) return null;

  return (
    <div className="phone-proto-switcher">
      <button
        type="button"
        aria-label="Previous variant"
        onClick={() => step(-1)}
      >
        ←
      </button>
      <span>
        {current} — {label}
      </span>
      <button type="button" aria-label="Next variant" onClick={() => step(1)}>
        →
      </button>
    </div>
  );
}
