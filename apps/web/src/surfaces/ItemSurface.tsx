import { useCallback, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import type { Item, ItemId, LearningPlanId, StageId } from "@unshelf/shared";
import { useCurrentUser } from "../application-auth/useCurrentUser";
import { ItemSidebar } from "../items/ItemSidebar";
import { readItemBackgroundLocation } from "../items/item-route-state";
import { LibrarySurface } from "./LibrarySurface";
import { LearningPlanSurface } from "./LearningPlanSurface";

/**
 * An Item at its one canonical URL (design spec §4) — `/items/:itemId`, the same
 * record regardless of the Stage or LearningPlan it was reached through. This slice
 * opens as a route-owned right sidebar over its canonical home, the Library.
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
  const backgroundStageId = backgroundLocation?.pathname.match(
    /^\/plans\/[^/]+\/stages\/([^/]+)$/,
  )?.[1] as StageId | undefined;
  const backgroundIsLibrary = backgroundLocation?.pathname === "/library";
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
            stageId={backgroundStageId}
          />
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
