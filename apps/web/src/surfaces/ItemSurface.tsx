import { useCallback, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import type { Item, ItemId } from "@unshelf/shared";
import { useCurrentUser } from "../application-auth/useCurrentUser";
import { ItemSidebar } from "../items/ItemSidebar";
import type { ItemPlacementChange } from "../items/ItemPlacements";
import {
  itemBackgroundSurface,
  readItemBackgroundLocation,
} from "../items/item-route-state";
import { LibrarySurface } from "./LibrarySurface";
import { LearningPlanSurface } from "./LearningPlanSurface";
import { TodaySurface } from "./TodaySurface";
import { DailyFocusHistorySurface } from "./DailyFocusHistorySurface";

/**
 * An Item at its one canonical URL (design spec §4) — `/items/:itemId`, the same
 * record regardless of where it was reached. The route-owned sidebar keeps a
 * live Today or Learning Plan room underneath when navigation supplied one;
 * a cold deep link opens over the Item's canonical Library home.
 */
export function ItemSurface() {
  const { itemId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const user = useCurrentUser();
  const [changedItems, setChangedItems] = useState<Record<string, Item>>({});
  const [placementVersion, setPlacementVersion] = useState(0);
  const recordItemChange = useCallback((changed: Item) => {
    setChangedItems((current) => ({ ...current, [changed.id]: changed }));
  }, []);
  const changedItem = itemId ? changedItems[itemId] : undefined;
  const itemOverrides = Object.values(changedItems);
  const backgroundLocation = readItemBackgroundLocation(location.state);
  const backgroundSurface = itemBackgroundSurface(backgroundLocation);
  const backgroundLibrarySearch =
    backgroundSurface.kind === "library" && backgroundLocation
      ? backgroundLocation.search
      : "";
  const handlePlacementChange = (change: ItemPlacementChange) => {
    if (
      change.operation === "remove" &&
      backgroundSurface.kind === "plan" &&
      backgroundSurface.learningPlanId === change.learningPlanId &&
      backgroundLocation
    ) {
      void navigate(
        `${backgroundLocation.pathname}${backgroundLocation.search}${backgroundLocation.hash}`,
      );
      return;
    }

    setPlacementVersion((current) => current + 1);
  };

  return (
    <div className="grid min-w-0 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(22rem,28rem)]">
      {itemId && (
        <ItemSidebar
          itemId={itemId as ItemId}
          user={user}
          itemOverride={changedItem}
          onItemChanged={recordItemChange}
          onPlacementChanged={handlePlacementChange}
          onClose={() => {
            void navigate(
              backgroundLocation
                ? `${backgroundLocation.pathname}${backgroundLocation.search}${backgroundLocation.hash}`
                : "/library",
            );
          }}
        />
      )}
      {backgroundLocation ? (
        backgroundSurface.kind === "plan" ? (
          <LearningPlanSurface
            key={`${
              changedItem
                ? `${changedItem.id}:${changedItem.status}`
                : "learningPlan"
            }:${placementVersion}`}
            learningPlanId={backgroundSurface.learningPlanId}
          />
        ) : backgroundSurface.kind === "today" ? (
          <TodaySurface />
        ) : backgroundSurface.kind === "history" ? (
          <DailyFocusHistorySurface selectedDate={backgroundSurface.date} />
        ) : (
          <LibrarySurface
            itemOverrides={itemOverrides}
            onItemChanged={recordItemChange}
            labelFilterEnabled={backgroundSurface.kind === "library"}
            labelFilterSearch={backgroundLibrarySearch}
            onLabelFilterChange={(next) => {
              void navigate({
                pathname: "/library",
                search: next.size > 0 ? `?${next.toString()}` : "",
              });
            }}
          />
        )
      ) : (
        <LibrarySurface
          itemOverrides={itemOverrides}
          onItemChanged={recordItemChange}
        />
      )}
    </div>
  );
}
