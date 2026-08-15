import { CalendarClock } from "lucide-react";
import { Badge } from "@/components/ui/badge";

/** The derived past-target state: something you notice, not something that shouts. */
export function ItemPastTargetBadge() {
  return (
    <Badge variant="past">
      <CalendarClock aria-hidden="true" />
      Past target
    </Badge>
  );
}
