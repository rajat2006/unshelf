import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useSearchParams } from "react-router";
import {
  createInitialState,
  itemStatusFromParts,
  statusLabel,
  typeLabel,
  type Candidate,
  type ItemStatus,
  type ItemType,
  type LearningItem,
  type PlanNode,
  type PrototypeState,
} from "./learning-workspace-model";

const variants = [
  { key: "A", name: "Rooms" },
  { key: "B", name: "Flow board" },
  { key: "C", name: "Plan cockpit" },
  { key: "D", name: "Rooms + plan studio" },
] as const;

type VariantKey = (typeof variants)[number]["key"];

interface CaptureInput {
  title: string;
  type: ItemType;
  source?: string;
}

interface PrototypeActions {
  addToPlan: (itemId: string) => void;
  addToToday: (itemId: string) => void;
  capture: (input: CaptureInput) => void;
  dismissCandidate: (candidateId: string) => void;
  keepCandidate: (candidateId: string) => void;
  removeFromToday: (itemId: string) => void;
  reset: () => void;
  selectCandidate: (candidateId: string) => void;
  selectItem: (itemId: string) => void;
  toggleItemStatus: (itemId: string) => void;
  togglePart: (partId: string) => void;
}

interface VariantProps {
  actions: PrototypeActions;
  onOpenCapture: () => void;
  state: PrototypeState;
}

