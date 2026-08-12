import { useState } from "react";
import { type Item, type Status } from "@unshelf/shared";
import { updateItemStatus } from "../api";
import type { CurrentUser } from "../application-auth/types";

interface ItemStatusMutationInput {
  item: Item;
  user: CurrentUser;
  onChanged: (item: Item) => void;
}

/** Shared request state for Item Status controls with different presentations. */
export function useItemStatusMutation({
  item,
  user,
  onChanged,
}: ItemStatusMutationInput) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const changeStatus = async (status: Status) => {
    setSaving(true);
    setError(null);
    try {
      onChanged(await updateItemStatus(user, item.id, status));
    } catch (caught: unknown) {
      setError(String(caught));
    } finally {
      setSaving(false);
    }
  };

  return { changeStatus, error, saving };
}
