import { useCallback, useEffect, useRef, useState } from "react";
import {
  Check,
  LibraryBig,
  LoaderCircle,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { Link } from "react-router";
import type {
  ItemId,
  LearningPlanId,
  LearningPlanItemCandidate,
  LearningPlanView,
} from "@unshelf/shared";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  fetchLearningPlanItemCandidates,
  placeItemDirectly,
  removeDirectItemFromLearningPlan,
} from "../api";
import type { CurrentUser } from "../application-auth/types";
import { ItemSummary } from "../items/ItemSummary";
import { planItemBackgroundLocation } from "../items/item-route-state";
import { useCapture } from "../shell/useCapture";
import { useCaptureListener } from "../shell/useCaptureListener";

interface PlanLibraryDrawerProps {
  learningPlanId: LearningPlanId;
  user: CurrentUser;
  onLearningPlanChanged: (learningPlan: LearningPlanView) => void;
}

/** Search and place existing Library Items without creating a Stage. */
export function PlanLibraryDrawer({
  learningPlanId,
  user,
  onLearningPlanChanged,
}: PlanLibraryDrawerProps) {
  const capture = useCapture();
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<
    LearningPlanItemCandidate[] | null
  >(null);
  const [busyItemId, setBusyItemId] = useState<ItemId | null>(null);
  const [error, setError] = useState<"load" | "mutation" | null>(null);
  const requestVersion = useRef(0);

  const search = useCallback(async () => {
    const version = ++requestVersion.current;
    setError(null);
    try {
      const found = await fetchLearningPlanItemCandidates(
        user,
        learningPlanId,
        query,
      );
      if (version === requestVersion.current) setCandidates(found);
    } catch {
      if (version === requestVersion.current) setError("load");
    }
  }, [learningPlanId, query, user]);

  useEffect(() => {
    const timer = window.setTimeout(() => void search(), query ? 200 : 0);
    return () => window.clearTimeout(timer);
  }, [query, search]);
  useCaptureListener(search);

  async function changeDirectPlacement(candidate: LearningPlanItemCandidate) {
    if (busyItemId || candidate.kind === "stage") return;
    setBusyItemId(candidate.item.id);
    setError(null);
    try {
      const learningPlan =
        candidate.kind === "direct"
          ? await removeDirectItemFromLearningPlan(
              user,
              learningPlanId,
              candidate.item.id,
            )
          : await placeItemDirectly(user, learningPlanId, candidate.item.id);
      onLearningPlanChanged(learningPlan);
      await search();
    } catch {
      setError("mutation");
    } finally {
      setBusyItemId(null);
    }
  }

  return (
    <aside
      aria-label="Library placement drawer"
      aria-busy={candidates === null && error === null}
      className="grid min-w-0 content-start gap-5 overflow-hidden border-b bg-quiet-panel p-4 text-foreground md:max-h-[calc(100dvh-9rem)] md:overflow-y-auto md:border-r md:border-b-0 lg:p-5"
    >
      <header className="grid gap-1 border-b pb-4">
        <p className="m-0 flex items-center gap-2 text-xs font-semibold tracking-[0.12em] text-primary uppercase">
          <LibraryBig aria-hidden="true" className="size-4" />
          Library
        </p>
        <h2 className="m-0 font-serif text-2xl leading-tight font-semibold">
          Place Items
        </h2>
        <p className="m-0 text-sm leading-relaxed text-muted-foreground">
          Draw from material you already kept, or Capture something new.
        </p>
      </header>

      <Field>
        <FieldLabel htmlFor="plan-library-search">Search Library</FieldLabel>
        <div className="relative">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            id="plan-library-search"
            type="search"
            value={query}
            className="pl-9"
            placeholder="Search by title…"
            disabled={busyItemId !== null}
            onChange={(event) => {
              requestVersion.current += 1;
              setCandidates(null);
              setError(null);
              setQuery(event.target.value);
            }}
          />
        </div>
      </Field>

      {candidates === null && !error && (
        <div
          className="grid gap-3"
          role="status"
          aria-label="Searching Library"
        >
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      )}

      {candidates?.length === 0 && !error && (
        <div className="grid justify-items-start gap-3 rounded-[var(--radius-card)] border border-dashed bg-background/65 p-4">
          <p className="m-0 text-sm text-muted-foreground">
            {query ? `No matching Items for “${query}”.` : "No matching Items."}
          </p>
          <Button
            type="button"
            variant="secondary"
            size="compact"
            className="min-h-11 sm:min-h-8"
            onClick={capture.open}
          >
            <Plus aria-hidden="true" />
            Capture an Item
          </Button>
        </div>
      )}

      {candidates && candidates.length > 0 && (
        <ul
          className="grid min-w-0 list-none gap-3 p-0"
          aria-label="Library placement results"
        >
          {candidates.map((candidate) => {
            const pending = busyItemId === candidate.item.id;
            return (
              <li key={candidate.item.id} className="min-w-0">
                <ItemSummary
                  item={candidate.item}
                  detailBackgroundLocation={planItemBackgroundLocation({
                    learningPlanId,
                    ...(candidate.kind === "stage"
                      ? { stageId: candidate.stage.id }
                      : {}),
                  })}
                  className="bg-background p-3"
                  actions={
                    <div className="flex min-w-0 flex-wrap items-center gap-2 border-t pt-3">
                      {candidate.kind === "available" ? (
                        <Button
                          type="button"
                          size="compact"
                          className="min-h-11 sm:min-h-8"
                          disabled={busyItemId !== null}
                          onClick={() => void changeDirectPlacement(candidate)}
                        >
                          {pending ? (
                            <LoaderCircle
                              aria-hidden="true"
                              className="animate-spin motion-reduce:animate-none"
                            />
                          ) : (
                            <Plus aria-hidden="true" />
                          )}
                          {pending ? "Placing…" : "Place directly"}
                        </Button>
                      ) : candidate.kind === "direct" ? (
                        <>
                          <Badge variant="completed">
                            <Check aria-hidden="true" />
                            Placed directly
                          </Badge>
                          <Button
                            type="button"
                            variant="quiet"
                            size="compact"
                            className="min-h-11 text-destructive hover:bg-destructive/8 hover:text-destructive sm:min-h-8"
                            disabled={busyItemId !== null}
                            aria-label={`Remove ${candidate.item.title} from this Learning Plan`}
                            onClick={() =>
                              void changeDirectPlacement(candidate)
                            }
                          >
                            {pending ? (
                              <LoaderCircle
                                aria-hidden="true"
                                className="animate-spin motion-reduce:animate-none"
                              />
                            ) : (
                              <Trash2 aria-hidden="true" />
                            )}
                            {pending ? "Removing…" : "Remove"}
                          </Button>
                        </>
                      ) : (
                        <Button
                          asChild
                          variant="secondary"
                          size="compact"
                          className="min-h-11 max-w-full sm:min-h-8"
                        >
                          <Link
                            to={`/plans/${learningPlanId}/stages/${candidate.stage.id}`}
                            aria-label={`Open ${candidate.stage.name}`}
                          >
                            In {candidate.stage.name}
                          </Link>
                        </Button>
                      )}
                    </div>
                  }
                />
              </li>
            );
          })}
        </ul>
      )}

      {error && (
        <div className="grid justify-items-start gap-3">
          <Alert>
            {error === "load"
              ? "Couldn’t search your Library. The Learning Plan is still available."
              : "Couldn’t update this placement. Nothing changed; try again."}
          </Alert>
          <Button
            type="button"
            variant="secondary"
            onClick={() => void search()}
          >
            Retry
          </Button>
        </div>
      )}
    </aside>
  );
}
