import { useEffect, useState } from "react";
import { CalendarCheck, X } from "lucide-react";
import { Link } from "react-router";
import type {
  DailyFocus,
  DailyFocusOrigin,
  Item,
  LearningPlan,
} from "@unshelf/shared";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchToday, removeItemFromToday } from "../api";
import type { CurrentUser } from "../application-auth/types";
import { ItemDoneToggle } from "../items/ItemDoneToggle";
import {
  itemDetailRouteState,
  planItemBackgroundLocation,
} from "../items/item-route-state";

interface PlanTodaySidecarProps {
  learningPlan: LearningPlan;
  user: CurrentUser;
  refreshVersion?: number;
  onStudioChanged?: () => void;
}

function todayOriginLabel(origin: DailyFocusOrigin | null): string {
  if (!origin) return "From Library";
  return `From ${origin.learningPlan.name}`;
}

/** The open-plan rail shows current global picks only; picking happens in the plan list. */
export function PlanTodaySidecar({
  learningPlan,
  user,
  refreshVersion = 0,
  onStudioChanged,
}: PlanTodaySidecarProps) {
  const [focus, setFocus] = useState<DailyFocus | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [mutationError, setMutationError] = useState(false);
  const [loadVersion, setLoadVersion] = useState(0);
  const [removingId, setRemovingId] = useState<Item["id"] | null>(null);

  useEffect(() => {
    let active = true;
    setLoadError(false);
    void fetchToday(user)
      .then((nextFocus) => {
        if (active) setFocus(nextFocus);
      })
      .catch(() => {
        if (active) setLoadError(true);
      });
    return () => {
      active = false;
    };
  }, [loadVersion, refreshVersion, user]);

  const remove = async (item: Item) => {
    if (!focus || removingId) return;
    setRemovingId(item.id);
    setMutationError(false);
    try {
      setFocus(await removeItemFromToday(user, focus.id, item.id));
      onStudioChanged?.();
    } catch {
      setMutationError(true);
    } finally {
      setRemovingId(null);
    }
  };

  const replaceItem = (changed: Item) => {
    setFocus((current) =>
      current
        ? {
            ...current,
            entries: current.entries.map((entry) =>
              entry.item.id === changed.id
                ? {
                    ...entry,
                    item: changed,
                    snapshot: { ...entry.snapshot, status: changed.status },
                  }
                : entry,
            ),
          }
        : current,
    );
    onStudioChanged?.();
  };

  return (
    <aside
      className="grid min-w-0 content-start gap-4 overflow-hidden border-t bg-muted/45 p-4 text-foreground md:col-span-2 md:max-h-[calc(100dvh-9rem)] md:overflow-y-auto lg:col-span-1 lg:border-t-0 lg:border-l lg:p-5"
      aria-label="Today sidecar"
      aria-busy={!focus && !loadError}
    >
      <header className="grid gap-1 border-b pb-4">
        <p className="m-0 flex items-center gap-2 text-xs font-semibold tracking-[0.12em] text-primary uppercase">
          <CalendarCheck aria-hidden="true" className="size-4" />
          Global Daily Focus
        </p>
        <h2 className="m-0 font-serif text-2xl leading-tight font-semibold">
          Today&apos;s picks
        </h2>
        <p className="m-0 text-sm leading-relaxed text-muted-foreground">
          Picks may come from this plan or directly from the Library.
        </p>
      </header>

      {loadError && (
        <Alert className="grid gap-3 p-4">
          <p className="m-0 text-sm">Couldn&apos;t load Today&apos;s picks.</p>
          <Button
            type="button"
            variant="secondary"
            size="compact"
            className="w-fit"
            onClick={() => setLoadVersion((version) => version + 1)}
          >
            Retry
          </Button>
        </Alert>
      )}

      {!focus && !loadError && (
        <div
          className="grid gap-3"
          role="status"
          aria-label="Loading Today's picks"
        >
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      )}

      {focus && (
        <>
          {focus.entries.length === 0 ? (
            <p className="m-0 rounded-[var(--radius-card)] border border-dashed bg-background/65 p-4 text-sm text-muted-foreground">
              Nothing selected for Today yet.
            </p>
          ) : (
            <ul
              className="grid min-w-0 list-none gap-2 p-0"
              aria-label="Today's picks"
            >
              {focus.entries.map((entry) => (
                <li key={entry.item.id}>
                  <article className="flex min-w-0 items-center gap-2 rounded-[var(--radius-card)] border bg-background p-3">
                    <ItemDoneToggle
                      item={entry.item}
                      user={user}
                      iconOnly
                      onChanged={replaceItem}
                    />
                    <div className="min-w-0 flex-1">
                      <Link
                        className="block truncate text-sm font-semibold text-foreground underline-offset-4 hover:text-primary hover:underline"
                        to={`/items/${entry.item.id}`}
                        state={itemDetailRouteState(
                          planItemBackgroundLocation({
                            learningPlanId: learningPlan.id,
                          }),
                        )}
                      >
                        {entry.item.title}
                      </Link>
                      <p className="mt-1 mb-0 truncate text-xs text-muted-foreground">
                        {todayOriginLabel(entry.origin)}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="quiet"
                      size="icon-compact"
                      className="min-h-11 sm:min-h-8"
                      loading={removingId === entry.item.id}
                      loadingLabel="Removing…"
                      disabled={removingId !== null}
                      aria-label={`Remove ${entry.item.title} from Today`}
                      onClick={() => void remove(entry.item)}
                    >
                      <X aria-hidden="true" />
                    </Button>
                  </article>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {mutationError && (
        <Alert>
          Couldn&apos;t change Today. Your current picks are still shown above.
        </Alert>
      )}
    </aside>
  );
}
