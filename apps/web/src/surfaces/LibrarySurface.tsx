import { useCallback, useEffect, useRef, useState } from "react";
import type { Item, Stop, StopDetail } from "@unshelf/shared";
import { fetchAll, fetchStop, fetchStops } from "../api";
import { useCurrentUser } from "../application-auth";
import { LibraryItems } from "../items/LibraryItems";
import { useCapture, useCaptureListener } from "../shell/CaptureController";

type LibraryState =
  | { status: "loading" }
  | { status: "error" }
  | {
      status: "ready";
      items: Item[];
      stops: Stop[];
      stopDetails: StopDetail[];
    };

/**
 * The Library is the flat store every capture lands in and the per-row home for
 * triage. Labels and their URL filter arrive in later slices (#98–#99); this
 * surface owns Item facts and Stop placement only (#96).
 */
interface LibrarySurfaceProps {
  itemOverrides?: Item[];
  onItemChanged?: (item: Item) => void;
}

export function LibrarySurface({
  itemOverrides = [],
  onItemChanged,
}: LibrarySurfaceProps = {}) {
  const user = useCurrentUser();
  const capture = useCapture();
  const [state, setState] = useState<LibraryState>({ status: "loading" });
  const loadGeneration = useRef(0);

  const load = useCallback(async () => {
    const generation = ++loadGeneration.current;
    setState({ status: "loading" });
    try {
      const [items, stops] = await Promise.all([
        fetchAll(user),
        fetchStops(user),
      ]);
      const stopDetails = await Promise.all(
        stops.map((stop) => fetchStop(user, stop.id)),
      );
      if (generation !== loadGeneration.current) return;
      setState({ status: "ready", items, stops, stopDetails });
    } catch {
      if (generation !== loadGeneration.current) return;
      setState({ status: "error" });
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);
  useCaptureListener(load);

  const replaceItem = useCallback((changed: Item) => {
    setState((current) => replaceItemInLibraryState(current, changed));
    onItemChanged?.(changed);
  }, [onItemChanged]);

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

  const displayedState = itemOverrides.reduce(
    replaceItemInLibraryState,
    state,
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
      {displayedState.status === "ready" && displayedState.items.length === 0 && (
        <div className="library-empty">
          <p>Nothing captured yet</p>
          <button type="button" onClick={capture.open}>
            Capture your first Item
          </button>
        </div>
      )}
      {displayedState.status === "ready" && displayedState.items.length > 0 && (
        <LibraryItems
          items={displayedState.items}
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
