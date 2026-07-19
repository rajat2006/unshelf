import { useCallback, useEffect, useState } from "react";
import type { Item, Stop, StopDetail, TrailView } from "@unshelf/shared";
import { fetchAll, fetchStops, fetchTrail } from "../api";
import { useCurrentUser } from "../application-auth";
import { StopsSection } from "../stops/StopsSection";
import { TrailSection } from "../trail/TrailSection";
import { AddItemForm } from "./AddItemForm";
import { AllItems } from "./AllItems";

/**
 * The signed-in view: capture an Item, browse it in All, and group Items into
 * Stops.
 *
 * It owns the space's state because All and the open Stop show the *same* Items —
 * one record seen twice, not two records (ADR-0003, ADR-0004). Keeping them in one
 * place is what lets `replaceItem` put a changed Item back everywhere it is on
 * screen at once, so a Status changed in All is already changed in the Stop: the
 * model's "one Status, shared by every Stop" holds in the UI without a refetch.
 */
export function CurrentSpace() {
  const user = useCurrentUser();
  const [items, setItems] = useState<Item[] | null>(null);
  const [stops, setStops] = useState<Stop[] | null>(null);
  const [openStop, setOpenStop] = useState<StopDetail | null>(null);
  const [trail, setTrail] = useState<TrailView | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [allItems, allStops, theTrail] = await Promise.all([
        fetchAll(user),
        fetchStops(user),
        fetchTrail(user),
      ]);
      setItems(allItems);
      setStops(allStops);
      setTrail(theTrail);
      setError(null);
    } catch (caught: unknown) {
      setError(String(caught));
    }
  }, [user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /**
   * Put a changed Item back wherever it is shown — All and the open Stop alike.
   * The api returned one Item; both views are just places that Item appears, so
   * neither is allowed its own copy of the answer.
   */
  const replaceItem = useCallback((changed: Item) => {
    const replaceIn = (current: Item[]) =>
      current.map((item) => (item.id === changed.id ? changed : item));

    setItems((current) => (current ? replaceIn(current) : null));
    setOpenStop((current) =>
      current ? { ...current, items: replaceIn(current.items) } : null,
    );
  }, []);

  /** Adopt a Stop's new contents, but only if it is the one on screen. */
  const replaceStop = useCallback((changed: StopDetail) => {
    setOpenStop((current) => (current?.id === changed.id ? changed : current));
  }, []);

  return (
    <section style={{ marginTop: "2rem" }}>
      <AddItemForm user={user} onCaptured={refresh} />
      <StopsSection
        stops={stops}
        openStop={openStop}
        error={error}
        user={user}
        onStopsChanged={refresh}
        onStopOpened={setOpenStop}
        onStopChanged={replaceStop}
        onItemChanged={replaceItem}
      />
      <TrailSection
        trail={trail}
        error={error}
        user={user}
        onTrailChanged={setTrail}
        onRefresh={refresh}
      />
      <AllItems
        items={items}
        stops={stops}
        error={error}
        user={user}
        onItemChanged={replaceItem}
        onStopChanged={replaceStop}
      />
    </section>
  );
}
