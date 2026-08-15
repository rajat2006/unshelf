import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import {
  PlanNodeKind,
  Status,
  type DailyFocus,
  type Item,
  type ItemId,
  type LearningPlanId,
  type LearningPlanNode,
  type LearningPlanView,
  type StageId,
} from "@unshelf/shared";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { addItemToToday, fetchLearningPlanStage, fetchToday } from "../api";
import type { CurrentUser } from "../application-auth/types";
import {
  itemDetailRouteState,
  planItemBackgroundLocation,
} from "../items/item-route-state";
import { STATUS_LABELS, TYPE_LABELS } from "../items/presentation";
import { deriveTopologyLayout } from "../topology";

interface PlanGroup {
  id: LearningPlanNode["id"];
  kind: "stage" | "item";
  name?: string;
  items: Item[];
  stageId?: StageId;
}

interface LearningPlanItemsProps {
  learningPlanId: LearningPlanId;
  topology: LearningPlanView;
  user: CurrentUser;
  refreshVersion?: number;
  onStudioChanged?: () => void;
}

/** The prototype's numbered vertical plan sequence, without graph or trail chrome. */
export function LearningPlanItems({
  learningPlanId,
  topology,
  user,
  refreshVersion = 0,
  onStudioChanged,
}: LearningPlanItemsProps) {
  const [groups, setGroups] = useState<PlanGroup[] | null>(null);
  const [focus, setFocus] = useState<DailyFocus | null>(null);
  const [failed, setFailed] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [loadVersion, setLoadVersion] = useState(0);
  const [addingId, setAddingId] = useState<ItemId | null>(null);

  const orderedNodes = useMemo(() => orderPlanNodes(topology), [topology]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setFailed(false);
      setReloading(true);
      try {
        const stageNodes = orderedNodes.filter(
          (node) => node.kind === PlanNodeKind.Stage,
        );
        const [nextFocus, ...details] = await Promise.all([
          fetchToday(user),
          ...stageNodes.map((stage) =>
            fetchLearningPlanStage(user, learningPlanId, stage.id),
          ),
        ]);
        if (!active) return;
        const detailById = new Map(
          details.map((detail) => [detail.id, detail]),
        );
        setGroups(
          orderedNodes.map((node) =>
            node.kind === PlanNodeKind.Item
              ? { id: node.id, kind: "item", items: [node.item] }
              : {
                  id: node.id,
                  kind: "stage",
                  name: node.name,
                  stageId: node.id,
                  items: detailById.get(node.id)?.items ?? [],
                },
          ),
        );
        setFocus(nextFocus);
      } catch {
        if (active) setFailed(true);
      } finally {
        if (active) setReloading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [learningPlanId, loadVersion, orderedNodes, refreshVersion, user]);

  const pickToday = async (item: Item, stageId?: StageId) => {
    if (addingId) return;
    setAddingId(item.id);
    setFailed(false);
    try {
      setFocus(
        await addItemToToday(user, item.id, {
          learningPlanId,
          ...(stageId ? { stageId } : {}),
        }),
      );
      onStudioChanged?.();
    } catch {
      setFailed(true);
    } finally {
      setAddingId(null);
    }
  };

  if (failed) {
    return (
      <Alert className="grid gap-3 p-4">
        <p className="m-0 text-sm">Couldn&apos;t update this Learning Plan.</p>
        <Button
          type="button"
          variant="secondary"
          size="compact"
          className="w-fit"
          onClick={() => setLoadVersion((version) => version + 1)}
        >
          Retry
        </Button>
      </Alert>
    );
  }

  if (!groups || !focus) return <PlanItemsLoading />;

  if (groups.length === 0) {
    return (
      <p className="m-0 rounded-[var(--radius-card)] border border-dashed p-5 text-sm text-muted-foreground">
        No Items in this Learning Plan yet. Add one from the Library.
      </p>
    );
  }

  const todayIds = new Set(focus.entries.map((entry) => entry.item.id));

  return (
    <ol
      className="grid max-w-3xl list-none gap-4 p-0"
      aria-label="Learning Plan sequence"
      aria-busy={reloading}
    >
      {groups.map((group, index) => (
        <li
          key={group.id}
          className="relative grid grid-cols-[2rem_minmax(0,1fr)] gap-3 after:absolute after:top-8 after:bottom-[-1rem] after:left-[0.9375rem] after:w-px after:bg-border last:after:hidden"
        >
          <span className="z-10 grid size-8 place-items-center rounded-[var(--radius-card)] bg-primary text-xs font-bold text-primary-foreground">
            {index + 1}
          </span>
          <section className="min-w-0 rounded-[var(--radius-card)] border bg-card p-4">
            <div className="border-b pb-2">
              <p className="m-0 text-xs font-semibold tracking-[0.1em] text-muted-foreground uppercase">
                {group.kind === "stage" ? "Stage" : "Direct Item"}
              </p>
              {group.name && (
                <h3 className="mt-1 mb-0 text-sm font-semibold">
                  {group.name}
                </h3>
              )}
            </div>
            {group.items.length === 0 ? (
              <p className="mt-3 mb-0 text-sm text-muted-foreground">
                No Items
              </p>
            ) : (
              <ul className="list-none p-0">
                {group.items.map((item) => (
                  <li
                    key={item.id}
                    className="flex min-w-0 items-center gap-3 border-b py-3 last:border-b-0 last:pb-0"
                  >
                    <span
                      className={`size-2.5 shrink-0 rounded-full border ${item.status === Status.Done ? "border-status-completed bg-status-completed" : item.status === Status.InProgress ? "border-status-progress bg-status-progress" : "border-muted-foreground"}`}
                      aria-hidden="true"
                    />
                    <span className="sr-only">
                      {STATUS_LABELS[item.status]}
                    </span>
                    <div className="min-w-0 flex-1">
                      <Link
                        className="block truncate text-sm font-semibold text-foreground underline-offset-4 hover:text-primary hover:underline"
                        to={`/items/${item.id}`}
                        state={itemDetailRouteState(
                          planItemBackgroundLocation({ learningPlanId }),
                        )}
                      >
                        {item.title}
                      </Link>
                      <p className="mt-1 mb-0 text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">
                        {TYPE_LABELS[item.type]}
                        {item.partPercentage !== null
                          ? ` · ${item.partPercentage}% Parts`
                          : ""}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      size="compact"
                      className="min-h-11 shrink-0 sm:min-h-8"
                      aria-label={
                        todayIds.has(item.id)
                          ? `${item.title} is in Today`
                          : `Pick ${item.title} for Today`
                      }
                      disabled={
                        reloading || todayIds.has(item.id) || addingId !== null
                      }
                      loading={addingId === item.id}
                      loadingLabel="Picking…"
                      onClick={() => void pickToday(item, group.stageId)}
                    >
                      {todayIds.has(item.id) ? "In Today" : "Pick today"}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </li>
      ))}
    </ol>
  );
}

function orderPlanNodes(topology: LearningPlanView): LearningPlanNode[] {
  const connectedIds = new Set(
    topology.edges.flatMap((edge) => [edge.fromNodeId, edge.toNodeId]),
  );
  const layout = deriveTopologyLayout({
    nodeIds: topology.nodes.map((node) => node.id),
    edges: topology.edges.map((edge) => ({
      from: edge.fromNodeId,
      to: edge.toNodeId,
    })),
  });
  const connected = topology.nodes
    .filter((node) => connectedIds.has(node.id))
    .sort((left, right) => {
      const a = layout.byId.get(left.id)!;
      const b = layout.byId.get(right.id)!;
      return a.depth - b.depth || a.lane - b.lane;
    });
  return [
    ...connected,
    ...topology.nodes.filter((node) => !connectedIds.has(node.id)),
  ];
}

function PlanItemsLoading() {
  return (
    <div
      className="grid max-w-3xl gap-4"
      role="status"
      aria-label="Loading Learning Plan Items"
    >
      {[0, 1, 2].map((row) => (
        <div className="grid grid-cols-[2rem_minmax(0,1fr)] gap-3" key={row}>
          <Skeleton className="size-8" />
          <div className="grid gap-3 rounded-[var(--radius-card)] border bg-card p-4">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-5 w-2/3" />
          </div>
        </div>
      ))}
    </div>
  );
}
