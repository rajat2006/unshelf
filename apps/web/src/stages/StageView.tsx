import { useState } from "react";
import type { Item, ItemId, StageDetail, StageId } from "@unshelf/shared";
import { removeItemFromStage } from "../api";
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
}

/**
 * One Stage's contents: its Items, each shown exactly as All shows them — the same
 * `ItemRow`, so the same Status and the same Target date (story 33). A Stage
 * displays progress without owning any of it; changing it here changes the Item,
 * which is why it lands in every other Stage at the same time.
 *
 * The list is presented plainly, with no numbering, drag handles, or "next up":
 * a Stage is an unordered set (ADR-0004), and any order shown here is the api's
 * display convenience, not a plan. Sequencing is the LearningPlan's job.
 */
export function StageView({
  stage,
  user,
  onStageChanged,
  onItemChanged,
  onClose,
  closeLabel = "← All stages",
  headingLevel = 3,
}: StageViewProps) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <div>
      <div className="stage-view__heading">
        <Heading>{stage.name}</Heading>
        <button type="button" onClick={onClose} className="quiet-button">
          {closeLabel}
        </button>
      </div>

      {stage.items.length > 0 && (
        <ul className="stage-view__items">
          {stage.items.map((item) => (
            <ItemRow
              key={item.id}
              item={item}
              user={user}
              onChanged={onItemChanged}
            >
              <RemoveFromStage
                stageId={stage.id}
                itemId={item.id}
                user={user}
                onStageChanged={onStageChanged}
              />
            </ItemRow>
          ))}
        </ul>
      )}
      <StageItemIntake
        stageId={stage.id}
        user={user}
        onStageChanged={onStageChanged}
      />
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
