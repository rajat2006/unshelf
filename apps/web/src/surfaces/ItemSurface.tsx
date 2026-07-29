import { useCallback, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import type { Item, ItemId, TrailId } from "@unshelf/shared";
import { useCurrentUser } from "../application-auth/useCurrentUser";
import { ItemSidebar } from "../items/ItemSidebar";
import { readItemBackgroundLocation } from "../items/item-route-state";
import { LibrarySurface } from "./LibrarySurface";
import { TrailSurface } from "./TrailSurface";

/**
 * An Item at its one canonical URL (design spec §4) — `/items/:itemId`, the same
 * record regardless of the Stop or Trail it was reached through. This slice
 * opens as a route-owned right sidebar over its canonical home, the Library.
 */
export function ItemSurface() {
  const { itemId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const user = useCurrentUser();
  const [changedItems, setChangedItems] = useState<Record<string, Item>>({});
  const recordItemChange = useCallback((changed: Item) => {
    setChangedItems((current) => ({ ...current, [changed.id]: changed }));
  }, []);
  const changedItem = itemId ? changedItems[itemId] : undefined;
  const itemOverrides = Object.values(changedItems);
  const backgroundLocation = readItemBackgroundLocation(location.state);
  const backgroundTrailId = backgroundLocation?.pathname.match(
    /^\/trails\/([^/]+)$/,
  )?.[1] as TrailId | undefined;
  const backgroundIsLibrary = backgroundLocation?.pathname === "/library";
  const backgroundLibrarySearch = backgroundIsLibrary
    ? backgroundLocation.search
    : "";

  return (
    <div className="item-detail-layout">
      {backgroundLocation ? (
        backgroundTrailId ? (
          <TrailSurface
            key={
              changedItem ? `${changedItem.id}:${changedItem.status}` : "trail"
            }
            trailId={backgroundTrailId}
          />
        ) : (
          <LibrarySurface
            itemOverrides={itemOverrides}
            onItemChanged={recordItemChange}
            labelFilterEnabled={backgroundIsLibrary}
            labelFilterSearch={backgroundLibrarySearch}
            onLabelFilterChange={(next) =>
              navigate({
                pathname: "/library",
                search: next.size > 0 ? `?${next.toString()}` : "",
              })
            }
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
          onClose={() =>
            backgroundLocation ? navigate(-1) : navigate("/library")
          }
        />
      )}
    </div>
  );
}
