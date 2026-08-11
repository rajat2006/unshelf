import { useState } from "react";
import { useSearchParams } from "react-router";
import "./calm-resurfacing.css";

/**
 * FINALIZED THROWAWAY PROTOTYPE — issue #271.
 *
 * Preserves the selected Library B and Daily Planning D designs as a branch-only
 * decision artifact. It is not production implementation.
 */

type SurfaceKey = "library" | "focus";
type ItemStatus = "not-started" | "in-progress" | "done";

interface PrototypeItem {
  id: string;
  title: string;
  type: string;
  initialStatus: ItemStatus;
  ageMonths: number;
  saved: string;
  lastOpened: string;
  labels: string[];
}

const ITEMS: readonly PrototypeItem[] = [
  {
    id: "ddia",
    title: "Designing Data-Intensive Applications",
    type: "Book",
    initialStatus: "not-started",
    ageMonths: 11,
    saved: "11 months ago",
    lastOpened: "7 months ago",
    labels: ["Distributed systems", "Databases"],
  },
  {
    id: "raft",
    title: "The Secret Lives of Data — Raft",
    type: "Article",
    initialStatus: "not-started",
    ageMonths: 10,
    saved: "10 months ago",
    lastOpened: "Never",
    labels: ["Distributed systems", "Visual explanation"],
  },
  {
    id: "software-design",
    title: "A Philosophy of Software Design",
    type: "Book",
    initialStatus: "not-started",
    ageMonths: 8,
    saved: "8 months ago",
    lastOpened: "5 months ago",
    labels: ["Architecture", "Craft"],
  },
  {
    id: "visual-display",
    title: "The Visual Display of Quantitative Information",
    type: "Book",
    initialStatus: "not-started",
    ageMonths: 21,
    saved: "1 year 9 months ago",
    lastOpened: "Never",
    labels: ["Design", "Reference"],
  },
  {
    id: "browsers",
    title: "How Browsers Work: Behind the Scenes",
    type: "Article",
    initialStatus: "not-started",
    ageMonths: 15,
    saved: "1 year 3 months ago",
    lastOpened: "1 year ago",
    labels: ["Web platform", "Architecture"],
  },
  {
    id: "explain",
    title: "Explaining Technical Ideas Clearly",
    type: "Video",
    initialStatus: "not-started",
    ageMonths: 6,
    saved: "6 months ago",
    lastOpened: "Never",
    labels: ["Writing", "Communication"],
  },
  {
    id: "linear-algebra",
    title: "Essence of Linear Algebra",
    type: "Playlist",
    initialStatus: "in-progress",
    ageMonths: 3,
    saved: "3 months ago",
    lastOpened: "3 weeks ago",
    labels: ["Mathematics", "Visual explanation"],
  },
];

const INITIAL_FOCUS_IDS = ["linear-algebra", "ddia", "explain"];

function initialItemStatuses() {
  return Object.fromEntries(
    ITEMS.map((item) => [item.id, item.initialStatus]),
  ) as Record<string, ItemStatus>;
}

function isSurfaceKey(value: string | null): value is SurfaceKey {
  return value === "library" || value === "focus";
}

