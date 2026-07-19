import { useState } from "react";
import { ITEM_STATUSES, type Item, type Status } from "@unshelf/shared";
import { updateItemStatus } from "../api";
import type { CurrentUser } from "../application-auth";
import {
  ITEM_CONTROL_CAPTION_STYLE,
  ITEM_CONTROL_ERROR_STYLE,
  ITEM_CONTROL_LABEL_STYLE,
  ITEM_CONTROL_ROW_STYLE,
  ITEM_CONTROL_STYLE,
  STATUS_LABELS,
} from "./presentation";

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
    <div style={ITEM_CONTROL_ROW_STYLE}>
      <label style={ITEM_CONTROL_LABEL_STYLE}>
        <span style={ITEM_CONTROL_CAPTION_STYLE}>Status</span>
        <select
          value={item.status}
          disabled={saving}
          onChange={(event) => void change(event.target.value as Status)}
          style={ITEM_CONTROL_STYLE}
        >
          {ITEM_STATUSES.map((status) => (
            <option key={status} value={status}>
              {STATUS_LABELS[status]}
            </option>
          ))}
        </select>
        {saving && <span style={ITEM_CONTROL_CAPTION_STYLE}>Saving…</span>}
      </label>
      {error && (
        <div role="alert" style={ITEM_CONTROL_ERROR_STYLE}>
          Could not change Status: {error}
        </div>
      )}
    </div>
  );
}
