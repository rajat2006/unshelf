import { useCallback, useEffect, useState } from "react";
import type { Item } from "@unshelf/shared";
import { fetchAll } from "../api";
import { useCurrentUser } from "../auth";
import { AddItemForm } from "./AddItemForm";
import { AllItems } from "./AllItems";

/** The signed-in view: capture an Item, then browse it in All. */
export function CurrentSpace() {
  const user = useCurrentUser();
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setItems(await fetchAll(user));
      setError(null);
    } catch (caught: unknown) {
      setError(String(caught));
    }
  }, [user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <section style={{ marginTop: "2rem" }}>
      <AddItemForm user={user} onCaptured={refresh} />
      <AllItems items={items} error={error} />
    </section>
  );
}
