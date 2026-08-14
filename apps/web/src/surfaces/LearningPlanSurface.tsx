import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { ArrowLeft, Pencil } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router";
import type {
  LearningPlan,
  LearningPlanId,
  LearningPlanView,
  StageId,
} from "@unshelf/shared";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  fetchLearningPlan,
  fetchLearningPlanRecord,
  updateLearningPlan,
} from "../api";
import { useCurrentUser } from "../application-auth/useCurrentUser";
import { LearningPlanCanvas } from "../learning-plan/LearningPlanCanvas";
import { PlanLibraryDrawer } from "../learning-plan/PlanLibraryDrawer";
import { PlanTodaySidecar } from "../learning-plan/PlanTodaySidecar";
import { usePhoneViewport } from "../learning-plan/usePhoneViewport";
import { completionPercentage } from "../presentation/progress";
import { StageSidebar } from "../stages/StageSidebar";

interface LearningPlanSurfaceProps {
  learningPlanId?: LearningPlanId;
  stageId?: StageId;
}

/** The routed Library–canvas–Today workspace for one durable Learning Plan. */
export function LearningPlanSurface({
  learningPlanId: selectedLearningPlanId,
  stageId: selectedStageId,
}: LearningPlanSurfaceProps = {}) {
  const params = useParams();
  const learningPlanId = selectedLearningPlanId ?? params.learningPlanId;
  const stageId = selectedStageId ?? params.stageId;
  const navigate = useNavigate();
  const user = useCurrentUser();
  const phoneReadOnly = usePhoneViewport();
  const nameRef = useRef<HTMLInputElement>(null);
  const [learningPlan, setLearningPlan] = useState<LearningPlanView | null>(
    null,
  );
  const [record, setRecord] = useState<LearningPlan | null>(null);
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState<string>();
  const [renameOpen, setRenameOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameFailed, setRenameFailed] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const archived = record?.archivedAt != null;
  const readOnly = phoneReadOnly || archived;

  const refresh = useCallback(async () => {
    if (!learningPlanId) return;
    setLoadError(false);
    try {
      const [nextRecord, nextTopology] = await Promise.all([
        fetchLearningPlanRecord(user, learningPlanId as LearningPlanId),
        fetchLearningPlan(user, learningPlanId as LearningPlanId),
      ]);
      setRecord(nextRecord);
      setName(nextRecord.name);
      setLearningPlan(nextTopology);
    } catch {
      setLoadError(true);
    }
  }, [user, learningPlanId]);

  useEffect(() => {
    setLearningPlan(null);
    setRecord(null);
    setRenameOpen(false);
    void refresh();
  }, [refresh]);

  const acceptDrawerChange = useCallback(
    (changed: LearningPlanView) => {
      setLearningPlan(changed);
      void refresh();
    },
    [refresh],
  );

  const rename = async (event: FormEvent) => {
    event.preventDefault();
    if (!learningPlanId || renaming) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setNameError("Enter a Learning Plan name.");
      nameRef.current?.focus();
      return;
    }

    setNameError(undefined);
    setRenameFailed(false);
    setRenaming(true);
    try {
      const updated = await updateLearningPlan(
        user,
        learningPlanId as LearningPlanId,
        { name: trimmed },
      );
      setRecord(updated);
      setName(updated.name);
      setRenameOpen(false);
    } catch {
      setRenameFailed(true);
    } finally {
      setRenaming(false);
    }
  };

  return (
    <div
      className={
        stageId
          ? "grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(20rem,26rem)]"
          : "min-w-0"
      }
    >
      <section
        aria-labelledby="learning-plan-heading"
        aria-busy={!learningPlan && !loadError}
        className="learning-plan-surface grid min-w-0 overflow-hidden bg-background"
      >
        <header className="grid min-w-0 gap-5 border-b bg-quiet-panel px-4 py-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-end md:px-8 lg:px-12">
          <div className="grid min-w-0 gap-2">
            <Link
              to="/plans"
              className="inline-flex min-h-11 w-fit items-center gap-1 rounded-[var(--radius-small)] text-sm font-semibold text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/30 sm:min-h-8"
            >
              <ArrowLeft aria-hidden="true" className="size-4" />
              All Learning Plans
            </Link>
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h1
                id="learning-plan-heading"
                className="m-0 min-w-0 font-serif text-3xl leading-tight font-semibold tracking-tight break-words sm:text-4xl"
              >
                {record?.name ?? "Learning Plan"}
              </h1>
              {record && (
                <Badge variant="neutral">
                  {archived ? "Archived · read-only" : "Active"}
                </Badge>
              )}
            </div>
            <p className="m-0 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
              {archived
                ? "This commitment is preserved for consultation. Restore it from Plans to change its structure."
                : phoneReadOnly
                  ? "Consult the plan, open Items, and choose Today’s focus. Use a wider screen to author the path."
                  : "Arrange the path, draw from the Library, and choose what belongs in Today."}
            </p>

            {record && !archived && (
              <Collapsible open={renameOpen} onOpenChange={setRenameOpen}>
                <CollapsibleTrigger asChild>
                  <Button
                    type="button"
                    variant="quiet"
                    size="compact"
                    className="min-h-11 w-fit sm:min-h-8"
                  >
                    <Pencil aria-hidden="true" />
                    Rename
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-3">
                  <form
                    className="grid max-w-xl gap-3 rounded-[var(--radius-card)] border bg-background p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"
                    onSubmit={(event) => void rename(event)}
                  >
                    <Field>
                      <FieldLabel htmlFor="rename-learning-plan">
                        Learning Plan name
                      </FieldLabel>
                      <Input
                        ref={nameRef}
                        id="rename-learning-plan"
                        value={name}
                        disabled={renaming}
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
                      className="min-w-32"
                    >
                      Save name
                    </Button>
                    {renameFailed && (
                      <Alert className="sm:col-span-2">
                        Couldn’t rename this Learning Plan. Your entered name is
                        still here; check your connection and try again.
                      </Alert>
                    )}
                  </form>
                </CollapsibleContent>
              </Collapsible>
            )}
          </div>

          {record && (
            <div className="grid min-w-56 gap-2 rounded-[var(--radius-card)] border bg-background/75 p-4">
              <div className="flex items-baseline justify-between gap-3">
                <strong className="font-serif text-3xl font-semibold text-status-completed">
                  {record.total === 0
                    ? "—"
                    : `${Math.round(completionPercentage(record))}%`}
                </strong>
                <span className="text-sm text-muted-foreground">
                  {record.total === 0
                    ? "No Items added yet"
                    : `${record.done} of ${record.total} Items done`}
                </span>
              </div>
              <Progress
                value={completionPercentage(record)}
                aria-label={`${record.name} progress`}
                aria-valuetext={
                  record.total === 0
                    ? "No Items added yet"
                    : `${record.done} of ${record.total} Items done`
                }
                className="[&_[data-slot=progress-indicator]]:bg-status-completed"
              />
            </div>
          )}
        </header>

        {loadError && (
          <div className="grid min-h-80 place-content-center justify-items-start gap-4 p-6">
            <Alert className="grid max-w-xl gap-1 p-4">
              <p className="m-0 font-semibold">
                Couldn’t load this Learning Plan
              </p>
              <p className="m-0 text-destructive/85">
                It may no longer exist, or the connection may have been
                interrupted. The rest of Unshelf is still available.
              </p>
            </Alert>
            <Button
              type="button"
              variant="secondary"
              onClick={() => void refresh()}
            >
              Retry
            </Button>
          </div>
        )}

        {!learningPlan && !loadError && <LearningPlanStudioSkeleton />}

        {learningPlan && learningPlanId && (
          <div
            className={`grid min-w-0 items-start md:grid-cols-[minmax(14rem,0.65fr)_minmax(24rem,1.5fr)] ${readOnly ? "lg:grid-cols-[minmax(28rem,1.5fr)_minmax(16rem,0.6fr)]" : "lg:grid-cols-[minmax(14rem,0.62fr)_minmax(28rem,1.7fr)_minmax(16rem,0.68fr)]"}`}
          >
            {!readOnly && (
              <PlanLibraryDrawer
                learningPlanId={learningPlanId as LearningPlanId}
                user={user}
                onLearningPlanChanged={acceptDrawerChange}
              />
            )}
            <LearningPlanCanvas
              learningPlanId={learningPlanId as LearningPlanId}
              learningPlan={learningPlan}
              user={user}
              onLearningPlanChanged={setLearningPlan}
              onRefresh={refresh}
              onOpenStage={(selectedStageId) => {
                void navigate(
                  `/plans/${learningPlanId}/stages/${selectedStageId}`,
                );
              }}
              readOnly={readOnly}
            />
            {record && (
              <PlanTodaySidecar
                learningPlan={record}
                topology={learningPlan}
                user={user}
              />
            )}
          </div>
        )}
      </section>

      {stageId && learningPlanId && (
        <StageSidebar
          stageId={stageId as StageId}
          learningPlanId={learningPlanId as LearningPlanId}
          user={user}
          onClose={() => void navigate(`/plans/${learningPlanId}`)}
          onLearningPlanChanged={refresh}
          structuralReadOnly={readOnly}
        />
      )}
    </div>
  );
}

function LearningPlanStudioSkeleton() {
  return (
    <div
      className="grid min-h-[32rem] min-w-0 gap-px bg-border md:grid-cols-[minmax(14rem,0.65fr)_minmax(24rem,1.5fr)] lg:grid-cols-[minmax(14rem,0.62fr)_minmax(28rem,1.7fr)_minmax(16rem,0.68fr)]"
      role="status"
      aria-label="Loading Learning Plan studio"
    >
      {[0, 1, 2].map((key) => (
        <div key={key} className="grid content-start gap-4 bg-background p-5">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-36 w-full" />
        </div>
      ))}
    </div>
  );
}
