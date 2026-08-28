import { useCallback, useEffect, useId, useState } from "react";
import { ChevronDown, Plus, Trash2 } from "lucide-react";
import { Link } from "react-router";
import type {
  ItemId,
  ItemPlacementCatalog,
  PlacementStage,
  StageId,
  LearningPlanId,
} from "@unshelf/shared";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
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
  onChanged?: (change: ItemPlacementChange) => void;
}

export interface ItemPlacementChange {
  learningPlanId: LearningPlanId;
  operation: "place" | "remove";
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
  const headingId = useId();

  const load = useCallback(async () => {
    const nextCatalog = await fetchItemPlacements(user, itemId);
    setCatalog(nextCatalog);
    return nextCatalog;
  }, [itemId, user]);

  useEffect(() => {
    setCatalog(null);
    setError(null);
    setRetryAction(null);
    void load().catch(() => {
      setError("Couldn’t load Learning Plan placements.");
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
    } catch {
      setError("Couldn’t update this placement.");
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

  const place = (learningPlanId: LearningPlanId, stageId: StageId) =>
    runPlacementMutation(
      async () => {
        await addItemToStage(user, stageId, itemId);
        await load();
        onChanged?.({ learningPlanId, operation: "place" });
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
  const remove = (learningPlanId: LearningPlanId, stageId: StageId) =>
    runPlacementMutation(
      async () => {
        await removeItemFromStage(user, stageId, itemId);
        await load();
        onChanged?.({ learningPlanId, operation: "remove" });
      },
      {
        retryStillAppliesAfterReconciliation: (reconciled) =>
          reconciled.learningPlans.some(
            (state) =>
              state.learningPlan.id === learningPlanId &&
              state.kind === "placed" &&
              state.stage.id === stageId,
          ),
      },
    );
  const removeDirect = (learningPlanId: LearningPlanId) =>
    runPlacementMutation(
      async () => {
        await removeDirectItemFromLearningPlan(user, learningPlanId, itemId);
        await load();
        onChanged?.({ learningPlanId, operation: "remove" });
      },
      {
        retryStillAppliesAfterReconciliation: (reconciled) =>
          reconciled.learningPlans.some(
            (state) =>
              state.learningPlan.id === learningPlanId &&
              state.kind === "placed_direct",
          ),
      },
    );
  const createStageWithPlacement = (
    learningPlanId: LearningPlanId,
    name: string,
  ) =>
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
        onChanged?.({ learningPlanId, operation: "place" });
        try {
          await load();
        } catch {
          setError(
            "The placement changed, but its refreshed details couldn’t load.",
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
      <section className="grid gap-4 border-t pt-6" aria-labelledby={headingId}>
        <h3 id={headingId} className="font-serif text-xl">
          Learning Plan placements
        </h3>
        {!error ? (
          <div
            className="grid gap-2"
            role="status"
            aria-label="Loading Learning Plan placements"
          >
            <Skeleton className="h-14 w-full" aria-hidden="true" />
            <Skeleton className="h-10 w-2/3" aria-hidden="true" />
          </div>
        ) : (
          <PlacementError
            message={error}
            retryAction={retryAction}
            onRetry={runPlacementMutation}
          />
        )}
      </section>
    );
  }

  const placed = catalog.learningPlans.filter(
    (learningPlan) =>
      learningPlan.kind === "placed" ||
      learningPlan.kind === "placed_direct" ||
      (learningPlan.kind === "archived" && learningPlan.placement !== null),
  );

  return (
    <section
      className="grid min-w-0 gap-4 border-t pt-6"
      aria-labelledby={headingId}
    >
      <h3 id={headingId} className="font-serif text-xl">
        Learning Plan placements
      </h3>
      {placed.length === 0 ? (
        <p className="text-sm text-muted-foreground">Not on a Learning Plan</p>
      ) : (
        <ul
          className="grid gap-2"
          aria-label="Current Learning Plan placements"
        >
          {placed.map((state) => (
            <li
              key={state.learningPlan.id}
              className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-[var(--radius-card)] border bg-background p-3"
            >
              <span className="grid min-w-0 gap-1 text-sm">
                <strong className="wrap-break-word font-medium">
                  {state.learningPlan.name}
                </strong>
                <span className="text-muted-foreground">
                  {state.kind === "placed"
                    ? state.stage.name
                    : state.kind === "archived" &&
                        state.placement !== null &&
                        state.placement !== "direct"
                      ? state.placement.name
                      : "Placed directly"}
                </span>
                {state.kind === "archived" && <Badge>Archived</Badge>}
              </span>
              <span className="flex flex-wrap items-center gap-2">
                {state.kind === "placed" &&
                  lastCreated?.learningPlanId === state.learningPlan.id &&
                  lastCreated.stage.id === state.stage.id && (
                    <Link
                      to={`/plans/${state.learningPlan.id}/stages/${state.stage.id}`}
                      className="inline-flex min-h-11 items-center text-sm font-semibold text-primary underline underline-offset-4 sm:min-h-8"
                    >
                      Open Stage
                    </Link>
                  )}
                {state.kind !== "archived" && (
                  <Button
                    type="button"
                    variant="quiet-destructive"
                    size="icon"
                    className="size-11 sm:size-8"
                    disabled={busy}
                    onClick={() =>
                      state.kind === "placed"
                        ? void remove(state.learningPlan.id, state.stage.id)
                        : void removeDirect(state.learningPlan.id)
                    }
                    aria-label={
                      state.kind === "placed"
                        ? `Remove from ${state.learningPlan.name} · ${state.stage.name}`
                        : `Remove from ${state.learningPlan.name}`
                    }
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      {catalog.learningPlans.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No Learning Plans yet.{" "}
          <Link
            className="text-primary underline underline-offset-4"
            to="/plans"
          >
            Create a Learning Plan first
          </Link>
          .
        </p>
      ) : (
        <Collapsible className="rounded-[var(--radius-card)] border bg-background">
          <CollapsibleTrigger asChild>
            <Button
              type="button"
              variant="quiet"
              className="group min-h-11 w-full justify-between rounded-[var(--radius-card)] sm:min-h-10"
            >
              Add to Learning Plan
              <ChevronDown
                aria-hidden="true"
                className="transition-transform group-aria-expanded:rotate-180"
              />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <ul
              className="grid gap-3 border-t p-3"
              aria-label="Learning Plan destinations"
            >
              {catalog.learningPlans.map((state) => (
                <li
                  key={state.learningPlan.id}
                  aria-label={state.learningPlan.name}
                  className="grid min-w-0 gap-2 rounded-[var(--radius-small)] bg-muted/45 p-3"
                >
                  <strong className="wrap-break-word text-sm font-medium">
                    {state.learningPlan.name}
                  </strong>
                  {state.kind === "archived" ? (
                    <span className="text-sm text-muted-foreground">
                      Archived · read-only
                    </span>
                  ) : state.kind === "placed" ? (
                    <span className="text-sm text-muted-foreground">
                      Already in {state.stage.name}
                    </span>
                  ) : state.kind === "placed_direct" ? (
                    <span className="text-sm text-muted-foreground">
                      Already placed directly
                    </span>
                  ) : (
                    <div className="grid min-w-0 gap-2">
                      {state.stages.length > 0 && (
                        <Select
                          disabled={busy}
                          onValueChange={(value) =>
                            void place(state.learningPlan.id, value as StageId)
                          }
                        >
                          <SelectTrigger
                            className="min-h-11 w-full sm:min-h-10"
                            aria-label={`Add to ${state.learningPlan.name}`}
                          >
                            <SelectValue placeholder="Choose a Stage…" />
                          </SelectTrigger>
                          <SelectContent>
                            {state.stages.map((stage) => (
                              <SelectItem key={stage.id} value={stage.id}>
                                {stage.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                      <Button
                        type="button"
                        variant="secondary"
                        className="min-h-11 w-fit sm:min-h-10"
                        disabled={busy}
                        onClick={() => {
                          setCreatingOn(state.learningPlan.id);
                          setNewStageName(itemTitle);
                        }}
                      >
                        <Plus aria-hidden="true" />
                        New Stage
                      </Button>
                      {creatingOn === state.learningPlan.id && (
                        <NewStageForm
                          learningPlanName={state.learningPlan.name}
                          name={newStageName}
                          existingStages={state.stages}
                          busy={busy}
                          onNameChange={setNewStageName}
                          onCancel={() => setCreatingOn(null)}
                          onSubmit={(name) =>
                            void createStageWithPlacement(
                              state.learningPlan.id,
                              name,
                            )
                          }
                        />
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </CollapsibleContent>
        </Collapsible>
      )}

      {busy && (
        <p role="status" className="text-sm text-muted-foreground">
          Updating placement…
        </p>
      )}
      {error && (
        <PlacementError
          message={error}
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
  const fieldId = useId();
  const trimmedName = name.trim();
  const repeatsName = existingStages.some(
    (stage) => stage.name === trimmedName,
  );

  return (
    <form
      className="grid gap-3 border-t pt-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (trimmedName) onSubmit(trimmedName);
      }}
    >
      <Field>
        <FieldLabel htmlFor={fieldId}>
          Stage name on {learningPlanName}
        </FieldLabel>
        <Input
          id={fieldId}
          autoFocus
          required
          value={name}
          disabled={busy}
          onChange={(event) => onNameChange(event.target.value)}
        />
      </Field>
      {repeatsName && (
        <FieldDescription role="status">
          A Stage on this Learning Plan already has this name. You can still
          create another.
        </FieldDescription>
      )}
      <span className="flex flex-wrap gap-2">
        <Button
          type="submit"
          className="min-h-11 sm:min-h-10"
          disabled={busy || !trimmedName}
        >
          Create Stage
        </Button>
        <Button
          type="button"
          variant="quiet"
          className="min-h-11 sm:min-h-10"
          disabled={busy}
          onClick={onCancel}
        >
          Cancel
        </Button>
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
    <Alert className="grid gap-3">
      <span>{message}</span>
      {retryAction && (
        <Button
          type="button"
          variant="secondary"
          size="compact"
          className="min-h-11 w-fit sm:min-h-8"
          onClick={() => void onRetry(retryAction)}
        >
          Retry
        </Button>
      )}
    </Alert>
  );
}
