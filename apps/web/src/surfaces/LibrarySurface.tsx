import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Item, Label, LabelId, Stop, StopDetail } from "@unshelf/shared";
import { useSearchParams } from "react-router";
import { fetchAll, fetchLabels, fetchStop, fetchStops } from "../api";
import { useCurrentUser } from "../application-auth/useCurrentUser";
import { LibraryItems } from "../items/LibraryItems";
import { useCapture } from "../shell/useCapture";
import { useCaptureListener } from "../shell/useCaptureListener";

type LibraryState =
  | { status: "loading" }
  | { status: "error" }
  | {
      status: "ready";
      items: Item[];
      labels: Label[];
      stops: Stop[];
      stopDetails: StopDetail[];
    };

/**
 * The Library is the flat store every capture lands in and the per-row home for
 * triage. The optional Label filter is owned by the URL so refresh, bookmarks,
 * and browser history restore the same view (ADR-0013).
 */
interface LibrarySurfaceProps {
  itemOverrides?: Item[];
  onItemChanged?: (item: Item) => void;
  /** `/library`, or its preserved background beneath Item detail, owns this query. */
  labelFilterEnabled?: boolean;
  /** The preserved Library query beneath an Item route. */
  labelFilterSearch?: string;
  /** Item routes use this to leave detail before changing Library filters. */
  onLabelFilterChange?: (searchParams: URLSearchParams) => void;
}

export function LibrarySurface({
  itemOverrides = [],
  onItemChanged,
  labelFilterEnabled = false,
  labelFilterSearch,
  onLabelFilterChange,
}: LibrarySurfaceProps = {}) {
  const user = useCurrentUser();
  const capture = useCapture();
  const [routeSearchParams, setRouteSearchParams] = useSearchParams();
  const searchParams = useMemo(
    () =>
      labelFilterSearch === undefined
        ? routeSearchParams
        : new URLSearchParams(labelFilterSearch),
    [labelFilterSearch, routeSearchParams],
  );
  const [state, setState] = useState<LibraryState>({ status: "loading" });
  const loadGeneration = useRef(0);

  const load = useCallback(async () => {
    const generation = ++loadGeneration.current;
    setState({ status: "loading" });
    try {
      const [items, labels, stops] = await Promise.all([
        fetchAll(user),
        fetchLabels(user),
        fetchStops(user),
      ]);
      const stopDetails = await Promise.all(
        stops.map((stop) => fetchStop(user, stop.id)),
      );
      if (generation !== loadGeneration.current) return;
      setState({ status: "ready", items, labels, stops, stopDetails });
    } catch {
      if (generation !== loadGeneration.current) return;
      setState({ status: "error" });
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);
  useCaptureListener(load);

  const replaceItem = useCallback(
    (changed: Item) => {
      setState((current) => replaceItemInLibraryState(current, changed));
      onItemChanged?.(changed);
    },
    [onItemChanged],
  );

  const replaceStop = useCallback((changed: StopDetail) => {
    setState((current) =>
      current.status === "ready"
        ? {
            ...current,
            stopDetails: current.stopDetails.map((stop) =>
              stop.id === changed.id ? changed : stop,
            ),
          }
        : current,
    );
  }, []);

  const displayedState = itemOverrides.reduce(replaceItemInLibraryState, state);
  const activeLabelId = labelFilterEnabled ? searchParams.get("label") : null;
  const activeLabel =
    displayedState.status === "ready"
      ? displayedState.labels.find((label) => label.id === activeLabelId)
      : undefined;
  const hasUnknownLabel =
    displayedState.status === "ready" && activeLabelId !== null && !activeLabel;
  const visibleItems =
    displayedState.status !== "ready" || hasUnknownLabel
      ? []
      : activeLabel
        ? displayedState.items.filter((item) =>
            item.labels.some((label) => label.id === activeLabel.id),
          )
        : displayedState.items;
  const filteredEmptyMessage =
    displayedState.status === "ready" && displayedState.items.length > 0
      ? hasUnknownLabel
        ? "Label unavailable"
        : activeLabel && visibleItems.length === 0
          ? `No Items match "${activeLabel.name}"`
          : null
      : null;

  const selectLabel = useCallback(
    (labelId: LabelId | null) => {
      const next = new URLSearchParams(searchParams);
      if (labelId) next.set("label", labelId);
      else next.delete("label");
      if (onLabelFilterChange) onLabelFilterChange(next);
      else setRouteSearchParams(next);
    },
    [onLabelFilterChange, searchParams, setRouteSearchParams],
  );

  return (
    <section className="library-surface" aria-labelledby="library-heading">
      <h1 id="library-heading">Library</h1>
      {displayedState.status === "loading" && <LibrarySkeleton />}
      {displayedState.status === "error" && (
        <div role="alert">
          <p>Couldn&apos;t load this</p>
          <button type="button" onClick={() => void load()}>
            Retry
          </button>
        </div>
      )}
      {displayedState.status === "ready" &&
        labelFilterEnabled &&
        (displayedState.labels.length > 0 || hasUnknownLabel) && (
          <fieldset className="library-label-filter">
            <legend>Filter by Label</legend>
            <button
              type="button"
              aria-label="Show all Items"
              aria-pressed={activeLabelId === null}
              onClick={() => selectLabel(null)}
            >
              All Items
            </button>
            {displayedState.labels.map((label) => (
              <button
                type="button"
                key={label.id}
                aria-label={`Filter by ${label.name}`}
                aria-pressed={label.id === activeLabel?.id}
                onClick={() => selectLabel(label.id)}
              >
                {label.name}
              </button>
            ))}
          </fieldset>
        )}
      {displayedState.status === "ready" &&
        displayedState.items.length === 0 && (
          <div className="library-empty">
            <p>Nothing captured yet</p>
            <button type="button" onClick={capture.open}>
              Capture your first Item
            </button>
          </div>
        )}
      {filteredEmptyMessage && (
        <div className="library-empty">
          <p>{filteredEmptyMessage}</p>
          <button type="button" onClick={() => selectLabel(null)}>
            Clear Label filter
          </button>
        </div>
      )}
      {displayedState.status === "ready" && visibleItems.length > 0 && (
        <LibraryItems
          items={visibleItems}
          labels={displayedState.labels}
          stops={displayedState.stops}
          stopDetails={displayedState.stopDetails}
          user={user}
          onItemChanged={replaceItem}
          onStopChanged={replaceStop}
        />
      )}
    </section>
  );
}

function replaceItemIn(items: Item[], changed: Item): Item[] {
  return items.map((item) => (item.id === changed.id ? changed : item));
}

function replaceItemInLibraryState(
  state: LibraryState,
  changed: Item,
): LibraryState {
  return state.status === "ready"
    ? {
        ...state,
        items: replaceItemIn(state.items, changed),
        stopDetails: state.stopDetails.map((stop) => ({
          ...stop,
          items: replaceItemIn(stop.items, changed),
        })),
      }
    : state;
}

function LibrarySkeleton() {
  return (
    <div
      className="library-skeleton"
      role="status"
      aria-label="Loading Library"
    >
      {[0, 1, 2].map((row) => (
        <div className="library-skeleton__row" aria-hidden="true" key={row}>
          <span />
          <span />
          <span />
        </div>
      ))}
    </div>
  );
}
