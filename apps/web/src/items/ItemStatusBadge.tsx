import { CheckCircle2, Circle, CircleDashed } from "lucide-react";
import { Status } from "@unshelf/shared";
import { Badge } from "@/components/ui/badge";
import { STATUS_LABELS } from "./presentation";

const STATUS_PRESENTATION = {
  [Status.NotStarted]: { icon: Circle, variant: "neutral" },
  [Status.InProgress]: { icon: CircleDashed, variant: "progress" },
  [Status.Done]: { icon: CheckCircle2, variant: "completed" },
} as const;

/** The read-only expression of the shared Item Status vocabulary. */
export function ItemStatusBadge({ status }: { status: Status }) {
  const presentation = STATUS_PRESENTATION[status];
  const Icon = presentation.icon;

  return (
    <Badge variant={presentation.variant}>
      <Icon className="size-3.5" aria-hidden="true" />
      {STATUS_LABELS[status]}
    </Badge>
  );
}