export function CalmResurfacingPrototype() {
  const [searchParams] = useSearchParams();
  const requestedSurface = searchParams.get("surface");
  const surface: SurfaceKey = isSurfaceKey(requestedSurface)
    ? requestedSurface
    : "focus";
  const [libraryQuery, setLibraryQuery] = useState("");
  const [facet, setFacet] = useState("All Items");
  const [selectedItemId, setSelectedItemId] = useState(ITEMS[0].id);
  const [focusIds, setFocusIds] = useState<string[]>(INITIAL_FOCUS_IDS);
  const [dismissedIds, setDismissedIds] = useState<string[]>([]);
  const [itemStatuses, setItemStatuses] =
    useState<Record<string, ItemStatus>>(initialItemStatuses);
  const [focusQuery, setFocusQuery] = useState("");
  const [lastAction, setLastAction] = useState("No prototype action yet.");

  const addToFocus = (item: PrototypeItem) => {
    setFocusIds((current) =>
      current.includes(item.id) ? current : [...current, item.id],
    );
    setDismissedIds((current) => current.filter((id) => id !== item.id));
    setLastAction(`Added “${item.title}” to today.`);
  };

  const dismissForToday = (item: PrototypeItem) => {
    setDismissedIds((current) =>
      current.includes(item.id) ? current : [...current, item.id],
    );
    setLastAction(`Skipped “${item.title}” for today only.`);
  };

  const removeFromFocus = (item: PrototypeItem) => {
    setFocusIds((current) => current.filter((id) => id !== item.id));
    setLastAction(`Removed “${item.title}” from today.`);
  };

  const openFocusItem = (item: PrototypeItem) => {
    setItemStatuses((current) => ({
      ...current,
      [item.id]: "in-progress",
    }));
    setLastAction(`Started “${item.title}” from today’s plan.`);
  };

  const updateItemStatus = ({
    item,
    status,
  }: {
    item: PrototypeItem;
    status: ItemStatus;
  }) => {
    setItemStatuses((current) => ({ ...current, [item.id]: status }));
    setLastAction(`Changed “${item.title}” to ${statusLabel(status)}.`);
  };

  const resetScenario = () => {
    setLibraryQuery("");
    setFacet("All Items");
    setSelectedItemId(ITEMS[0].id);
    setFocusIds(INITIAL_FOCUS_IDS);
    setDismissedIds([]);
    setItemStatuses(initialItemStatuses());
    setFocusQuery("");
    setLastAction("Prototype state reset.");
  };

  const focusCandidates = ITEMS.filter(
    (item) => !focusIds.includes(item.id) && !dismissedIds.includes(item.id),
  );

  return (
    <section className="surface-prototype" aria-labelledby="prototype-heading">
      <div className="prototype-notice" role="note">
        <strong>Finalized throwaway prototype</strong>
        <span>Selected outcome: Library B + Daily Planning D.</span>
      </div>

      {surface === "library" ? (
        <LibraryCatalog
          facet={facet}
          setFacet={setFacet}
          selectedItemId={selectedItemId}
          setSelectedItemId={setSelectedItemId}
          query={libraryQuery}
          setQuery={setLibraryQuery}
          itemStatuses={itemStatuses}
        />
      ) : (
        <DailyPlanning
          focusIds={focusIds}
          candidates={focusCandidates}
          itemStatuses={itemStatuses}
          addToFocus={addToFocus}
          dismissForToday={dismissForToday}
          removeFromFocus={removeFromFocus}
          openItem={openFocusItem}
          updateItemStatus={updateItemStatus}
          query={focusQuery}
          setQuery={setFocusQuery}
        />
      )}

      <PrototypeState
        surface={surface}
        focusIds={focusIds}
        itemStatuses={itemStatuses}
        dismissedIds={dismissedIds}
        query={surface === "library" ? libraryQuery : focusQuery}
        lastAction={lastAction}
        onReset={resetScenario}
      />
    </section>
  );
}

interface LibraryCatalogProps {
  facet: string;
  setFacet: (facet: string) => void;
  selectedItemId: string;
  setSelectedItemId: (itemId: string) => void;
  query: string;
  setQuery: (query: string) => void;
  itemStatuses: Readonly<Record<string, ItemStatus>>;
}

