import { useRef, useState, type FormEvent } from "react";
import type { LearningPlan } from "@unshelf/shared";
import {
  Archive,
  ArchiveRestore,
  ArrowRight,
  LoaderCircle,
  Plus,
} from "lucide-react";
import { Link } from "react-router";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { completionPercentage } from "../presentation/progress";

export type LearningPlansIndexState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; learningPlans: LearningPlan[] };

interface LearningPlansIndexProps {
  state: LearningPlansIndexState;
  creating: boolean;
  onCreate: (name: string) => Promise<void>;
  onArchive: (learningPlan: LearningPlan) => Promise<void>;
  onRestore: (learningPlan: LearningPlan) => Promise<void>;
  onRetry: () => void;
}

/** The Plans room index over active and archived Learning Plan commitments. */
export function LearningPlansIndex({
  state,
  creating,
  onCreate,
  onArchive,
  onRestore,
  onRetry,
}: LearningPlansIndexProps) {
  if (state.status === "loading") return <LearningPlansSkeleton />;
  if (state.status === "error") return <LearningPlansError onRetry={onRetry} />;

  const activePlans = state.learningPlans.filter(
    (learningPlan) => learningPlan.archivedAt === null,
  );
  const archivedPlans = state.learningPlans.filter(
    (learningPlan) => learningPlan.archivedAt !== null,
  );

  return (
    <div className="grid min-w-0 gap-8">
      <section
        className="grid gap-4 rounded-[var(--radius-panel)] border bg-quiet-panel p-5 sm:p-6"
        aria-labelledby="new-learning-plan-heading"
      >
        <div className="grid gap-1">
          <p className="m-0 text-xs font-semibold tracking-[0.12em] text-primary uppercase">
            Begin a commitment
          </p>
          <h2
            id="new-learning-plan-heading"
            className="m-0 font-serif text-2xl leading-tight font-semibold"
          >
            Start a new Learning Plan
          </h2>
          <p className="m-0 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Name the outcome now. You can add and arrange Library Items inside
            the plan studio.
          </p>
        </div>
        <NewLearningPlanForm creating={creating} onCreate={onCreate} />
      </section>

      {state.learningPlans.length === 0 ? (
        <EmptyLearningPlans />
      ) : (
        <div className="grid gap-10">
          <LearningPlanGroup
            heading="Active Learning Plans"
            description="Current commitments you can continue shaping."
            learningPlans={activePlans}
            emptyMessage="No active Learning Plans. Restore one below or start a new commitment."
            actionLabel="Archive"
            onAction={onArchive}
          />
          {archivedPlans.length > 0 && (
            <LearningPlanGroup
              heading="Archived Learning Plans"
              description="Archived Learning Plans are read-only until restored."
              learningPlans={archivedPlans}
              actionLabel="Restore"
              onAction={onRestore}
            />
          )}
        </div>
      )}
    </div>
  );
}

