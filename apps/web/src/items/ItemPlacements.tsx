import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import type {
  ItemId,
  ItemPlacementCatalog,
  PlacementStage,
  StageId,
  LearningPlanId,
} from "@unshelf/shared";
import {
  addItemToStage,
  createStageWithItem,
  fetchItemPlacements,
  removeDirectItemFromLearningPlan,
  removeItemFromStage,
} from "../api";
import type { CurrentUser } from "../application-auth/types";

interface ItemPlacementsProps {
  itemId: ItemId;
  itemTitle: string;
  user: CurrentUser;
  onChanged?: () => void;
}

/**
 * One Item's LearningPlan-qualified placement state and existing-Stage destinations.
 * The catalog is refreshed after every write, so a conflict or removal is
 * reconciled without leaving the route-owned sidebar.
 */
export function ItemPlacements({
  itemId,
  itemTitle,
  user,
  onChanged,
}: ItemPlacementsProps) {
  const [catalog, setCatalog] = useState<ItemPlacementCatalog | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryAction, setRetryAction] = useState<(() => Promise<void>) | null>(
    null,
  );
  const [creatingOn, setCreatingOn] = useState<LearningPlanId | null>(null);
  const [newStageName, setNewStageName] = useState(itemTitle);
  const [lastCreated, setLastCreated] = useState<{
    learningPlanId: LearningPlanId;
    stage: PlacementStage;
  } | null>(null);

  const load = useCallback(async () => {
    const nextCatalog = await fetchItemPlacements(user, itemId);
    setCatalog(nextCatalog);
    return nextCatalog;
  }, [itemId, user]);

  useEffect(() => {
    setCatalog(null);
    setError(null);
    setRetryAction(null);
    void load().catch((caught: unknown) => {
      setError(String(caught));
      setRetryAction(() => async () => {
        await load();
      });
    });
  }, [load]);

  const runPlacementMutation = async (
    action: () => Promise<void>,
    options: {
      retryStillAppliesAfterReconciliation?: (
        reconciled: ItemPlacementCatalog,
      ) => boolean;
    } = {},
  ) => {
    setBusy(true);
    setError(null);
    setRetryAction(null);
    try {
      await action();
    } catch (caught: unknown) {
      setError(String(caught));
      let retryStillApplies = true;
      try {
        const reconciled = await load();
        retryStillApplies =
          options.retryStillAppliesAfterReconciliation?.(reconciled) ?? true;
      } catch {
        // Preserve the mutation failure as the local action the User can retry.
      }
      setRetryAction(retryStillApplies ? () => action : null);
    } finally {
      setBusy(false);
    }
  };

  const place = (stageId: StageId) =>
    runPlacementMutation(async () => {
      await addItemToStage(user, stageId, itemId);
      await load();
      onChanged?.();
    });
  const remove = (stageId: StageId) =>
    runPlacementMutation(async () => {
      await removeItemFromStage(user, stageId, itemId);
      await load();
      onChanged?.();
    });
  const removeDirect = (learningPlanId: LearningPlanId) =>
    runPlacementMutation(async () => {
      await removeDirectItemFromLearningPlan(user, learningPlanId, itemId);
      await load();
      onChanged?.();
    });
  const create = (learningPlanId: LearningPlanId, name: string) =>
    runPlacementMutation(
      async () => {
        const stage = await createStageWithItem(user, itemId, {
          learningPlanId,
          name,
        });
        const placementStage = { id: stage.id, name: stage.name };
        setCatalog((current) =>
          current
            ? {
                ...current,
                learningPlans: current.learningPlans.map((state) =>
                  state.learningPlan.id === learningPlanId
                    ? {
                        kind: "placed",
                        learningPlan: state.learningPlan,
                        stage: placementStage,
                      }
                    : state,
                ),
              }
            : current,
        );
        setLastCreated({
          learningPlanId,
          stage: placementStage,
        });
        setCreatingOn(null);
        onChanged?.();
        try {
          await load();
        } catch (caught: unknown) {
          setError(
            `Could not refresh Learning Plan placements: ${String(caught)}`,
          );
          setRetryAction(() => async () => {
            await load();
          });
        }
      },
      {
        retryStillAppliesAfterReconciliation: (reconciled) =>
          reconciled.learningPlans.some(
            (state) =>
              state.learningPlan.id === learningPlanId &&
              state.kind === "available",
          ),
      },
    );

  if (!catalog) {
    return (
      <section
        className="item-placements"
        aria-labelledby="item-placements-title"
      >
        <h3 id="item-placements-title">Learning Plan placements</h3>
        {!error ? (
          <p role="status">Loading Learning Plan placements…</p>
        ) : (
          <PlacementError
            message={`Could not load Learning Plan placements: ${error}`}
            retryAction={retryAction}
            onRetry={runPlacementMutation}
          />
        )}
      </section>
    );
  }

  const placed = catalog.learningPlans.filter(
    (learningPlan) =>
      learningPlan.kind === "placed" || learningPlan.kind === "placed_direct",
  );

  return (
    <section
      className="item-placements"
      aria-labelledby="item-placements-title"
    >
      <h3 id="item-placements-title">Learning Plan placements</h3>
      {placed.length === 0 ? (
        <p>Not on a Learning Plan</p>
      ) : (
        <ul aria-label="Current Learning Plan placements">
          {placed.map((state) => (
            <li key={state.learningPlan.id}>
              <span>
                {state.learningPlan.name}
                {state.kind === "placed" ? ` · ${state.stage.name}` : ""}
              </span>
              <span className="item-placement-actions">
                {state.kind === "placed" &&
                  lastCreated?.learningPlanId === state.learningPlan.id &&
                  lastCreated.stage.id === state.stage.id && (
                    <Link
                      to={`/plans/${state.learningPlan.id}/stages/${state.stage.id}`}
                    >
                      Open Stage
                    </Link>
                  )}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    state.kind === "placed"
                      ? void remove(state.stage.id)
                      : void removeDirect(state.learningPlan.id)
                  }
                  aria-label={
                    state.kind === "placed"
                      ? `Remove from ${state.learningPlan.name} · ${state.stage.name}`
                      : `Remove from ${state.learningPlan.name}`
                  }
                >
                  Remove
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {catalog.learningPlans.length === 0 ? (
        <p>
          No Learning Plans yet.{" "}
          <Link to="/plans">Create a Learning Plan first</Link>.
        </p>
      ) : (
        <details>
          <summary>Add to Learning Plan…</summary>
          <ul className="item-placement-destinations">
            {catalog.learningPlans.map((state) => (
              <li key={state.learningPlan.id}>
                <strong>{state.learningPlan.name}</strong>
                {state.kind === "placed" ? (
                  <span>Already in {state.stage.name}</span>
                ) : state.kind === "placed_direct" ? (
                  <span>Already placed directly</span>
                ) : (
                  <div className="item-placement-choice">
                    {state.stages.length > 0 && (
                      <select
                        aria-label={`Add to ${state.learningPlan.name}`}
                        value=""
                        disabled={busy}
                        onChange={(event) =>
                          void place(event.target.value as StageId)
                        }
                      >
                        <option value="" disabled>
                          Choose a Stage…
                        </option>
                        {state.stages.map((stage) => (
                          <option key={stage.id} value={stage.id}>
                            {stage.name}
                          </option>
                        ))}
                      </select>
                    )}
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setCreatingOn(state.learningPlan.id);
                        setNewStageName(itemTitle);
                      }}
                    >
                      New Stage
                    </button>
                    {creatingOn === state.learningPlan.id && (
                      <NewStageForm
                        learningPlanName={state.learningPlan.name}
                        name={newStageName}
                        existingStages={state.stages}
                        busy={busy}
                        onNameChange={setNewStageName}
                        onCancel={() => setCreatingOn(null)}
                        onSubmit={(name) =>
                          void create(state.learningPlan.id, name)
                        }
                      />
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}

      {busy && <p role="status">Updating placement…</p>}
      {error && (
        <PlacementError
          message={`Could not load or update this placement: ${error}`}
          retryAction={retryAction}
          onRetry={runPlacementMutation}
        />
      )}
    </section>
  );
}

interface NewStageFormProps {
  learningPlanName: string;
  name: string;
  existingStages: PlacementStage[];
  busy: boolean;
  onNameChange: (name: string) => void;
  onCancel: () => void;
  onSubmit: (name: string) => void;
}

function NewStageForm({
  learningPlanName,
  name,
  existingStages,
  busy,
  onNameChange,
  onCancel,
  onSubmit,
}: NewStageFormProps) {
  const trimmedName = name.trim();
  const repeatsName = existingStages.some(
    (stage) => stage.name === trimmedName,
  );

  return (
    <form
      className="item-new-stage-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (trimmedName) onSubmit(trimmedName);
      }}
    >
      <label>
        Stage name on {learningPlanName}
        <input
          autoFocus
          required
          value={name}
          disabled={busy}
          onChange={(event) => onNameChange(event.target.value)}
        />
      </label>
      {repeatsName && (
        <p role="status">
          A Stage on this Learning Plan already has this name. You can still
          create another.
        </p>
      )}
      <span>
        <button type="submit" disabled={busy || !trimmedName}>
          Create Stage
        </button>
        <button type="button" disabled={busy} onClick={onCancel}>
          Cancel
        </button>
      </span>
    </form>
  );
}

interface PlacementErrorProps {
  message: string;
  retryAction: (() => Promise<void>) | null;
  onRetry: (action: () => Promise<void>) => Promise<void>;
}

function PlacementError({
  message,
  retryAction,
  onRetry,
}: PlacementErrorProps) {
  return (
    <div role="alert">
      <p>{message}</p>
      {retryAction && (
        <button type="button" onClick={() => void onRetry(retryAction)}>
          Retry
        </button>
      )}
    </div>
  );
}
