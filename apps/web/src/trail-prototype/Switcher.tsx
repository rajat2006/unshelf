/** PROTOTYPE (issue #21) — throwaway floating variant switcher. See ./README.md. */
import { useEffect } from "react";

export interface VariantMeta {
  key: string;
  name: string;
}

export function Switcher({
  variants,
  current,
  onChange,
}: {
  variants: VariantMeta[];
  current: string;
  onChange: (key: string) => void;
}) {
  const idx = Math.max(0, variants.findIndex((v) => v.key === current));
  const go = (delta: number) =>
    onChange(variants[(idx + delta + variants.length) % variants.length].key);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      const typing =
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        (el as HTMLElement | null)?.isContentEditable;
      if (typing) return;
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div
      style={{
        position: "fixed",
        bottom: "1rem",
        left: "50%",
        transform: "translateX(-50%)",
        display: "flex",
        alignItems: "center",
        gap: "0.75rem",
        padding: "0.5rem 0.75rem",
        background: "#111",
        color: "#fff",
        borderRadius: "999px",
        boxShadow: "0 6px 24px rgba(0,0,0,0.35)",
        fontFamily: "system-ui, sans-serif",
        fontSize: "0.85rem",
        zIndex: 1000,
      }}
    >
      <button type="button" onClick={() => go(-1)} style={arrow}>
        ←
      </button>
      <span style={{ minWidth: "14rem", textAlign: "center" }}>
        <strong>{variants[idx].key}</strong> — {variants[idx].name}
      </span>
      <button type="button" onClick={() => go(1)} style={arrow}>
        →
      </button>
    </div>
  );
}

const arrow: React.CSSProperties = {
  background: "#333",
  color: "#fff",
  border: "none",
  borderRadius: "999px",
  width: "2rem",
  height: "2rem",
  cursor: "pointer",
  fontSize: "1rem",
};
