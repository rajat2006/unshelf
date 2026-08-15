import { BookOpenText } from "lucide-react";

/** The Unshelf wordmark, reused by loading, signed-out, and signed-in shells. */
export function Wordmark() {
  return (
    <span className="inline-flex items-center gap-2.5">
      <span className="grid size-8 shrink-0 place-items-center rounded-[var(--radius-small)] bg-primary text-primary-foreground">
        <BookOpenText aria-hidden="true" className="size-4" />
      </span>
      <span className="font-serif text-xl font-semibold tracking-tight">
        Unshelf
      </span>
    </span>
  );
}
