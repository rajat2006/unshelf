import * as React from "react";
import { Progress as ProgressPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";

function Progress({
  className,
  value,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root>) {
  const percentage = Math.max(0, Math.min(100, value ?? 0));
  const variant = percentage === 100 ? "completed" : "progress";

  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      data-variant={variant}
      className={cn(
        "relative h-1.5 w-full overflow-hidden rounded-full bg-muted",
        className,
      )}
      value={percentage}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className={cn(
          "h-full w-full origin-left transition-transform",
          variant === "completed"
            ? "bg-status-completed"
            : "bg-status-progress",
        )}
        style={{ transform: `scaleX(${percentage / 100})` }}
      />
    </ProgressPrimitive.Root>
  );
}

export { Progress };
