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
  itemOverride?: Item;
}

export function LibrarySurface({
  itemOverride,
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
    setState((current) =>
      current.status === "ready"
        ? {
            ...current,
            items: replaceItemIn(current.items, changed),
            stopDetails: current.stopDetails.map((stop) => ({
              ...stop,
              items: replaceItemIn(stop.items, changed),
            })),
          }
        : current,
    );
  }, []);

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

  return (
    <section className="library-surface" aria-labelledby="library-heading">
      <h1 id="library-heading">Library</h1>
      {state.status === "loading" && <LibrarySkeleton />}
      {state.status === "error" && (
        <div role="alert">
          <p>Couldn&apos;t load this</p>
          <button type="button" onClick={() => void load()}>
            Retry
          </button>
        </div>
      )}
      {state.status === "ready" && state.items.length === 0 && (
        <div className="library-empty">
          <p>Nothing captured yet</p>
          <button type="button" onClick={capture.open}>
            Capture your first Item
          </button>
        </div>
      )}
      {state.status === "ready" && state.items.length > 0 && (
        <LibraryItems
          items={
            itemOverride ? replaceItemIn(state.items, itemOverride) : state.items
          }
          stops={state.stops}
          stopDetails={
            itemOverride
              ? state.stopDetails.map((stop) => ({
                  ...stop,
                  items: replaceItemIn(stop.items, itemOverride),
                }))
              : state.stopDetails
          }
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