function LibraryCatalog({
  facet,
  setFacet,
  selectedItemId,
  setSelectedItemId,
  query,
  setQuery,
  itemStatuses,
}: LibraryCatalogProps) {
  const viewFacets = [
    "All Items",
    "In progress",
    "Books",
    "Articles",
    "Unlabelled",
  ];
  const labelFacets = [
    "Distributed systems",
    "Architecture",
    "Writing",
    "Design",
  ];
  const normalizedQuery = query.trim().toLowerCase();
  const visibleItems = ITEMS.filter((item) => {
    const status = itemStatuses[item.id] ?? item.initialStatus;
    const matchesFacet =
      facet === "In progress"
        ? status === "in-progress"
        : facet === "Books"
          ? item.type === "Book"
          : facet === "Articles"
            ? item.type === "Article"
            : facet === "Unlabelled"
              ? item.labels.length === 0
              : labelFacets.includes(facet)
                ? item.labels.includes(facet)
                : true;
    return matchesFacet && itemMatchesQuery({ item, query: normalizedQuery });
  });
  const selectedItem =
    ITEMS.find((item) => item.id === selectedItemId) ??
    visibleItems[0] ??
    ITEMS[0];
  const selectedStatus =
    itemStatuses[selectedItem.id] ?? selectedItem.initialStatus;

  return (
    <div className="library-catalog">
      <header className="prototype-page-heading compact-heading">
        <div>
          <p className="prototype-eyebrow">Selected Library design</p>
          <h1 id="prototype-heading">Library</h1>
        </div>
        <input
          aria-label="Search catalog"
          placeholder="Search 128 Items"
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
        />
      </header>
      <div className="catalog-layout">
        <aside className="catalog-facets" aria-label="Library facets">
          <strong>Views</strong>
          {viewFacets.map((name) => (
            <button
              type="button"
              aria-pressed={facet === name}
              key={name}
              onClick={() => setFacet(name)}
            >
              <span>{name}</span>
              <small>{facetCount({ facet: name, itemStatuses })}</small>
            </button>
          ))}
          <strong>Labels</strong>
          {labelFacets.map((name) => (
            <button
              type="button"
              aria-pressed={facet === name}
              key={name}
              onClick={() => setFacet(name)}
            >
              <span>{name}</span>
              <small>{facetCount({ facet: name, itemStatuses })}</small>
            </button>
          ))}
        </aside>
        <div className="catalog-table" role="list" aria-label={facet}>
          <div className="catalog-table-heading">
            <span>{facet}</span>
            <span>Type</span>
            <span>Status</span>
          </div>
          {visibleItems.map((item) => (
            <button
              type="button"
              role="listitem"
              className={selectedItem.id === item.id ? "is-selected" : ""}
              key={item.id}
              onClick={() => setSelectedItemId(item.id)}
            >
              <span>{item.title}</span>
              <span>{item.type}</span>
              <span>
                {statusLabel(itemStatuses[item.id] ?? item.initialStatus)}
              </span>
            </button>
          ))}
        </div>
        <aside className="catalog-preview" aria-label="Selected Item">
          <span>{selectedItem.type}</span>
          <h2>{selectedItem.title}</h2>
          <p>{statusLabel(selectedStatus)}</p>
          <dl>
            <div>
              <dt>Kept</dt>
              <dd>{selectedItem.saved}</dd>
            </div>
            <div>
              <dt>Last opened</dt>
              <dd>{selectedItem.lastOpened}</dd>
            </div>
          </dl>
          <div className="prototype-labels">
            {selectedItem.labels.map((label) => (
              <span key={label}>{label}</span>
            ))}
          </div>
          <button type="button">Open Item</button>
        </aside>
      </div>
    </div>
  );
}

function facetCount({
  facet,
  itemStatuses,
}: {
  facet: string;
  itemStatuses: Readonly<Record<string, ItemStatus>>;
}) {
  if (facet === "In progress") {
    return ITEMS.filter(
      (item) => (itemStatuses[item.id] ?? item.initialStatus) === "in-progress",
    ).length;
  }
  if (facet === "Books")
    return ITEMS.filter((item) => item.type === "Book").length;
  if (facet === "Articles") {
    return ITEMS.filter((item) => item.type === "Article").length;
  }
  if (facet === "Unlabelled") {
    return ITEMS.filter((item) => item.labels.length === 0).length;
  }
  if (facet !== "All Items") {
    return ITEMS.filter((item) => item.labels.includes(facet)).length;
  }
  return 128;
}

interface DailyPlanningProps {
  focusIds: readonly string[];
  candidates: readonly PrototypeItem[];
  itemStatuses: Readonly<Record<string, ItemStatus>>;
  addToFocus: (item: PrototypeItem) => void;
  dismissForToday: (item: PrototypeItem) => void;
  removeFromFocus: (item: PrototypeItem) => void;
  openItem: (item: PrototypeItem) => void;
  updateItemStatus: (input: {
    item: PrototypeItem;
    status: ItemStatus;
  }) => void;
  query: string;
  setQuery: (query: string) => void;
}

