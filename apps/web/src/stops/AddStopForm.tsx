import { useState, type FormEvent } from "react";
import { createStop } from "../api";
import type { CurrentUser } from "../application-auth";

interface AddStopFormProps {
  user: CurrentUser;
  onCreated: () => Promise<void>;
}

/**
 * Create a Stop: a name, and nothing else to decide. There is no kind to pick
 * (ADR-0004) — the same Stop serves "Learn CSS" and "Build the API" — and no
 * Items to choose up front, because a Stop is filled by pulling from All.
 */
export function AddStopForm({ user, onCreated }: AddStopFormProps) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = name.trim().length > 0 && !saving;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    setSaving(true);
    setError(null);
    try {
      await createStop(user, { name });
      setName("");
      await onCreated();
    } catch (caught: unknown) {
      setError(String(caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} style={{ marginTop: "0.75rem" }}>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "0.5rem",
          alignItems: "center",
        }}
      >
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Name a stop — a topic or a project"
          aria-label="Stop name"
          required
          style={{
            fontSize: "1rem",
            padding: "0.6rem 0.75rem",
            minHeight: "44px",
            boxSizing: "border-box",
            flex: "1 1 14rem",
            minWidth: 0,
          }}
        />
        <button
          type="submit"
          disabled={!canSubmit}
          style={{
            fontSize: "1rem",
            padding: "0.75rem 1.25rem",
            minHeight: "44px",
            cursor: canSubmit ? "pointer" : "not-allowed",
          }}
        >
          {saving ? "Creating…" : "Create stop"}
        </button>
      </div>
      {error && (
        <p role="alert" style={{ color: "crimson", fontSize: "0.85rem" }}>
          Could not create the stop: {error}
        </p>
      )}
    </form>
  );
}
