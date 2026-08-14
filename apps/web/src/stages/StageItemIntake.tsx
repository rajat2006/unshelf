import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ItemId,
  StageDetail,
  StageId,
  StageItemCandidate,
} from "@unshelf/shared";
import {
  ArrowRightLeft,
  Check,
  LoaderCircle,
  Plus,
  RotateCcw,
  Search,
} from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  addItemToStage,
  fetchStage,
  fetchStageItemCandidates,
  moveLearningPlanItem,
  removeItemFromStage,
} from "../api";
import type { CurrentUser } from "../application-auth/types";
import { TYPE_LABELS } from "../items/presentation";

interface StageItemIntakeProps {
  stageId: StageId;
  user: CurrentUser;
  onStageChanged: (stage: StageDetail) => void;
}

type AvailableCandidate = Extract<StageItemCandidate, { kind: "available" }>;

/** Server-searched Library intake for one open Stage. */
export function StageItemIntake({
  stageId,
  user,
  onStageChanged,
}: StageItemIntakeProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<StageItemCandidate[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const [pendingItemId, setPendingItemId] = useState<ItemId | null>(null);
  const [failedItemId, setFailedItemId] = useState<ItemId | null>(null);
  const [moved, setMoved] = useState<AvailableCandidate | null>(null);
  const requestVersion = useRef(0);

  const search = useCallback(
    async (titleQuery: string) => {
      const version = ++requestVersion.current;
      setSearching(true);
      setSearchError(false);
      try {
        const found = await fetchStageItemCandidates(user, stageId, titleQuery);
        if (version === requestVersion.current) setResults(found);
      } catch {
        if (version === requestVersion.current) setSearchError(true);
      } finally {
        if (version === requestVersion.current) setSearching(false);
      }
    },
    [stageId, user],
  );

  useEffect(() => {
    const delay = query ? 200 : 0;
    const timer = window.setTimeout(() => void search(query), delay);
    return () => window.clearTimeout(timer);
  }, [query, search]);

  const settleMovedRow = () => {
    if (!moved) return;
    setResults(
      (current) =>
        current?.filter((candidate) => candidate.id !== moved.id) ?? current,
    );
    setMoved(null);
  };

  async function add(candidate: AvailableCandidate) {
    if (pendingItemId) return;
    settleMovedRow();
    setPendingItemId(candidate.id);
    setFailedItemId(null);
    try {
      const changed = await addItemToStage(user, stageId, candidate.id);
      onStageChanged(changed);
      setMoved(candidate);
    } catch {
      setFailedItemId(candidate.id);
      const version = ++requestVersion.current;
      try {
        const reconciled = await fetchStageItemCandidates(user, stageId, query);
        if (version === requestVersion.current) setResults(reconciled);
      } catch {
        // The placement error remains actionable; search has its own Retry.
      }
    } finally {
      setPendingItemId(null);
    }
  }

  async function undo() {
    if (!moved || pendingItemId) return;
    setPendingItemId(moved.id);
    setFailedItemId(null);
    try {
      const changed = await removeItemFromStage(user, stageId, moved.id);
      onStageChanged(changed);
      setMoved(null);
    } catch {
      setFailedItemId(moved.id);
    } finally {
      setPendingItemId(null);
    }
  }

  async function moveHere(candidate: StageItemCandidate) {
    if (pendingItemId) return;
    setPendingItemId(candidate.id);
    setFailedItemId(null);
    try {
      const currentStage = await fetchStage(user, stageId);
      await moveLearningPlanItem(
        user,
        currentStage.learningPlanId,
        candidate.id,
        stageId,
      );
      onStageChanged(await fetchStage(user, stageId));
      await search(query);
    } catch {
      setFailedItemId(candidate.id);
    } finally {
      setPendingItemId(null);
    }
  }

  return (
    <section
      className="grid min-w-0 gap-4 border-t pt-6"
      aria-labelledby={`stage-intake-${stageId}`}
    >
      <div className="grid gap-1">
        <h3
          id={`stage-intake-${stageId}`}
          className="m-0 font-serif text-xl leading-tight font-semibold"
        >
          Add Items from your Library
        </h3>
        <p className="m-0 text-sm leading-relaxed text-muted-foreground">
          Search your Library. Items already on this Learning Plan can move
          here, but cannot appear twice.
        </p>
      </div>

      <Field>
        <FieldLabel htmlFor={`stage-search-${stageId}`}>
          Search by title
        </FieldLabel>
        <div className="relative">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            id={`stage-search-${stageId}`}
            type="search"
            className="pl-9"
            value={query}
            disabled={pendingItemId !== null}
            onChange={(event) => {
              requestVersion.current += 1;
              setMoved(null);
              setResults(null);
              setFailedItemId(null);
              setQuery(event.target.value);
            }}
          />
        </div>
      </Field>

      {searching && results === null && <StageSearchSkeleton />}

      {searchError && (
        <div className="grid justify-items-start gap-3">
          <Alert>
            Couldn&apos;t search your Library. Check your connection and try
            again.
          </Alert>
          <Button
            type="button"
            variant="secondary"
            onClick={() => void search(query)}
          >
            Retry
          </Button>
        </div>
      )}

      {!searchError && results?.length === 0 && (
        <div className="rounded-[var(--radius-card)] border border-dashed bg-muted/35 p-5">
          <p className="m-0 text-sm text-muted-foreground">
            {query
              ? `No Library Items match “${query}”.`
              : "No Library Items are available to place here."}
          </p>
        </div>
      )}

      {!searchError && results && results.length > 0 && (
        <ul
          className="grid min-w-0 list-none gap-3 p-0"
          aria-label="Library search results"
        >
          {results.map((candidate) => {
            const isMoved = moved?.id === candidate.id;
            const isPending = pendingItemId === candidate.id;
            const hasFailed = failedItemId === candidate.id;
            const conflict =
              candidate.kind === "conflict" ||
              candidate.kind === "direct_conflict";

            return (
              <li
                key={candidate.id}
                className="grid min-w-0 gap-3 rounded-[var(--radius-card)] border bg-background p-4"
              >
                <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <strong className="block text-sm leading-snug break-words">
                      {candidate.title}
                    </strong>
                    <span className="text-xs text-muted-foreground">
                      {TYPE_LABELS[candidate.type]}
                    </span>
                  </div>
                  {conflict && (
                    <Badge variant="progress">
                      {candidate.kind === "conflict"
                        ? `In ${candidate.stage.name}`
                        : "Placed directly on this Learning Plan"}
                    </Badge>
                  )}
                </div>

                <div className="grid justify-items-start gap-2">
                  {isMoved ? (
                    <>
                      <span
                        className="inline-flex items-center gap-1.5 text-sm font-semibold text-status-completed"
                        role="status"
                      >
                        <Check aria-hidden="true" className="size-4" />
                        Added to this Stage
                      </span>
                      <Button
                        type="button"
                        variant="quiet"
                        size="compact"
                        className="min-h-11 sm:min-h-8"
                        disabled={pendingItemId !== null}
                        onClick={() => void undo()}
                      >
                        {isPending ? (
                          <LoaderCircle
                            aria-hidden="true"
                            className="animate-spin motion-reduce:animate-none"
                          />
                        ) : (
                          <RotateCcw aria-hidden="true" />
                        )}
                        {isPending ? "Undoing…" : "Undo"}
                      </Button>
                    </>
                  ) : conflict ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="compact"
                      className="min-h-11 sm:min-h-8"
                      disabled={pendingItemId !== null}
                      onClick={() => void moveHere(candidate)}
                    >
                      {isPending ? (
                        <LoaderCircle
                          aria-hidden="true"
                          className="animate-spin motion-reduce:animate-none"
                        />
                      ) : (
                        <ArrowRightLeft aria-hidden="true" />
                      )}
                      {isPending ? "Moving…" : "Move to this Stage"}
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      size="compact"
                      className="min-h-11 sm:min-h-8"
                      disabled={pendingItemId !== null}
                      onClick={() => void add(candidate)}
                    >
                      {isPending ? (
                        <LoaderCircle
                          aria-hidden="true"
                          className="animate-spin motion-reduce:animate-none"
                        />
                      ) : (
                        <Plus aria-hidden="true" />
                      )}
                      {isPending ? "Adding…" : "Add to this Stage"}
                    </Button>
                  )}

                  {hasFailed && (
                    <Alert>
                      {isMoved
                        ? "Couldn’t undo that placement. Try again."
                        : conflict
                          ? "Couldn’t move this Item. Nothing changed; try again."
                          : "Couldn’t add this Item. Its current placement is unchanged; try again."}
                    </Alert>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function StageSearchSkeleton() {
  return (
    <div className="grid gap-3" role="status" aria-label="Searching Library">
      <span className="sr-only">Searching Library…</span>
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}
