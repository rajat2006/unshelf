import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Status, type Item, type Label, type LabelId } from "@unshelf/shared";
import { Search } from "lucide-react";
import { useSearchParams } from "react-router";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchAll, fetchLabels } from "../api";
import { useCurrentUser } from "../application-auth/useCurrentUser";
import { LibraryItems } from "../items/LibraryItems";
import { ItemLabels } from "../items/ItemLabels";
import { ItemStatusSelect } from "../items/ItemStatusSelect";
import { ItemTargetDate } from "../items/ItemTargetDate";
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
  { id: "all", label: "All" },
  { id: "in-progress", label: "In progress" },
  { id: "unplanned", label: "Unplanned" },
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
    <section
      className="mx-auto grid w-full max-w-7xl min-w-0 gap-6"
      aria-labelledby="library-heading"
      aria-busy={displayedState.status === "loading"}
    >
      <header className="grid gap-2">
        <div className="grid gap-1">
          <p className="m-0 text-xs font-semibold tracking-[0.12em] text-primary uppercase">
            Your collection
          </p>
          <h1
            id="library-heading"
            className="m-0 font-serif text-4xl leading-tight font-semibold tracking-tight sm:text-5xl"
          >
            Library
          </h1>
          <p className="m-0 max-w-2xl text-base leading-relaxed text-muted-foreground">
            A passive catalog of every Item, whether committed or not.
          </p>
        </div>
      </header>
      {displayedState.status === "loading" && (
        <LibrarySkeleton showFilters={labelFilterEnabled} />
      )}
      {displayedState.status === "error" && (
        <Alert className="grid max-w-xl gap-3 p-4">
          <div>
            <p className="m-0 font-semibold">Couldn&apos;t load your Library</p>
            <p className="mt-1 mb-0 text-destructive/85">
              Your other rooms are still available. Try loading this room again.
            </p>
          </div>
          <Button
            className="w-fit"
            type="button"
            variant="secondary"
            onClick={() => void load()}
          >
            Retry
          </Button>
        </Alert>
      )}
      {displayedState.status === "ready" &&
        displayedState.items.length === 0 && (
          <div className="grid justify-items-start gap-3 rounded-[var(--radius-panel)] border bg-card p-6 sm:p-8">
            <div>
              <h2 className="m-0 font-serif text-2xl">Nothing captured yet</h2>
              <p className="mt-2 mb-0 text-muted-foreground">
                Capture your first Item to begin a durable learning collection.
              </p>
            </div>
            <Button type="button" onClick={capture.open}>
              Capture your first Item
            </Button>
          </div>
        )}
      {displayedState.status === "ready" && displayedState.items.length > 0 && (
        <div className="grid min-w-0 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.42fr)]">
          <section className="grid min-w-0 gap-4" aria-label="Library catalog">
            {labelFilterEnabled && (
              <div className="grid gap-4 rounded-[var(--radius-panel)] border bg-card p-4">
                <Field>
                  <FieldLabel htmlFor="library-search">
                    Search Library
                  </FieldLabel>
                  <div className="relative">
                    <Search
                      aria-hidden="true"
                      className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                    />
                    <Input
                      id="library-search"
                      type="search"
                      value={rawQuery}
                      onChange={(event) => searchLibrary(event.target.value)}
                      placeholder="Search every Item…"
                      className="pl-9"
                    />
                  </div>
                </Field>
                <div
                  className="flex max-w-full flex-wrap gap-2"
                  aria-label="Library views"
                >
                  {LIBRARY_VIEWS.map((view) => (
                    <Button
                      type="button"
                      key={view.id}
                      variant={
                        activeLabelId === null && activeView === view.id
                          ? "primary"
                          : "secondary"
                      }
                      size="compact"
                      aria-label={`Show ${view.label}`}
                      aria-pressed={
                        activeLabelId === null && activeView === view.id
                      }
                      onClick={() => selectView(view.id)}
                    >
                      {view.label}
                    </Button>
                  ))}
                </div>
                {displayedState.labels.length > 0 && (
                  <Field className="max-w-xs">
                    <FieldLabel id="library-label-filter">
                      Filter by Label
                    </FieldLabel>
                    <Select
                      value={activeLabel?.id ?? "all"}
                      onValueChange={(value) =>
                        selectLabel(value === "all" ? null : (value as LabelId))
                      }
                    >
                      <SelectTrigger
                        className="w-full"
                        aria-labelledby="library-label-filter"
                      >
                        <SelectValue placeholder="All Labels" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Labels</SelectItem>
                        {displayedState.labels.map((label) => (
                          <SelectItem key={label.id} value={label.id}>
                            {label.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                )}
              </div>
            )}
            {filteredEmptyMessage ? (
              <div className="grid justify-items-start gap-3 rounded-[var(--radius-card)] border border-dashed bg-card p-6">
                <p className="m-0 text-muted-foreground">
                  {filteredEmptyMessage}
                </p>
                {query.length > 0 ? (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => searchLibrary("")}
                  >
                    Clear search
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => selectLabel(null)}
                  >
                    Clear Label filter
                  </Button>
                )}
              </div>
            ) : (
              <LibraryItems
                items={visibleItems}
                selectedItemId={selectedItem?.id}
                onPreview={(item) => setSelectedItemId(item.id)}
              />
            )}
          </section>
          {selectedItem && (
            <aside
              className="grid min-w-0 gap-5 rounded-[var(--radius-panel)] border bg-quiet-panel p-4 sm:p-5 lg:sticky lg:top-24"
              aria-label={`Edit ${selectedItem.title}`}
            >
              <div>
                <p className="m-0 text-xs font-semibold tracking-[0.1em] text-primary uppercase">
                  Shared Item details
                </p>
                <h2 className="mt-1 mb-0 font-serif text-2xl leading-tight">
                  {selectedItem.title}
                </h2>
                <p className="mt-2 mb-0 text-sm leading-relaxed text-muted-foreground">
                  Changes here appear everywhere this Item is used.
                </p>
              </div>
              <div className="grid gap-5">
                <ItemStatusSelect
                  item={selectedItem}
                  user={user}
                  onChanged={replaceItem}
                />
                <ItemTargetDate
                  item={selectedItem}
                  user={user}
                  onChanged={replaceItem}
                />
                <ItemLabels
                  item={selectedItem}
                  labels={displayedState.labels}
                  user={user}
                  onItemChanged={replaceItem}
                />
              </div>
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
  if (view === "unplanned") return item.labels.length === 0;
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

function LibrarySkeleton({ showFilters }: { showFilters: boolean }) {
  return (
    <div
      className="grid min-w-0 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.42fr)]"
      role="status"
      aria-label="Loading Library"
    >
      <div className="grid min-w-0 gap-4" aria-hidden="true">
        {showFilters && (
          <div className="grid gap-4 rounded-[var(--radius-panel)] border bg-card p-4">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-10 w-full" />
            <div className="flex flex-wrap gap-2">
              <Skeleton className="h-8 w-16 rounded-full" />
              <Skeleton className="h-8 w-24 rounded-full" />
              <Skeleton className="h-8 w-20 rounded-full" />
            </div>
            <Skeleton className="h-10 w-full max-w-xs" />
          </div>
        )}
        {[0, 1, 2].map((row) => (
          <div
            className="grid min-h-40 gap-3 rounded-[var(--radius-card)] border bg-card p-4"
            key={row}
          >
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-5 w-full max-w-96" />
            <Skeleton className="h-4 w-full max-w-64" />
          </div>
        ))}
      </div>
      <div
        className="grid min-h-80 gap-4 rounded-[var(--radius-panel)] border bg-quiet-panel p-5"
        aria-hidden="true"
      >
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-7 w-full max-w-64" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    </div>
  );
}
