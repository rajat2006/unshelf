import { cva } from "class-variance-authority";
import { Status } from "@unshelf/shared";

import { Badge } from "@/components/ui/badge";
import { STATUS_LABELS } from "@/items/presentation";
import { cn } from "@/lib/utils";

const statusBadgeVariants = cva(
  "gap-2 border text-foreground before:size-2 before:shrink-0 before:rounded-full before:content-['']",
  {
    variants: {
      status: {
        [Status.NotStarted]:
          "border-border bg-muted before:border before:border-muted-foreground/60 before:bg-transparent",
        [Status.InProgress]:
          "border-status-progress/40 bg-status-progress/10 before:bg-status-progress",
        [Status.Done]:
          "border-status-completed/40 bg-status-completed/10 before:bg-status-completed",
      },
    },
  },
);

export function ItemStatusBadge({
  status,
  className,
}: {
  status: Status;
  className?: string;
}) {
  return (
    <Badge
      variant="outline"
      className={cn(statusBadgeVariants({ status }), className)}
    >
      {STATUS_LABELS[status]}
    </Badge>
  );
}
