import { Status, type Item } from "@unshelf/shared";
import { Check, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CurrentUser } from "../application-auth/types";
import { useItemStatusMutation } from "./useItemStatusMutation";

interface ItemDoneToggleProps {
  item: Item;
  user: CurrentUser;
  onChanged: (item: Item) => void;
  iconOnly?: boolean;
}

/** Compact done/reopen action shared by current-focus presentations. */
export function ItemDoneToggle({
  item,
  user,
  onChanged,
  iconOnly = false,
}: ItemDoneToggleProps) {
  const nextStatus =
    item.status === Status.Done ? Status.NotStarted : Status.Done;
  const { changeStatus, error, saving } = useItemStatusMutation({
    item,
    user,
    onChanged,
  });

  return (
    <>
      <Button
        type="button"
        variant={
          iconOnly || item.status === Status.Done ? "secondary" : "primary"
        }
        size={iconOnly ? "icon-compact" : "compact"}
        className={
          iconOnly ? "min-h-11 sm:min-h-8" : "min-h-11 min-w-28 sm:min-h-8"
        }
        loading={saving}
        loadingLabel="Saving…"
        onClick={() => void changeStatus(nextStatus)}
        aria-label={
          item.status === Status.Done
            ? `Reopen ${item.title}`
            : `Mark ${item.title} done`
        }
      >
        {iconOnly && item.status !== Status.Done ? (
          <span className="size-4 rounded-full border border-muted-foreground" />
        ) : item.status === Status.Done ? (
          <RotateCcw aria-hidden="true" />
        ) : (
          <Check aria-hidden="true" />
        )}
        {!iconOnly && (item.status === Status.Done ? "Reopen" : "Done")}
      </Button>
      {error && (
        <span className="sr-only" role="alert">
          Couldn&apos;t update Item status.
        </span>
      )}
    </>
  );
}
