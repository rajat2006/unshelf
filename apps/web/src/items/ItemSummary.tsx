import type { ReactNode } from "react";
import { CalendarClock, ListChecks } from "lucide-react";
import type { Item } from "@unshelf/shared";
import { Link, useLocation } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import {
  itemDetailRouteState,
  readItemBackgroundLocation,
  type ItemBackgroundLocation,
} from "./item-route-state";
import { ItemSource } from "./ItemSource";
import { ItemStatusBadge } from "./ItemStatusBadge";
import { TYPE_LABELS } from "./presentation";

interface ItemSummaryProps {
  item: Item;
  actions?: ReactNode;
  className?: string;
  detailBackgroundLocation?: ItemBackgroundLocation;
}

/** Shared, read-only Item identity and facts for every recurring row. */
export function ItemSummary({
  item,
  actions,
  className,
  detailBackgroundLocation,
}: ItemSummaryProps) {
  const location = useLocation();
  const preservedBackground = readItemBackgroundLocation(location.state);
  const originLocation = location.pathname.startsWith("/items/")
    ? (preservedBackground ?? {
        pathname: "/library",
        search: "",
        hash: "",
      })
    : location;
  const backgroundLocation = detailBackgroundLocation ?? originLocation;

  return (
    <article
      className={cn(
        "grid min-w-0 gap-3 rounded-[var(--radius-card)] border bg-card p-4 text-card-foreground",
        className,
      )}
    >
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="mb-1 text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">
            {TYPE_LABELS[item.type]}
          </p>
          <h3 className="m-0 text-base leading-snug font-semibold break-words">
            <Link
              className="text-foreground underline-offset-4 hover:text-primary hover:underline"
              to={`/items/${item.id}`}
              state={itemDetailRouteState(backgroundLocation)}
            >
              {item.title}
            </Link>
          </h3>
        </div>
        <ItemStatusBadge status={item.status} />
      </div>

      <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm text-muted-foreground">
        {item.labels.length > 0 ? (
          item.labels.map((label) => (
            <Badge
              key={label.id}
              className="max-w-full whitespace-normal break-words"
            >
              {label.name}
            </Badge>
          ))
        ) : (
          <span>No Labels</span>
        )}
        <span aria-hidden="true">·</span>
        {item.targetDate ? (
          <span>Target {formatTargetDate(item.targetDate)}</span>
        ) : (
          <span>No Target date</span>
        )}
        {item.pastTarget && (
          <Badge variant="past">
            <CalendarClock aria-hidden="true" />
            Past target
          </Badge>
        )}
      </div>

      {item.partPercentage !== null && (
        <div className="grid gap-1.5" aria-label="Structured Item progress">
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <ListChecks className="size-4" aria-hidden="true" />
            {item.partPercentage}% of Parts complete
          </div>
          <Progress
            value={item.partPercentage}
            aria-label={`${item.partPercentage}% of Parts complete`}
          />
        </div>
      )}

      <div className="min-w-0 text-sm text-muted-foreground">
        {item.source ? (
          <ItemSource source={item.source} />
        ) : (
          <span>No Source</span>
        )}
      </div>
      {actions}
    </article>
  );
}

function formatTargetDate(targetDate: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${targetDate}T00:00:00Z`));
}
