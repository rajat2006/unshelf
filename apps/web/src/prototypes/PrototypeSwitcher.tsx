/**
 * PROTOTYPE — throwaway. Shared floating variant switcher.
 *
 * Owns `?variant=` on the real URL (so a variant is shareable and survives
 * reload), cycles with the arrows or ← / →, and never renders in a production
 * build — a stray merge cannot ship this bar to a User.
 */
import { useEffect } from "react";

export function useVariant(keys: string[]): [string, (key: string) => void] {
  const fromUrl = new URLSearchParams(window.location.search).get("variant");
  const current = fromUrl && keys.includes(fromUrl) ? fromUrl : keys[0];

  const set = (key: string) => {
    const params = new URLSearchParams(window.location.search);
    params.set("variant", key);
    window.history.replaceState(null, "", `?${params.toString()}`);
    window.dispatchEvent(new Event("prototype:variant"));
  };

  return [current, set];
}

export function PrototypeSwitcher({
  variants,
  current,
  label,
  onSelect,
}: {
  variants: string[];
  current: string;
  label: string;
  onSelect: (key: string) => void;
}) {
  const index = variants.indexOf(current);
  const step = (delta: number) =>
    onSelect(variants[(index + delta + variants.length) % variants.length]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (event.key === "ArrowLeft") step(-1);
      if (event.key === "ArrowRight") step(1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (import.meta.env.PROD) return null;

  return (
    <div className="proto-switcher">
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
