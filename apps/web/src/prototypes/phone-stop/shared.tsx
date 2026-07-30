/**
 * PROTOTYPE — throwaway fixtures, in-memory state, and phone route primitives.
 * Ticket #218, map #211.
 */
import {
  useMemo,
  useState,
  type ReactNode,
  type RefObject,
} from "react";

export interface PrototypeItem {
  id: string;
  kind: string;
  placement?: string;
  status: string;
  title: string;
}

const ITEMS: PrototypeItem[] = [
  {
    id: "mental-model",
    kind: "Article",
    placement: "JavaScript · Foundations",
    status: "In progress",
    title: "A mental model for React",
  },
  {
    id: "typescript",
    kind: "Course",
    status: "Not started",
    title: "TypeScript for React developers",
  },
  {
    id: "accessibility",
    kind: "Guide",
    placement: "Frontend craft · Week 2",
    status: "Not started",
    title: "Accessible component patterns",
  },
  {
    id: "state",
    kind: "Article",
    status: "In progress",
    title: "Choosing state structure",
  },
  {
    id: "rendering",
    kind: "Video",
    placement: "React · Week 1",
    status: "Not started",
    title: "Rendering and commit phases",
  },
  {
    id: "testing",
    kind: "Book",
    status: "Not started",
    title: "Testing user behaviour",
  },
  {
    id: "effects",
    kind: "Guide",
    status: "Not started",
    title: "You might not need an Effect",
  },
  {
    id: "transitions",
    kind: "Talk",
    placement: "React · Concurrent UI",
    status: "Not started",
    title: "Transitions without mystery",
  },
  {
    id: "forms",
    kind: "Article",
    status: "Done",
    title: "Form actions from first principles",
  },
  {
    id: "composition",
    kind: "Essay",
    status: "Not started",
    title: "Composition over configuration",
  },
];

const POPULATED_IDS = ["mental-model", "typescript", "accessibility", "state"];

export interface PhoneStopState {
  addItem: (itemId: string) => void;
  allItems: PrototypeItem[];
  availableItems: PrototypeItem[];
  currentItems: PrototypeItem[];
  loadPopulated: () => void;
  query: string;
  recentItemId: string | null;
  resetEmpty: () => void;
  setQuery: (query: string) => void;
  undoAdd: (itemId: string) => void;
}

export function usePhoneStopState(): PhoneStopState {
  const [currentIds, setCurrentIds] = useState<string[]>(POPULATED_IDS);
  const [query, setQuery] = useState("");
  const [recentItemId, setRecentItemId] = useState<string | null>(null);
  const normalizedQuery = query.trim().toLowerCase();

  const currentItems = useMemo(
    () =>
      currentIds.flatMap((itemId) => {
        const item = ITEMS.find((candidate) => candidate.id === itemId);
        return item ? [item] : [];
      }),
    [currentIds],
  );
  const availableItems = useMemo(
    () =>
      ITEMS.filter(
        (item) =>
          !currentIds.includes(item.id) &&
          item.title.toLowerCase().includes(normalizedQuery),
      ),
    [currentIds, normalizedQuery],
  );

  const addItem = (itemId: string) => {
    setCurrentIds((current) =>
      current.includes(itemId) ? current : [itemId, ...current],
    );
    setRecentItemId(itemId);
  };
  const undoAdd = (itemId: string) => {
    setCurrentIds((current) =>
      current.filter((candidate) => candidate !== itemId),
    );
    setRecentItemId((current) => (current === itemId ? null : current));
  };
  const resetEmpty = () => {
    setCurrentIds([]);
    setRecentItemId(null);
    setQuery("");
  };
  const loadPopulated = () => {
    setCurrentIds(POPULATED_IDS);
    setRecentItemId(null);
    setQuery("");
  };

  return {
    addItem,
    allItems: ITEMS,
    availableItems,
    currentItems,
    loadPopulated,
    query,
    recentItemId,
    resetEmpty,
    setQuery,
    undoAdd,
  };
}

interface PhoneRouteFrameProps {
  children: ReactNode;
  claim: string;
  state: PhoneStopState;
}

