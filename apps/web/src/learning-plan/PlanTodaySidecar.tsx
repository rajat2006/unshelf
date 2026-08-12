import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import {
  PlanNodeKind,
  type DailyFocus,
  type Item,
  type LearningPlan,
  type LearningPlanView,
  type StageId,
} from "@unshelf/shared";
import { addItemToToday, fetchLearningPlanStage, fetchToday } from "../api";
import type { CurrentUser } from "../application-auth/types";

interface PlannedItem {
  item: Item;
  stage: { id: StageId; name: string } | null;
}

interface PlanTodaySidecarProps {
  learningPlan: LearningPlan;
  topology: LearningPlanView;
  user: CurrentUser;
}

/** Explicit Daily Focus selection inside one open Learning Plan studio. */
export function PlanTodaySidecar({
  learningPlan,
  topology,
  user,
}: PlanTodaySidecarProps) {
  const [focus, setFocus] = useState<DailyFocus | null>(null);
  const [plannedItems, setPlannedItems] = useState<PlannedItem[] | null>(null);
  const [error, setError] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setError(false);
      try {
        const stageNodes = topology.nodes.filter(
          (node) => node.kind === PlanNodeKind.Stage,
        );
        const [nextFocus, ...stageDetails] = await Promise.all([
          fetchToday(user),
          ...stageNodes.map((stage) =>
            fetchLearningPlanStage(user, learningPlan.id, stage.id),
          ),
        ]);
        if (!active) return;
        const directItems: PlannedItem[] = topology.nodes
          .filter((node) => node.kind === PlanNodeKind.Item)
          .map((node) => ({ item: node.item, stage: null }));
        const stagedItems = stageDetails.flatMap((stage) =>
          stage.items.map((item) => ({
            item,
            stage: { id: stage.id, name: stage.name },
          })),
        );
        setFocus(nextFocus);
        setPlannedItems([...directItems, ...stagedItems]);
      } catch {
        if (active) setError(true);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [learningPlan.id, topology, user]);

  const selectedIds = useMemo(
    () => new Set(focus?.entries.map((entry) => entry.item.id) ?? []),
    [focus],
  );

  const add = async ({ item, stage }: PlannedItem) => {
    setAddingId(item.id);
    setError(false);
    try {
      setFocus(
        await addItemToToday(user, item.id, {
          learningPlanId: learningPlan.id,
          ...(stage ? { stageId: stage.id } : {}),
        }),
      );
    } catch {
      setError(true);
    } finally {
      setAddingId(null);
    }
  };

  return (
    <aside className="plan-today-sidecar" aria-label="Today sidecar">
      <h2>Today</h2>
      {!focus || !plannedItems ? (
        error ? null : (
          <p role="status">Loading Today…</p>
        )
      ) : (
        <>
          <p>
            {focus.total} {focus.total === 1 ? "Item" : "Items"} in Today
          </p>
          {plannedItems.length === 0 ? (
            <p className="quiet-copy">No Items on this Learning Plan yet.</p>
          ) : (
            <ul>
              {plannedItems.map((plannedItem) => {
                const { item, stage } = plannedItem;
                const selected = selectedIds.has(item.id);
                const backgroundLocation = {
                  pathname: stage
                    ? `/plans/${learningPlan.id}/stages/${stage.id}`
                    : `/plans/${learningPlan.id}`,
                  search: "",
                  hash: "",
                };
                return (
                  <li key={item.id}>
                    <span>{item.title}</span>
                    {stage && <small>{stage.name}</small>}
                    {selected ? (
                      <>
                        <button
                          type="button"
                          disabled
                          aria-label={`${item.title} is in Today`}
                        >
                          In Today
                        </button>
                        <Link
                          to={`/items/${item.id}`}
                          state={{ backgroundLocation }}
                          aria-label={`Open ${item.title} from Today`}
                        >
                          Open
                        </Link>
                      </>
                    ) : (
                      <button
                        type="button"
                        disabled={
                          addingId !== null || learningPlan.archivedAt !== null
                        }
                        onClick={() => void add(plannedItem)}
                        aria-label={`Add ${item.title} to Today`}
                      >
                        Add
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
      {error && <p role="alert">Couldn&apos;t update Today. Try again.</p>}
    </aside>
  );
}