function DailyPlanning({
  focusIds,
  candidates,
  itemStatuses,
  addToFocus,
  dismissForToday,
  removeFromFocus,
  openItem,
  updateItemStatus,
  query,
  setQuery,
}: DailyPlanningProps) {
  const recentItems = recentCandidates(candidates);
  const suggestionPool = query.trim()
    ? candidates
    : candidates.filter(
        (item) => !recentItems.some((recent) => recent.id === item.id),
      );
  const smartItems = [...suggestionPool].sort(
    (first, second) =>
      relevanceScore({
        item: second,
        query,
        focusIds,
        itemStatuses,
      }) -
      relevanceScore({
        item: first,
        query,
        focusIds,
        itemStatuses,
      }),
  );

  return (
    <div className="daily-planning">
      <header className="prototype-page-heading focus-heading">
        <div>
          <p className="prototype-eyebrow">Selected Daily Planning design</p>
          <h1 id="prototype-heading">Tuesday, 11 August</h1>
          <p>
            Your plan is ready. Work from it here; reshape it from the side.
          </p>
        </div>
        <span className="plan-ready-badge">Plan ready</span>
      </header>
      <div className="focus-sidecar-layout">
        <DailyPlanCanvas
          focusIds={focusIds}
          itemStatuses={itemStatuses}
          openItem={openItem}
          removeFromFocus={removeFromFocus}
          updateItemStatus={updateItemStatus}
        />
        <aside
          className="smart-sidecar"
          aria-label="Search and recommendations"
        >
          <SmartFocusSearch
            query={query}
            setQuery={setQuery}
            candidates={candidates}
            itemStatuses={itemStatuses}
            addToFocus={addToFocus}
          />
          <section>
            <div className="sidecar-section-heading">
              <h2>Recently added</h2>
              <span>Newest first</span>
            </div>
            {recentItems.slice(0, 3).map((item) => (
              <SidecarItem
                item={item}
                reason={`Kept ${item.saved}`}
                key={item.id}
                onAdd={() => addToFocus(item)}
              />
            ))}
          </section>
          <section>
            <div className="sidecar-section-heading">
              <h2>Suggested for you</h2>
              <span>
                {query.trim() ? "Using your input" : "Based on today"}
              </span>
            </div>
            {smartItems.slice(0, 3).map((item) => (
              <SidecarItem
                item={item}
                reason={suggestionReason({
                  item,
                  query,
                  focusIds,
                  itemStatuses,
                })}
                key={item.id}
                onAdd={() => addToFocus(item)}
                onDismiss={() => dismissForToday(item)}
              />
            ))}
          </section>
        </aside>
      </div>
    </div>
  );
}