export function PhoneRouteFrame({
  children,
  claim,
  state,
}: PhoneRouteFrameProps) {
  return (
    <main className="phone-proto-page">
      <div className="phone-proto-route">
        <header className="phone-proto-route-bar">
          <button type="button" aria-label="Back to Learn React properly">
            ←
          </button>
          <div>
            <span>Trail</span>
            <strong>Learn React properly</strong>
          </div>
          <span className="phone-proto-view-only">View only</span>
        </header>

        <div className="phone-proto-ticket-note">
          <span>Throwaway · ticket #218</span>
          <p>{claim}</p>
        </div>

        <header className="phone-proto-stop-header">
          <div>
            <span>Open Stop</span>
            <h1>React foundations</h1>
          </div>
          <span className="phone-proto-count">
            {state.currentItems.length}{" "}
            {state.currentItems.length === 1 ? "Item" : "Items"}
          </span>
        </header>

        <div className="phone-proto-state-controls" aria-label="Fixture state">
          <button type="button" onClick={state.resetEmpty}>
            Empty state
          </button>
          <button type="button" onClick={state.loadPopulated}>
            Populated state
          </button>
        </div>

        {children}
      </div>
    </main>
  );
}

interface CurrentItemsProps {
  cardRef?: RefObject<HTMLLIElement | null>;
  compact?: boolean;
  state: PhoneStopState;
}

export function CurrentItems({
  cardRef,
  compact = false,
  state,
}: CurrentItemsProps) {
  if (state.currentItems.length === 0) {
    return (
      <div className="phone-proto-empty-current">
        <span aria-hidden="true">＋</span>
        <p>
          <strong>This Stop is empty.</strong>
          Add its first Item from the Library below.
        </p>
      </div>
    );
  }

  return (
    <ul
      className={`phone-proto-current-list${
        compact ? " is-compact" : ""
      }`}
    >
      {state.currentItems.map((item) => {
        const isRecent = state.recentItemId === item.id;
        return (
          <li
            key={item.id}
            ref={isRecent ? cardRef : undefined}
            className={isRecent ? "is-recent" : undefined}
            data-current-id={item.id}
          >
            <div>
              <strong>{item.title}</strong>
              <span>
                {item.kind} · {item.status}
              </span>
            </div>
            {isRecent ? (
              <button type="button" onClick={() => state.undoAdd(item.id)}>
                Undo
              </button>
            ) : (
              <span className="phone-proto-item-mark" aria-hidden="true">
                ✓
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

interface LibraryIntakeProps {
  addItem: (itemId: string) => void;
  items?: PrototypeItem[];
  renderEcho?: (item: PrototypeItem) => ReactNode;
  showSearch?: boolean;
  state: PhoneStopState;
}

export function LibraryIntake({
  addItem,
  items,
  renderEcho,
  showSearch = true,
  state,
}: LibraryIntakeProps) {
  const results = items ?? state.availableItems;

  return (
    <>
      {showSearch && (
        <label className="phone-proto-search">
          <span className="phone-proto-search-icon" aria-hidden="true">
            ⌕
          </span>
          <span className="visually-hidden">Search your Library</span>
          <input
            type="search"
            value={state.query}
            placeholder={`Search ${state.allItems.length} Items…`}
            onChange={(event) => state.setQuery(event.target.value)}
          />
        </label>
      )}

      {results.length > 0 ? (
        <ul className="phone-proto-results">
          {results.map((item) => (
            <li key={item.id}>
              {renderEcho?.(item) ?? (
                <button
                  type="button"
                  className="phone-proto-result"
                  onClick={() => addItem(item.id)}
                >
                  <span aria-hidden="true">＋</span>
                  <span>
                    <strong>{item.title}</strong>
                    <small>
                      {item.kind}
                      {item.placement ? ` · ${item.placement}` : ""}
                    </small>
                  </span>
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <div className="phone-proto-no-results">
          <strong>No Items match “{state.query}”</strong>
          <span>Future seam: Capture into this Stop (#136)</span>
        </div>
      )}
    </>
  );
}

export function SectionHeading({
  detail,
  title,
}: {
  detail: string;
  title: string;
}) {
  return (
    <div className="phone-proto-section-heading">
      <h2>{title}</h2>
      <span>{detail}</span>
    </div>
  );
}

export function scrollToSection(sectionId: string) {
  document.getElementById(sectionId)?.scrollIntoView({
    behavior: "smooth",
    block: "start",
  });
}
