import { useCallback, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import type { Item, ItemId, LearningPlanId } from "@unshelf/shared";
import { useCurrentUser } from "../application-auth/useCurrentUser";
import { ItemSidebar } from "../items/ItemSidebar";
import { readItemBackgroundLocation } from "../items/item-route-state";
import { LibrarySurface } from "./LibrarySurface";
import { LearningPlanSurface } from "./LearningPlanSurface";
import { TodaySurface } from "./TodaySurface";

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
  const backgroundLearningPlanId = backgroundLocation?.pathname.match(
    /^\/plans\/([^/]+)(?:\/stages\/[^/]+)?$/,
  )?.[1] as LearningPlanId | undefined;
  const backgroundIsLibrary = backgroundLocation?.pathname === "/library";
  const backgroundIsToday = backgroundLocation?.pathname === "/today";
  const backgroundLibrarySearch = backgroundIsLibrary
    ? backgroundLocation.search
    : "";

  return (
    <div className="item-detail-layout">
      {backgroundLocation ? (
        backgroundLearningPlanId ? (
          <LearningPlanSurface
            key={`${
              changedItem
                ? `${changedItem.id}:${changedItem.status}`
                : "learningPlan"
            }:${placementVersion}`}
            learningPlanId={backgroundLearningPlanId}
          />
        ) : backgroundIsToday ? (
          <TodaySurface />
        ) : (
          <LibrarySurface
            itemOverrides={itemOverrides}
            onItemChanged={recordItemChange}
            labelFilterEnabled={backgroundIsLibrary}
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
      {itemId && (
        <ItemSidebar
          itemId={itemId as ItemId}
          user={user}
          itemOverride={changedItem}
          onItemChanged={recordItemChange}
          onPlacementChanged={() =>
            setPlacementVersion((current) => current + 1)
          }
          onClose={() => {
            void navigate(
              backgroundLocation
                ? `${backgroundLocation.pathname}${backgroundLocation.search}${backgroundLocation.hash}`
                : "/library",
            );
          }}
        />
      )}
    </div>
  );
}
