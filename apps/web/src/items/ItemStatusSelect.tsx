import { ITEM_STATUSES, Status, StatusMode, type Item } from "@unshelf/shared";
import type { CurrentUser } from "../application-auth/types";
import { STATUS_LABELS } from "./presentation";
import { useItemStatusMutation } from "./useItemStatusMutation";

interface ItemStatusSelectProps {
  item: Item;
  user: CurrentUser;
  onChanged: (item: Item) => void;
  structured?: boolean;
}

/** The Item-level Status control used everywhere an Item is rendered. */
export function ItemStatusSelect({
  item,
  user,
  onChanged,
  structured = false,
}: ItemStatusSelectProps) {
  const { changeStatus, error, saving } = useItemStatusMutation({
    item,
    user,
    onChanged,
  });

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
              onClick={() => void changeStatus(status)}
            >
              {STATUS_LABELS[status]}
            </button>
          ))}
        </div>
        {structured && !saving && (
          <span className="item-control-caption">
            {item.statusMode === StatusMode.Automatic
              ? "Status follows Parts"
              : "Status set manually"}
          </span>
        )}
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
