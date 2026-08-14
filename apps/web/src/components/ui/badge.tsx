import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold leading-normal",
  {
    variants: {
      variant: {
        neutral: "border-border bg-muted text-muted-foreground",
        progress:
          "border-status-progress/50 bg-status-progress/12 text-foreground",
        completed:
          "border-status-completed/50 bg-status-completed/12 text-foreground",
        past: "border-status-past/50 bg-status-past/12 text-foreground",
      },
    },
    defaultVariants: { variant: "neutral" },
  },
);

function Badge({
  className,
  variant = "neutral",
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return (
    <span
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant, className }))}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
