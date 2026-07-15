import { useState, type CSSProperties, type FormEvent } from "react";
import { ITEM_TYPES, Type } from "@unshelf/shared";
import { captureItem } from "../api";
import type { CurrentUser } from "../auth";
import { TYPE_LABELS } from "./presentation";

interface AddItemFormProps {
  user: CurrentUser;
  onCaptured: () => Promise<void>;
}

const inputStyle: CSSProperties = {
  fontSize: "1rem",
  padding: "0.6rem 0.75rem",
  minHeight: "44px",
  boxSizing: "border-box",
  width: "100%",
};

const labelStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.25rem",
};

/**
 * The one uniform capture form (ADR-0007): required title, a chosen Type with no
 * default, and optional Source. A link and an offline title use the same insert.
 */
export function AddItemForm({ user, onCaptured }: AddItemFormProps) {
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
      setTitle("");
      setType("");
      setSource("");
      await onCaptured();
    } catch (caught: unknown) {
      setError(String(caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}
    >
      <h2 style={{ margin: 0, fontSize: "1.2rem" }}>Add an item</h2>
      <label style={labelStyle}>
        Title
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="What did you find?"
          required
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
        Source <span style={{ opacity: 0.6 }}>(optional link)</span>
        <input
          value={source}
          onChange={(event) => setSource(event.target.value)}
          placeholder="Paste a link, or leave blank for an offline item"
          style={inputStyle}
        />
      </label>
      <button
        type="submit"
        disabled={!canSubmit}
        style={{
          fontSize: "1rem",
          padding: "0.75rem 1.25rem",
          minHeight: "44px",
          cursor: canSubmit ? "pointer" : "not-allowed",
          alignSelf: "flex-start",
        }}
      >
        {saving ? "Adding…" : "Add to All"}
      </button>
      {error && <p style={{ color: "crimson" }}>Could not add: {error}</p>}
    </form>
  );
}
