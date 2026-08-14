import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  Status,
  type DailyFocus,
  type DailyFocusEntry,
  type ItemId,
} from "@unshelf/shared";
import { ArrowLeft, CalendarDays, Check, Plus } from "lucide-react";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { addItemToToday, fetchDailyFocusHistory } from "../api";
import { useCurrentUser } from "../application-auth/useCurrentUser";
import { ItemSummary } from "../items/ItemSummary";
import { completionPercentage } from "../presentation/progress";

type HistoryState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; focus: DailyFocus };

/** One elapsed Daily Focus: frozen evidence with explicit reconsideration only. */
export function DailyFocusHistorySurface({
  selectedDate,
}: {
  selectedDate?: string;
} = {}) {
  const user = useCurrentUser();
  const { date: routeDate = "" } = useParams();
  const date = selectedDate ?? routeDate;
  const location = useLocation();
  const navigate = useNavigate();
  const [browseDate, setBrowseDate] = useState(date);
  const [state, setState] = useState<HistoryState>({ status: "loading" });
  const [addedItemIds, setAddedItemIds] = useState<Set<ItemId>>(new Set());
  const [addingItemId, setAddingItemId] = useState<ItemId>();
  const [mutationError, setMutationError] = useState(false);

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      setState({
        status: "ready",
        focus: await fetchDailyFocusHistory(user, date),
      });
    } catch {
      setState({ status: "error" });
    }
  }, [date, user]);

  useEffect(() => {
    setBrowseDate(date);
    setAddedItemIds(new Set());
    void load();
  }, [date, load]);

  async function reconsider(itemId: ItemId) {
    setMutationError(false);
    setAddingItemId(itemId);
    try {
      await addItemToToday(user, itemId);
      setAddedItemIds((current) => new Set(current).add(itemId));
    } catch {
      setMutationError(true);
    } finally {
      setAddingItemId(undefined);
    }
  }

  function browse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (browseDate) {
      void navigate({
        pathname: `/today/${browseDate}`,
        search: location.search,
      });
    }
  }

  return (
    <section
      className="mx-auto grid w-full max-w-6xl min-w-0 gap-6"
      aria-labelledby="daily-focus-history-heading"
      aria-busy={state.status === "loading"}
    >
      <header className="grid gap-2 border-b pb-6">
        <p className="m-0 text-xs font-semibold tracking-[0.12em] text-primary uppercase">
          Frozen daily record
        </p>
        <h1
          id="daily-focus-history-heading"
          className="m-0 font-serif text-4xl leading-none font-medium tracking-[-0.025em] sm:text-5xl"
        >
          Daily Focus history
        </h1>
        <p className="m-0 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
          Review what received your attention and its Status at day end. Past
          Daily Focus records cannot be edited.
        </p>
      </header>

      <div className="flex min-w-0 flex-col gap-4 rounded-[var(--radius-panel)] border bg-quiet-panel p-4 sm:flex-row sm:items-end sm:justify-between">
        <Button asChild variant="secondary">
          <Link to={{ pathname: "/today", search: location.search }}>
            <ArrowLeft aria-hidden="true" />
            Go to Today
          </Link>
        </Button>
        <form
          className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end"
          onSubmit={browse}
        >
          <Field className="sm:w-52">
            <FieldLabel htmlFor="daily-focus-date">Daily Focus date</FieldLabel>
            <Input
              id="daily-focus-date"
              type="date"
              value={browseDate}
              onChange={(event) => setBrowseDate(event.target.value)}
            />
          </Field>
          <Button type="submit" variant="secondary">
            <CalendarDays aria-hidden="true" />
            View date
          </Button>
        </form>
      </div>

      {state.status === "loading" && <HistoryLoading />}
      {state.status === "error" && (
        <Alert className="grid gap-3">
          <div>
            <p className="m-0 font-semibold">Daily Focus unavailable</p>
            <p className="mt-1 mb-0 text-sm">
              This date could not be loaded. Your history is unchanged.
            </p>
          </div>
          <Button
            type="button"
            variant="secondary"
            className="w-fit"
            onClick={() => void load()}
          >
            Retry
          </Button>
        </Alert>
      )}
      {state.status === "ready" && (
        <>
          <section
            className="grid gap-3 rounded-[var(--radius-panel)] border bg-card p-4 sm:p-6"
            aria-label={`Daily Focus for ${state.focus.date}`}
          >
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="m-0 text-xs font-semibold tracking-[0.1em] text-primary uppercase">
                  {state.focus.date}
                </p>
                <h2 className="mt-1 mb-0 font-serif text-2xl font-medium">
                  Day-end record
                </h2>
              </div>
              <p className="m-0 text-sm font-semibold">
                {state.focus.done} of {state.focus.total} done at day end
              </p>
            </div>
            <Progress
              value={completionPercentage(state.focus)}
              aria-label={`${state.focus.done} of ${state.focus.total} done at day end`}
            />

            {state.focus.entries.length === 0 ? (
              <div className="rounded-[var(--radius-card)] border border-dashed p-6 text-center">
                <p className="m-0 font-medium">Nothing was selected.</p>
                <p className="mt-1 mb-0 text-sm text-muted-foreground">
                  This is the complete record for the date.
                </p>
              </div>
            ) : (
              <ul className="grid list-none gap-3 p-0">
                {state.focus.entries.map(({ item, snapshot, origin }) => (
                  <li key={item.id}>
                    <ItemSummary
                      item={itemAtDayEnd({ item, snapshot }, state.focus.date)}
                      actions={
                        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
                          <div className="text-sm text-muted-foreground">
                            <span className="font-medium text-foreground">
                              Read-only day-end snapshot
                            </span>
                            {origin && (
                              <span className="block">
                                From {origin.learningPlan.name}
                                {origin.stage ? ` · ${origin.stage.name}` : ""}
                              </span>
                            )}
                          </div>
                          {snapshot.status !== Status.Done &&
                            (addedItemIds.has(item.id) ? (
                              <span
                                className="inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-status-completed"
                                role="status"
                              >
                                <Check className="size-4" aria-hidden="true" />
                                Added to Today
                              </span>
                            ) : (
                              <Button
                                type="button"
                                size="compact"
                                className="min-h-11 min-w-32 sm:min-h-8"
                                disabled={addingItemId === item.id}
                                loading={addingItemId === item.id}
                                loadingLabel="Adding…"
                                onClick={() => void reconsider(item.id)}
                                aria-label={`Add ${item.title} to Today`}
                              >
                                <Plus aria-hidden="true" />
                                Add to Today
                              </Button>
                            ))}
                        </div>
                      }
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>
          {mutationError && (
            <Alert>
              Couldn&apos;t add this Item to Today. The historical record is
              unchanged; try again.
            </Alert>
          )}
        </>
      )}
    </section>
  );
}

function HistoryLoading() {
  return (
    <div
      className="grid gap-4 rounded-[var(--radius-panel)] border bg-card p-4 sm:p-6"
      role="status"
      aria-label="Loading Daily Focus history"
    >
      <Skeleton className="h-7 w-48" />
      <Skeleton className="h-2 w-full" />
      <Skeleton className="h-40 w-full" />
      <span className="sr-only">Loading history…</span>
    </div>
  );
}

function itemAtDayEnd(
  { item, snapshot }: Pick<DailyFocusEntry, "item" | "snapshot">,
  date: string,
) {
  return {
    ...item,
    status: snapshot.status,
    partPercentage: snapshot.partPercentage,
    pastTarget:
      snapshot.status !== Status.Done &&
      item.targetDate !== null &&
      item.targetDate < date,
  };
}
