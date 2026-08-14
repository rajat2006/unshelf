import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import type {
  Item,
  StageDetail,
  StageItemDisposition,
  StageId,
  LearningPlanId,
} from "@unshelf/shared";
import { Pencil, Trash2, X } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
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

/** Route-owned Stage detail, kept separate from the live Learning Plan beside it. */
export function StageSidebar({
  stageId,
  learningPlanId,
  user,
  onClose,
  onLearningPlanChanged,
  structuralReadOnly = false,
}: StageSidebarProps) {
  const nameRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<StageDetail | null>(null);
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState<string>();
  const [loadError, setLoadError] = useState(false);
  const [renameFailed, setRenameFailed] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [confirmingRemoval, setConfirmingRemoval] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [removeFailed, setRemoveFailed] = useState(false);
  const loadVersion = useRef(0);
  const route = useRef({ stageId, learningPlanId });
  route.current = { stageId, learningPlanId };

  const load = useCallback(async () => {
    const version = ++loadVersion.current;
    setLoadError(false);
    try {
      const nextStage = await fetchLearningPlanStage(
        user,
        learningPlanId,
        stageId,
      );
      if (version !== loadVersion.current) return;
      setStage(nextStage);
      setName(nextStage.name);
    } catch {
      if (version === loadVersion.current) setLoadError(true);
    }
  }, [stageId, learningPlanId, user]);

  useEffect(() => {
    setStage(null);
    void load();
    return () => {
      loadVersion.current += 1;
    };
  }, [load]);

  const refreshSurroundingPlan = async () => {
    try {
      await onLearningPlanChanged();
    } catch {
      // The enclosing Learning Plan surface owns and presents refresh recovery.
    }
  };

  const updateItem = (changed: Item) => {
    setStage((current) =>
      current &&
      current.id === route.current.stageId &&
      current.learningPlanId === route.current.learningPlanId
        ? {
            ...current,
            items: current.items.map((item) =>
              item.id === changed.id ? changed : item,
            ),
          }
        : current,
    );
    void refreshSurroundingPlan();
  };

  const acceptStageChange = (changed: StageDetail) => {
    if (
      changed.id !== route.current.stageId ||
      changed.learningPlanId !== route.current.learningPlanId
    )
      return;
    setStage(changed);
    void refreshSurroundingPlan();
  };

  const rename = async (event: FormEvent) => {
    event.preventDefault();
    if (renaming) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setNameError("Enter a Stage name.");
      nameRef.current?.focus();
      return;
    }
    setNameError(undefined);
    setRenameFailed(false);
    setRenaming(true);
    try {
      const updated = await updateStage(user, stageId, { name: trimmed });
      if (
        updated.id !== route.current.stageId ||
        updated.learningPlanId !== route.current.learningPlanId
      )
        return;
      setStage(updated);
      setName(updated.name);
    } catch {
      setRenameFailed(true);
      return;
    } finally {
      setRenaming(false);
    }
    await refreshSurroundingPlan();
  };

  const remove = async (itemDisposition: StageItemDisposition) => {
    if (removing) return;
    setRemoving(true);
    setRemoveFailed(false);
    try {
      await removeStage(user, stageId, itemDisposition);
    } catch {
      setRemoveFailed(true);
      return;
    } finally {
      setRemoving(false);
    }
    if (stageId !== route.current.stageId) return;
    onClose();
    await refreshSurroundingPlan();
  };

  const displayedStage =
    stage?.id === stageId && stage.learningPlanId === learningPlanId
      ? stage
      : null;

  return (
    <aside
      className="grid min-w-0 content-start gap-6 overflow-hidden rounded-[var(--radius-panel)] border bg-card p-4 text-card-foreground sm:p-6"
      aria-label={
        displayedStage ? `${displayedStage.name} details` : "Stage details"
      }
      aria-busy={!displayedStage && !loadError}
    >
      {!displayedStage && !loadError && <StageSidebarSkeleton />}

      {loadError && (
        <div className="grid gap-4">
          <Alert>
            Couldn&apos;t load this Stage. It may no longer exist, or the
            connection may have been interrupted.
          </Alert>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => void load()}
            >
              Retry
            </Button>
            <Button type="button" variant="quiet" onClick={onClose}>
              Back to Learning Plan
            </Button>
          </div>
        </div>
      )}

      {displayedStage && (
        <>
          <header className="flex min-w-0 items-start justify-between gap-3 border-b pb-4">
            <div className="min-w-0">
              <p className="m-0 text-xs font-semibold tracking-[0.12em] text-primary uppercase">
                Stage detail
              </p>
              <h2 className="m-0 mt-1 font-serif text-2xl leading-tight font-semibold break-words">
                {displayedStage.name}
              </h2>
            </div>
            <Button
              type="button"
              variant="quiet"
              size="icon"
              className="-mt-1 -mr-2"
              aria-label="Close details"
              onClick={onClose}
            >
              <X aria-hidden="true" />
            </Button>
          </header>

          {!structuralReadOnly && (
            <form
              className="grid min-w-0 gap-3 rounded-[var(--radius-card)] border bg-muted/35 p-4"
              onSubmit={(event) => void rename(event)}
            >
              <Field>
                <FieldLabel htmlFor="rename-stage">Rename Stage</FieldLabel>
                <Input
                  ref={nameRef}
                  id="rename-stage"
                  value={name}
                  aria-invalid={nameError ? "true" : undefined}
                  onChange={(event) => {
                    setName(event.target.value);
                    setNameError(undefined);
                    setRenameFailed(false);
                  }}
                />
                {nameError && <FieldError>{nameError}</FieldError>}
              </Field>
              <Button
                type="submit"
                variant="secondary"
                loading={renaming}
                loadingLabel="Renaming…"
                className="w-fit min-w-36"
              >
                <Pencil aria-hidden="true" />
                Rename Stage
              </Button>
              {renameFailed && (
                <Alert>
                  Couldn&apos;t rename this Stage. Your entered name is still
                  here; check your connection and try again.
                </Alert>
              )}
            </form>
          )}

          <StageView
            stage={displayedStage}
            user={user}
            onStageChanged={acceptStageChange}
            onItemChanged={updateItem}
            onClose={onClose}
            headingLevel={2}
            showHeading={false}
            structuralReadOnly={structuralReadOnly}
          />

          {!structuralReadOnly && (
            <section
              className="grid gap-3 border-t pt-5"
              aria-label="Remove Stage"
            >
              {confirmingRemoval ? (
                <div className="grid gap-3 rounded-[var(--radius-card)] border border-destructive/30 bg-destructive/6 p-4">
                  <div className="grid gap-1">
                    <h3 className="m-0 text-base font-semibold">
                      Remove Stage?
                    </h3>
                    <p className="m-0 text-sm leading-relaxed text-muted-foreground">
                      Choose what happens to the Items in this Stage. The Items
                      themselves always remain in your Library.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={removing}
                      onClick={() => void remove("place_directly")}
                    >
                      Keep Items directly in plan
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      loading={removing}
                      loadingLabel="Removing Items…"
                      onClick={() => void remove("remove_from_plan")}
                    >
                      Remove Items from plan
                    </Button>
                    <Button
                      type="button"
                      variant="quiet"
                      disabled={removing}
                      onClick={() => setConfirmingRemoval(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                  {removeFailed && (
                    <Alert>
                      Couldn&apos;t remove this Stage. Nothing changed; check
                      your connection and try again.
                    </Alert>
                  )}
                </div>
              ) : (
                <Button
                  type="button"
                  variant="quiet-destructive"
                  className="w-fit"
                  onClick={() => setConfirmingRemoval(true)}
                >
                  <Trash2 aria-hidden="true" />
                  Remove Stage
                </Button>
              )}
            </section>
          )}
        </>
      )}
    </aside>
  );
}

function StageSidebarSkeleton() {
  return (
    <div
      className="grid gap-5"
      role="status"
      aria-label="Loading Stage details"
    >
      <div className="flex items-start justify-between gap-3 border-b pb-4">
        <div className="grid w-full gap-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-7 w-2/3" />
        </div>
        <Skeleton className="size-10 shrink-0 rounded-full" />
      </div>
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-48 w-full" />
    </div>
  );
}
