import * as React from "react";

import { cn } from "@/lib/utils";

function Alert({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert"
      role="alert"
      className={cn(
        "w-full rounded-[var(--radius-card)] border border-destructive/35 bg-destructive/6 px-3 py-2 text-sm text-destructive",
        className,
      )}
      {...props}
    />
  );
}

export { Alert };
