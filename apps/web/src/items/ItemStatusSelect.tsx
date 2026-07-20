import { useState } from "react";
import { ITEM_STATUSES, Status, type Item } from "@unshelf/shared";
import { updateItemStatus } from "../api";
import type { CurrentUser } from "../application-auth";
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
    <div className="item-control-row">
      <fieldset
        className="status-control"
        aria-label={`Status for ${item.title}`}
        disabled={saving}
      >
        <legend>Status</legend>
        <div className="status-control__choices">
          {ITEM_STATUSES.map((status) => (
            <button
              key={status}
              type="button"
              className={[
                status === item.status ? "is-active" : "",
                status === Status.Done ? "is-done" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              aria-pressed={status === item.status}
              onClick={() => void change(status)}
            >
              {STATUS_LABELS[status]}
            </button>
          ))}
        </div>
        {saving && <span className="item-control-caption">Saving…</span>}
      </fieldset>
      {error && (
        <div role="alert" className="item-control-error">
          Could not change Status: {error}
        </div>
      )}
    </div>
  );
}
