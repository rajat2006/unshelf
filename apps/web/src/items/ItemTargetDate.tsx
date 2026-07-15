import { useState } from "react";
import type { Item } from "@unshelf/shared";
import { updateItemTargetDate } from "../api";
import type { CurrentUser } from "../auth";
import {
  ITEM_CONTROL_CAPTION_STYLE,
  ITEM_CONTROL_ERROR_STYLE,
  ITEM_CONTROL_LABEL_STYLE,
  ITEM_CONTROL_ROW_STYLE,
  ITEM_CONTROL_STYLE,
} from "./presentation";

interface ItemTargetDateProps {
  item: Item;
  user: CurrentUser;
  onChanged: (item: Item) => void;
}

/**
 * The Item-level Target date control — the User's soft "by when" (ADR-0005).
 *
 * A native date input carries set and change (and gives phones their own picker
 * for free); Clear appears only when there is a date to clear. The *past target*
 * state beside it is read from the Item the api just returned — never computed
 * here — so the whole app derives it in exactly one place. It states the fact and
 * stops: no red, no warning icon, no count of days. Unshelf never nags.
 */
export function ItemTargetDate({ item, user, onChanged }: ItemTargetDateProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function change(targetDate: string | null) {
    setSaving(true);
    setError(null);
    try {
      onChanged(await updateItemTargetDate(user, item.id, targetDate));
    } catch (caught: unknown) {
      setError(String(caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={ITEM_CONTROL_ROW_STYLE}>
      <label style={ITEM_CONTROL_LABEL_STYLE}>
        <span style={ITEM_CONTROL_CAPTION_STYLE}>Target</span>
        <input
          type="date"
          value={item.targetDate ?? ""}
          disabled={saving}
          onChange={(event) => void change(event.target.value || null)}
          style={ITEM_CONTROL_STYLE}
        />
        {item.targetDate && (
          <button
            type="button"
            disabled={saving}
            onClick={() => void change(null)}
            style={{ ...ITEM_CONTROL_STYLE, fontSize: "0.85rem" }}
          >
            Clear
          </button>
        )}
        {item.pastTarget && <PastTarget />}
        {saving && <span style={ITEM_CONTROL_CAPTION_STYLE}>Saving…</span>}
      </label>
      {error && (
        <div role="alert" style={ITEM_CONTROL_ERROR_STYLE}>
          Could not change the Target date: {error}
        </div>
      )}
    </div>
  );
}

/** The derived past-target state: something you notice, not something that shouts. */
function PastTarget() {
  return (
    <span style={{ ...ITEM_CONTROL_CAPTION_STYLE, opacity: 0.7 }}>
      Past target
    </span>
  );
}
