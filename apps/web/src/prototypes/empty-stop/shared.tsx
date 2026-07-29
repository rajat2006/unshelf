/**
 * PROTOTYPE — throwaway primitives and in-memory state. Ticket #208, map #211.
 *
 * The canvas frame is fixed across variants because its answer is already
 * settled: the complete waypoint is the Stop-opening target, and an empty Stop
 * uses a plus instead of an inert 0/0.
 */
import { useMemo, useState, type ReactNode } from "react";
import { Status, type Item, type ItemId } from "@unshelf/shared";
import { TYPE_LABELS } from "../../items/presentation";
import { ITEMS, OPEN_STOP, PLACEMENTS, matches } from "../item-picker/fixtures";

const PROTOTYPE_ITEMS = ITEMS.slice(0, 18);

export interface StopPrototypeState {
  availableItems: Item[];
  currentItems: Item[];
  query: string;
  recentItemIds: Set<ItemId>;
  addItem: (itemId: ItemId) => void;
  reset: () => void;
  setQuery: (query: string) => void;
  undoAdd: (itemId: ItemId) => void;
}

export function useStopPrototype(): StopPrototypeState {
  const [currentItemIds, setCurrentItemIds] = useState<ItemId[]>([]);
  const [recentItemIds, setRecentItemIds] = useState<Set<ItemId>>(new Set());
  const [query, setQuery] = useState("");

  const currentItems = useMemo(
    () =>
      currentItemIds.flatMap((itemId) => {
        const item = PROTOTYPE_ITEMS.find(
          (candidate) => candidate.id === itemId,
        );
        return item ? [item] : [];
      }),
    [currentItemIds],
  );
  const availableItems = useMemo(
    () =>
      PROTOTYPE_ITEMS.filter(
        (item) => !currentItemIds.includes(item.id) && matches(item, query),
      ),
    [currentItemIds, query],
  );

  function addItem(itemId: ItemId) {
    setCurrentItemIds((current) =>
      current.includes(itemId) ? current : [...current, itemId],
    );
    setRecentItemIds((current) => new Set([...current, itemId]));
  }

  function undoAdd(itemId: ItemId) {
    setCurrentItemIds((current) =>
      current.filter((candidate) => candidate !== itemId),
    );
    setRecentItemIds((current) => {
      const next = new Set(current);
      next.delete(itemId);
      return next;
    });
  }

  function reset() {
    setCurrentItemIds([]);
    setRecentItemIds(new Set());
    setQuery("");
  }

  return {
    availableItems,
    currentItems,
    query,
    recentItemIds,
    addItem,
    reset,
    setQuery,
    undoAdd,
  };
}

export function PrototypeFrame({
  currentItems,
  children,
}: {
  currentItems: Item[];
  children: (actions: { closePanel: () => void }) => ReactNode;
}) {
  const [panelOpen, setPanelOpen] = useState(true);
  const doneCount = currentItems.filter(
    (item) => item.status === Status.Done,
  ).length;

  return (
    <div className="empty-proto-frame">
      <div
        className={`trail-detail-layout empty-proto-layout${
          panelOpen ? "" : " is-panel-closed"
        }`}
      >
        <section className="trail-surface">
          <div className="empty-proto-trail-heading">
            <div>
              <p className="empty-proto-eyebrow">Trail</p>
              <h2>Learn React properly</h2>
            </div>
            <span className="empty-proto-saved">Saved</span>
          </div>

          <div className="empty-proto-canvas" aria-label="Trail canvas">
            <svg
              className="empty-proto-edges"
              viewBox="0 0 720 300"
              aria-hidden="true"
            >
              <path d="M118 155 C215 155 230 105 330 105" />
              <path d="M388 105 C485 105 505 155 604 155" />
            </svg>

            <StaticWaypoint
              className="is-first"
              name="Foundations"
              progress="3/3"
              done
            />

            <button
              type="button"
              className="empty-proto-waypoint is-open"
              aria-label={
                currentItems.length === 0
                  ? `Open ${OPEN_STOP.name} to add Items`
                  : `Open ${OPEN_STOP.name}, ${doneCount} of ${currentItems.length} Items done`
              }
              aria-pressed={panelOpen}
              onClick={() => setPanelOpen(true)}
            >
              <span className="empty-proto-medallion" aria-hidden="true">
                {currentItems.length === 0
                  ? "＋"
                  : `${doneCount}/${currentItems.length}`}
              </span>
              <span className="empty-proto-waypoint-name">
                {OPEN_STOP.name}
              </span>
              <span className="empty-proto-waypoint-hint">
                {currentItems.length === 0 ? "Add Items" : "Open Stop"}
              </span>
            </button>

            <StaticWaypoint
              className="is-last"
              name="Build something"
              progress="0/2"
            />
          </div>
        </section>

        {panelOpen && (
          <aside className="stop-sidebar empty-proto-panel">
            {children({ closePanel: () => setPanelOpen(false) })}
          </aside>
        )}
      </div>
    </div>
  );
}

