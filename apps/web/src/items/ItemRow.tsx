import type { ReactNode } from "react";
import type { Item } from "@unshelf/shared";
import { CalendarClock, ListChecks } from "lucide-react";
import { Link, useLocation } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import type { CurrentUser } from "../application-auth/types";
import {
  itemDetailRouteState,
  itemLinkBackgroundLocation,
  type ItemBackgroundLocation,
} from "./item-route-state";
import { ItemSource } from "./ItemSource";
import { ItemStatusSelect } from "./ItemStatusSelect";
import { ItemTargetDate } from "./ItemTargetDate";
import { TYPE_LABELS } from "./presentation";

interface ItemRowProps {
  item: Item;
  user: CurrentUser;
  onChanged: (item: Item) => void;
  /** Placement and ordering actions owned by the containing feature. */
  children?: ReactNode;
  detailBackgroundLocation?: ItemBackgroundLocation;
}

/** Shared editable Item facts, with feature-owned actions supplied as children. */
export function ItemRow({
  item,
  user,
  onChanged,
  children,
  detailBackgroundLocation,
}: ItemRowProps) {
  const location = useLocation();
  const backgroundLocation = itemLinkBackgroundLocation(
    location,
    detailBackgroundLocation,
  );

  return (
    <li className="grid min-w-0 gap-4 rounded-[var(--radius-card)] border bg-background p-4">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="m-0 mb-1 text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">
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
        {item.pastTarget && (
          <Badge variant="past">
            <CalendarClock aria-hidden="true" />
            Past target
          </Badge>
        )}
      </div>

      <div className="grid min-w-0 gap-4 sm:grid-cols-2">
        <ItemStatusSelect item={item} user={user} onChanged={onChanged} />
        <ItemTargetDate item={item} user={user} onChanged={onChanged} />
      </div>

      {item.partPercentage !== null && (
        <div className="grid gap-2" aria-label="Structured Item progress">
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <ListChecks aria-hidden="true" className="size-4" />
            {item.partPercentage}% of Parts complete
          </div>
          <Progress
            value={item.partPercentage}
            aria-label={`${item.partPercentage}% of Parts complete`}
          />
        </div>
      )}

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
        {item.source ? (
          <ItemSource source={item.source} />
        ) : (
          <span>No Source</span>
        )}
      </div>

      {children && <div className="border-t pt-3">{children}</div>}
    </li>
  );
}
