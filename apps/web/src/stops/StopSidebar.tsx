import { useCallback, useEffect, useState } from "react";
import type { Item, StopDetail, StopId, TrailId } from "@unshelf/shared";
import { fetchTrailStop } from "../api";
import type { CurrentUser } from "../application-auth/types";
import { StopView } from "./StopView";

interface StopSidebarProps {
  stopId: StopId;
  trailId: TrailId;
  user: CurrentUser;
  onClose: () => void;
  onTrailChanged: () => Promise<void>;
}

/** Route-owned Stop detail, kept separate from the live Trail beside it. */
export function StopSidebar({
  stopId,
  trailId,
  user,
  onClose,
  onTrailChanged,
}: StopSidebarProps) {
  const [stop, setStop] = useState<StopDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setStop(await fetchTrailStop(user, trailId, stopId));
    } catch (caught: unknown) {
      setError(String(caught));
    }
  }, [stopId, trailId, user]);

  useEffect(() => {
    setStop(null);
    void load();
  }, [load]);

  const updateItem = (changed: Item) => {
    setStop((current) =>
      current
        ? {
            ...current,
            items: current.items.map((item) =>
              item.id === changed.id ? changed : item,
            ),
          }
        : current,
    );
    void onTrailChanged();
  };

  return (
    <aside
      className="stop-sidebar"
      aria-label={stop ? `${stop.name} details` : "Stop details"}
    >
      {!stop && !error && (
        <div
          className="stop-sidebar-skeleton"
          role="status"
          aria-label="Loading Stop details"
        >
          <span aria-hidden="true" />
          <span aria-hidden="true" />
          <span aria-hidden="true" />
        </div>
      )}
      {error && (
        <div role="alert">
          <p>Could not load this Stop: {error}</p>
          <button type="button" onClick={() => void load()}>
            Retry
          </button>
        </div>
      )}
      {stop && (
        <StopView
          stop={stop}
          user={user}
          onStopChanged={(changed) => {
            setStop(changed);
            void onTrailChanged();
          }}
          onItemChanged={updateItem}
          onClose={onClose}
          closeLabel="Close details"
          headingLevel={2}
        />
      )}
    </aside>
  );
}
