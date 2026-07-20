import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
} from "react";
import { ITEM_TYPES, Type } from "@unshelf/shared";
import { captureItem } from "../api";
import { useCurrentUser } from "../application-auth";
import { TYPE_LABELS } from "../items/presentation";

interface CaptureOverlayProps {
  isOpen: boolean;
  /** The overlay closed (Escape, backdrop, Close, or a successful capture). */
  onClose: () => void;
  /** A capture succeeded — surfaces showing the store should refresh. */
  onCaptured: () => void;
}

/**
 * The Capture composer (ADR-0014, design spec §3). A non-navigating overlay over
 * whatever surface opened it, carrying the one uniform intake (ADR-0007): required
 * title, an explicitly chosen Type, an optional Source stored verbatim. It files
 * the Item into the Library and nowhere else — no Label, no Stop — and does not
 * navigate, so the User stays where they were.
 *
 * A native `<dialog>` gives modal semantics for free: Escape closes it, focus is
 * contained, and the rest of the app is inert while it is open — the browser and
 * assistive-technology conventions this overlay must not fight. Validation and
 * request failures stay inside it, so a bad capture never destroys the surface
 * beneath.
 */
export function CaptureOverlay({
  isOpen,
  onClose,
  onCaptured,
}: CaptureOverlayProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isOpen && !dialog.open) dialog.showModal();
    else if (!isOpen && dialog.open) dialog.close();
  }, [isOpen]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="capture-heading"
      onClose={onClose}
      onClick={(event) => {
        // A click on the backdrop (the dialog element itself) dismisses it.
        if (event.target === dialogRef.current) onClose();
      }}
      style={dialogStyle}
    >
      {isOpen && (
        <CaptureComposer onCaptured={onCaptured} onClose={onClose} />
      )}
    </dialog>
  );
}

function CaptureComposer({
  onCaptured,
  onClose,
}: {
  onCaptured: () => void;
  onClose: () => void;
}) {
  const user = useCurrentUser();
  const [title, setTitle] = useState("");
  const [type, setType] = useState<Type | "">("");
  const [source, setSource] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = title.trim().length > 0 && type !== "" && !saving;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (type === "" || title.trim().length === 0) return;
    setSaving(true);
    setError(null);
    try {
      await captureItem(user, { title, type, source });
      onCaptured();
      onClose();
    } catch (caught: unknown) {
      setError(String(caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} style={formStyle}>
      <div style={{ display: "flex", alignItems: "baseline", gap: "var(--space-3)" }}>
        <h2 id="capture-heading" style={{ margin: 0, fontSize: "1.2rem" }}>
          Capture
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          style={closeStyle}
        >
          Close
        </button>
      </div>
      <p style={{ margin: 0, color: "var(--muted)", fontSize: "0.9rem" }}>
        New items land in your Library — never directly in a Trail.
      </p>
      <label style={labelStyle}>
        Title
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="What did you find?"
          required
          autoFocus
          style={inputStyle}
        />
      </label>
      <label style={labelStyle}>
        Type
        <select
          value={type}
          onChange={(event) => setType(event.target.value as Type | "")}
          required
          style={inputStyle}
        >
          <option value="" disabled>
            Choose a type…
          </option>
          {ITEM_TYPES.map((itemType) => (
            <option key={itemType} value={itemType}>
              {TYPE_LABELS[itemType]}
            </option>
          ))}
        </select>
      </label>
      <label style={labelStyle}>
        Source <span style={{ color: "var(--muted)" }}>(optional link)</span>
        <input
          value={source}
          onChange={(event) => setSource(event.target.value)}
          placeholder="Paste a link, or leave blank for an offline item"
          style={inputStyle}
        />
      </label>
      <button type="submit" disabled={!canSubmit} style={submitStyle(canSubmit)}>
        {saving ? "Adding…" : "Add to Library"}
      </button>
      {error && (
        <p role="alert" style={{ margin: 0, color: "var(--accent)" }}>
          Could not capture: {error}
        </p>
      )}
    </form>
  );
}

const dialogStyle: CSSProperties = {
  width: "min(28rem, calc(100vw - var(--space-5)))",
  border: "1px solid var(--line)",
  borderRadius: "var(--radius-3)",
  background: "var(--surface)",
  color: "var(--ink)",
  padding: "var(--space-5)",
};

const formStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--space-3)",
};

const labelStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--space-1)",
};

const inputStyle: CSSProperties = {
  font: "inherit",
  padding: "var(--space-2) var(--space-3)",
  minHeight: "44px",
  boxSizing: "border-box",
  width: "100%",
  color: "var(--ink)",
  background: "var(--field-bg)",
  border: "1px solid var(--field-line)",
  borderRadius: "var(--radius-1)",
};

const closeStyle: CSSProperties = {
  font: "inherit",
  marginLeft: "auto",
  color: "var(--muted)",
  background: "transparent",
  border: "none",
  cursor: "pointer",
  padding: "var(--space-1) var(--space-2)",
  borderRadius: "var(--radius-1)",
};

const submitStyle = (canSubmit: boolean): CSSProperties => ({
  font: "inherit",
  fontWeight: 550,
  padding: "var(--space-3) var(--space-4)",
  minHeight: "44px",
  cursor: canSubmit ? "pointer" : "not-allowed",
  alignSelf: "flex-start",
  color: "var(--on-accent)",
  background: "var(--accent)",
  border: "none",
  borderRadius: "var(--radius-2)",
  opacity: canSubmit ? 1 : 0.6,
});
