import { useMemo, useState } from "react";
import { X } from "lucide-react";
import type { Item, Label, LabelId } from "@unshelf/shared";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CurrentUser } from "../application-auth/types";
import { applyLabelToItem, removeLabelFromItem } from "../api";

interface ItemLabelsProps {
  item: Item;
  labels: Label[];
  user: CurrentUser;
  onItemChanged: (item: Item) => void;
}

/** Keyboard-operable membership for Labels already available to the User. */
export function ItemLabels({
  item,
  labels,
  user,
  onItemChanged,
}: ItemLabelsProps) {
  const [selectedId, setSelectedId] = useState<LabelId | null>(null);
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

  return (
    <fieldset
      className="grid min-w-0 gap-2 border-0 p-0"
      aria-label={`Labels for ${item.title}`}
      disabled={pending}
    >
      <legend className="mb-2 text-sm font-medium">Labels</legend>
      <div className="flex flex-wrap gap-2">
        {item.labels.length === 0 && (
          <span className="text-sm text-muted-foreground">No Labels</span>
        )}
        {item.labels.map((label) => (
          <Button
            variant="secondary"
            size="compact"
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
            {label.name} <X aria-hidden="true" />
          </Button>
        ))}
      </div>
      <div className="flex min-w-0 flex-wrap gap-2">
        <Select
          value={selectedId ?? ""}
          disabled={pending || available.length === 0}
          onValueChange={(value) => setSelectedId(value as LabelId)}
        >
          <SelectTrigger
            className="min-w-0 flex-1"
            aria-label={`Add a Label to ${item.title}`}
          >
            <SelectValue
              placeholder={
                available.length > 0 ? "Choose Label" : "No Labels available"
              }
            />
          </SelectTrigger>
          <SelectContent>
            {available.map((label) => (
              <SelectItem value={label.id} key={label.id}>
                {label.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="secondary"
          disabled={!selectedId}
          onClick={() => void applySelected()}
        >
          Apply Label
        </Button>
      </div>
      {pending && (
        <p role="status" className="m-0 text-sm text-muted-foreground">
          Updating Labels…
        </p>
      )}
      {failed && <Alert>Couldn&apos;t update Labels. Try again.</Alert>}
    </fieldset>
  );
}
