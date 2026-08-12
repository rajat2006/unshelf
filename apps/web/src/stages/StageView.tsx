import { useState } from "react";
import type { Item, ItemId, StageDetail, StageId } from "@unshelf/shared";
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
  structuralReadOnly?: boolean;
}

/**
 * One Stage's contents: its Items, each shown exactly as All shows them — the same
 * `ItemRow`, so the same Status and the same Target date (story 33). A Stage
 * displays progress without owning any of it; changing it here changes the Item,
 * which is why it lands in every other Stage at the same time.
 *
 * The list exposes keyboard-operable local-order controls. This order belongs
 * inside the Stage; graph sequencing still operates on the Stage as one Plan Node.
 */
export function StageView({
  stage,
  user,
  onStageChanged,
  onItemChanged,
  onClose,
  closeLabel = "← All stages",
  headingLevel = 3,
  structuralReadOnly = false,
}: StageViewProps) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const [orderingItemId, setOrderingItemId] = useState<ItemId | null>(null);
  const [orderError, setOrderError] = useState<string | null>(null);

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
    setOrderError(null);
    try {
      onStageChanged(await reorderStageItems(user, stage.id, itemIds));
    } catch (caught: unknown) {
      setOrderError(String(caught));
    } finally {
      setOrderingItemId(null);
    }
  }
  return (
    <div>
      <div className="stage-view__heading">
        <Heading>{stage.name}</Heading>
        <button type="button" onClick={onClose} className="quiet-button">
          {closeLabel}
        </button>
      </div>

      {stage.items.length === 0 && (
        <p className="quiet-copy">No items added to this Stage yet.</p>
      )}

      {stage.items.length > 0 && (
        <ul className="stage-view__items">
          {stage.items.map((item, index) => (
            <ItemRow
              key={item.id}
              item={item}
              user={user}
              onChanged={onItemChanged}
            >
              {!structuralReadOnly && (
                <div>
                  <button
                    type="button"
                    className="quiet-button"
                    aria-label={`Move ${item.title} up`}
                    disabled={orderingItemId !== null || index === 0}
                    onClick={() => void moveInOrder(item.id, -1)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="quiet-button"
                    aria-label={`Move ${item.title} down`}
                    disabled={
                      orderingItemId !== null ||
                      index === stage.items.length - 1
                    }
                    onClick={() => void moveInOrder(item.id, 1)}
                  >
                    ↓
                  </button>
                </div>
              )}
              {!structuralReadOnly && (
                <>
                  <RemoveFromStage
                    stageId={stage.id}
                    itemId={item.id}
                    user={user}
                    onStageChanged={onStageChanged}
                  />
                  <MoveDirectly
                    stage={stage}
                    itemId={item.id}
                    user={user}
                    onStageChanged={onStageChanged}
                  />
                </>
              )}
            </ItemRow>
          ))}
        </ul>
      )}
      {orderError && (
        <div role="alert" className="surface-error">
          Could not reorder this Stage: {orderError}
        </div>
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
  const [error, setError] = useState<string | null>(null);

  async function move() {
    setMoving(true);
    setError(null);
    try {
      await moveLearningPlanItem(user, stage.learningPlanId, itemId, null);
      onStageChanged(await fetchStage(user, stage.id));
    } catch (caught: unknown) {
      setError(String(caught));
    } finally {
      setMoving(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        className="quiet-button"
        disabled={moving}
        onClick={() => void move()}
      >
        {moving ? "Moving…" : "Move directly in plan"}
      </button>
      {error && <span role="alert">Could not move this Item: {error}</span>}
    </div>
  );
}

interface RemoveFromStageProps {
  stageId: StageId;
  itemId: ItemId;
  user: CurrentUser;
  onStageChanged: (stage: StageDetail) => void;
}

/**
 * Take one Item out of this Stage. It unfiles, it does not delete: the Item keeps
 * its Status and its place in All and in every other Stage — which is what makes
 * reorganising free (story 32), and why this needs no confirmation.
 */
function RemoveFromStage({
  stageId,
  itemId,
  user,
  onStageChanged,
}: RemoveFromStageProps) {
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setRemoving(true);
    setError(null);
    try {
      onStageChanged(await removeItemFromStage(user, stageId, itemId));
    } catch (caught: unknown) {
      setError(String(caught));
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div className="stage-view__remove">
      <button
        type="button"
        disabled={removing}
        onClick={() => void remove()}
        className="quiet-button"
      >
        {removing ? "Removing…" : "Remove from stage"}
      </button>
      {error && (
        <div role="alert" className="surface-error">
          Could not remove from the stage: {error}
        </div>
      )}
    </div>
  );
}
