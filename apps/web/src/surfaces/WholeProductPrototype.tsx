import { useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router";
import { isEditableTarget } from "../shell/isEditableTarget";
import "./whole-product-prototype.css";

/**
 * PROTOTYPE — throwaway, in-memory, and development-only.
 *
 * Three variants of the complete bookmark-to-action workspace, switchable via
 * `?variant=`, with v0 and AI-assisted v1 compared via `?phase=`, on the
 * dedicated `/prototype/bookmark-to-action` route.
 *
 * Question: which product structure makes Capture/Import → Inbox → Library →
 * Plans → Today easiest to understand, and how should AI layer onto it without
 * taking control away from the User?
 */

const VARIANTS = [
  { id: "A", name: "Workflow rail" },
  { id: "B", name: "Focus dashboard" },
  { id: "C", name: "Action pipeline" },
] as const;

type VariantId = (typeof VARIANTS)[number]["id"];
type Phase = "v0" | "v1";
type Surface = "today" | "inbox" | "library" | "plans";
type SavedLifecycle = "active" | "archived" | "trashed";
type Progress = "none" | "not-started" | "in-progress" | "done";

interface PrototypeItem {
  id: string;
  title: string;
  source: string;
  domain: string;
  type: string;
  labels: string[];
  savedAt: string;
  reviewed: boolean;
  lifecycle: SavedLifecycle;
  progress: Progress;
  planId: string | null;
  why: string;
  importBatch: string | null;
}

interface PrototypePlan {
  id: string;
  name: string;
  outcome: string;
  itemIds: string[];
}

interface AiProposal {
  id: string;
  itemId: string;
  type: string;
  labels: string[];
  reason: string;
}

interface PrototypeState {
  surface: Surface;
  items: PrototypeItem[];
  plans: PrototypePlan[];
  todayIds: string[];
  savedViews: string[];
  selectedItemId: string | null;
  activeFilter: string;
  aiProposals: AiProposal[];
  lastAction: string;
}

interface PrototypeActions {
  setSurface: (surface: Surface) => void;
  selectItem: (itemId: string) => void;
  review: (itemId: string) => void;
  archive: (itemId: string) => void;
  addToPlan: (itemId: string) => void;
  addToToday: (itemId: string) => void;
  toggleDone: (itemId: string) => void;
  setFilter: (filter: string) => void;
  saveView: () => void;
  acceptAiProposal: (proposalId: string) => void;
  dismissAiProposal: (proposalId: string) => void;
  generatePlanDraft: () => void;
  openCapture: () => void;
  openImport: () => void;
}

interface VariantProps {
  phase: Phase;
  state: PrototypeState;
  actions: PrototypeActions;
}

const INITIAL_ITEMS: PrototypeItem[] = [
  {
    id: "item-rsc",
    title: "React Server Components explained",
    source: "https://youtube.com/watch?v=unshelf",
    domain: "youtube.com",
    type: "Video",
    labels: ["React", "Frontend"],
    savedAt: "Today, 09:42",
    reviewed: true,
    lifecycle: "active",
    progress: "in-progress",
    planId: "plan-product",
    why: "Understand the rendering trade-offs before the next architecture review.",
    importBatch: null,
  },
  {
    id: "item-jaipur",
    title: "A quiet weekend in Jaipur",
    source: "https://example.com/jaipur-weekend",
    domain: "example.com",
    type: "Article",
    labels: ["Travel"],
    savedAt: "Today, 08:10",
    reviewed: false,
    lifecycle: "active",
    progress: "none",
    planId: null,
    why: "Possible itinerary for the October break.",
    importBatch: null,
  },
  {
    id: "item-desk",
    title: "Standing desk comparison: 2026 models",
    source: "https://workspace.example/desks",
    domain: "workspace.example",
    type: "Product",
    labels: [],
    savedAt: "Yesterday",
    reviewed: false,
    lifecycle: "active",
    progress: "none",
    planId: null,
    why: "",
    importBatch: "Chrome import · Aug 18",
  },
  {
    id: "item-book",
    title: "A Philosophy of Software Design",
    source: "",
    domain: "Offline",
    type: "Book",
    labels: ["Software design"],
    savedAt: "Aug 14",
    reviewed: true,
    lifecycle: "active",
    progress: "not-started",
    planId: "plan-product",
    why: "Build a shared vocabulary for module depth.",
    importBatch: null,
  },
  {
    id: "item-sourdough",
    title: "Weekend sourdough schedule",
    source: "https://bread.example/schedule",
    domain: "bread.example",
    type: "Web page",
    labels: ["Recipes"],
    savedAt: "Aug 09",
    reviewed: true,
    lifecycle: "active",
    progress: "none",
    planId: null,
    why: "Reference when starting a loaf on Friday evening.",
    importBatch: "Chrome import · Aug 18",
  },
  {
    id: "item-research",
    title: "Practical methods for continuous discovery",
    source: "https://research.example/discovery.pdf",
    domain: "research.example",
    type: "File",
    labels: ["Research", "Product"],
    savedAt: "Aug 02",
    reviewed: true,
    lifecycle: "active",
    progress: "done",
    planId: "plan-product",
    why: "Use the interview cadence in the v0 study.",
    importBatch: null,
  },
];

const INITIAL_PLANS: PrototypePlan[] = [
  {
    id: "plan-product",
    name: "Build better product instincts",
    outcome: "Make stronger evidence-based product calls this quarter.",
    itemIds: ["item-research", "item-rsc", "item-book"],
  },
];

const INITIAL_AI_PROPOSALS: AiProposal[] = [
  {
    id: "ai-jaipur",
    itemId: "item-jaipur",
    type: "Article",
    labels: ["Travel", "Jaipur"],
    reason: "The title and page metadata describe a destination guide.",
  },
  {
    id: "ai-desk",
    itemId: "item-desk",
    type: "Product",
    labels: ["Workspace", "Buying research"],
    reason: "This compares purchasable desk models across vendors.",
  },
];

export function WholeProductPrototype() {
  const [searchParams, setSearchParams] = useSearchParams();
  const variant = prototypeVariant(searchParams.get("variant"));
  const phase = prototypePhase(searchParams.get("phase"));
  const [surface, setSurface] = useState<Surface>("today");
  const [items, setItems] = useState(INITIAL_ITEMS);
  const [plans, setPlans] = useState(INITIAL_PLANS);
  const [todayIds, setTodayIds] = useState(["item-rsc"]);
  const [savedViews, setSavedViews] = useState(["Watch this weekend"]);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(
    "item-rsc",
  );
  const [activeFilter, setActiveFilter] = useState("All active");
  const [aiProposals, setAiProposals] = useState(INITIAL_AI_PROPOSALS);
  const [lastAction, setLastAction] = useState(
    "Prototype loaded — no data is persisted.",
  );
  const [captureOpen, setCaptureOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const updateItem = (
    itemId: string,
    change: (item: PrototypeItem) => PrototypeItem,
  ) => {
    setItems((current) =>
      current.map((item) => (item.id === itemId ? change(item) : item)),
    );
  };

  const actions: PrototypeActions = {
    setSurface: (nextSurface) => {
      setSurface(nextSurface);
      setLastAction(`Opened ${surfaceLabel(nextSurface)}.`);
    },
    selectItem: (itemId) => {
      setSelectedItemId(itemId);
      const item = items.find((candidate) => candidate.id === itemId);
      setLastAction(`Selected ${item?.title ?? "Item"}.`);
    },
    review: (itemId) => {
      updateItem(itemId, (item) => ({ ...item, reviewed: true }));
      setLastAction("Kept in Library and marked reviewed. Undo is available.");
    },
    archive: (itemId) => {
      updateItem(itemId, (item) => ({ ...item, lifecycle: "archived" }));
      setLastAction(
        "Archived. The Item is still searchable and can be restored.",
      );
    },
    addToPlan: (itemId) => {
      updateItem(itemId, (item) => ({
        ...item,
        planId: "plan-product",
        reviewed: true,
        progress: item.progress === "none" ? "not-started" : item.progress,
      }));
      setPlans((current) =>
        current.map((plan) =>
          plan.id === "plan-product" && !plan.itemIds.includes(itemId)
            ? { ...plan, itemIds: [...plan.itemIds, itemId] }
            : plan,
        ),
      );
      setLastAction(
        "Added to “Build better product instincts” as the next Item.",
      );
    },
    addToToday: (itemId) => {
      setTodayIds((current) =>
        current.includes(itemId) ? current : [...current, itemId],
      );
      setLastAction(
        "Added to Today. Plan order and Library membership did not change.",
      );
    },
    toggleDone: (itemId) => {
      updateItem(itemId, (item) => ({
        ...item,
        progress: item.progress === "done" ? "in-progress" : "done",
      }));
      setLastAction("Updated progress. The next Plan Item is ready to choose.");
    },
    setFilter: (filter) => {
      setActiveFilter(filter);
      setLastAction(`Applied Library filter: ${filter}.`);
    },
    saveView: () => {
      const view =
        activeFilter === "All active" ? "Recent references" : activeFilter;
      setSavedViews((current) =>
        current.includes(view) ? current : [...current, view],
      );
      setLastAction(`Saved “${view}” as a reusable Library View.`);
    },
    acceptAiProposal: (proposalId) => {
      const proposal = aiProposals.find(
        (candidate) => candidate.id === proposalId,
      );
      if (!proposal) return;
      updateItem(proposal.itemId, (item) => ({
        ...item,
        type: proposal.type,
        labels: proposal.labels,
      }));
      setAiProposals((current) =>
        current.filter((candidate) => candidate.id !== proposalId),
      );
      setLastAction("Accepted an AI proposal after review. Undo is available.");
    },
    dismissAiProposal: (proposalId) => {
      setAiProposals((current) =>
        current.filter((candidate) => candidate.id !== proposalId),
      );
      setLastAction("Dismissed an AI proposal. No Item fields changed.");
    },
    generatePlanDraft: () => {
      const unplanned = items.find(
        (item) => item.lifecycle === "active" && item.planId === null,
      );
      if (unplanned) {
        actions.addToPlan(unplanned.id);
        setLastAction(
          `Reviewed an AI Plan draft and accepted “${unplanned.title}” as the next Item.`,
        );
      }
    },
    openCapture: () => setCaptureOpen(true),
    openImport: () => setImportOpen(true),
  };

  const state: PrototypeState = {
    surface,
    items,
    plans,
    todayIds,
    savedViews,
    selectedItemId,
    activeFilter,
    aiProposals,
    lastAction,
  };

  return (
    <div className={`whole-product-prototype is-${phase}`}>
      <div className="whole-product-prototype__notice">
        <strong>PROTOTYPE · wipe me</strong>
        <span>
          {phase === "v0"
            ? "v0 — manual, transparent bookmark-to-action loop"
            : "v1 — v0 plus reviewable AI proposals"}
        </span>
      </div>
      {variant === "A" && (
        <VariantA phase={phase} state={state} actions={actions} />
      )}
      {variant === "B" && (
        <VariantB phase={phase} state={state} actions={actions} />
      )}
      {variant === "C" && (
        <VariantC phase={phase} state={state} actions={actions} />
      )}
      <PrototypeStateInspector phase={phase} variant={variant} state={state} />
      <PrototypeSwitcher
        current={variant}
        phase={phase}
        onChange={(nextVariant, nextPhase) => {
          const next = new URLSearchParams(searchParams);
          next.set("variant", nextVariant);
          next.set("phase", nextPhase);
          setSearchParams(next, { replace: true });
        }}
      />
      {captureOpen && (
        <CapturePrototype
          phase={phase}
          onClose={() => setCaptureOpen(false)}
          onSave={({ source, title, type }) => {
            const id = `captured-${crypto.randomUUID()}`;
            setItems((current) => [
              {
                id,
                title,
                source,
                domain: source ? domainOf(source) : "Offline",
                type,
                labels: [],
                savedAt: "Just now",
                reviewed: false,
                lifecycle: "active",
                progress: "none",
                planId: null,
                why: "",
                importBatch: null,
              },
              ...current,
            ]);
            setSelectedItemId(id);
            setSurface("inbox");
            setCaptureOpen(false);
            setLastAction(`Saved “${title}” to Inbox. Undo is available.`);
          }}
        />
      )}
      {importOpen && (
        <ImportPrototype
          onClose={() => setImportOpen(false)}
          onImport={() => {
            const imported = importSampleItems();
            setItems((current) => [...imported, ...current]);
            setSavedViews((current) => ["Chrome import · Aug 18", ...current]);
            setImportOpen(false);
            setSurface("library");
            setLastAction(
              "Imported 1,238 bookmarks, skipped 42 exact duplicates, and created a recoverable batch.",
            );
          }}
        />
      )}
    </div>
  );
}

export function VariantA({ phase, state, actions }: VariantProps) {
  const selected = selectedItem(state);
  return (
    <div className="prototype-a">
      <aside className="prototype-a__rail">
        <div className="prototype-wordmark">
          unshelf<span>●</span>
        </div>
        <button className="prototype-primary" onClick={actions.openCapture}>
          ＋ Save something
        </button>
        <PrototypeNav state={state} actions={actions} />
        <div className="prototype-a__views">
          <span>Saved views</span>
          {state.savedViews.map((view) => (
            <button key={view} onClick={() => actions.setFilter(view)}>
              {view}
            </button>
          ))}
        </div>
        <button className="prototype-import-link" onClick={actions.openImport}>
          ⇧ Import bookmarks
        </button>
      </aside>
      <main className="prototype-a__main">
        <PrototypeTopline
          eyebrow="A · Workflow rail"
          title={surfaceLabel(state.surface)}
          phase={phase}
          onCapture={actions.openCapture}
        />
        {state.surface === "today" && (
          <section className="prototype-a__today">
            <div className="prototype-focus-card">
              <span className="prototype-kicker">Continue now</span>
              <h2>
                {todayItems(state)[0]?.title ?? "Choose one useful thing"}
              </h2>
              <p>
                {todayItems(state)[0]?.why ||
                  "Today stays deliberately smaller than your Library."}
              </p>
              <div className="prototype-actions">
                <button className="prototype-primary">Open original ↗</button>
                {todayItems(state)[0] && (
                  <button
                    onClick={() => actions.toggleDone(todayItems(state)[0].id)}
                  >
                    Mark done
                  </button>
                )}
              </div>
            </div>
            <section className="prototype-panel">
              <PanelHeading
                title="Today’s list"
                copy="Explicit picks only. Nothing arrives here automatically."
              />
              <ItemRows
                items={todayItems(state)}
                state={state}
                actions={actions}
                action="done"
              />
            </section>
          </section>
        )}
        {state.surface === "inbox" && (
          <section className="prototype-panel">
            <PanelHeading
              title="Review new saves"
              copy={`${inboxItems(state).length} waiting quietly · Keep, plan, or archive.`}
            />
            <ItemRows
              items={inboxItems(state)}
              state={state}
              actions={actions}
              action="review"
            />
          </section>
        )}
        {state.surface === "library" && (
          <section className="prototype-panel">
            <LibraryToolbar state={state} actions={actions} />
            <ItemRows
              items={visibleLibraryItems(state)}
              state={state}
              actions={actions}
              action="select"
            />
          </section>
        )}
        {state.surface === "plans" && (
          <PlanOutline state={state} actions={actions} />
        )}
      </main>
      <aside className="prototype-a__context">
        {phase === "v1" ? (
          <AiAssistant state={state} actions={actions} />
        ) : selected ? (
          <ItemInspector item={selected} actions={actions} />
        ) : (
          <V0Principles />
        )}
      </aside>
    </div>
  );
}

export function VariantB({ phase, state, actions }: VariantProps) {
  const today = todayItems(state);
  const inbox = inboxItems(state);
  return (
    <div className="prototype-b">
      <header className="prototype-b__header">
        <div className="prototype-wordmark">
          unshelf<span>○</span>
        </div>
        <nav aria-label="Prototype destinations">
          {SURFACES.map((surface) => (
            <button
              key={surface}
              className={state.surface === surface ? "is-active" : undefined}
              onClick={() => actions.setSurface(surface)}
            >
              {surfaceLabel(surface)}
              {surface === "inbox" && <small>{inbox.length}</small>}
            </button>
          ))}
        </nav>
        <div className="prototype-b__header-actions">
          <button onClick={actions.openImport}>Import</button>
          <button className="prototype-primary" onClick={actions.openCapture}>
            ＋ Save
          </button>
        </div>
      </header>
      <main className="prototype-b__main">
        <section className="prototype-b__search">
          <span>
            {phase === "v1" ? "Ask or search" : "Find anything again"}
          </span>
          <input
            aria-label="Search prototype"
            placeholder={
              phase === "v1"
                ? "Try “videos about design I haven’t started”…"
                : "Search title, URL, domain, or label…"
            }
          />
          {phase === "v1" && <button>Generate visible filters ✦</button>}
        </section>
        {state.surface === "today" && (
          <>
            <header className="prototype-b__welcome">
              <div>
                <span className="prototype-kicker">Tuesday · Aug 18</span>
                <h1>Make one saved thing useful.</h1>
                <p>
                  Your Library can stay large. Today only needs a clear next
                  step.
                </p>
              </div>
              <strong>
                {today.filter((item) => item.progress === "done").length}/
                {today.length}
              </strong>
            </header>
            <section className="prototype-b__focus-grid">
              {today.map((item, index) => (
                <article
                  className={index === 0 ? "is-featured" : undefined}
                  key={item.id}
                >
                  <span>{index === 0 ? "Up next" : "Later today"}</span>
                  <h2>{item.title}</h2>
                  <p>
                    {item.domain} · {progressLabel(item.progress)}
                  </p>
                  <div className="prototype-actions">
                    <button className="prototype-primary">Open ↗</button>
                    <button onClick={() => actions.toggleDone(item.id)}>
                      Done
                    </button>
                  </div>
                </article>
              ))}
              <article className="prototype-b__add-card">
                <span>Choose more</span>
                <h2>
                  {phase === "v1"
                    ? "Three explained suggestions"
                    : "Search your Library"}
                </h2>
                <button onClick={() => actions.setSurface("library")}>
                  Browse choices →
                </button>
              </article>
            </section>
          </>
        )}
        {state.surface === "inbox" && (
          <>
            <header className="prototype-b__section-heading">
              <div>
                <span className="prototype-kicker">Quiet review</span>
                <h1>What do these saves mean?</h1>
              </div>
              <p>
                Inbox is a view. Every save already remains safe in Library.
              </p>
            </header>
            <section className="prototype-b__cards">
              {inbox.map((item) => (
                <article key={item.id}>
                  <span>
                    {item.type} · {item.savedAt}
                  </span>
                  <h2>{item.title}</h2>
                  <p>{item.why || `Saved from ${item.domain}`}</p>
                  {phase === "v1" && aiForItem(state, item.id) && (
                    <small>✦ AI has a reviewable organization proposal</small>
                  )}
                  <div className="prototype-actions">
                    <button
                      className="prototype-primary"
                      onClick={() => actions.review(item.id)}
                    >
                      Keep
                    </button>
                    <button onClick={() => actions.addToPlan(item.id)}>
                      Plan
                    </button>
                    <button onClick={() => actions.archive(item.id)}>
                      Archive
                    </button>
                  </div>
                </article>
              ))}
            </section>
          </>
        )}
        {state.surface === "library" && (
          <>
            <LibraryToolbar state={state} actions={actions} />
            <section className="prototype-b__library-grid">
              {visibleLibraryItems(state).map((item) => (
                <article
                  key={item.id}
                  onClick={() => actions.selectItem(item.id)}
                >
                  <div className="prototype-b__thumbnail">
                    {typeGlyph(item.type)}
                  </div>
                  <span>
                    {item.type} · {item.domain}
                  </span>
                  <h2>{item.title}</h2>
                  <p>{item.why || "Kept for later reference."}</p>
                  <div>
                    {item.labels.map((label) => (
                      <small key={label}>{label}</small>
                    ))}
                  </div>
                </article>
              ))}
            </section>
          </>
        )}
        {state.surface === "plans" && (
          <section className="prototype-b__plan-story">
            <header>
              <span className="prototype-kicker">Outcome first</span>
              <h1>{state.plans[0].name}</h1>
              <p>{state.plans[0].outcome}</p>
            </header>
            <ol>
              {planItems(state).map((item, index) => (
                <li key={item.id}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <article>
                    <small>{item.type}</small>
                    <h2>{item.title}</h2>
                    <p>{progressLabel(item.progress)}</p>
                  </article>
                  <button onClick={() => actions.addToToday(item.id)}>
                    ＋ Today
                  </button>
                </li>
              ))}
            </ol>
            <button
              className="prototype-primary"
              onClick={() => actions.setSurface("library")}
            >
              ＋ Add Items
            </button>
            {phase === "v1" && (
              <button onClick={actions.generatePlanDraft}>
                ✦ Review an AI ordering draft
              </button>
            )}
          </section>
        )}
        {phase === "v1" && (
          <aside className="prototype-b__ai-float">
            <span>✦ Optional assistant</span>
            <strong>
              {state.aiProposals.length} proposals waiting for review
            </strong>
            <button onClick={() => actions.setSurface("inbox")}>
              Review proposals
            </button>
          </aside>
        )}
      </main>
    </div>
  );
}

export function VariantC({ phase, state, actions }: VariantProps) {
  const columns: Array<{
    surface: Surface;
    items: PrototypeItem[];
    copy: string;
  }> = [
    {
      surface: "inbox",
      items: inboxItems(state),
      copy: "Decide what a save means",
    },
    {
      surface: "library",
      items: visibleLibraryItems(state).slice(0, 4),
      copy: "Keep and retrieve",
    },
    {
      surface: "plans",
      items: planItems(state),
      copy: "Commit toward an outcome",
    },
    {
      surface: "today",
      items: todayItems(state),
      copy: "Do the next useful thing",
    },
  ];
  return (
    <div className="prototype-c">
      <header className="prototype-c__commandbar">
        <div className="prototype-wordmark">
          unshelf<span>→</span>
        </div>
        <label>
          <span className="visually-hidden">Search or command</span>
          <input
            placeholder={
              phase === "v1" ? "Search or ask Unshelf…" : "Search everything…"
            }
          />
        </label>
        <button onClick={actions.openImport}>Import</button>
        <button className="prototype-primary" onClick={actions.openCapture}>
          ＋ Save
        </button>
      </header>
      {phase === "v1" && (
        <section className="prototype-c__ai-ribbon">
          <div>
            <span>✦ AI review queue</span>
            <strong>
              2 organization proposals · 1 Plan draft · 3 Today candidates
            </strong>
          </div>
          <p>Nothing changes until you inspect and accept it.</p>
          <button onClick={() => actions.setSurface("inbox")}>Review</button>
        </section>
      )}
      <main>
        <header className="prototype-c__intro">
          <div>
            <span className="prototype-kicker">C · Action pipeline</span>
            <h1>See the whole loop at once.</h1>
          </div>
          <p>
            Items do not move between stores. Each column is a view over one
            shared record.
          </p>
        </header>
        <section
          className="prototype-c__pipeline"
          aria-label="Bookmark to action pipeline"
        >
          {columns.map((column, columnIndex) => (
            <section
              key={column.surface}
              className={
                state.surface === column.surface ? "is-active" : undefined
              }
            >
              <button
                className="prototype-c__column-heading"
                onClick={() => actions.setSurface(column.surface)}
              >
                <small>0{columnIndex + 1}</small>
                <strong>{surfaceLabel(column.surface)}</strong>
                <span>{column.copy}</span>
                <b>{column.items.length}</b>
              </button>
              <div className="prototype-c__stack">
                {column.items.slice(0, 3).map((item) => (
                  <article key={`${column.surface}-${item.id}`}>
                    <span>{item.type}</span>
                    <h2>{item.title}</h2>
                    <small>{columnItemStatus(column.surface, item)}</small>
                    {column.surface === "inbox" && (
                      <button onClick={() => actions.review(item.id)}>
                        Keep →
                      </button>
                    )}
                    {column.surface === "library" && item.planId === null && (
                      <button onClick={() => actions.addToPlan(item.id)}>
                        Plan →
                      </button>
                    )}
                    {column.surface === "plans" && (
                      <button onClick={() => actions.addToToday(item.id)}>
                        Today →
                      </button>
                    )}
                    {column.surface === "today" && (
                      <button onClick={() => actions.toggleDone(item.id)}>
                        Complete ✓
                      </button>
                    )}
                  </article>
                ))}
                {column.items.length === 0 && <p>Nothing waiting here.</p>}
              </div>
            </section>
          ))}
        </section>
        <section className="prototype-c__detail">
          <div>
            <span className="prototype-kicker">Selected workspace</span>
            <h2>{surfaceLabel(state.surface)}</h2>
            <p>{surfaceExplanation(state.surface)}</p>
          </div>
          {state.surface === "library" && (
            <LibraryToolbar state={state} actions={actions} />
          )}
          {state.surface === "plans" && (
            <div className="prototype-actions">
              <button
                className="prototype-primary"
                onClick={() => actions.setSurface("library")}
              >
                ＋ Add Items
              </button>
              <button>＋ Optional Stage</button>
              <button>View branching map</button>
              {phase === "v1" && (
                <button onClick={actions.generatePlanDraft}>
                  ✦ Review draft
                </button>
              )}
            </div>
          )}
          {state.surface === "inbox" && phase === "v1" && (
            <AiProposalList state={state} actions={actions} />
          )}
        </section>
      </main>
    </div>
  );
}

const SURFACES: Surface[] = ["today", "inbox", "library", "plans"];

function PrototypeNav({
  state,
  actions,
}: {
  state: PrototypeState;
  actions: PrototypeActions;
}) {
  return (
    <nav className="prototype-nav" aria-label="Prototype destinations">
      {SURFACES.map((surface) => (
        <button
          type="button"
          key={surface}
          className={state.surface === surface ? "is-active" : undefined}
          onClick={() => actions.setSurface(surface)}
        >
          <span>{surfaceGlyph(surface)}</span>
          {surfaceLabel(surface)}
          {surface === "inbox" && <b>{inboxItems(state).length}</b>}
        </button>
      ))}
    </nav>
  );
}

function PrototypeTopline({
  eyebrow,
  title,
  phase,
  onCapture,
}: {
  eyebrow: string;
  title: string;
  phase: Phase;
  onCapture: () => void;
}) {
  return (
    <header className="prototype-topline">
      <div>
        <span className="prototype-kicker">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{surfaceExplanation(title.toLocaleLowerCase() as Surface)}</p>
      </div>
      <div>
        {phase === "v1" && (
          <span className="prototype-ai-badge">✦ AI available</span>
        )}
        <button className="prototype-primary" onClick={onCapture}>
          ＋ Save
        </button>
      </div>
    </header>
  );
}

function PanelHeading({ title, copy }: { title: string; copy: string }) {
  return (
    <header className="prototype-panel__heading">
      <div>
        <h2>{title}</h2>
        <p>{copy}</p>
      </div>
      <button>•••</button>
    </header>
  );
}

function ItemRows({
  items,
  state,
  actions,
  action,
}: {
  items: PrototypeItem[];
  state: PrototypeState;
  actions: PrototypeActions;
  action: "review" | "select" | "done";
}) {
  return (
    <ul className="prototype-item-rows">
      {items.map((item) => (
        <li
          className={
            state.selectedItemId === item.id ? "is-selected" : undefined
          }
          key={item.id}
        >
          <button
            className="prototype-item-rows__main"
            onClick={() => actions.selectItem(item.id)}
          >
            <span className="prototype-type-glyph">{typeGlyph(item.type)}</span>
            <span>
              <strong>{item.title}</strong>
              <small>
                {item.domain} · {item.savedAt}
              </small>
            </span>
          </button>
          <span className={`prototype-progress is-${item.progress}`}>
            {progressLabel(item.progress)}
          </span>
          {action === "review" && (
            <div className="prototype-row-actions">
              <button
                className="prototype-primary"
                onClick={() => actions.review(item.id)}
              >
                Keep
              </button>
              <button onClick={() => actions.addToPlan(item.id)}>Plan</button>
              <button onClick={() => actions.archive(item.id)}>Archive</button>
            </div>
          )}
          {action === "done" && (
            <button onClick={() => actions.toggleDone(item.id)}>
              {item.progress === "done" ? "Reopen" : "Done"}
            </button>
          )}
          {action === "select" && (
            <button onClick={() => actions.addToToday(item.id)}>
              ＋ Today
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

function LibraryToolbar({
  state,
  actions,
}: {
  state: PrototypeState;
  actions: PrototypeActions;
}) {
  return (
    <div className="prototype-library-toolbar">
      <label>
        <span className="visually-hidden">Search Library</span>
        <input placeholder="Search title, URL, domain, or label…" />
      </label>
      <div>
        {["All active", "Unreviewed", "In progress", "Unplanned"].map(
          (filter) => (
            <button
              key={filter}
              className={
                state.activeFilter === filter ? "is-active" : undefined
              }
              onClick={() => actions.setFilter(filter)}
            >
              {filter}
            </button>
          ),
        )}
      </div>
      <button>☷ Filters</button>
      <button onClick={actions.saveView}>Save view</button>
      <button>Select</button>
    </div>
  );
}

function PlanOutline({
  state,
  actions,
}: {
  state: PrototypeState;
  actions: PrototypeActions;
}) {
  const plan = state.plans[0];
  return (
    <section className="prototype-plan-outline">
      <header>
        <div>
          <span className="prototype-kicker">Active Plan</span>
          <h2>{plan.name}</h2>
          <p>{plan.outcome}</p>
        </div>
        <div className="prototype-actions">
          <button
            className="prototype-primary"
            onClick={() => actions.setSurface("library")}
          >
            ＋ Add Items
          </button>
          <button>＋ Optional Stage</button>
          <button>View map</button>
        </div>
      </header>
      <ol>
        {planItems(state).map((item, index) => (
          <li key={item.id}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <span className="prototype-type-glyph">{typeGlyph(item.type)}</span>
            <div>
              <strong>{item.title}</strong>
              <small>
                {item.type} · {progressLabel(item.progress)}
              </small>
            </div>
            <button>Move after…</button>
            <button onClick={() => actions.addToToday(item.id)}>
              ＋ Today
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}

function ItemInspector({
  item,
  actions,
}: {
  item: PrototypeItem;
  actions: PrototypeActions;
}) {
  return (
    <section className="prototype-inspector">
      <span className="prototype-kicker">Selected Item</span>
      <div className="prototype-inspector__hero">{typeGlyph(item.type)}</div>
      <span>
        {item.type} · {item.domain}
      </span>
      <h2>{item.title}</h2>
      <p>{item.why || "Add a note about why this was worth keeping."}</p>
      <button className="prototype-primary">Open original ↗</button>
      <dl>
        <div>
          <dt>Saved</dt>
          <dd>{item.savedAt}</dd>
        </div>
        <div>
          <dt>Progress</dt>
          <dd>{progressLabel(item.progress)}</dd>
        </div>
        <div>
          <dt>Plan</dt>
          <dd>{item.planId ? "Build better product instincts" : "None"}</dd>
        </div>
      </dl>
      <div className="prototype-actions">
        <button onClick={() => actions.addToPlan(item.id)}>Add to Plan</button>
        <button onClick={() => actions.addToToday(item.id)}>
          Add to Today
        </button>
        <button onClick={() => actions.archive(item.id)}>Archive</button>
      </div>
    </section>
  );
}

function V0Principles() {
  return (
    <section className="prototype-inspector">
      <span className="prototype-kicker">v0 boundary</span>
      <h2>Transparent by default</h2>
      <ul>
        <li>No AI or hidden reorganization.</li>
        <li>Imports are previewed and reversible.</li>
        <li>Plans and Today require explicit choice.</li>
        <li>Reference saves carry no false unfinished state.</li>
      </ul>
    </section>
  );
}

function AiAssistant({
  state,
  actions,
}: {
  state: PrototypeState;
  actions: PrototypeActions;
}) {
  return (
    <section className="prototype-ai-assistant">
      <span className="prototype-kicker">✦ v1 assistant</span>
      <h2>Proposals, not commands</h2>
      <p>Unshelf can draft organization and plans. You inspect every change.</p>
      <AiProposalList state={state} actions={actions} />
      <button className="prototype-ai-settings">
        Data used · Model · Turn AI off
      </button>
    </section>
  );
}

function AiProposalList({
  state,
  actions,
}: {
  state: PrototypeState;
  actions: PrototypeActions;
}) {
  return (
    <div className="prototype-ai-proposals">
      {state.aiProposals.map((proposal) => {
        const item = state.items.find(
          (candidate) => candidate.id === proposal.itemId,
        );
        return (
          <article key={proposal.id}>
            <small>Suggested for {item?.title}</small>
            <strong>
              {proposal.type} · {proposal.labels.join(" · ")}
            </strong>
            <p>{proposal.reason}</p>
            <div className="prototype-actions">
              <button
                className="prototype-primary"
                onClick={() => actions.acceptAiProposal(proposal.id)}
              >
                Accept
              </button>
              <button>Edit</button>
              <button onClick={() => actions.dismissAiProposal(proposal.id)}>
                Dismiss
              </button>
            </div>
          </article>
        );
      })}
      {state.aiProposals.length === 0 && (
        <p>All proposals reviewed. Nothing changed silently.</p>
      )}
    </div>
  );
}

function CapturePrototype({
  phase,
  onClose,
  onSave,
}: {
  phase: Phase;
  onClose: () => void;
  onSave: (input: { source: string; title: string; type: string }) => void;
}) {
  const [source, setSource] = useState(
    "https://youtube.com/watch?v=design-systems",
  );
  const [title, setTitle] = useState("Design systems that scale");
  const [type, setType] = useState("Video");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSave({ source, title, type });
  };
  return (
    <div className="prototype-modal-backdrop">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="prototype-capture-heading"
        className="prototype-modal"
      >
        <button
          className="prototype-modal__close"
          onClick={onClose}
          aria-label="Close prototype capture"
        >
          ×
        </button>
        <span className="prototype-kicker">Quick capture</span>
        <h2 id="prototype-capture-heading">
          Save something worth returning to
        </h2>
        <form onSubmit={submit}>
          <label>
            Source URL
            <input
              value={source}
              onChange={(event) => setSource(event.target.value)}
              autoFocus
            />
          </label>
          <div className="prototype-metadata-preview">
            <span>▣</span>
            <div>
              <strong>Metadata found</strong>
              <small>
                Title, site, preview, and canonical URL remain editable.
              </small>
            </div>
          </div>
          <label>
            Title
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          <label>
            Type
            <select
              value={type}
              onChange={(event) => setType(event.target.value)}
            >
              <option>Article</option>
              <option>Video</option>
              <option>Product</option>
              <option>Web page</option>
              <option>Other</option>
            </select>
          </label>
          <p className="prototype-suggestion">
            {phase === "v1"
              ? "✦ Suggested from page content · you decide"
              : "Suggested from youtube.com · editable"}
          </p>
          <details>
            <summary>Organize now (optional)</summary>
            <p>
              Labels, Plan placement, and progress stay out of the fastest path.
            </p>
          </details>
          <button className="prototype-primary" type="submit">
            Save to Inbox
          </button>
        </form>
      </section>
    </div>
  );
}

function ImportPrototype({
  onClose,
  onImport,
}: {
  onClose: () => void;
  onImport: () => void;
}) {
  return (
    <div className="prototype-modal-backdrop">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="prototype-import-heading"
        className="prototype-modal prototype-import-modal"
      >
        <button
          className="prototype-modal__close"
          onClick={onClose}
          aria-label="Close prototype import"
        >
          ×
        </button>
        <span className="prototype-kicker">
          Import preview · Chrome bookmarks.html
        </span>
        <h2 id="prototype-import-heading">1,280 bookmarks found</h2>
        <div className="prototype-import-stats">
          <div>
            <strong>1,238</strong>
            <span>ready to import</span>
          </div>
          <div>
            <strong>42</strong>
            <span>exact duplicates</span>
          </div>
          <div>
            <strong>16</strong>
            <span>folder paths</span>
          </div>
          <div>
            <strong>3</strong>
            <span>invalid rows</span>
          </div>
        </div>
        <label>
          Duplicates
          <select defaultValue="skip">
            <option value="skip">Skip exact URL matches</option>
            <option>Review matches</option>
            <option>Keep separate copies</option>
          </select>
        </label>
        <label className="prototype-checkbox">
          <input type="checkbox" defaultChecked /> Preserve folder paths as
          import provenance
        </label>
        <label className="prototype-checkbox">
          <input type="checkbox" /> Put this large batch in Inbox
        </label>
        <p>
          Recommended: import as reviewed so a migration does not create 1,238
          chores. A Saved View keeps the batch easy to revisit.
        </p>
        <div className="prototype-actions">
          <button onClick={onClose}>Back</button>
          <button className="prototype-primary" onClick={onImport}>
            Import 1,238 bookmarks
          </button>
        </div>
      </section>
    </div>
  );
}

function PrototypeStateInspector({
  phase,
  variant,
  state,
}: {
  phase: Phase;
  variant: VariantId;
  state: PrototypeState;
}) {
  const visibleState = {
    phase,
    variant,
    surface: state.surface,
    inboxCount: inboxItems(state).length,
    libraryCount: visibleLibraryItems(state).length,
    todayIds: state.todayIds,
    plan: state.plans[0],
    savedViews: state.savedViews,
    activeFilter: state.activeFilter,
    aiProposalIds: state.aiProposals.map((proposal) => proposal.id),
    lastAction: state.lastAction,
    items: state.items.map(({ id, reviewed, lifecycle, progress, planId }) => ({
      id,
      reviewed,
      lifecycle,
      progress,
      planId,
    })),
  };
  return (
    <details className="whole-product-prototype__state">
      <summary>Inspect full prototype state · {state.lastAction}</summary>
      <pre>{JSON.stringify(visibleState, null, 2)}</pre>
    </details>
  );
}

function PrototypeSwitcher({
  current,
  phase,
  onChange,
}: {
  current: VariantId;
  phase: Phase;
  onChange: (variant: VariantId, phase: Phase) => void;
}) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        onChange(adjacentVariant(current, -1), phase);
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        onChange(adjacentVariant(current, 1), phase);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [current, onChange, phase]);

  if (!import.meta.env.DEV) return null;
  const label = VARIANTS.find((variant) => variant.id === current)?.name;
  return (
    <div className="whole-product-switcher" aria-label="Prototype controls">
      <div className="whole-product-switcher__phase">
        <button
          className={phase === "v0" ? "is-active" : undefined}
          onClick={() => onChange(current, "v0")}
        >
          v0
        </button>
        <button
          className={phase === "v1" ? "is-active" : undefined}
          onClick={() => onChange(current, "v1")}
        >
          v1 + AI
        </button>
      </div>
      <button
        aria-label="Previous prototype variant"
        onClick={() => onChange(adjacentVariant(current, -1), phase)}
      >
        ←
      </button>
      <span>
        <strong>{current}</strong> — {label}
      </span>
      <button
        aria-label="Next prototype variant"
        onClick={() => onChange(adjacentVariant(current, 1), phase)}
      >
        →
      </button>
    </div>
  );
}

function prototypeVariant(value: string | null): VariantId {
  return VARIANTS.some((variant) => variant.id === value)
    ? (value as VariantId)
    : "A";
}

function prototypePhase(value: string | null): Phase {
  return value === "v1" ? "v1" : "v0";
}

function adjacentVariant(current: VariantId, direction: -1 | 1): VariantId {
  const index = VARIANTS.findIndex((variant) => variant.id === current);
  return VARIANTS[(index + direction + VARIANTS.length) % VARIANTS.length].id;
}

function surfaceLabel(surface: Surface): string {
  return { today: "Today", inbox: "Inbox", library: "Library", plans: "Plans" }[
    surface
  ];
}

function surfaceExplanation(surface: Surface): string {
  return (
    {
      today:
        "Choose a small working set and make the next useful thing obvious.",
      inbox: "Review new saves without turning review into an obligation.",
      library:
        "Find everything you kept; narrow it with filters and Saved Views.",
      plans: "Arrange a few shared Items toward an outcome—simple order first.",
    }[surface] ?? ""
  );
}

function surfaceGlyph(surface: Surface): string {
  return { today: "☀", inbox: "⌄", library: "▤", plans: "↗" }[surface];
}

function typeGlyph(type: string): string {
  if (type === "Video") return "▶";
  if (type === "Book") return "▥";
  if (type === "Product") return "◇";
  if (type === "File") return "▧";
  if (type === "Article") return "¶";
  return "↗";
}

function progressLabel(progress: Progress): string {
  return {
    none: "Reference",
    "not-started": "Not started",
    "in-progress": "In progress",
    done: "Done",
  }[progress];
}

function selectedItem(state: PrototypeState): PrototypeItem | undefined {
  return state.items.find((item) => item.id === state.selectedItemId);
}

function inboxItems(state: PrototypeState): PrototypeItem[] {
  return state.items.filter(
    (item) => !item.reviewed && item.lifecycle === "active",
  );
}

function visibleLibraryItems(state: PrototypeState): PrototypeItem[] {
  return state.items.filter((item) => {
    if (item.lifecycle !== "active") return false;
    if (state.activeFilter === "Unreviewed") return !item.reviewed;
    if (state.activeFilter === "In progress")
      return item.progress === "in-progress";
    if (state.activeFilter === "Unplanned") return item.planId === null;
    return true;
  });
}

function todayItems(state: PrototypeState): PrototypeItem[] {
  return state.todayIds.flatMap((id) =>
    state.items.filter((item) => item.id === id),
  );
}

function planItems(state: PrototypeState): PrototypeItem[] {
  return state.plans[0].itemIds.flatMap((id) =>
    state.items.filter((item) => item.id === id),
  );
}

function aiForItem(
  state: PrototypeState,
  itemId: string,
): AiProposal | undefined {
  return state.aiProposals.find((proposal) => proposal.itemId === itemId);
}

function columnItemStatus(surface: Surface, item: PrototypeItem): string {
  if (surface === "inbox") return item.savedAt;
  if (surface === "library")
    return item.progress === "none"
      ? "Kept as reference"
      : progressLabel(item.progress);
  if (surface === "plans") return item.planId ? "In active Plan" : "Available";
  return progressLabel(item.progress);
}

function domainOf(source: string): string {
  try {
    return new URL(source).hostname;
  } catch {
    return "Web page";
  }
}

function importSampleItems(): PrototypeItem[] {
  return [
    {
      id: `imported-${crypto.randomUUID()}`,
      title: "Tokyo coffee map",
      source: "https://maps.example/tokyo-coffee",
      domain: "maps.example",
      type: "Web page",
      labels: [],
      savedAt: "Imported just now",
      reviewed: true,
      lifecycle: "active",
      progress: "none",
      planId: null,
      why: "",
      importBatch: "Chrome import · Aug 18",
    },
    {
      id: `imported-${crypto.randomUUID()}`,
      title: "Accessible product interfaces",
      source: "https://design.example/accessibility",
      domain: "design.example",
      type: "Article",
      labels: [],
      savedAt: "Imported just now",
      reviewed: true,
      lifecycle: "active",
      progress: "none",
      planId: null,
      why: "",
      importBatch: "Chrome import · Aug 18",
    },
  ];
}
