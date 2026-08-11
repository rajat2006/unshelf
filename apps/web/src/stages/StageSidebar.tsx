import { useCallback, useEffect, useState, type FormEvent } from "react";
import type {
  Item,
  StageDetail,
  StageItemDisposition,
  StageId,
  LearningPlanId,
} from "@unshelf/shared";
import { fetchLearningPlanStage, removeStage, updateStage } from "../api";
import type { CurrentUser } from "../application-auth/types";
import { StageView } from "./StageView";

interface StageSidebarProps {
  stageId: StageId;
  learningPlanId: LearningPlanId;
  user: CurrentUser;
  onClose: () => void;
  onLearningPlanChanged: () => Promise<void>;
  structuralReadOnly?: boolean;
}

/** Route-owned Stage detail, kept separate from the live LearningPlan beside it. */
export function StageSidebar({
  stageId,
  learningPlanId,
  user,
  onClose,
  onLearningPlanChanged,
  structuralReadOnly = false,
}: StageSidebarProps) {
  const [stage, setStage] = useState<StageDetail | null>(null);
  const [name, setName] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingRemoval, setConfirmingRemoval] = useState(false);
  const [removing, setRemoving] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const nextStage = await fetchLearningPlanStage(
        user,
        learningPlanId,
        stageId,
      );
      setStage(nextStage);
      setName(nextStage.name);
    } catch (caught: unknown) {
      setError(String(caught));
    }
  }, [stageId, learningPlanId, user]);

  useEffect(() => {
    setStage(null);
    void load();
  }, [load]);

  const updateItem = (changed: Item) => {
    setStage((current) =>
      current
        ? {
            ...current,
            items: current.items.map((item) =>
              item.id === changed.id ? changed : item,
            ),
          }
        : current,
    );
    void onLearningPlanChanged();
  };

  const rename = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || renaming) return;
    setRenaming(true);
    setError(null);
    try {
      const updated = await updateStage(user, stageId, { name: trimmed });
      setStage(updated);
      setName(updated.name);
      await onLearningPlanChanged();
    } catch (caught: unknown) {
      setError(String(caught));
    } finally {
      setRenaming(false);
    }
  };

  const remove = async (itemDisposition: StageItemDisposition) => {
    setRemoving(true);
    setError(null);
    try {
      await removeStage(user, stageId, itemDisposition);
      onClose();
      await onLearningPlanChanged();
    } catch (caught: unknown) {
      setError(String(caught));
    } finally {
      setRemoving(false);
    }
  };

  return (
    <aside
      className="stage-sidebar"
      aria-label={stage ? `${stage.name} details` : "Stage details"}
    >
      {!stage && !error && (
        <div
          className="stage-sidebar-skeleton"
          role="status"
          aria-label="Loading Stage details"
        >
          <span aria-hidden="true" />
          <span aria-hidden="true" />
          <span aria-hidden="true" />
        </div>
      )}
      {error && (
        <div role="alert">
          <p>Could not load this Stage: {error}</p>
          <button type="button" onClick={() => void load()}>
            Retry
          </button>
        </div>
      )}
      {stage && (
        <>
          {!structuralReadOnly && (
            <form onSubmit={(event) => void rename(event)}>
              <label htmlFor="rename-stage">Rename Stage</label>
              <input
                id="rename-stage"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
              <button type="submit" disabled={!name.trim() || renaming}>
                Rename Stage
              </button>
            </form>
          )}
          <StageView
            stage={stage}
            user={user}
            onStageChanged={(changed) => {
              setStage(changed);
              void onLearningPlanChanged();
            }}
            onItemChanged={updateItem}
            onClose={onClose}
            closeLabel="Close details"
            headingLevel={2}
            structuralReadOnly={structuralReadOnly}
          />
          {!structuralReadOnly && (
            <section aria-label="Remove Stage">
              {confirmingRemoval ? (
                <>
                  <p>Choose what happens to the Items in this Stage.</p>
                  <button
                    type="button"
                    disabled={removing}
                    onClick={() => void remove("place_directly")}
                  >
                    Keep Items directly in plan
                  </button>
                  <button
                    type="button"
                    disabled={removing}
                    onClick={() => void remove("remove_from_plan")}
                  >
                    Remove Items from plan
                  </button>
                  <button
                    type="button"
                    disabled={removing}
                    onClick={() => setConfirmingRemoval(false)}
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmingRemoval(true)}
                >
                  Remove Stage
                </button>
              )}
            </section>
          )}
        </>
      )}
    </aside>
  );
}
