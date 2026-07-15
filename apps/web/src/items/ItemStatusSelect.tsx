import { useState } from "react";
import { ITEM_STATUSES, type Item, type Status } from "@unshelf/shared";
import { updateItemStatus } from "../api";
import type { CurrentUser } from "../auth";
import { STATUS_LABELS } from "./presentation";

interface ItemStatusSelectProps {
  item: Item;
  user: CurrentUser;
  onChanged: (item: Item) => void;
}

/** The Item-level Status control used everywhere an Item is rendered. */
export function ItemStatusSelect({
  item,
  user,
  onChanged,
}: ItemStatusSelectProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function change(status: Status) {
    setSaving(true);
    setError(null);
    try {
      onChanged(await updateItemStatus(user, item.id, status));
    } catch (caught: unknown) {
      setError(String(caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ marginTop: "0.35rem" }}>
      <label
        style={{
          display: "inline-flex",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "0.5rem",
        }}
      >
        <span style={{ fontSize: "0.85rem" }}>Status</span>
        <select
          value={item.status}
          disabled={saving}
          onChange={(event) => void change(event.target.value as Status)}
          style={{
            fontSize: "1rem",
            minHeight: "44px",
            maxWidth: "100%",
            padding: "0.5rem",
          }}
        >
          {ITEM_STATUSES.map((status) => (
            <option key={status} value={status}>
              {STATUS_LABELS[status]}
            </option>
          ))}
        </select>
        {saving && <span style={{ fontSize: "0.85rem" }}>Saving…</span>}
      </label>
      {error && (
        <div role="alert" style={{ color: "crimson", fontSize: "0.85rem" }}>
          Could not change Status: {error}
        </div>
      )}
    </div>
  );
}
