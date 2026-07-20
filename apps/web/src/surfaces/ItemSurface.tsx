import { useCallback, useState } from "react";
import {
  useLocation,
  useNavigate,
  useParams,
  type Location,
} from "react-router";
import type { Item, ItemId, TrailId } from "@unshelf/shared";
import { useCurrentUser } from "../application-auth";
import { ItemSidebar } from "../items/ItemSidebar";
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
  const backgroundLocation = readBackgroundLocation(location.state);
  const backgroundTrailId = backgroundLocation?.pathname.match(
    /^\/trails\/([^/]+)$/,
  )?.[1] as TrailId | undefined;

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

function readBackgroundLocation(state: unknown): Location | null {
  if (typeof state !== "object" || state === null) return null;
  const candidate = (state as { backgroundLocation?: unknown })
    .backgroundLocation;
  if (typeof candidate !== "object" || candidate === null) return null;
  return typeof (candidate as { pathname?: unknown }).pathname === "string"
    ? (candidate as Location)
    : null;
}
