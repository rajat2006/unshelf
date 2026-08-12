import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Status,
  Type,
  type Item,
  type Label,
  type LabelId,
} from "@unshelf/shared";
import { Link, useLocation, useSearchParams } from "react-router";
import { fetchAll, fetchLabels } from "../api";
import { useCurrentUser } from "../application-auth/useCurrentUser";
import { LibraryItems } from "../items/LibraryItems";
import { itemDetailRouteState } from "../items/item-route-state";
import { STATUS_LABELS, TYPE_LABELS } from "../items/presentation";
import { useCapture } from "../shell/useCapture";
import { useCaptureListener } from "../shell/useCaptureListener";

type LibraryState =
  | { status: "loading" }
  | { status: "error" }
  | {
      status: "ready";
      items: Item[];
      labels: Label[];
    };

const LIBRARY_VIEWS = [
  { id: "all", label: "All Items" },
  { id: "in-progress", label: "In progress" },
  { id: "books", label: "Books" },
  { id: "articles", label: "Articles" },
  { id: "unlabelled", label: "Unlabelled" },
] as const;

type LibraryViewId = (typeof LIBRARY_VIEWS)[number]["id"];

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
  const location = useLocation();
  const [routeSearchParams, setRouteSearchParams] = useSearchParams();
  const searchParams = useMemo(
    () =>
      labelFilterSearch === undefined
        ? routeSearchParams
        : new URLSearchParams(labelFilterSearch),
    [labelFilterSearch, routeSearchParams],
  );
  const [state, setState] = useState<LibraryState>({ status: "loading" });
  const [selectedItemId, setSelectedItemId] = useState<Item["id"] | null>(null);
  const loadGeneration = useRef(0);

  const load = useCallback(async () => {
    const generation = ++loadGeneration.current;
    setState({ status: "loading" });
    try {
      const [items, labels] = await Promise.all([
        fetchAll(user),
        fetchLabels(user),
      ]);
      if (generation !== loadGeneration.current) return;
      setState({ status: "ready", items, labels });
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

  const displayedState = itemOverrides.reduce(replaceItemInLibraryState, state);
  const activeLabelId = labelFilterEnabled ? searchParams.get("label") : null;
  const rawQuery = labelFilterEnabled ? (searchParams.get("q") ?? "") : "";
  const activeView = labelFilterEnabled
    ? libraryViewId(searchParams.get("view"))
    : "all";
  const query = rawQuery.trim().toLocaleLowerCase();
  const activeLabel =
    displayedState.status === "ready"
      ? displayedState.labels.find((label) => label.id === activeLabelId)
      : undefined;
  const hasUnknownLabel =
    displayedState.status === "ready" && activeLabelId !== null && !activeLabel;
  const viewFilteredItems =
    displayedState.status !== "ready"
      ? []
      : displayedState.items.filter((item) =>
          matchesLibraryView(item, activeView),
        );
  const labelFilteredItems =
    displayedState.status !== "ready" || hasUnknownLabel
      ? []
      : activeLabel
        ? viewFilteredItems.filter((item) =>
            item.labels.some((label) => label.id === activeLabel.id),
          )
        : viewFilteredItems;
  const visibleItems =
    query.length === 0
      ? labelFilteredItems
      : labelFilteredItems.filter((item) => matchesLibraryQuery(item, query));
  const selectedItem =
    visibleItems.find((item) => item.id === selectedItemId) ?? visibleItems[0];
  const filteredEmptyMessage =
    displayedState.status === "ready" && displayedState.items.length > 0
      ? hasUnknownLabel
        ? "Label unavailable"
        : visibleItems.length === 0
          ? query.length > 0
            ? activeLabel
              ? `No Items match "${rawQuery.trim()}" with "${activeLabel.name}"`
              : `No Items match "${rawQuery.trim()}"`
            : activeLabel
              ? `No Items match "${activeLabel.name}"`
              : `No Items in ${libraryViewLabel(activeView)}`
          : null
      : null;

  const selectLabel = useCallback(
    (labelId: LabelId | null) => {
      const next = new URLSearchParams(searchParams);
      if (labelId) next.set("label", labelId);
      else next.delete("label");
      next.delete("view");
      if (onLabelFilterChange) onLabelFilterChange(next);
      else setRouteSearchParams(next);
    },
    [onLabelFilterChange, searchParams, setRouteSearchParams],
  );

  const searchLibrary = useCallback(
    (value: string) => {
      const next = new URLSearchParams(searchParams);
      if (value.length > 0) next.set("q", value);
      else next.delete("q");
      if (onLabelFilterChange) onLabelFilterChange(next);
      else setRouteSearchParams(next, { replace: true });
    },
    [onLabelFilterChange, searchParams, setRouteSearchParams],
  );

  const selectView = useCallback(
    (view: LibraryViewId) => {
      const next = new URLSearchParams(searchParams);
      if (view === "all") next.delete("view");
      else next.set("view", view);
      next.delete("label");
      if (onLabelFilterChange) onLabelFilterChange(next);
      else setRouteSearchParams(next);
    },
    [onLabelFilterChange, searchParams, setRouteSearchParams],
  );

  return (
    <section className="library-surface" aria-labelledby="library-heading">
      <header className="editorial-heading library-surface__heading">
        <div>
          <p className="editorial-eyebrow">Your collected material</p>
          <h1 id="library-heading">Library</h1>
          <p className="editorial-intro">
            A passive catalog of every Item—not a queue of unfinished work.
          </p>
        </div>
        {displayedState.status === "ready" &&
          labelFilterEnabled &&
          displayedState.items.length > 0 && (
            <label className="library-search">
              <span className="visually-hidden">Search Library</span>
              <input
                type="search"
                value={rawQuery}
                onChange={(event) => searchLibrary(event.target.value)}
                placeholder={`Search ${displayedState.items.length} Items`}
                aria-label="Search Library"
              />
            </label>
          )}
      </header>
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
        displayedState.items.length === 0 && (
          <div className="library-empty">
            <p>Nothing captured yet</p>
            <button type="button" onClick={capture.open}>
              Capture your first Item
            </button>
          </div>
        )}
      {displayedState.status === "ready" && displayedState.items.length > 0 && (
        <div
          className={`library-catalog${labelFilterEnabled ? "" : " library-catalog--without-facets"}`}
        >
          {labelFilterEnabled && (
            <aside
              className="library-catalog__facets"
              aria-label="Library filters"
            >
              <strong>Views</strong>
              {LIBRARY_VIEWS.map((view) => (
                <button
                  type="button"
                  key={view.id}
                  aria-label={`Show ${view.label}`}
                  aria-pressed={
                    activeLabelId === null && activeView === view.id
                  }
                  onClick={() => selectView(view.id)}
                >
                  <span>{view.label}</span>
                  <small>
                    {
                      displayedState.items.filter((item) =>
                        matchesLibraryView(item, view.id),
                      ).length
                    }
                  </small>
                </button>
              ))}
              {(displayedState.labels.length > 0 || hasUnknownLabel) && (
                <>
                  <strong>Labels</strong>
                  {displayedState.labels.map((label) => (
                    <button
                      type="button"
                      key={label.id}
                      aria-label={`Filter by ${label.name}`}
                      aria-pressed={label.id === activeLabel?.id}
                      onClick={() => selectLabel(label.id)}
                    >
                      <span>{label.name}</span>
                      <small>
                        {
                          displayedState.items.filter((item) =>
                            item.labels.some(({ id }) => id === label.id),
                          ).length
                        }
                      </small>
                    </button>
                  ))}
                </>
              )}
            </aside>
          )}
          <section
            className="library-catalog__results"
            aria-labelledby="library-results-heading"
          >
            <div className="library-catalog__results-heading">
              <h2 id="library-results-heading">
                {query.length > 0
                  ? "Search results"
                  : (activeLabel?.name ?? libraryViewLabel(activeView))}
              </h2>
              <span>{visibleItems.length} Items</span>
            </div>
            {filteredEmptyMessage ? (
              <div className="library-empty">
                <p>{filteredEmptyMessage}</p>
                {query.length > 0 ? (
                  <button type="button" onClick={() => searchLibrary("")}>
                    Clear search
                  </button>
                ) : (
                  <button type="button" onClick={() => selectLabel(null)}>
                    Clear filter
                  </button>
                )}
              </div>
            ) : (
              <LibraryItems
                items={visibleItems}
                labels={displayedState.labels}
                user={user}
                onItemChanged={replaceItem}
                selectedItemId={selectedItem?.id}
                onPreview={(item) => setSelectedItemId(item.id)}
              />
            )}
          </section>
          {selectedItem && (
            <aside
              className="library-catalog__preview"
              aria-label="Item preview"
            >
              <span>{TYPE_LABELS[selectedItem.type]}</span>
              <h2>{selectedItem.title}</h2>
              <p>{STATUS_LABELS[selectedItem.status]}</p>
              {selectedItem.source && (
                <p className="library-catalog__preview-source">
                  {selectedItem.source}
                </p>
              )}
              <div className="library-catalog__preview-labels">
                {selectedItem.labels.map((label) => (
                  <span key={label.id}>{label.name}</span>
                ))}
              </div>
              <Link
                to={`/items/${selectedItem.id}`}
                state={itemDetailRouteState(location)}
              >
                Open Item
              </Link>
            </aside>
          )}
        </div>
      )}
    </section>
  );
}

function libraryViewId(value: string | null): LibraryViewId {
  return LIBRARY_VIEWS.some((view) => view.id === value)
    ? (value as LibraryViewId)
    : "all";
}

function libraryViewLabel(viewId: LibraryViewId): string {
  return LIBRARY_VIEWS.find((view) => view.id === viewId)?.label ?? "All Items";
}

function matchesLibraryView(item: Item, view: LibraryViewId): boolean {
  if (view === "in-progress") return item.status === Status.InProgress;
  if (view === "books") return item.type === Type.Book;
  if (view === "articles") return item.type === Type.Article;
  if (view === "unlabelled") return item.labels.length === 0;
  return true;
}

function matchesLibraryQuery(item: Item, query: string): boolean {
  return [item.title, item.source, ...item.labels.map((label) => label.name)]
    .filter((value): value is string => value !== null)
    .some((value) => value.toLocaleLowerCase().includes(query));
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
