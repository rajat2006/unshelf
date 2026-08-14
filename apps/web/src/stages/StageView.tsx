import { useState } from "react";
import {
  Status,
  type Item,
  type ItemId,
  type StageDetail,
  type StageId,
} from "@unshelf/shared";
import {
  ArrowDown,
  ArrowUp,
  CornerDownLeft,
  LoaderCircle,
  Trash2,
} from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  fetchStage,
  moveLearningPlanItem,
  removeItemFromStage,
  reorderStageItems,
} from "../api";
import type { CurrentUser } from "../application-auth/types";
import { ItemRow } from "../items/ItemRow";
import { StageItemIntake } from "./StageItemIntake";

interface StageViewProps {
  stage: StageDetail;
  user: CurrentUser;
  onStageChanged: (stage: StageDetail) => void;
  onItemChanged: (item: Item) => void;
  onClose: () => void;
  closeLabel?: string;
  headingLevel?: 2 | 3;
  showHeading?: boolean;
  structuralReadOnly?: boolean;
}

/** Ordered shared Items and derived progress for one optional Stage. */
export function StageView({
  stage,
  user,
  onStageChanged,
  onItemChanged,
  onClose,
  closeLabel = "All stages",
  headingLevel = 3,
  showHeading = true,
  structuralReadOnly = false,
}: StageViewProps) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const [orderingItemId, setOrderingItemId] = useState<ItemId | null>(null);
  const [orderFailed, setOrderFailed] = useState(false);
  const done = stage.items.filter((item) => item.status === Status.Done).length;
  const percentage =
    stage.items.length === 0 ? 0 : (done / stage.items.length) * 100;
  const progressLabel =
    stage.items.length === 0
      ? "No Items added yet"
      : `${done} of ${stage.items.length} Items done`;

  async function moveInOrder(itemId: ItemId, offset: -1 | 1) {
    const index = stage.items.findIndex((item) => item.id === itemId);
    const destination = index + offset;
    if (index < 0 || destination < 0 || destination >= stage.items.length)
      return;
    const itemIds = stage.items.map((item) => item.id);
    [itemIds[index], itemIds[destination]] = [
      itemIds[destination],
      itemIds[index],
    ];
    setOrderingItemId(itemId);
    setOrderFailed(false);
    try {
      onStageChanged(await reorderStageItems(user, stage.id, itemIds));
    } catch {
      setOrderFailed(true);
    } finally {
      setOrderingItemId(null);
    }
  }

  return (
    <div className="grid min-w-0 gap-5">
      {showHeading && (
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
          <Heading className="m-0 font-serif text-xl leading-tight font-semibold break-words">
            {stage.name}
          </Heading>
          <Button type="button" variant="quiet" onClick={onClose}>
            {closeLabel}
          </Button>
        </div>
      )}

      <div className="grid gap-2 rounded-[var(--radius-card)] bg-muted/35 p-4">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-sm font-semibold">Stage progress</span>
          <span className="text-xs font-semibold text-muted-foreground">
            {progressLabel}
          </span>
        </div>
        <Progress
          value={percentage}
          aria-label={`${stage.name} progress`}
          aria-valuetext={progressLabel}
          className={
            percentage === 100
              ? "[&_[data-slot=progress-indicator]]:bg-status-completed"
              : undefined
          }
        />
      </div>

      {stage.items.length === 0 ? (
        <div className="rounded-[var(--radius-card)] border border-dashed bg-background p-5">
          <p className="m-0 text-sm leading-relaxed text-muted-foreground">
            No Items added to this Stage yet. Search your Library below to give
            this optional grouping meaningful structure.
          </p>
        </div>
      ) : (
        <ul
          className="grid min-w-0 list-none gap-4 p-0"
          aria-label={`Items in ${stage.name}`}
        >
          {stage.items.map((item, index) => (
            <ItemRow
              key={item.id}
              item={item}
              user={user}
              onChanged={onItemChanged}
            >
              {!structuralReadOnly && (
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <div className="flex items-center rounded-[var(--radius-control)] border bg-background p-0.5">
                    <Button
                      type="button"
                      variant="quiet"
                      size="icon-compact"
                      className="min-h-11 min-w-11 sm:min-h-8 sm:min-w-8"
                      aria-label={`Move ${item.title} up`}
                      disabled={orderingItemId !== null || index === 0}
                      onClick={() => void moveInOrder(item.id, -1)}
                    >
                      {orderingItemId === item.id ? (
                        <LoaderCircle
                          aria-hidden="true"
                          className="animate-spin motion-reduce:animate-none"
                        />
                      ) : (
                        <ArrowUp aria-hidden="true" />
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="quiet"
                      size="icon-compact"
                      className="min-h-11 min-w-11 sm:min-h-8 sm:min-w-8"
                      aria-label={`Move ${item.title} down`}
                      disabled={
                        orderingItemId !== null ||
                        index === stage.items.length - 1
                      }
                      onClick={() => void moveInOrder(item.id, 1)}
                    >
                      {orderingItemId === item.id ? (
                        <LoaderCircle
                          aria-hidden="true"
                          className="animate-spin motion-reduce:animate-none"
                        />
                      ) : (
                        <ArrowDown aria-hidden="true" />
                      )}
                    </Button>
                  </div>
                  <MoveDirectly
                    stage={stage}
                    itemId={item.id}
                    user={user}
                    onStageChanged={onStageChanged}
                  />
                  <RemoveFromStage
                    stageId={stage.id}
                    itemId={item.id}
                    user={user}
                    onStageChanged={onStageChanged}
                  />
                </div>
              )}
            </ItemRow>
          ))}
        </ul>
      )}

      {orderFailed && (
        <Alert>
          Couldn&apos;t reorder this Stage. Nothing changed; check your
          connection and try again.
        </Alert>
      )}

      {!structuralReadOnly && (
        <StageItemIntake
          stageId={stage.id}
          user={user}
          onStageChanged={onStageChanged}
        />
      )}
    </div>
  );
}

function MoveDirectly({
  stage,
  itemId,
  user,
  onStageChanged,
}: {
  stage: StageDetail;
  itemId: ItemId;
  user: CurrentUser;
  onStageChanged: (stage: StageDetail) => void;
}) {
  const [moving, setMoving] = useState(false);
  const [failed, setFailed] = useState(false);

  async function move() {
    if (moving) return;
    setMoving(true);
    setFailed(false);
    try {
      await moveLearningPlanItem(user, stage.learningPlanId, itemId, null);
      onStageChanged(await fetchStage(user, stage.id));
    } catch {
      setFailed(true);
    } finally {
      setMoving(false);
    }
  }

  return (
    <div className="grid gap-2">
      <Button
        type="button"
        variant="secondary"
        size="compact"
        className="min-h-11 sm:min-h-8"
        disabled={moving}
        onClick={() => void move()}
      >
        {moving ? (
          <LoaderCircle
            aria-hidden="true"
            className="animate-spin motion-reduce:animate-none"
          />
        ) : (
          <CornerDownLeft aria-hidden="true" />
        )}
        {moving ? "Moving…" : "Move directly in plan"}
      </Button>
      {failed && <Alert>Couldn&apos;t move this Item. Nothing changed.</Alert>}
    </div>
  );
}

interface RemoveFromStageProps {
  stageId: StageId;
  itemId: ItemId;
  user: CurrentUser;
  onStageChanged: (stage: StageDetail) => void;
}

/** Remove only this placement; the shared Item remains in the Library. */
function RemoveFromStage({
  stageId,
  itemId,
  user,
  onStageChanged,
}: RemoveFromStageProps) {
  const [removing, setRemoving] = useState(false);
  const [failed, setFailed] = useState(false);

  async function remove() {
    if (removing) return;
    setRemoving(true);
    setFailed(false);
    try {
      onStageChanged(await removeItemFromStage(user, stageId, itemId));
    } catch {
      setFailed(true);
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div className="grid gap-2">
      <Button
        type="button"
        variant="quiet"
        size="compact"
        className="min-h-11 text-destructive hover:bg-destructive/8 hover:text-destructive sm:min-h-8"
        disabled={removing}
        onClick={() => void remove()}
      >
        {removing ? (
          <LoaderCircle
            aria-hidden="true"
            className="animate-spin motion-reduce:animate-none"
          />
        ) : (
          <Trash2 aria-hidden="true" />
        )}
        {removing ? "Removing…" : "Remove from stage"}
      </Button>
      {failed && (
        <Alert>
          Couldn&apos;t remove this Item from the Stage. Nothing changed.
        </Alert>
      )}
    </div>
  );
}