export function LearningWorkspacesPrototype() {
  const [state, setState] = useState(createInitialState);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedVariant = searchParams.get("variant");
  const currentVariant = variants.some(
    (variant) => variant.key === requestedVariant,
  )
    ? (requestedVariant as VariantKey)
    : "A";

  function changeState({
    event,
    update,
  }: {
    event: string;
    update: (current: PrototypeState) => PrototypeState;
  }) {
    setState((current) => {
      const next = update(current);
      if (next === current) return current;
      return { ...next, events: [event, ...current.events].slice(0, 10) };
    });
  }

  const actions: PrototypeActions = {
    addToPlan(itemId) {
      changeState({
        event: "Placed an Item directly at the end of the Learning Plan",
        update(current) {
          if (planContainsItem({ nodes: current.planNodes, itemId })) {
            return current;
          }
          return {
            ...current,
            planNodes: [
              ...current.planNodes,
              { id: `direct-${itemId}`, kind: "item", itemId },
            ],
          };
        },
      });
    },
    addToToday(itemId) {
      changeState({
        event: "Added an Item to today's Daily Focus",
        update(current) {
          if (current.dailyPicks.some((pick) => pick.itemId === itemId)) {
            return current;
          }
          const origin = planContainsItem({ nodes: current.planNodes, itemId })
            ? "Reliable web systems"
            : undefined;
          return {
            ...current,
            dailyPicks: [...current.dailyPicks, { itemId, origin }],
          };
        },
      });
    },
    capture(input) {
      const itemId = `captured-${Date.now()}`;
      changeState({
        event: `Captured “${input.title}” as an uncommitted Library Item`,
        update(current) {
          return {
            ...current,
            items: [
              {
                id: itemId,
                title: input.title,
                type: input.type,
                source: input.source,
                labels: [],
                status: "not-started",
                captured: "Captured manually · just now",
              },
              ...current.items,
            ],
            selectedItemId: itemId,
          };
        },
      });
      setCaptureOpen(false);
    },
    dismissCandidate(candidateId) {
      changeState({
        event: "Dismissed this Discovery; Candidate history remains",
        update(current) {
          return {
            ...current,
            candidates: current.candidates.map((candidate) =>
              candidate.id === candidateId
                ? { ...candidate, status: "dismissed" }
                : candidate,
            ),
          };
        },
      });
    },
    keepCandidate(candidateId) {
      changeState({
        event: "Kept a Discovery and resolved it to one Library Item",
        update(current) {
          const candidate = current.candidates.find(
            (entry) => entry.id === candidateId,
          );
          if (!candidate || candidate.status === "kept") return current;

          const exactMatch = current.items.find(
            (item) => item.providerIdentity === candidate.providerIdentity,
          );
          const linkedItemId = exactMatch?.id ?? `kept-${candidate.id}`;
          const items = exactMatch
            ? current.items
            : [
                {
                  id: linkedItemId,
                  title: candidate.title,
                  type: "video" as const,
                  source: candidate.source,
                  providerIdentity: candidate.providerIdentity,
                  labels: [],
                  status: "not-started" as const,
                  captured: `Kept from ${candidate.channel} · just now`,
                },
                ...current.items,
              ];

          return {
            ...current,
            items,
            candidates: current.candidates.map((entry) =>
              entry.id === candidateId
                ? { ...entry, status: "kept", linkedItemId }
                : entry,
            ),
            selectedItemId: linkedItemId,
          };
        },
      });
    },
    removeFromToday(itemId) {
      changeState({
        event: "Removed an Item from today's Daily Focus only",
        update(current) {
          return {
            ...current,
            dailyPicks: current.dailyPicks.filter(
              (pick) => pick.itemId !== itemId,
            ),
          };
        },
      });
    },
    reset() {
      setState(createInitialState());
    },
    selectCandidate(candidateId) {
      changeState({
        event: "Acknowledged a new Discovery",
        update(current) {
          const selected = current.candidates.find(
            (candidate) => candidate.id === candidateId,
          );
          if (!selected) return current;
          return {
            ...current,
            selectedCandidateId: candidateId,
            candidates: current.candidates.map((candidate) =>
              candidate.id === candidateId && candidate.status === "new"
                ? { ...candidate, status: "seen" }
                : candidate,
            ),
          };
        },
      });
    },
    selectItem(itemId) {
      setState((current) => ({ ...current, selectedItemId: itemId }));
    },
    toggleItemStatus(itemId) {
      changeState({
        event: "Changed the shared Item Status everywhere",
        update(current) {
          return {
            ...current,
            items: current.items.map((item) =>
              item.id === itemId
                ? { ...item, status: nextStatus(item.status) }
                : item,
            ),
          };
        },
      });
    },
    togglePart(partId) {
      changeState({
        event: "Checked a book Part and re-derived its shared Item Status",
        update(current) {
          return {
            ...current,
            items: current.items.map((item) => {
              if (!item.parts?.some((part) => part.id === partId)) return item;
              const parts = item.parts.map((part) =>
                part.id === partId ? { ...part, done: !part.done } : part,
              );
              return { ...item, parts, status: itemStatusFromParts(parts) };
            }),
          };
        },
      });
    },
  };

  function setVariant(variant: VariantKey) {
    const next = new URLSearchParams(searchParams);
    next.set("variant", variant);
    setSearchParams(next, { replace: true });
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      if (isEditableTarget(event.target)) return;
      const index = variants.findIndex(
        (variant) => variant.key === currentVariant,
      );
      const offset = event.key === "ArrowRight" ? 1 : -1;
      const nextIndex = (index + offset + variants.length) % variants.length;
      setVariant(variants[nextIndex].key);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  return (
    <div className="learning-prototype">
      {currentVariant === "A" && (
        <RoomsVariant
          state={state}
          actions={actions}
          onOpenCapture={() => setCaptureOpen(true)}
        />
      )}
      {currentVariant === "B" && (
        <FlowBoardVariant
          state={state}
          actions={actions}
          onOpenCapture={() => setCaptureOpen(true)}
        />
      )}
      {currentVariant === "C" && (
        <PlanCockpitVariant
          state={state}
          actions={actions}
          onOpenCapture={() => setCaptureOpen(true)}
        />
      )}
      {currentVariant === "D" && (
        <RoomsWithPlanStudioVariant
          state={state}
          actions={actions}
          onOpenCapture={() => setCaptureOpen(true)}
        />
      )}

      {captureOpen && (
        <CaptureSheet
          onCancel={() => setCaptureOpen(false)}
          onCapture={actions.capture}
        />
      )}

      {import.meta.env.DEV && (
        <>
          <StateLens state={state} />
          <PrototypeSwitcher current={currentVariant} onSelect={setVariant} />
        </>
      )}
    </div>
  );
}

type RoomsArea = "today" | "discover" | "library" | "plans";

function RoomsVariant({ state, actions, onOpenCapture }: VariantProps) {
  const [area, setArea] = useState<RoomsArea>("today");
  const [query, setQuery] = useState("");
  const planProgress = getPlanProgress(state);

  return (
    <div className="rooms">
      <aside className="rooms__rail">
        <Brand />
        <nav aria-label="Workspace rooms" className="rooms__nav">
          <RoomDoor
            active={area === "today"}
            count={state.dailyPicks.length}
            label="Today"
            onClick={() => setArea("today")}
          />
          <RoomDoor
            active={area === "discover"}
            count={unresolvedCandidates(state).length}
            label="Discover"
            onClick={() => setArea("discover")}
          />
          <RoomDoor
            active={area === "library"}
            count={state.items.length}
            label="Library"
            onClick={() => setArea("library")}
          />
          <RoomDoor
            active={area === "plans"}
            count={1}
            label="Plans"
            onClick={() => setArea("plans")}
          />
        </nav>
        <div className="rooms__plan-glance">
          <span>Reliable web systems</span>
          <strong>
            {planProgress.done}/{planProgress.total}
          </strong>
          <div className="meter">
            <i style={{ width: `${planProgress.percent}%` }} />
          </div>
        </div>
      </aside>

      <main className="rooms__main">
        <header className="rooms__header">
          <VariantIntro
            eyebrow="Variant A · Rooms"
            title={roomTitle(area)}
            detail="Distinct lifecycle rooms; shared Items connect them."
          />
          <HeaderActions actions={actions} onOpenCapture={onOpenCapture} />
        </header>

        {area === "today" && (
          <div className="rooms__today">
            <section className="agenda-panel">
              <SectionHeading
                eyebrow="Tuesday · 11 August"
                title="Three things, then stop"
              />
              <div className="agenda-list">
                {state.dailyPicks.map((pick, index) => {
                  const item = findItem(state, pick.itemId);
                  return (
                    <article className="agenda-row" key={pick.itemId}>
                      <span className="agenda-row__index">0{index + 1}</span>
                      <div className="grow">
                        <ItemKicker item={item} />
                        <button
                          className="title-button"
                          onClick={() => actions.selectItem(item.id)}
                        >
                          {item.title}
                        </button>
                        <small>{pick.origin ?? "From Library"}</small>
                      </div>
                      <button
                        className="status-button"
                        onClick={() => actions.toggleItemStatus(item.id)}
                      >
                        {item.status === "done" ? "Reopen" : "Mark done"}
                      </button>
                      <button
                        className="icon-button"
                        aria-label={`Remove ${item.title} from today`}
                        onClick={() => actions.removeFromToday(item.id)}
                      >
                        ×
                      </button>
                    </article>
                  );
                })}
              </div>
            </section>
            <aside className="smart-sidecar">
              <SectionHeading
                eyebrow="Add to today"
                title="What fits your attention?"
              />
              <input aria-label="Search Items" placeholder="Search Items…" />
              <p className="sidecar-label">Suggested from your plan</p>
              {state.items
                .filter(
                  (item) =>
                    planContainsItem({
                      nodes: state.planNodes,
                      itemId: item.id,
                    }) &&
                    !state.dailyPicks.some((pick) => pick.itemId === item.id),
                )
                .slice(0, 3)
                .map((item) => (
                  <SuggestionRow
                    key={item.id}
                    item={item}
                    reason="Next in Reliable web systems"
                    onAdd={() => actions.addToToday(item.id)}
                  />
                ))}
            </aside>
          </div>
        )}

        {area === "discover" && (
          <div className="rooms__discover">
            <aside className="follow-list">
              <p className="sidecar-label">Following</p>
              <button className="follow-list__active">
                YouTube channels <span>3</span>
              </button>
              <button>
                Jack Herrington <span>1 new</span>
              </button>
              <button>
                ByteByteGo <span>1 new</span>
              </button>
              <button>
                MIT OpenCourseWare <span>1 new</span>
              </button>
              <p className="quiet-note">
                Follows are active. Pausing stops new Discoveries without
                clearing these.
              </p>
            </aside>
            <section className="candidate-stream">
              <SectionHeading
                eyebrow="Recurring discovery"
                title="Decide what earns a Library place"
              />
              {state.candidates.map((candidate) => (
                <CandidateCard
                  actions={actions}
                  candidate={candidate}
                  key={candidate.id}
                />
              ))}
            </section>
          </div>
        )}

        {area === "library" && (
          <div className="rooms__library">
            <section className="catalog-panel">
              <div className="catalog-toolbar">
                <input
                  aria-label="Search Library"
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search every Item…"
                  value={query}
                />
                <button className="chip chip--active">
                  All {state.items.length}
                </button>
                <button className="chip">In progress</button>
                <button className="chip">Books</button>
              </div>
              <div className="catalog-list">
                {state.items
                  .filter((item) =>
                    item.title.toLowerCase().includes(query.toLowerCase()),
                  )
                  .map((item) => (
                    <LibraryRow
                      actions={actions}
                      item={item}
                      key={item.id}
                      selected={state.selectedItemId === item.id}
                    />
                  ))}
              </div>
            </section>
            <ItemDetail actions={actions} item={selectedItem(state)} />
          </div>
        )}

        {area === "plans" && (
          <div className="rooms__plans">
            <section className="plan-overview">
              <SectionHeading
                eyebrow="Active Learning Plan"
                title="Reliable web systems"
              />
              <p className="lede">
                Build a working mental model from the network edge to durable
                data.
              </p>
              <PlanSequence actions={actions} state={state} />
            </section>
            <aside className="plan-summary-card">
              <span className="big-number">{planProgress.percent}%</span>
              <p>
                Progress comes from the shared Status of {planProgress.total}{" "}
                Items.
              </p>
              <button className="quiet-action">Archive plan</button>
            </aside>
          </div>
        )}
      </main>
    </div>
  );
}

function FlowBoardVariant({ state, actions, onOpenCapture }: VariantProps) {
  const planProgress = getPlanProgress(state);
  return (
    <main className="flow-board">
      <header className="flow-board__header">
        <div>
          <Brand />
          <VariantIntro
            eyebrow="Variant B · Flow board"
            title="From possibility to today"
            detail="The whole learning lifecycle is visible as a left-to-right flow."
          />
        </div>
        <HeaderActions actions={actions} onOpenCapture={onOpenCapture} />
      </header>
      <div className="flow-board__metrics">
        <span>
          <b>{unresolvedCandidates(state).length}</b> decisions waiting
        </span>
        <span>
          <b>{state.items.length}</b> Library Items
        </span>
        <span>
          <b>{planProgress.percent}%</b> plan progress
        </span>
        <span>
          <b>{state.dailyPicks.length}</b> picked today
        </span>
      </div>
      <section className="flow-board__lanes" aria-label="Learning lifecycle">
        <FlowLane
          eyebrow="Recurring"
          title="1 · Discover"
          subtitle="Candidates, not commitments"
        >
          {state.candidates.map((candidate) => (
            <CandidateCard
              actions={actions}
              candidate={candidate}
              compact
              key={candidate.id}
            />
          ))}
        </FlowLane>
        <FlowLane
          eyebrow="Durable option pool"
          title="2 · Library"
          subtitle="Capture and Keep land here"
        >
          {state.items.map((item) => (
            <article className="flow-card" key={item.id}>
              <ItemKicker item={item} />
              <button
                className="title-button"
                onClick={() => actions.selectItem(item.id)}
              >
                {item.title}
              </button>
              <div className="flow-card__footer">
                <StatusPill status={item.status} />
                <button
                  disabled={planContainsItem({
                    nodes: state.planNodes,
                    itemId: item.id,
                  })}
                  onClick={() => actions.addToPlan(item.id)}
                >
                  {planContainsItem({ nodes: state.planNodes, itemId: item.id })
                    ? "In plan"
                    : "Plan →"}
                </button>
              </div>
            </article>
          ))}
        </FlowLane>
        <FlowLane
          eyebrow="Durable commitment"
          title="3 · Learning Plan"
          subtitle="Reliable web systems"
        >
          {state.planNodes.map((node, index) => (
            <FlowPlanNode
              actions={actions}
              index={index}
              key={node.id}
              node={node}
              state={state}
            />
          ))}
        </FlowLane>
        <FlowLane
          eyebrow="Dated attention"
          title="4 · Today"
          subtitle="Explicit picks only"
        >
          {state.dailyPicks.map((pick) => {
            const item = findItem(state, pick.itemId);
            return (
              <article className="flow-card flow-card--today" key={pick.itemId}>
                <ItemKicker item={item} />
                <strong>{item.title}</strong>
                <small>{pick.origin ?? "From Library"}</small>
                <div className="flow-card__footer">
                  <button onClick={() => actions.toggleItemStatus(item.id)}>
                    {item.status === "done" ? "Reopen" : "Done"}
                  </button>
                  <button onClick={() => actions.removeFromToday(item.id)}>
                    Remove
                  </button>
                </div>
              </article>
            );
          })}
        </FlowLane>
      </section>
      <aside className="flow-board__detail">
        <ItemDetail actions={actions} item={selectedItem(state)} inline />
      </aside>
    </main>
  );
}

function PlanCockpitVariant({ state, actions, onOpenCapture }: VariantProps) {
  const [source, setSource] = useState<"library" | "discover">("library");
  const [query, setQuery] = useState("");
  const planProgress = getPlanProgress(state);
  return (
    <div className="cockpit">
      <header className="cockpit__header">
        <Brand />
        <div className="cockpit__plan-picker">
          <small>Active Learning Plan</small>
          <strong>Reliable web systems⌄</strong>
        </div>
        <div className="cockpit__progress">
          <span>
            {planProgress.done}/{planProgress.total} Items done
          </span>
          <div className="meter">
            <i style={{ width: `${planProgress.percent}%` }} />
          </div>
        </div>
        <HeaderActions actions={actions} onOpenCapture={onOpenCapture} />
      </header>
      <div className="cockpit__body">
        <aside className="resource-drawer">
          <div className="segmented">
            <button
              className={source === "library" ? "active" : ""}
              onClick={() => setSource("library")}
            >
              Library
            </button>
            <button
              className={source === "discover" ? "active" : ""}
              onClick={() => setSource("discover")}
            >
              Discover <span>{unresolvedCandidates(state).length}</span>
            </button>
          </div>
          {source === "library" ? (
            <>
              <input
                aria-label="Search Library"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Find an Item…"
                value={query}
              />
              <p className="sidecar-label">Option pool</p>
              <div className="drawer-list">
                {state.items
                  .filter((item) =>
                    item.title.toLowerCase().includes(query.toLowerCase()),
                  )
                  .map((item) => (
                    <article className="drawer-item" key={item.id}>
                      <button
                        className="title-button"
                        onClick={() => actions.selectItem(item.id)}
                      >
                        {item.title}
                      </button>
                      <ItemKicker item={item} />
                      <div>
                        <button
                          disabled={planContainsItem({
                            nodes: state.planNodes,
                            itemId: item.id,
                          })}
                          onClick={() => actions.addToPlan(item.id)}
                        >
                          {planContainsItem({
                            nodes: state.planNodes,
                            itemId: item.id,
                          })
                            ? "Placed"
                            : "+ Plan"}
                        </button>
                      </div>
                    </article>
                  ))}
              </div>
            </>
          ) : (
            <div className="drawer-list">
              <p className="sidecar-label">From followed channels</p>
              {state.candidates.map((candidate) => (
                <CandidateCard
                  actions={actions}
                  candidate={candidate}
                  compact
                  key={candidate.id}
                />
              ))}
            </div>
          )}
        </aside>

        <main className="plan-canvas">
          <VariantIntro
            eyebrow="Variant C · Plan cockpit"
            title="Reliable web systems"
            detail="The outcome owns the center; intake and today stay within reach."
          />
          <div className="plan-path">
            {state.planNodes.map((node, index) => (
              <CockpitNode
                actions={actions}
                index={index}
                key={node.id}
                node={node}
                state={state}
              />
            ))}
          </div>
        </main>

        <aside className="today-dock">
          <SectionHeading eyebrow="Tuesday · 11 Aug" title="Today's picks" />
          <div className="today-dock__list">
            {state.dailyPicks.map((pick) => {
              const item = findItem(state, pick.itemId);
              return (
                <article key={pick.itemId}>
                  <button
                    className="check-button"
                    aria-label={`Toggle ${item.title}`}
                    onClick={() => actions.toggleItemStatus(item.id)}
                  >
                    {item.status === "done" ? "✓" : ""}
                  </button>
                  <div className="grow">
                    <button
                      className="title-button"
                      onClick={() => actions.selectItem(item.id)}
                    >
                      {item.title}
                    </button>
                    <small>{pick.origin ?? "From Library"}</small>
                  </div>
                  <button
                    className="icon-button"
                    onClick={() => actions.removeFromToday(item.id)}
                  >
                    ×
                  </button>
                </article>
              );
            })}
          </div>
          <ItemDetail actions={actions} item={selectedItem(state)} compact />
        </aside>
      </div>
    </div>
  );
}

type HybridRoom = "today" | "discover" | "library" | "plans";

function RoomsWithPlanStudioVariant({
  state,
  actions,
  onOpenCapture,
}: VariantProps) {
  const [room, setRoom] = useState<HybridRoom>("plans");
  const [planOpen, setPlanOpen] = useState(true);
  const [query, setQuery] = useState("");
  const planProgress = getPlanProgress(state);
  const dailyProgress = getDailyProgress(state);

  function chooseRoom(nextRoom: HybridRoom) {
    setRoom(nextRoom);
    if (nextRoom === "plans") setPlanOpen(true);
  }

  return (
    <div className="hybrid">
      <header className="hybrid__global-header">
        <Brand />
        <nav aria-label="Global workspace rooms">
          <button
            aria-current={room === "today" ? "page" : undefined}
            onClick={() => chooseRoom("today")}
          >
            Today <span>{state.dailyPicks.length}</span>
          </button>
          <button
            aria-current={room === "discover" ? "page" : undefined}
            onClick={() => chooseRoom("discover")}
          >
            Discover <span>{unresolvedCandidates(state).length}</span>
          </button>
          <button
            aria-current={room === "library" ? "page" : undefined}
            onClick={() => chooseRoom("library")}
          >
            Library <span>{state.items.length}</span>
          </button>
          <button
            aria-current={room === "plans" ? "page" : undefined}
            onClick={() => chooseRoom("plans")}
          >
            Plans <span>1</span>
          </button>
        </nav>
        <HeaderActions actions={actions} onOpenCapture={onOpenCapture} />
      </header>

      {room === "today" && (
        <main className="hybrid-room hybrid-room--today">
          <header className="hybrid-room__heading hybrid-room__heading--with-progress">
            <VariantIntro
              eyebrow="Variant D · Global room"
              title="Today"
              detail="Daily Focus is a dated agenda, not a small Learning Plan."
            />
            <div className="hybrid-daily-progress">
              <div>
                <strong>{dailyProgress.percent}%</strong>
                <span>
                  {dailyProgress.done} of {dailyProgress.total} picks done
                </span>
              </div>
              <div className="meter">
                <i style={{ width: `${dailyProgress.percent}%` }} />
              </div>
              <small>
                Derived from each Item's shared Status; nothing extra is stored
                on Daily Focus.
              </small>
            </div>
          </header>
          <div className="hybrid-today-grid">
            <section className="hybrid-agenda">
              <SectionHeading
                eyebrow="Tuesday · 11 August"
                title="Today's explicit picks"
              />
              {state.dailyPicks.map((pick, index) => {
                const item = findItem(state, pick.itemId);
                return (
                  <article key={pick.itemId}>
                    <span className="hybrid-agenda__number">0{index + 1}</span>
                    <StatusDot status={item.status} />
                    <div className="grow">
                      <button
                        className="title-button"
                        onClick={() => actions.selectItem(item.id)}
                      >
                        {item.title}
                      </button>
                      <small>{pick.origin ?? "From Library"}</small>
                    </div>
                    <button onClick={() => actions.toggleItemStatus(item.id)}>
                      {item.status === "done" ? "Reopen" : "Mark done"}
                    </button>
                    <button
                      className="icon-button"
                      onClick={() => actions.removeFromToday(item.id)}
                    >
                      ×
                    </button>
                  </article>
                );
              })}
            </section>
            <aside className="hybrid-suggestions">
              <SectionHeading
                eyebrow="Search + suggestions"
                title="Add only what fits"
              />
              <input aria-label="Search Library" placeholder="Find an Item…" />
              <p className="sidecar-label">Suggested from active plans</p>
              {state.items
                .filter(
                  (item) =>
                    planContainsItem({
                      nodes: state.planNodes,
                      itemId: item.id,
                    }) &&
                    !state.dailyPicks.some((pick) => pick.itemId === item.id),
                )
                .slice(0, 4)
                .map((item) => (
                  <SuggestionRow
                    item={item}
                    key={item.id}
                    onAdd={() => actions.addToToday(item.id)}
                    reason="Next in Reliable web systems"
                  />
                ))}
            </aside>
          </div>
        </main>
      )}

      {room === "discover" && (
        <main className="hybrid-room">
          <header className="hybrid-room__heading">
            <VariantIntro
              eyebrow="Variant D · Global room"
              title="Discover"
              detail="Recurring arrivals are decided here before plans enter the picture."
            />
          </header>
          <div className="hybrid-discover-grid">
            <aside className="hybrid-follows">
              <span className="sidecar-label">Active Follows</span>
              <strong>YouTube channels</strong>
              <button>
                Jack Herrington <span>1 new</span>
              </button>
              <button>
                ByteByteGo <span>1 new</span>
              </button>
              <button>
                MIT OpenCourseWare <span>1 new</span>
              </button>
              <p>
                Keep creates or links one Library Item. It does not place the
                Item into a Learning Plan.
              </p>
            </aside>
            <section className="hybrid-candidates">
              <SectionHeading
                eyebrow="Candidate intake"
                title="What is worth preserving?"
              />
              {state.candidates.map((candidate) => (
                <CandidateCard
                  actions={actions}
                  candidate={candidate}
                  key={candidate.id}
                />
              ))}
            </section>
          </div>
        </main>
      )}

      {room === "library" && (
        <main className="hybrid-room">
          <header className="hybrid-room__heading">
            <VariantIntro
              eyebrow="Variant D · Global room"
              title="Library"
              detail="A passive catalog of every Item, whether committed or not."
            />
          </header>
          <div className="hybrid-library-grid">
            <section className="hybrid-catalog">
              <div className="hybrid-catalog__toolbar">
                <input
                  aria-label="Search Library"
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search every Item…"
                  value={query}
                />
                <button className="chip chip--active">All</button>
                <button className="chip">In progress</button>
                <button className="chip">Unplanned</button>
              </div>
              {state.items
                .filter((item) =>
                  item.title.toLowerCase().includes(query.toLowerCase()),
                )
                .map((item) => (
                  <LibraryRow
                    actions={actions}
                    item={item}
                    key={item.id}
                    selected={state.selectedItemId === item.id}
                  />
                ))}
            </section>
            <ItemDetail actions={actions} item={selectedItem(state)} />
          </div>
        </main>
      )}

      {room === "plans" && !planOpen && (
        <main className="hybrid-room">
          <header className="hybrid-room__heading">
            <VariantIntro
              eyebrow="Variant D · Global room"
              title="Learning Plans"
              detail="Durable commitments are listed here; no plan is the whole app."
            />
          </header>
          <button
            className="hybrid-plan-card"
            onClick={() => setPlanOpen(true)}
          >
            <span className="sidecar-label">Active plan</span>
            <strong>Reliable web systems</strong>
            <p>Build a mental model from the network edge to durable data.</p>
            <div className="meter">
              <i style={{ width: `${planProgress.percent}%` }} />
            </div>
            <span>
              {planProgress.done}/{planProgress.total} Items done →
            </span>
          </button>
        </main>
      )}

      {room === "plans" && planOpen && (
        <main className="hybrid-plan-studio">
          <header className="hybrid-plan-studio__header">
            <div>
              <button
                className="breadcrumb-button"
                onClick={() => setPlanOpen(false)}
              >
                ← All Learning Plans
              </button>
              <h1>Reliable web systems</h1>
              <p>Build a mental model from the network edge to durable data.</p>
            </div>
            <div className="hybrid-plan-studio__progress">
              <strong>{planProgress.percent}%</strong>
              <span>
                {planProgress.done} of {planProgress.total} Items done
              </span>
              <div className="meter">
                <i style={{ width: `${planProgress.percent}%` }} />
              </div>
            </div>
          </header>

          <div className="hybrid-plan-studio__body">
            <aside className="hybrid-placement-drawer">
              <span className="sidecar-label">Library placement drawer</span>
              <h2>Add existing Items</h2>
              <p>
                Discovery is intentionally absent. Keep happens in the Discover
                room first.
              </p>
              <input
                aria-label="Find Library Item to place"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Find in Library…"
                value={query}
              />
              <div className="hybrid-placement-drawer__list">
                {state.items
                  .filter((item) =>
                    item.title.toLowerCase().includes(query.toLowerCase()),
                  )
                  .map((item) => {
                    const placed = planContainsItem({
                      nodes: state.planNodes,
                      itemId: item.id,
                    });
                    return (
                      <article key={item.id}>
                        <div className="grow">
                          <button
                            className="title-button"
                            onClick={() => actions.selectItem(item.id)}
                          >
                            {item.title}
                          </button>
                          <ItemKicker item={item} />
                        </div>
                        <button
                          disabled={placed}
                          onClick={() => actions.addToPlan(item.id)}
                        >
                          {placed ? "Placed" : "+ Plan"}
                        </button>
                      </article>
                    );
                  })}
              </div>
            </aside>

            <section className="hybrid-plan-canvas">
              <div className="hybrid-local-label">
                <span>Local workspace</span>
                <strong>Plan structure</strong>
              </div>
              <div className="plan-path">
                {state.planNodes.map((node, index) => (
                  <CockpitNode
                    actions={actions}
                    index={index}
                    key={node.id}
                    node={node}
                    state={state}
                  />
                ))}
              </div>
            </section>

            <aside className="hybrid-today-sidecar">
              <span className="sidecar-label">Global Daily Focus</span>
              <h2>Today's picks</h2>
              <p>Picks may come from this plan or directly from the Library.</p>
              <div className="hybrid-today-sidecar__list">
                {state.dailyPicks.map((pick) => {
                  const item = findItem(state, pick.itemId);
                  return (
                    <article key={pick.itemId}>
                      <button
                        className="check-button"
                        onClick={() => actions.toggleItemStatus(item.id)}
                      >
                        {item.status === "done" ? "✓" : ""}
                      </button>
                      <div className="grow">
                        <button
                          className="title-button"
                          onClick={() => actions.selectItem(item.id)}
                        >
                          {item.title}
                        </button>
                        <small>{pick.origin ?? "From Library"}</small>
                      </div>
                      <button
                        className="icon-button"
                        onClick={() => actions.removeFromToday(item.id)}
                      >
                        ×
                      </button>
                    </article>
                  );
                })}
              </div>
              <ItemDetail
                actions={actions}
                compact
                item={selectedItem(state)}
              />
            </aside>
          </div>
        </main>
      )}
    </div>
  );
}

function CandidateCard({
  actions,
  candidate,
  compact = false,
}: {
  actions: PrototypeActions;
  candidate: Candidate;
  compact?: boolean;
}) {
  const resolved =
    candidate.status === "kept" || candidate.status === "dismissed";
  return (
    <article
      className={`candidate-card${compact ? " candidate-card--compact" : ""}`}
    >
      <div className="candidate-card__meta">
        <span
          className={`candidate-state candidate-state--${candidate.status}`}
        >
          {candidate.status}
        </span>
        <span>{candidate.channel}</span>
      </div>
      <button
        className="title-button"
        onClick={() => actions.selectCandidate(candidate.id)}
      >
        {candidate.title}
      </button>
      {candidate.history && (
        <small className="history-note">↻ {candidate.history}</small>
      )}
      <div className="candidate-card__actions">
        <button
          disabled={resolved}
          onClick={() => actions.dismissCandidate(candidate.id)}
        >
          Dismiss
        </button>
        <button
          className="primary-action"
          disabled={resolved}
          onClick={() => actions.keepCandidate(candidate.id)}
        >
          {candidate.linkedItemId ? "Link existing Item" : "Keep in Library"}
        </button>
      </div>
    </article>
  );
}

function LibraryRow({
  actions,
  item,
  selected,
}: {
  actions: PrototypeActions;
  item: LearningItem;
  selected: boolean;
}) {
  return (
    <button
      className={`library-row${selected ? " library-row--selected" : ""}`}
      onClick={() => actions.selectItem(item.id)}
    >
      <span className="library-row__type">{typeLabel(item.type)}</span>
      <span className="library-row__title">{item.title}</span>
      <span className="library-row__labels">
        {item.labels.join(" · ") || "Unlabelled"}
      </span>
      <StatusPill status={item.status} />
    </button>
  );
}

function ItemDetail({
  actions,
  compact = false,
  inline = false,
  item,
}: {
  actions: PrototypeActions;
  compact?: boolean;
  inline?: boolean;
  item: LearningItem;
}) {
  return (
    <aside
      className={`item-detail${compact ? " item-detail--compact" : ""}${inline ? " item-detail--inline" : ""}`}
    >
      <ItemKicker item={item} />
      <h2>{item.title}</h2>
      <p className="quiet-note">{item.captured}</p>
      <div className="item-detail__actions">
        <button
          className="primary-action"
          onClick={() => actions.addToToday(item.id)}
        >
          + Today
        </button>
        <button onClick={() => actions.addToPlan(item.id)}>+ Plan</button>
        <button onClick={() => actions.toggleItemStatus(item.id)}>
          {statusLabel(item.status)}
        </button>
      </div>
      {item.parts && (
        <div className="parts-list">
          <p className="sidecar-label">
            Manual outline · {item.parts.filter((part) => part.done).length}/
            {item.parts.length}
          </p>
          {item.parts.map((part) => (
            <label key={part.id}>
              <input
                checked={part.done}
                onChange={() => actions.togglePart(part.id)}
                type="checkbox"
              />
              <span>{part.title}</span>
            </label>
          ))}
        </div>
      )}
      {!compact && item.source && <a href={item.source}>Open original ↗</a>}
    </aside>
  );
}

function PlanSequence({
  actions,
  state,
}: {
  actions: PrototypeActions;
  state: PrototypeState;
}) {
  return (
    <ol className="plan-sequence">
      {state.planNodes.map((node, index) => (
        <li key={node.id}>
          <span className="plan-sequence__step">{index + 1}</span>
          {node.kind === "stage" ? (
            <div className="plan-stage">
              <span className="stage-label">Stage</span>
              <h3>{node.title.replace(/^\d · /, "")}</h3>
              {node.itemIds.map((itemId) => {
                const item = findItem(state, itemId);
                return (
                  <PlanItemLine actions={actions} item={item} key={itemId} />
                );
              })}
            </div>
          ) : (
            <PlanItemLine
              actions={actions}
              item={findItem(state, node.itemId)}
              standalone
            />
          )}
        </li>
      ))}
    </ol>
  );
}

function PlanItemLine({
  actions,
  item,
  standalone = false,
}: {
  actions: PrototypeActions;
  item: LearningItem;
  standalone?: boolean;
}) {
  return (
    <div
      className={`plan-item-line${standalone ? " plan-item-line--standalone" : ""}`}
    >
      <button
        className="check-button"
        onClick={() => actions.toggleItemStatus(item.id)}
      >
        {item.status === "done" ? "✓" : ""}
      </button>
      <button
        className="title-button grow"
        onClick={() => actions.selectItem(item.id)}
      >
        {item.title}
      </button>
      <button
        className="quiet-action"
        onClick={() => actions.addToToday(item.id)}
      >
        Today
      </button>
    </div>
  );
}

function FlowPlanNode({
  actions,
  index,
  node,
  state,
}: {
  actions: PrototypeActions;
  index: number;
  node: PlanNode;
  state: PrototypeState;
}) {
  const itemIds = node.kind === "stage" ? node.itemIds : [node.itemId];
  return (
    <article className="flow-plan-node">
      <span className="flow-plan-node__index">{index + 1}</span>
      <strong>
        {node.kind === "stage"
          ? node.title.replace(/^\d · /, "")
          : "Independent Item"}
      </strong>
      {itemIds.map((itemId) => {
        const item = findItem(state, itemId);
        return (
          <div className="mini-item" key={item.id}>
            <StatusDot status={item.status} />
            <button
              className="title-button grow"
              onClick={() => actions.selectItem(item.id)}
            >
              {item.title}
            </button>
            <button onClick={() => actions.addToToday(item.id)}>Today →</button>
          </div>
        );
      })}
    </article>
  );
}

function CockpitNode({
  actions,
  index,
  node,
  state,
}: {
  actions: PrototypeActions;
  index: number;
  node: PlanNode;
  state: PrototypeState;
}) {
  const itemIds = node.kind === "stage" ? node.itemIds : [node.itemId];
  return (
    <section className="cockpit-node">
      <div className="cockpit-node__marker">{index + 1}</div>
      <div className="cockpit-node__content">
        <span className="stage-label">
          {node.kind === "stage" ? "Stage" : "Direct Item"}
        </span>
        {node.kind === "stage" && <h3>{node.title.replace(/^\d · /, "")}</h3>}
        {itemIds.map((itemId) => {
          const item = findItem(state, itemId);
          return (
            <article className="cockpit-node__item" key={item.id}>
              <StatusDot status={item.status} />
              <div className="grow">
                <button
                  className="title-button"
                  onClick={() => actions.selectItem(item.id)}
                >
                  {item.title}
                </button>
                <ItemKicker item={item} />
              </div>
              <button onClick={() => actions.addToToday(item.id)}>
                Pick today
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function CaptureSheet({
  onCancel,
  onCapture,
}: {
  onCancel: () => void;
  onCapture: (input: CaptureInput) => void;
}) {
  const [title, setTitle] = useState("A visual guide to browser rendering");
  const [type, setType] = useState<ItemType>("video");
  const [source, setSource] = useState(
    "https://youtube.com/watch?v=browser-rendering",
  );

  function submit(event: FormEvent) {
    event.preventDefault();
    onCapture({ title, type, source: source || undefined });
  }

  return (
    <div className="capture-backdrop" role="presentation">
      <form
        aria-labelledby="capture-title"
        className="capture-sheet"
        onSubmit={submit}
        role="dialog"
      >
        <div className="capture-sheet__header">
          <div>
            <span className="stage-label">Manual Capture</span>
            <h2 id="capture-title">Preserve an option</h2>
          </div>
          <button
            aria-label="Close Capture"
            className="icon-button"
            onClick={onCancel}
            type="button"
          >
            ×
          </button>
        </div>
        <label>
          Title
          <input
            autoFocus
            onChange={(event) => setTitle(event.target.value)}
            required
            value={title}
          />
        </label>
        <label>
          Type
          <select
            onChange={(event) => setType(event.target.value as ItemType)}
            value={type}
          >
            <option value="video">Video</option>
            <option value="article">Article</option>
            <option value="book">Book</option>
            <option value="text">Custom text</option>
          </select>
        </label>
        <label>
          Source <small>optional</small>
          <input
            onChange={(event) => setSource(event.target.value)}
            value={source}
          />
        </label>
        <p>
          Capture creates one uncommitted Library Item. Labels, Plans, and Today
          stay separate.
        </p>
        <button className="primary-action" type="submit">
          Capture to Library
        </button>
      </form>
    </div>
  );
}

function PrototypeSwitcher({
  current,
  onSelect,
}: {
  current: VariantKey;
  onSelect: (variant: VariantKey) => void;
}) {
  const index = variants.findIndex((variant) => variant.key === current);
  const previous = variants[(index - 1 + variants.length) % variants.length];
  const next = variants[(index + 1) % variants.length];
  const selected = variants[index];
  return (
    <nav aria-label="Prototype variants" className="prototype-switcher">
      <button
        aria-label={`Show ${previous.name}`}
        onClick={() => onSelect(previous.key)}
      >
        ←
      </button>
      <span>
        <b>{selected.key}</b> — {selected.name}
      </span>
      <button
        aria-label={`Show ${next.name}`}
        onClick={() => onSelect(next.key)}
      >
        →
      </button>
    </nav>
  );
}

function StateLens({ state }: { state: PrototypeState }) {
  return (
    <details className="state-lens">
      <summary>
        State lens <span>{state.events[0]}</span>
      </summary>
      <div className="state-lens__body">
        <div>
          <p className="sidecar-label">Recent transitions</p>
          <ol>
            {state.events.map((event, index) => (
              <li key={`${index}-${event}`}>{event}</li>
            ))}
          </ol>
        </div>
        <details>
          <summary>Full in-memory state</summary>
          <pre>{JSON.stringify(state, null, 2)}</pre>
        </details>
      </div>
    </details>
  );
}

function HeaderActions({
  actions,
  onOpenCapture,
}: {
  actions: PrototypeActions;
  onOpenCapture: () => void;
}) {
  return (
    <div className="header-actions">
      <button className="quiet-action" onClick={actions.reset}>
        Reset
      </button>
      <button className="primary-action" onClick={onOpenCapture}>
        Capture
      </button>
      <span className="avatar">RG</span>
    </div>
  );
}

function Brand() {
  return (
    <strong className="brand">
      unshelf<span>.</span>
    </strong>
  );
}

function VariantIntro({
  detail,
  eyebrow,
  title,
}: {
  detail: string;
  eyebrow: string;
  title: string;
}) {
  return (
    <div className="variant-intro">
      <span>{eyebrow}</span>
      <h1>{title}</h1>
      <p>{detail}</p>
    </div>
  );
}

function SectionHeading({
  eyebrow,
  title,
}: {
  eyebrow: string;
  title: string;
}) {
  return (
    <header className="section-heading">
      <span>{eyebrow}</span>
      <h2>{title}</h2>
    </header>
  );
}

function RoomDoor({
  active,
  count,
  label,
  onClick,
}: {
  active: boolean;
  count: number;
  label: string;
  onClick: () => void;
}) {
  return (
    <button aria-current={active ? "page" : undefined} onClick={onClick}>
      <span>{label}</span>
      <b>{count}</b>
    </button>
  );
}

function FlowLane({
  children,
  eyebrow,
  subtitle,
  title,
}: {
  children: ReactNode;
  eyebrow: string;
  subtitle: string;
  title: string;
}) {
  return (
    <section className="flow-lane">
      <header>
        <span>{eyebrow}</span>
        <h2>{title}</h2>
        <p>{subtitle}</p>
      </header>
      <div className="flow-lane__cards">{children}</div>
    </section>
  );
}

function SuggestionRow({
  item,
  onAdd,
  reason,
}: {
  item: LearningItem;
  onAdd: () => void;
  reason: string;
}) {
  return (
    <article className="suggestion-row">
      <div className="grow">
        <strong>{item.title}</strong>
        <small>{reason}</small>
      </div>
      <button onClick={onAdd}>Add</button>
    </article>
  );
}

function ItemKicker({ item }: { item: LearningItem }) {
  return (
    <span className="item-kicker">
      {typeLabel(item.type)}
      {item.parts
        ? ` · ${item.parts.filter((part) => part.done).length}/${item.parts.length} parts`
        : ""}
    </span>
  );
}

function StatusPill({ status }: { status: ItemStatus }) {
  return (
    <span className={`status-pill status-pill--${status}`}>
      {statusLabel(status)}
    </span>
  );
}

function StatusDot({ status }: { status: ItemStatus }) {
  return (
    <span
      aria-label={statusLabel(status)}
      className={`status-dot status-dot--${status}`}
    />
  );
}

function nextStatus(status: ItemStatus): ItemStatus {
  if (status === "not-started") return "in-progress";
  if (status === "in-progress") return "done";
  return "in-progress";
}

function findItem(state: PrototypeState, itemId: string): LearningItem {
  const item = state.items.find((entry) => entry.id === itemId);
  if (!item) throw new Error(`Prototype Item ${itemId} not found`);
  return item;
}

function selectedItem(state: PrototypeState): LearningItem {
  return (
    state.items.find((item) => item.id === state.selectedItemId) ??
    state.items[0]
  );
}

function planContainsItem({
  nodes,
  itemId,
}: {
  nodes: PlanNode[];
  itemId: string;
}): boolean {
  return nodes.some((node) =>
    node.kind === "item"
      ? node.itemId === itemId
      : node.itemIds.includes(itemId),
  );
}

function planItemIds(nodes: PlanNode[]): string[] {
  return [
    ...new Set(
      nodes.flatMap((node) =>
        node.kind === "item" ? [node.itemId] : node.itemIds,
      ),
    ),
  ];
}

function getPlanProgress(state: PrototypeState) {
  const itemIds = planItemIds(state.planNodes);
  const done = itemIds.filter(
    (itemId) => findItem(state, itemId).status === "done",
  ).length;
  return {
    done,
    total: itemIds.length,
    percent: Math.round((done / itemIds.length) * 100),
  };
}

function getDailyProgress(state: PrototypeState) {
  const total = state.dailyPicks.length;
  const done = state.dailyPicks.filter(
    (pick) => findItem(state, pick.itemId).status === "done",
  ).length;
  return {
    done,
    total,
    percent: total === 0 ? 0 : Math.round((done / total) * 100),
  };
}

function unresolvedCandidates(state: PrototypeState): Candidate[] {
  return state.candidates.filter(
    (candidate) => candidate.status === "new" || candidate.status === "seen",
  );
}

function roomTitle(area: RoomsArea): string {
  if (area === "today") return "Today";
  if (area === "discover") return "Discover";
  if (area === "library") return "Library";
  return "Learning Plans";
}

function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    Boolean(target.closest("input, textarea, select, [contenteditable='true']"))
  );
}
