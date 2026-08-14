import { useEffect, useMemo, useState } from "react";
import { CalendarCheck, Check, LoaderCircle, Plus } from "lucide-react";
import { Link } from "react-router";
import {
  PlanNodeKind,
  type DailyFocus,
  type DailyFocusOrigin,
  type Item,
  type ItemId,
  type LearningPlan,
  type LearningPlanView,
  type StageId,
} from "@unshelf/shared";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { addItemToToday, fetchLearningPlanStage, fetchToday } from "../api";
import type { CurrentUser } from "../application-auth/types";
import { ItemSummary } from "../items/ItemSummary";
import { planItemBackgroundLocation } from "../items/item-route-state";

interface PlannedItem {
  item: Item;
  stage: { id: StageId; name: string } | null;
}

interface PlanTodaySidecarProps {
  learningPlan: LearningPlan;
  topology: LearningPlanView;
  user: CurrentUser;
}

function todayOriginLabel(origin: DailyFocusOrigin | null): string {
  if (!origin) return "Today from Library";
  return `Today from ${origin.learningPlan.name}${origin.stage ? ` · ${origin.stage.name}` : ""}`;
}

/** Explicit Daily Focus selection inside one open Learning Plan studio. */
export function PlanTodaySidecar({
  learningPlan,
  topology,
  user,
}: PlanTodaySidecarProps) {
  const [focus, setFocus] = useState<DailyFocus | null>(null);
  const [plannedItems, setPlannedItems] = useState<PlannedItem[] | null>(null);
  const [error, setError] = useState<"load" | "mutation" | null>(null);
  const [loadVersion, setLoadVersion] = useState(0);
  const [addingId, setAddingId] = useState<ItemId | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setError(null);
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
        if (active) setError("load");
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [learningPlan.id, loadVersion, topology, user]);

  const todayOriginByItemId = useMemo(
    () =>
      new Map(
        focus?.entries.map((entry) => [entry.item.id, entry.origin]) ?? [],
      ),
    [focus],
  );

  const add = async ({ item, stage }: PlannedItem) => {
    if (addingId) return;
    setAddingId(item.id);
    setError(null);
    try {
      setFocus(
        await addItemToToday(user, item.id, {
          learningPlanId: learningPlan.id,
          ...(stage ? { stageId: stage.id } : {}),
        }),
      );
    } catch {
      setError("mutation");
    } finally {
      setAddingId(null);
    }
  };

  const loading = !focus || !plannedItems;

  return (
    <aside
      className="grid min-w-0 content-start gap-5 overflow-hidden border-t bg-muted/45 p-4 text-foreground md:col-span-2 md:max-h-[calc(100dvh-9rem)] md:overflow-y-auto lg:col-span-1 lg:border-t-0 lg:border-l lg:p-5"
      aria-label="Today sidecar"
      aria-busy={loading && !error}
    >
      <header className="grid gap-1 border-b pb-4">
        <p className="m-0 flex items-center gap-2 text-xs font-semibold tracking-[0.12em] text-primary uppercase">
          <CalendarCheck aria-hidden="true" className="size-4" />
          Daily Focus
        </p>
        <h2 className="m-0 font-serif text-2xl leading-tight font-semibold">
          Today
        </h2>
        <p className="m-0 text-sm leading-relaxed text-muted-foreground">
          Explicitly choose which Items from this plan deserve attention now.
        </p>
      </header>

      {loading && !error && (
        <div className="grid gap-3" role="status" aria-label="Loading Today">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-36 w-full" />
          <Skeleton className="h-36 w-full" />
        </div>
      )}

      {!loading && focus && plannedItems && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="m-0 text-sm font-semibold">
              {focus.total} {focus.total === 1 ? "Item" : "Items"} in Today
            </p>
            <Button asChild variant="quiet" size="compact">
              <Link to="/today">Open Today</Link>
            </Button>
          </div>

          {plannedItems.length === 0 ? (
            <p className="m-0 rounded-[var(--radius-card)] border border-dashed bg-background/65 p-4 text-sm text-muted-foreground">
              No Items on this Learning Plan yet.
            </p>
          ) : (
            <ul
              className="grid min-w-0 list-none gap-3 p-0"
              aria-label="Learning Plan Items for Today"
            >
              {plannedItems.map((plannedItem) => {
                const { item, stage } = plannedItem;
                const selected = todayOriginByItemId.has(item.id);
                const todayOrigin = todayOriginByItemId.get(item.id) ?? null;
                const pending = addingId === item.id;
                const backgroundLocation = planItemBackgroundLocation({
                  learningPlanId: learningPlan.id,
                  ...(stage ? { stageId: stage.id } : {}),
                });
                return (
                  <li key={item.id} className="min-w-0">
                    <ItemSummary
                      item={item}
                      detailBackgroundLocation={backgroundLocation}
                      className="bg-background p-3"
                      actions={
                        <div className="flex min-w-0 flex-wrap items-center gap-2 border-t pt-3">
                          {selected ? (
                            <Button
                              type="button"
                              variant="secondary"
                              size="compact"
                              className="min-h-11 sm:min-h-8"
                              disabled
                              aria-label={`${item.title} is in Today`}
                            >
                              <Check aria-hidden="true" />
                              In Today
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              size="compact"
                              className="min-h-11 sm:min-h-8"
                              disabled={addingId !== null}
                              aria-label={
                                pending
                                  ? `Adding ${item.title} to Today…`
                                  : `Add ${item.title} to Today`
                              }
                              onClick={() => void add(plannedItem)}
                            >
                              {pending ? (
                                <LoaderCircle
                                  aria-hidden="true"
                                  className="animate-spin motion-reduce:animate-none"
                                />
                              ) : (
                                <Plus aria-hidden="true" />
                              )}
                              {pending ? "Adding…" : "Add to Today"}
                            </Button>
                          )}
                          {selected && (
                            <Badge variant="neutral">
                              {todayOriginLabel(todayOrigin)}
                            </Badge>
                          )}
                          {stage ? (
                            <Button asChild variant="quiet" size="compact">
                              <Link
                                to={`/plans/${learningPlan.id}/stages/${stage.id}`}
                                aria-label={`Current placement: ${stage.name}`}
                              >
                                Placed in {stage.name}
                              </Link>
                            </Button>
                          ) : (
                            <Badge variant="neutral">Direct placement</Badge>
                          )}
                        </div>
                      }
                    />
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      {error && (
        <div className="grid justify-items-start gap-3">
          <Alert>
            {error === "load"
              ? "Couldn’t load Today. The Learning Plan remains available."
              : "Couldn’t update Today. This Item is still available in the plan."}
          </Alert>
          <Button
            type="button"
            variant="secondary"
            onClick={() => setLoadVersion((current) => current + 1)}
          >
            Retry
          </Button>
        </div>
      )}
    </aside>
  );
}
