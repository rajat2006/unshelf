import { useCallback, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import type { Item, ItemId } from "@unshelf/shared";
import { useCurrentUser } from "../application-auth/useCurrentUser";
import { deleteItem, ItemRequestError } from "../api";
import { ItemSidebar } from "../items/ItemSidebar";
import type { ItemPlacementChange } from "../items/ItemPlacements";
import {
  itemBackgroundSurface,
  itemRecoveryRouteState,
  readItemBackgroundLocation,
  type ItemRecoveryNoticeKind,
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
  const [backgroundVersion, setBackgroundVersion] = useState(0);
  const nextBackgroundVersion = useRef(0);
  const reconciliationResolver = useRef<{
    version: number;
    resolve: () => void;
  } | null>(null);
  const recordItemChange = useCallback((changed: Item) => {
    setChangedItems((current) => ({ ...current, [changed.id]: changed }));
  }, []);
  const changedItem = itemId ? changedItems[itemId] : undefined;
  const itemOverrides = Object.values(changedItems);
  const backgroundLocation = readItemBackgroundLocation(location.state);
  const backgroundSurface = itemBackgroundSurface(backgroundLocation);
  const recoveryLocation = backgroundLocation ?? {
    pathname: "/library",
    search: "",
    hash: "",
  };
  const backgroundLibrarySearch =
    backgroundSurface.kind === "library" && backgroundLocation
      ? backgroundLocation.search
      : "";
  const closeDetails = () => {
    void navigate(
      backgroundLocation
        ? `${backgroundLocation.pathname}${backgroundLocation.search}${backgroundLocation.hash}`
        : "/library",
    );
  };
  const finishBackgroundReconciliation = useCallback((version: number) => {
    if (reconciliationResolver.current?.version !== version) return;
    reconciliationResolver.current.resolve();
    reconciliationResolver.current = null;
  }, []);
  const reconcileBackground = () =>
    new Promise<void>((resolve) => {
      const version = ++nextBackgroundVersion.current;
      reconciliationResolver.current = { version, resolve };
      setBackgroundVersion(version);
    });
  const finishCurrentBackgroundLoad = useCallback(() => {
    finishBackgroundReconciliation(backgroundVersion);
  }, [backgroundVersion, finishBackgroundReconciliation]);
  const recoveryPath = `${recoveryLocation.pathname}${recoveryLocation.search}${recoveryLocation.hash}`;
  const recoverWorkspace = useCallback(
    (notice: ItemRecoveryNoticeKind) => {
      void navigate(recoveryPath, {
        replace: true,
        state: itemRecoveryRouteState(notice),
      });
    },
    [navigate, recoveryPath],
  );
  const deleteCurrentItem = async () => {
    if (!itemId) return;
    try {
      await deleteItem(user, itemId as ItemId);
    } catch (deleteError) {
      if (
        deleteError instanceof ItemRequestError &&
        deleteError.kind === "not_found"
      ) {
        await reconcileBackground();
        recoverWorkspace("unavailable");
        return;
      }
      throw deleteError;
    }
    await reconcileBackground();
    recoverWorkspace("deleted");
  };
  const recoverUnavailableItem = useCallback(() => {
    void navigate("/library", {
      replace: true,
      state: itemRecoveryRouteState("unavailable"),
    });
  }, [navigate]);
  const handlePlacementChange = (change: ItemPlacementChange) => {
    if (
      change.operation === "remove" &&
      backgroundSurface.kind === "plan" &&
      backgroundSurface.learningPlanId === change.learningPlanId &&
      backgroundLocation
    ) {
      closeDetails();
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
          onClose={closeDetails}
          onDelete={deleteCurrentItem}
          onUnavailable={recoverUnavailableItem}
        />
      )}
      {backgroundLocation ? (
        backgroundSurface.kind === "plan" ? (
          <LearningPlanSurface
            key={`${backgroundVersion}:${
              changedItem
                ? `${changedItem.id}:${changedItem.status}`
                : "learningPlan"
            }:${placementVersion}`}
            learningPlanId={backgroundSurface.learningPlanId}
            onLoadSettled={finishCurrentBackgroundLoad}
            onItemRemovedFromPlan={(removedItemId) => {
              if (removedItemId === itemId) closeDetails();
            }}
          />
        ) : backgroundSurface.kind === "today" ? (
          <TodaySurface
            key={backgroundVersion}
            onLoadSettled={finishCurrentBackgroundLoad}
          />
        ) : backgroundSurface.kind === "history" ? (
          <DailyFocusHistorySurface
            key={backgroundVersion}
            selectedDate={backgroundSurface.date}
            onLoadSettled={finishCurrentBackgroundLoad}
          />
        ) : (
          <LibrarySurface
            key={backgroundVersion}
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
            onLoadSettled={finishCurrentBackgroundLoad}
          />
        )
      ) : (
        <LibrarySurface
          key={backgroundVersion}
          itemOverrides={itemOverrides}
          onItemChanged={recordItemChange}
          onLoadSettled={finishCurrentBackgroundLoad}
        />
      )}
    </div>
  );
}
