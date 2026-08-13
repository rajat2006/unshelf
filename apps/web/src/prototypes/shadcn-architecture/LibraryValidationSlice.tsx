import { useMemo, useState } from "react";
import { ITEM_STATUSES, Status } from "@unshelf/shared";
import {
  ArrowRight,
  CircleAlert,
  ExternalLink,
  Inbox,
  RotateCcw,
  Search,
} from "lucide-react";

import { ItemStatusBadge } from "@/components/unshelf/item-status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { STATUS_LABELS, TYPE_LABELS } from "@/items/presentation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import type { PrototypeScenario } from "./ArchitecturePrototype";
import { PROTOTYPE_ITEMS, type PrototypeItem } from "./prototype-data";

const LIBRARY_VIEWS = ["all", "in-progress", "unplanned"] as const;
type LibraryView = (typeof LIBRARY_VIEWS)[number];

export function LibraryValidationSlice({
  scenario,
  items,
  onOpenItem,
  onItemStatusChange,
  onCapture,
  onRetry,
}: {
  scenario: PrototypeScenario;
  items: PrototypeItem[];
  onOpenItem: (item: PrototypeItem) => void;
  onItemStatusChange: (change: { id: string; status: Status }) => void;
  onCapture: () => void;
  onRetry: () => void;
}) {
  const [query, setQuery] = useState("");
  const [view, setView] = useState<LibraryView>("all");
  const [selectedItemId, setSelectedItemId] = useState(PROTOTYPE_ITEMS[0].id);

  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return items.filter((item) => {
      const matchesView =
        view === "all" ||
        (view === "in-progress" && item.status === Status.InProgress) ||
        (view === "unplanned" && !item.planned);
      const matchesQuery =
        normalizedQuery.length === 0 ||
        [item.title, item.type, item.sourceLabel, ...item.labels]
          .join(" ")
          .toLocaleLowerCase()
          .includes(normalizedQuery);
      return matchesView && matchesQuery;
    });
  }, [items, query, view]);

  const selectedItem =
    filteredItems.find((item) => item.id === selectedItemId) ??
    filteredItems[0];

  return (
    <section aria-labelledby="prototype-library-heading">
      <header className="flex flex-col gap-6 border-b pb-8 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          <p className="mb-2 text-xs font-bold tracking-[0.14em] text-primary uppercase">
            Architecture validation · Global room
          </p>
          <h1
            id="prototype-library-heading"
            className="font-serif text-4xl leading-tight font-semibold tracking-tight md:text-5xl"
          >
            Library
          </h1>
          <p className="mt-3 text-base leading-7 text-muted-foreground">
            Every captured Item, ready to keep, plan, or quietly leave for
            later.
          </p>
        </div>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">
            {scenario === "ready" ? items.length : "—"}
          </span>
          <span>Items</span>
          <Separator orientation="vertical" className="h-4" />
          <span>Updated today</span>
        </div>
      </header>

      <div className="mt-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <label className="relative block w-full md:max-w-md">
          <span className="sr-only">Search Library</span>
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder="Search every Item…"
            className="pl-10"
          />
        </label>

        <div className="flex max-w-full gap-2 overflow-x-auto pb-1 md:pb-0">
          {LIBRARY_VIEWS.map((candidate) => (
            <Button
              key={candidate}
              type="button"
              size="sm"
              variant={view === candidate ? "secondary" : "ghost"}
              className="shrink-0"
              aria-pressed={view === candidate}
              onClick={() => setView(candidate)}
            >
              {libraryViewLabel(candidate)}
            </Button>
          ))}
        </div>
      </div>

      <div className="mt-6">
        {scenario === "loading" && <LibraryLoading />}
        {scenario === "error" && <LibraryError onRetry={onRetry} />}
        {scenario === "empty" && <LibraryEmpty onCapture={onCapture} />}
        {scenario === "ready" && filteredItems.length === 0 && (
          <FilteredEmpty query={query} onClear={() => setQuery("")} />
        )}
        {scenario === "ready" && filteredItems.length > 0 && (
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
            <ul
              className="divide-y overflow-hidden rounded-[var(--radius-panel)] border bg-card"
              aria-label="Library Items"
            >
              {filteredItems.map((item) => (
                <LibraryRow
                  key={item.id}
                  item={item}
                  selected={item.id === selectedItem?.id}
                  onPreview={() => setSelectedItemId(item.id)}
                  onOpen={() => onOpenItem(item)}
                  onStatusChange={(status) =>
                    onItemStatusChange({ id: item.id, status })
                  }
                />
              ))}
            </ul>

            {selectedItem && (
              <ItemPreview item={selectedItem} onOpen={onOpenItem} />
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function LibraryRow({
  item,
  selected,
  onPreview,
  onOpen,
  onStatusChange,
}: {
  item: PrototypeItem;
  selected: boolean;
  onPreview: () => void;
  onOpen: () => void;
  onStatusChange: (status: Status) => void;
}) {
  return (
    <li
      className={cn(
        "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 bg-card p-4 transition-colors hover:bg-accent/30 md:p-6",
        selected && "bg-accent/40 shadow-[inset_3px_0_0_var(--primary)]",
      )}
      onPointerEnter={onPreview}
    >
      <button
        type="button"
        className="min-w-0 rounded-md text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/35"
        onClick={onOpen}
        onFocus={onPreview}
      >
        <span className="flex flex-wrap items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          <span>{TYPE_LABELS[item.type]}</span>
          <span aria-hidden="true">·</span>
          <span>{item.sourceLabel}</span>
        </span>
        <span className="mt-2 block text-base leading-6 font-semibold text-foreground">
          {item.title}
        </span>
        <span className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          {item.targetDate && (
            <span
              className={cn(
                item.pastTarget && "font-semibold text-status-past",
              )}
            >
              {item.pastTarget ? "Past target" : "Target"} {item.targetDate}
            </span>
          )}
          {item.labels.slice(0, 2).map((label) => (
            <span key={label}>· {label}</span>
          ))}
        </span>
      </button>

      <div className="flex flex-col items-end gap-2">
        <StatusSelect item={item} onStatusChange={onStatusChange} />
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="xl:hidden"
          aria-label={`Open ${item.title}`}
          onClick={onOpen}
        >
          <ArrowRight aria-hidden="true" />
        </Button>
      </div>
    </li>
  );
}

function StatusSelect({
  item,
  onStatusChange,
}: {
  item: PrototypeItem;
  onStatusChange: (status: Status) => void;
}) {
  return (
    <Select
      value={item.status}
      onValueChange={(value) => onStatusChange(value as Status)}
    >
      <SelectTrigger
        size="sm"
        className="w-40 max-md:w-32"
        aria-label={`Status for ${item.title}`}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        {ITEM_STATUSES.map((status) => (
          <SelectItem key={status} value={status}>
            {STATUS_LABELS[status]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function ItemPreview({
  item,
  onOpen,
}: {
  item: PrototypeItem;
  onOpen: (item: PrototypeItem) => void;
}) {
  return (
    <aside
      aria-label="Selected Item preview"
      className="sticky top-28 hidden self-start rounded-[var(--radius-panel)] border bg-quiet-panel p-6 xl:block"
    >
      <div className="flex items-center justify-between gap-4">
        <Badge variant="secondary">{TYPE_LABELS[item.type]}</Badge>
        <ItemStatusBadge status={item.status} />
      </div>
      <h2 className="mt-6 font-serif text-2xl leading-8 font-semibold tracking-tight">
        {item.title}
      </h2>
      <p className="mt-4 text-sm leading-6 text-muted-foreground">
        {item.note}
      </p>
      <a
        href={item.source}
        className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-primary underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:ring-3 focus-visible:ring-ring/35"
      >
        {item.sourceLabel}
        <ExternalLink aria-hidden="true" className="size-4" />
      </a>
      <Button
        type="button"
        className="mt-8 w-full"
        onClick={() => onOpen(item)}
      >
        Open Item
        <ArrowRight data-icon="inline-end" aria-hidden="true" />
      </Button>
    </aside>
  );
}

function LibraryLoading() {
  return (
    <div
      className="overflow-hidden rounded-[var(--radius-panel)] border bg-card"
      role="status"
      aria-label="Loading Library"
    >
      {Array.from({ length: 5 }, (_, index) => (
        <div
          key={index}
          className="grid grid-cols-[minmax(0,1fr)_10rem] gap-6 border-b p-6 last:border-0"
        >
          <div className="space-y-3">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-3 w-48" />
          </div>
          <Skeleton className="h-8 w-40" />
        </div>
      ))}
      <span className="sr-only">Loading Library Items…</span>
    </div>
  );
}

function LibraryError({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="rounded-[var(--radius-panel)] border border-destructive/35 bg-destructive/5 p-6 md:p-8"
    >
      <CircleAlert aria-hidden="true" className="size-6 text-destructive" />
      <h2 className="mt-4 font-serif text-2xl font-semibold">
        The Library stayed on the shelf
      </h2>
      <p className="mt-2 max-w-xl text-base leading-7 text-muted-foreground">
        Nothing was changed. Try loading the room again while the rest of the
        workspace remains available.
      </p>
      <Button
        type="button"
        variant="outline"
        className="mt-6"
        onClick={onRetry}
      >
        <RotateCcw data-icon="inline-start" aria-hidden="true" />
        Retry
      </Button>
    </div>
  );
}

function LibraryEmpty({ onCapture }: { onCapture: () => void }) {
  return (
    <div className="grid min-h-64 place-items-center rounded-[var(--radius-panel)] border bg-quiet-panel p-8 text-center">
      <div className="max-w-md">
        <Inbox aria-hidden="true" className="mx-auto size-8 text-primary" />
        <h2 className="mt-4 font-serif text-2xl font-semibold">
          Nothing captured yet
        </h2>
        <p className="mt-2 text-base leading-7 text-muted-foreground">
          Save the first thing you want to return to. It will land here without
          committing it to a Plan.
        </p>
        <Button type="button" className="mt-6" onClick={onCapture}>
          Capture your first Item
        </Button>
      </div>
    </div>
  );
}

function FilteredEmpty({
  query,
  onClear,
}: {
  query: string;
  onClear: () => void;
}) {
  return (
    <div className="rounded-[var(--radius-panel)] border bg-quiet-panel p-8 text-center">
      <p className="text-base font-semibold">
        No Items match {query.trim() ? `“${query.trim()}”` : "this view"}
      </p>
      <Button type="button" variant="ghost" className="mt-4" onClick={onClear}>
        Clear search
      </Button>
    </div>
  );
}

function libraryViewLabel(view: LibraryView): string {
  if (view === "in-progress") return "In progress";
  if (view === "unplanned") return "Unplanned";
  return "All";
}
