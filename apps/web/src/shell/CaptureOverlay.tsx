import { useEffect, useRef, useState, type FormEvent } from "react";
import { ITEM_TYPES, Type } from "@unshelf/shared";
import { captureItem } from "../api";
import { useCurrentUser } from "../application-auth/useCurrentUser";
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
 * the Item into the Library and nowhere else — no Label, no Stage — and does not
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
      className="capture-dialog"
    >
      {isOpen && <CaptureComposer onCaptured={onCaptured} onClose={onClose} />}
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
    <form onSubmit={(event) => void submit(event)} className="capture-form">
      <div className="capture-form__heading">
        <h2 id="capture-heading">Capture</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="capture-form__close"
        >
          Close
        </button>
      </div>
      <p className="capture-form__intro">
        New Items land in your Library — never directly in a Learning Plan.
      </p>
      <label className="capture-form__field">
        Title
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="What did you find?"
          required
          autoFocus
          className="capture-form__input"
        />
      </label>
      <label className="capture-form__field">
        Type
        <select
          value={type}
          onChange={(event) => setType(event.target.value as Type | "")}
          required
          className="capture-form__input"
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
      <label className="capture-form__field">
        Source <span className="quiet-copy">(optional link)</span>
        <input
          value={source}
          onChange={(event) => setSource(event.target.value)}
          placeholder="Paste a link, or leave blank for an offline item"
          className="capture-form__input"
        />
      </label>
      <button
        type="submit"
        disabled={!canSubmit}
        className="capture-form__submit"
      >
        {saving ? "Adding…" : "Add to Library"}
      </button>
      {error && (
        <p role="alert" className="capture-form__error">
          Could not capture: {error}
        </p>
      )}
    </form>
  );
}