function SmartFocusSearch({
  query,
  setQuery,
  candidates,
  itemStatuses,
  addToFocus,
}: {
  query: string;
  setQuery: (query: string) => void;
  candidates: readonly PrototypeItem[];
  itemStatuses: Readonly<Record<string, ItemStatus>>;
  addToFocus: (item: PrototypeItem) => void;
}) {
  const results = filterCandidates({ candidates, query });

  return (
    <section className="smart-focus-search">
      <label htmlFor="focus-intention-search">
        Search or describe your intention
      </label>
      <input
        id="focus-intention-search"
        value={query}
        placeholder="Find an Item, or say what you want to learn…"
        onChange={(event) => setQuery(event.currentTarget.value)}
      />
      {query.trim() && (
        <div className="smart-focus-search-results">
          {results.slice(0, 3).map((item) => (
            <PickerResult
              item={item}
              status={itemStatuses[item.id] ?? item.initialStatus}
              key={item.id}
              onAdd={() => addToFocus(item)}
            />
          ))}
          {results.length === 0 && (
            <p>
              No direct title or Label match. Suggestions use matching words
              where possible, then fall back to today’s context.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function PickerResult({
  item,
  status,
  onAdd,
}: {
  item: PrototypeItem;
  status: ItemStatus;
  onAdd: () => void;
}) {
  return (
    <article className="picker-result">
      <div>
        <strong>{item.title}</strong>
        <span>
          {item.type} · {statusLabel(status)}
        </span>
      </div>
      <button type="button" onClick={onAdd}>
        Add to today
      </button>
    </article>
  );
}

function SidecarItem({
  item,
  reason,
  onAdd,
  onDismiss,
}: {
  item: PrototypeItem;
  reason: string;
  onAdd: () => void;
  onDismiss?: () => void;
}) {
  return (
    <article className="sidecar-item">
      <span>{item.type}</span>
      <strong>{item.title}</strong>
      <p>{reason}</p>
      <div>
        <button type="button" onClick={onAdd}>
          Add
        </button>
        {onDismiss && (
          <button type="button" onClick={onDismiss}>
            Not today
          </button>
        )}
      </div>
    </article>
  );
}

function DailyPlanCanvas({
  focusIds,
  itemStatuses,
  openItem,
  removeFromFocus,
  updateItemStatus,
}: {
  focusIds: readonly string[];
  itemStatuses: Readonly<Record<string, ItemStatus>>;
  openItem: (item: PrototypeItem) => void;
  removeFromFocus: (item: PrototypeItem) => void;
  updateItemStatus: (input: {
    item: PrototypeItem;
    status: ItemStatus;
  }) => void;
}) {
  const focusedItems = ITEMS.filter((item) => focusIds.includes(item.id));
  const doneCount = focusedItems.filter(
    (item) => itemStatuses[item.id] === "done",
  ).length;
  const progressPercent =
    focusedItems.length === 0
      ? 0
      : Math.round((doneCount / focusedItems.length) * 100);
  const currentItem =
    focusedItems.find((item) => itemStatuses[item.id] === "in-progress") ??
    focusedItems.find((item) => itemStatuses[item.id] !== "done");
  const currentStatus = currentItem
    ? (itemStatuses[currentItem.id] ?? currentItem.initialStatus)
    : undefined;

  return (
    <main className="daily-plan-canvas">
      <div className="daily-plan-heading">
        <div>
          <p className="prototype-eyebrow">Today’s plan</p>
          <h2>Your learning agenda</h2>
          <p>Follow the sequence, or open whichever Item feels right.</p>
        </div>
        <div className="daily-plan-total">
          <strong>{focusedItems.length} Items</strong>
          <span>chosen for today</span>
        </div>
      </div>

      {currentItem && currentStatus && (
        <section className="plan-next-up">
          <div>
            <span>
              {currentStatus === "in-progress"
                ? "Current learning phase"
                : "Up next"}
            </span>
            <strong>{currentItem.title}</strong>
            <p>
              {currentItem.type} · {statusLabel(currentStatus)}
            </p>
            <div className="status-track" aria-label="Current Item Status">
              <span className="is-reached">Not started</span>
              <span
                className={currentStatus === "in-progress" ? "is-reached" : ""}
              >
                In progress
              </span>
              <span>Done</span>
            </div>
          </div>
          <div className="current-phase-actions">
            <button type="button" onClick={() => openItem(currentItem)}>
              {currentStatus === "in-progress" ? "Continue" : "Start"}
            </button>
            <button
              type="button"
              onClick={() =>
                updateItemStatus({ item: currentItem, status: "done" })
              }
            >
              Mark done
            </button>
          </div>
        </section>
      )}

      {focusedItems.length > 0 && !currentItem && (
        <section className="plan-complete-state">
          <span>Plan complete</span>
          <strong>You finished everything chosen for today.</strong>
        </section>
      )}

      <section className="plan-agenda-section">
        <div className="plan-agenda-heading">
          <h3>Agenda</h3>
          <span>Work in any order</span>
        </div>
        <ol className="daily-plan-agenda">
          {focusedItems.map((item, index) => {
            const status = itemStatuses[item.id] ?? item.initialStatus;
            return (
              <li className={`is-${status}`} key={item.id}>
                <button
                  className="agenda-remove-button"
                  type="button"
                  aria-label={`Remove ${item.title} from today`}
                  title="Remove from today"
                  onClick={() => removeFromFocus(item)}
                >
                  ×
                </button>
                <span className="agenda-order">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div className="agenda-item-copy">
                  <span>
                    {item.type} · {item.labels[0]}
                  </span>
                  <strong>{item.title}</strong>
                  <p>
                    {status === "done"
                      ? "Done"
                      : status === "in-progress"
                        ? "Continue from where you left off"
                        : "Ready when you are"}
                  </p>
                </div>
                <label className="agenda-status-control">
                  <span>Status</span>
                  <select
                    aria-label={`Status for ${item.title}`}
                    value={status}
                    onChange={(event) =>
                      updateItemStatus({
                        item,
                        status: event.currentTarget.value as ItemStatus,
                      })
                    }
                  >
                    <option value="not-started">Not started</option>
                    <option value="in-progress">In progress</option>
                    <option value="done">Done</option>
                  </select>
                </label>
              </li>
            );
          })}
          {focusedItems.length === 0 && (
            <li className="empty-plan-row">
              Your plan is empty. Add an Item from search or suggestions.
            </li>
          )}
        </ol>
      </section>

      <footer className="daily-plan-footer">
        <span>
          {doneCount} of {focusedItems.length} done
        </span>
        <div
          role="progressbar"
          aria-label="Today’s plan completion"
          aria-valuemin={0}
          aria-valuemax={focusedItems.length}
          aria-valuenow={doneCount}
        >
          <span style={{ width: `${progressPercent}%` }} />
        </div>
      </footer>
    </main>
  );
}

function filterCandidates({
  candidates,
  query,
}: {
  candidates: readonly PrototypeItem[];
  query: string;
}) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return [];
  return candidates.filter((item) =>
    itemMatchesQuery({ item, query: normalized }),
  );
}

function itemMatchesQuery({
  item,
  query,
}: {
  item: PrototypeItem;
  query: string;
}) {
  if (!query) return true;
  return [item.title, item.type, ...item.labels]
    .join(" ")
    .toLowerCase()
    .includes(query);
}

function queryTerms(query: string) {
  return query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((term) => term.length >= 3);
}

function matchingTerm({ item, query }: { item: PrototypeItem; query: string }) {
  const haystack = [item.title, item.type, ...item.labels]
    .join(" ")
    .toLowerCase();
  return queryTerms(query).find((term) => haystack.includes(term));
}

function relevanceScore({
  item,
  query,
  focusIds,
  itemStatuses,
}: {
  item: PrototypeItem;
  query: string;
  focusIds: readonly string[];
  itemStatuses: Readonly<Record<string, ItemStatus>>;
}) {
  const todayLabels = ITEMS.filter((candidate) =>
    focusIds.includes(candidate.id),
  ).flatMap((candidate) => candidate.labels);
  const sharedLabelCount = item.labels.filter((label) =>
    todayLabels.includes(label),
  ).length;
  const status = itemStatuses[item.id] ?? item.initialStatus;
  return (
    (matchingTerm({ item, query }) ? 10 : 0) +
    sharedLabelCount * 3 +
    (status === "in-progress" ? 2 : 0) +
    Math.min(item.ageMonths / 12, 2)
  );
}

function recentCandidates(candidates: readonly PrototypeItem[]) {
  const recentOrder = ["linear-algebra", "explain", "software-design", "raft"];
  return recentOrder
    .map((id) => candidates.find((item) => item.id === id))
    .filter((item): item is PrototypeItem => item !== undefined);
}

function suggestionReason({
  item,
  query,
  focusIds,
  itemStatuses,
}: {
  item: PrototypeItem;
  query: string;
  focusIds: readonly string[];
  itemStatuses: Readonly<Record<string, ItemStatus>>;
}) {
  const term = matchingTerm({ item, query });
  if (term) return `Matches your input through “${term}”`;
  const todayLabels = ITEMS.filter((candidate) =>
    focusIds.includes(candidate.id),
  ).flatMap((candidate) => candidate.labels);
  const sharedLabel = item.labels.find((label) => todayLabels.includes(label));
  if (sharedLabel) return `Connects with today through ${sharedLabel}`;
  if ((itemStatuses[item.id] ?? item.initialStatus) === "in-progress") {
    return "Already in progress";
  }
  if (item.ageMonths >= 12) return `Worth revisiting · kept ${item.saved}`;
  return `An older Library option · kept ${item.saved}`;
}

function statusLabel(status: ItemStatus) {
  if (status === "in-progress") return "In progress";
  if (status === "done") return "Done";
  return "Not started";
}

function PrototypeState({
  surface,
  focusIds,
  itemStatuses,
  dismissedIds,
  query,
  lastAction,
  onReset,
}: {
  surface: SurfaceKey;
  focusIds: readonly string[];
  itemStatuses: Readonly<Record<string, ItemStatus>>;
  dismissedIds: readonly string[];
  query: string;
  lastAction: string;
  onReset: () => void;
}) {
  const doneCount = Object.values(itemStatuses).filter(
    (status) => status === "done",
  ).length;

  return (
    <aside className="prototype-state" aria-label="Prototype state">
      <div>
        <strong>Test state</strong>
        <span>{surface === "focus" ? "Daily Planning" : "Library"}</span>
        <span>Query: {query || "none"}</span>
        <span>Today: {focusIds.length}</span>
        <span>Not today: {dismissedIds.length}</span>
        <span>Done: {doneCount}</span>
      </div>
      <p aria-live="polite">{lastAction}</p>
      <button type="button" onClick={onReset}>
        Reset scenario
      </button>
    </aside>
  );
}
