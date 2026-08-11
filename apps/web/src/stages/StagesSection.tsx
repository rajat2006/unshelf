import { useState } from "react";
import type { Item, Stage, StageDetail, StageId } from "@unshelf/shared";
import { fetchStage } from "../api";
import type { CurrentUser } from "../application-auth/types";
import { StageView } from "./StageView";

interface StagesSectionProps {
  stages: Stage[] | null;
  openStage: StageDetail | null;
  error: string | null;
  user: CurrentUser;
  onStageOpened: (stage: StageDetail | null) => void;
  onStageChanged: (stage: StageDetail) => void;
  onItemChanged: (item: Item) => void;
}

/**
 * Stages: create them, list them, open one to see what is in it.
 *
 * The list and the open Stage are one section rather than two screens, because
 * v1's whole organising surface is "your Stages, and the one you are looking at".
 * Opening a Stage replaces the list in place, so the phone gets the same flow as
 * the desktop with nothing extra to reflow (ADR-0008).
 *
 * Stages are *created* on a LearningPlan now (ADR-0014, #94), not here — this transitional
 * Library view only lists the User's Stages and opens one; sequencing and authoring
 * live on the Learning Plan canvas.
 */
export function StagesSection({
  stages,
  openStage,
  error,
  user,
  onStageOpened,
  onStageChanged,
  onItemChanged,
}: StagesSectionProps) {
  const [opening, setOpening] = useState<StageId | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);

  async function open(stageId: StageId) {
    setOpening(stageId);
    setOpenError(null);
    try {
      onStageOpened(await fetchStage(user, stageId));
    } catch (caught: unknown) {
      setOpenError(String(caught));
    } finally {
      setOpening(null);
    }
  }

  return (
    <section className="stages-section">
      <h2>Stages</h2>
      {error && (
        <p className="surface-error">Could not reach your stages: {error}</p>
      )}

      {openStage ? (
        <StageView
          stage={openStage}
          user={user}
          onStageChanged={onStageChanged}
          onItemChanged={onItemChanged}
          onClose={() => onStageOpened(null)}
        />
      ) : (
        <>
          {!stages && !error && <p>Loading your stages…</p>}
          {stages && stages.length === 0 && (
            <p className="quiet-copy">
              No Stages yet — open a Learning Plan to add Stages and arrange
              them.
            </p>
          )}
          {stages && stages.length > 0 && (
            <ul className="stages-list">
              {stages.map((stage) => (
                <li key={stage.id}>
                  <button
                    type="button"
                    disabled={opening !== null}
                    onClick={() => void open(stage.id)}
                    className="stages-list__button"
                  >
                    {stage.name}
                    {opening === stage.id && (
                      <span className="quiet-copy"> — opening…</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {openError && (
            <div role="alert" className="surface-error">
              Could not open the stage: {openError}
            </div>
          )}
        </>
      )}
    </section>
  );
}
