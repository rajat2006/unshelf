import {
  ITEM_STATUSES,
  StatusMode,
  type Item,
  type Status,
} from "@unshelf/shared";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import type { CurrentUser } from "../application-auth/types";
import { ItemStatusBadge } from "./ItemStatusBadge";
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
  const { changeStatus, failedStatus, saving } = useItemStatusMutation({
    item,
    user,
    onChanged,
  });

  return (
    <Field className="max-w-56">
      <FieldLabel>Status</FieldLabel>
      <Select
        value={item.status}
        disabled={saving}
        onValueChange={(status: Status) => void changeStatus(status)}
      >
        <SelectTrigger
          aria-label={`Status for ${item.title}`}
          className="min-h-11 w-full sm:min-h-10"
        >
          <ItemStatusBadge status={item.status} />
        </SelectTrigger>
        <SelectContent>
          {ITEM_STATUSES.map((status) => (
            <SelectItem key={status} value={status}>
              <ItemStatusBadge status={status} />
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {structured && !saving && (
        <FieldDescription>
          {item.statusMode === StatusMode.Automatic
            ? "Status follows Parts"
            : "Status set manually"}
        </FieldDescription>
      )}
      {saving && (
        <FieldDescription role="status">Saving Status…</FieldDescription>
      )}
      {failedStatus !== null && (
        <Alert className="grid gap-2">
          <span>
            Couldn’t update Status. Your previous Status is unchanged.
          </span>
          <Button
            type="button"
            variant="secondary"
            size="compact"
            className="min-h-11 w-fit sm:min-h-8"
            onClick={() => void changeStatus(failedStatus)}
          >
            Retry Status
          </Button>
        </Alert>
      )}
    </Field>
  );
}
