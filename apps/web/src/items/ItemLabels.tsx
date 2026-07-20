import { useMemo, useState } from "react";
import type { Item, Label, LabelId } from "@unshelf/shared";
import type { CurrentUser } from "../application-auth";
import {
  applyLabelToItem,
  createLabel,
  removeLabelFromItem,
} from "../api";

interface ItemLabelsProps {
  item: Item;
  labels: Label[];
  user: CurrentUser;
  onItemChanged: (item: Item) => void;
  onLabelCreated: (label: Label) => void;
}

/** Keyboard-operable Label membership and creation at the Library Item seam. */
export function ItemLabels({
  item,
  labels,
  user,
  onItemChanged,
  onLabelCreated,
}: ItemLabelsProps) {
  const [selectedId, setSelectedId] = useState<LabelId | null>(null);
  const [newName, setNewName] = useState("");
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const appliedIds = useMemo(
    () => new Set(item.labels.map((label) => label.id)),
    [item.labels],
  );
  const available = labels.filter((label) => !appliedIds.has(label.id));

  async function runLabelMutation<Result>(
    operation: () => Promise<Result>,
    onSuccess: (result: Result) => void,
  ) {
    setPending(true);
    setFailed(false);
    try {
      onSuccess(await operation());
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  }

  async function applySelected() {
    if (!selectedId) return;
    await runLabelMutation(
      () => applyLabelToItem(user, item.id, selectedId),
      (changed) => {
        onItemChanged(changed);
        setSelectedId(null);
      },
    );
  }

  async function createAndApply() {
    if (newName.trim().length === 0) return;
    await runLabelMutation(
      async () => {
        const label = await createLabel(user, newName);
        onLabelCreated(label);
        return applyLabelToItem(user, item.id, label.id);
      },
      (changed) => {
        onItemChanged(changed);
        setNewName("");
      },
    );
  }

  return (
    <fieldset
      className="item-labels"
      aria-label={`Labels for ${item.title}`}
      disabled={pending}
    >
      <legend>Labels</legend>
      <div className="item-labels__applied">
        {item.labels.length === 0 && (
          <span className="item-control-caption">No Labels</span>
        )}
        {item.labels.map((label) => (
          <button
            className="item-label-chip"
            type="button"
            key={label.id}
            aria-label={`Remove ${label.name}`}
            onClick={() =>
              void runLabelMutation(
                () => removeLabelFromItem(user, item.id, label.id),
                onItemChanged,
              )
            }
          >
            {label.name} <span aria-hidden="true">×</span>
          </button>
        ))}
      </div>
      <div className="item-labels__control">
        <select
          aria-label={`Add a Label to ${item.title}`}
          value={selectedId ?? ""}
          onChange={(event) =>
            setSelectedId(
              event.target.value
                ? (event.target.value as LabelId)
                : null,
            )
          }
        >
          <option value="">Choose Label</option>
          {available.map((label) => (
            <option value={label.id} key={label.id}>
              {label.name}
            </option>
          ))}
        </select>
        <button type="button" disabled={!selectedId} onClick={() => void applySelected()}>
          Apply Label
        </button>
      </div>
      <div className="item-labels__control">
        <input
          aria-label={`New Label for ${item.title}`}
          value={newName}
          onChange={(event) => setNewName(event.target.value)}
        />
        <button
          type="button"
          disabled={newName.trim().length === 0}
          onClick={() => void createAndApply()}
        >
          Create and apply Label
        </button>
      </div>
      {failed && <p role="alert">Couldn&apos;t update Labels</p>}
    </fieldset>
  );
}