function LearningPlanGroup({
  heading,
  description,
  learningPlans,
  emptyMessage,
  actionLabel,
  onAction,
}: {
  heading: string;
  description: string;
  learningPlans: LearningPlan[];
  emptyMessage?: string;
  actionLabel: "Archive" | "Restore";
  onAction: (learningPlan: LearningPlan) => Promise<void>;
}) {
  const headingId = `${actionLabel.toLowerCase()}-plans`;

  return (
    <section className="grid min-w-0 gap-4" aria-labelledby={headingId}>
      <div className="grid gap-1 border-b pb-3">
        <h2
          id={headingId}
          className="m-0 font-serif text-2xl leading-tight font-semibold"
        >
          {heading}
        </h2>
        <p className="m-0 text-sm text-muted-foreground">{description}</p>
      </div>
      {learningPlans.length === 0 ? (
        <p className="m-0 rounded-[var(--radius-card)] border border-dashed bg-muted/35 p-5 text-sm text-muted-foreground">
          {emptyMessage}
        </p>
      ) : (
        <ul className="grid min-w-0 list-none gap-4 p-0 md:grid-cols-2 xl:grid-cols-3">
          {learningPlans.map((learningPlan) => (
            <LearningPlanListItem
              key={learningPlan.id}
              learningPlan={learningPlan}
              actionLabel={actionLabel}
              onAction={onAction}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function LearningPlanListItem({
  learningPlan,
  actionLabel,
  onAction,
}: {
  learningPlan: LearningPlan;
  actionLabel: "Archive" | "Restore";
  onAction: (learningPlan: LearningPlan) => Promise<void>;
}) {
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const archiving = actionLabel === "Archive";
  const pendingLabel = archiving ? "Archiving" : "Restoring";
  const ActionIcon = archiving ? Archive : ArchiveRestore;
  const archived = learningPlan.archivedAt !== null;

  async function runLifecycleAction() {
    if (pending) return;
    setPending(true);
    setFailed(false);
    try {
      await onAction(learningPlan);
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  }

  return (
    <li className="min-w-0">
      <article
        className={`flex h-full min-w-0 flex-col gap-4 rounded-[var(--radius-card)] border p-5 ${archived ? "border-dashed bg-muted/45" : "bg-card"}`}
      >
        <div className="flex min-w-0 items-start justify-between gap-3">
          <Badge variant="neutral">{archived ? "Archived" : "Active"}</Badge>
          <Button
            type="button"
            variant="quiet"
            size="compact"
            disabled={pending}
            className="-mt-1 -mr-2 grid h-11 min-w-32 grid-cols-1 sm:h-8"
            aria-label={
              pending
                ? `${pendingLabel} ${learningPlan.name}…`
                : `${actionLabel} ${learningPlan.name}`
            }
            onClick={() => void runLifecycleAction()}
          >
            <span
              aria-hidden={pending}
              className={`col-start-1 row-start-1 inline-flex items-center justify-center gap-2 ${pending ? "invisible" : ""}`}
            >
              <ActionIcon aria-hidden="true" />
              {actionLabel}
            </span>
            <span
              aria-hidden={!pending}
              className={`col-start-1 row-start-1 inline-flex items-center justify-center gap-2 ${pending ? "" : "invisible"}`}
            >
              <LoaderCircle
                aria-hidden="true"
                className="animate-spin motion-reduce:animate-none"
              />
              {pendingLabel}…
            </span>
          </Button>
        </div>

        <div className="grid min-w-0 flex-1 content-start gap-2">
          <Link
            to={`/plans/${learningPlan.id}`}
            aria-label={learningPlan.name}
            className="w-fit max-w-full rounded-[var(--radius-small)] font-serif text-xl leading-snug font-semibold break-words text-foreground underline-offset-4 outline-none hover:text-primary hover:underline focus-visible:ring-3 focus-visible:ring-ring/30"
          >
            {learningPlan.name}
            <ArrowRight aria-hidden="true" className="ml-1 inline size-4" />
          </Link>
          <p className="m-0 text-sm leading-relaxed text-muted-foreground">
            {archived
              ? "Preserved for reference; restore it to change its structure."
              : "Arrange shared Library Items and choose what belongs in Today."}
          </p>
        </div>

        <div className="grid gap-2">
          <Progress
            value={completionPercentage(learningPlan)}
            aria-label={`${learningPlan.name} progress`}
            aria-valuetext={progressLabel(learningPlan)}
            className={
              completionPercentage(learningPlan) === 100
                ? "[&_[data-slot=progress-indicator]]:bg-status-completed"
                : undefined
            }
          />
          <p className="m-0 text-xs font-semibold text-muted-foreground">
            {progressLabel(learningPlan)}
          </p>
        </div>

        {failed && (
          <Alert>
            Couldn&apos;t {actionLabel.toLowerCase()} {learningPlan.name}. Check
            your connection and try again.
          </Alert>
        )}
      </article>
    </li>
  );
}

function progressLabel(learningPlan: LearningPlan): string {
  if (learningPlan.total === 0) return "No Items added yet";
  return `${learningPlan.done} of ${learningPlan.total} done`;
}

function EmptyLearningPlans() {
  return (
    <section className="grid justify-items-start gap-2 rounded-[var(--radius-panel)] border border-dashed bg-card p-6 sm:p-8">
      <h2 className="m-0 font-serif text-2xl font-semibold">
        No Learning Plans yet
      </h2>
      <p className="m-0 max-w-xl text-sm leading-relaxed text-muted-foreground">
        Name an outcome above to turn selected Library Items into a durable
        commitment.
      </p>
    </section>
  );
}

function NewLearningPlanForm({
  creating,
  onCreate,
}: {
  creating: boolean;
  onCreate: (name: string) => Promise<void>;
}) {
  const nameRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState<string>();
  const [requestFailed, setRequestFailed] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (creating) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setNameError("Enter a Learning Plan name.");
      nameRef.current?.focus();
      return;
    }

    setRequestFailed(false);
    try {
      await onCreate(trimmed);
      setName("");
    } catch {
      setRequestFailed(true);
    }
  }

  return (
    <form
      noValidate
      onSubmit={(event) => void submit(event)}
      className="grid max-w-3xl gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"
    >
      <Field data-invalid={Boolean(nameError)}>
        <FieldLabel htmlFor="new-learning-plan-name">
          Learning Plan name
        </FieldLabel>
        <Input
          ref={nameRef}
          id="new-learning-plan-name"
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            setNameError(undefined);
          }}
          placeholder="e.g. Learn distributed systems"
          aria-invalid={Boolean(nameError)}
          aria-describedby={
            nameError ? "new-learning-plan-name-error" : undefined
          }
        />
        {nameError && (
          <FieldError id="new-learning-plan-name-error">{nameError}</FieldError>
        )}
      </Field>
      <Button
        type="submit"
        size="touch"
        disabled={creating}
        className="grid min-w-48 grid-cols-1 sm:h-10"
      >
        <span
          aria-hidden={creating}
          className={`col-start-1 row-start-1 inline-flex items-center justify-center gap-2 ${creating ? "invisible" : ""}`}
        >
          <Plus aria-hidden="true" />
          Start a Learning Plan
        </span>
        <span
          aria-hidden={!creating}
          className={`col-start-1 row-start-1 inline-flex items-center justify-center gap-2 ${creating ? "" : "invisible"}`}
        >
          <LoaderCircle
            aria-hidden="true"
            className="animate-spin motion-reduce:animate-none"
          />
          Creating Learning Plan…
        </span>
      </Button>
      {requestFailed && (
        <Alert className="sm:col-span-2">
          Couldn&apos;t create this Learning Plan. Check your connection and try
          again.
        </Alert>
      )}
    </form>
  );
}

function LearningPlansSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading Learning Plans"
      className="grid gap-8"
    >
      <div className="grid gap-4 rounded-[var(--radius-panel)] border bg-quiet-panel p-5 sm:p-6">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-8 w-full max-w-sm" />
        <Skeleton className="h-11 w-full max-w-3xl" />
      </div>
      <div className="grid gap-4">
        <Skeleton className="h-8 w-52" />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((key) => (
            <div
              key={key}
              aria-hidden="true"
              className="grid min-h-56 gap-4 rounded-[var(--radius-card)] border bg-card p-5"
            >
              <Skeleton className="h-5 w-20" />
              <Skeleton className="h-7 w-3/4" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="mt-auto h-2 w-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function LearningPlansError({ onRetry }: { onRetry: () => void }) {
  return (
    <Alert className="grid max-w-xl gap-3 p-4">
      <div>
        <p className="m-0 font-semibold">
          Couldn&apos;t load your Learning Plans
        </p>
        <p className="mt-1 mb-0 text-destructive/85">
          Your other rooms are still available. Try loading this room again.
        </p>
      </div>
      <Button
        className="w-fit"
        type="button"
        variant="secondary"
        onClick={onRetry}
      >
        Retry
      </Button>
    </Alert>
  );
}