function StaticWaypoint({
  className,
  name,
  progress,
  done = false,
}: {
  className: string;
  name: string;
  progress: string;
  done?: boolean;
}) {
  return (
    <div className={`empty-proto-waypoint is-static ${className}`}>
      <span
        className={`empty-proto-medallion${done ? " is-done" : ""}`}
        aria-hidden="true"
      >
        {done ? "✓" : progress}
      </span>
      <span className="empty-proto-waypoint-name">{name}</span>
    </div>
  );
}

export function StopPanelHeader({
  itemCount,
  closePanel,
  reset,
}: {
  itemCount: number;
  closePanel: () => void;
  reset: () => void;
}) {
  return (
    <>
      <div className="stop-view__heading empty-proto-panel-heading">
        <div>
          <p className="empty-proto-eyebrow">Stop</p>
          <h3>{OPEN_STOP.name}</h3>
        </div>
        <button type="button" className="quiet-button" onClick={closePanel}>
          Close
        </button>
      </div>
      <div className="empty-proto-state-line">
        <span>
          {itemCount} {itemCount === 1 ? "Item" : "Items"}
        </span>
        {itemCount > 0 && (
          <button type="button" onClick={reset}>
            Reset to empty
          </button>
        )}
      </div>
    </>
  );
}

export function SearchField({
  query,
  setQuery,
}: {
  query: string;
  setQuery: (query: string) => void;
}) {
  return (
    <label className="empty-proto-search-label">
      <span className="visually-hidden">Search the Library</span>
      <span className="empty-proto-search-icon" aria-hidden="true">
        ⌕
      </span>
      <input
        type="search"
        value={query}
        placeholder={`Search ${PROTOTYPE_ITEMS.length} Items…`}
        onChange={(event) => setQuery(event.target.value)}
      />
    </label>
  );
}

export function CurrentItemCard({
  item,
  recentlyAdded,
  undoAdd,
}: {
  item: Item;
  recentlyAdded: boolean;
  undoAdd: (itemId: ItemId) => void;
}) {
  return (
    <li className={`empty-proto-item${recentlyAdded ? " is-fresh" : ""}`}>
      <div>
        <strong>{item.title}</strong>
        <span>
          {TYPE_LABELS[item.type]} · {formatStatus(item)}
          {item.targetDate ? ` · Target ${item.targetDate}` : ""}
        </span>
      </div>
      {recentlyAdded && (
        <button type="button" onClick={() => undoAdd(item.id)}>
          Undo
        </button>
      )}
    </li>
  );
}

export function LibraryResult({
  item,
  addItem,
}: {
  item: Item;
  addItem: (itemId: ItemId) => void;
}) {
  const placements = PLACEMENTS.get(item.id) ?? [];
  return (
    <li>
      <button
        type="button"
        className="empty-proto-result"
        onClick={() => addItem(item.id)}
      >
        <span className="empty-proto-result-plus" aria-hidden="true">
          ＋
        </span>
        <span>
          <strong>{item.title}</strong>
          <small>
            {TYPE_LABELS[item.type]}
            {placements.length > 0 ? ` · ${placements.join(", ")}` : ""}
          </small>
        </span>
      </button>
    </li>
  );
}

export function NoResults({ query }: { query: string }) {
  return (
    <li className="empty-proto-no-results">
      <strong>No Items match “{query}”</strong>
      <span>Future: Capture this straight into the Stop (#136)</span>
    </li>
  );
}

function formatStatus(item: Item): string {
  if (item.status === Status.NotStarted) return "Not started";
  if (item.status === Status.InProgress) return "In progress";
  return "Done";
}
