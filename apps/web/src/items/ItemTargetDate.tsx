import { useState } from "react";
import type { Item } from "@unshelf/shared";
import { updateItemTargetDate } from "../api";
import type { CurrentUser } from "../application-auth/types";

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
 * stages: no red, no warning icon, no count of days. Unshelf never nags.
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
    <div className="item-control-row">
      <label className="item-control-label">
        <span className="item-control-caption">Target date</span>
        <input
          aria-label={`Target date for ${item.title}`}
          type="date"
          value={item.targetDate ?? ""}
          disabled={saving}
          onChange={(event) => void change(event.target.value || null)}
          className="item-control-input"
        />
        {item.targetDate && (
          <button
            type="button"
            disabled={saving}
            onClick={() => void change(null)}
            className="item-control-button"
          >
            Clear
          </button>
        )}
        {item.pastTarget && <PastTarget />}
        {saving && <span className="item-control-caption">Saving…</span>}
      </label>
      {error && (
        <div role="alert" className="item-control-error">
          Could not change the Target date: {error}
        </div>
      )}
    </div>
  );
}

/** The derived past-target state: something you notice, not something that shouts. */
function PastTarget() {
  return <span className="past-target">Past target</span>;
}
