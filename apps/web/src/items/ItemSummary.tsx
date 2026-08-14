import type { ReactNode } from "react";
import { ListChecks } from "lucide-react";
import type { Item } from "@unshelf/shared";
import { Link, useLocation } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import {
  itemDetailRouteState,
  itemLinkBackgroundLocation,
  type ItemBackgroundLocation,
} from "./item-route-state";
import { ItemSource } from "./ItemSource";
import { ItemPastTargetBadge } from "./ItemPastTargetBadge";
import { ItemStatusBadge } from "./ItemStatusBadge";
import { TYPE_LABELS } from "./presentation";

interface ItemSummaryProps {
  item: Item;
  actions?: ReactNode;
  className?: string;
  detailBackgroundLocation?: ItemBackgroundLocation;
  /** Item-owned editing controls used when the recurring row is operable. */
  editableFacts?: ReactNode;
  /** Compact catalog rows preserve the Library and sidecar density. */
  presentation?: "card" | "catalog";
}

/** Shared Item identity and facts for every recurring row. */
export function ItemSummary({
  item,
  actions,
  className,
  detailBackgroundLocation,
  editableFacts,
  presentation = "card",
}: ItemSummaryProps) {
  const location = useLocation();
  const backgroundLocation = itemLinkBackgroundLocation(
    location,
    detailBackgroundLocation,
  );

  if (presentation === "catalog") {
    return (
      <article
        className={cn(
          "grid min-w-0 gap-3 bg-card px-4 py-3 text-card-foreground sm:grid-cols-[5rem_minmax(0,1fr)_minmax(6rem,0.6fr)_auto] sm:items-center",
          className,
        )}
      >
        <p className="m-0 text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">
          {TYPE_LABELS[item.type]}
        </p>
        <div className="min-w-0">
          <h3 className="m-0 truncate text-sm leading-snug font-semibold">
            <Link
              className="text-foreground underline-offset-4 hover:text-primary hover:underline"
              to={`/items/${item.id}`}
              state={itemDetailRouteState(backgroundLocation)}
            >
              {item.title}
            </Link>
          </h3>
        </div>
        <p className="m-0 truncate text-xs text-muted-foreground">
          {item.labels.map((label) => label.name).join(" · ") || "Unlabelled"}
        </p>
        <div className="flex min-w-0 flex-wrap items-center gap-2 sm:justify-end">
          {!editableFacts && <ItemStatusBadge status={item.status} />}
          {editableFacts}
          {actions}
        </div>
      </article>
    );
  }

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
        {!editableFacts && <ItemStatusBadge status={item.status} />}
      </div>

      {editableFacts}

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
        {!editableFacts && (
          <>
            <span aria-hidden="true">·</span>
            {item.targetDate ? (
              <span>Target {formatTargetDate(item.targetDate)}</span>
            ) : (
              <span>No Target date</span>
            )}
            {item.pastTarget && <ItemPastTargetBadge />}
          </>
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
