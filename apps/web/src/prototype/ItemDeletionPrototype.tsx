import { useEffect, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CalendarDays,
  Check,
  CircleAlert,
  Library,
  MoreHorizontal,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";
import { useSearchParams } from "react-router";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

// Three Item-deletion interactions, switchable via ?variant=, on a development-only standalone route.
type Variant = "A" | "B" | "C";
type Context = "library" | "today" | "plan";
type Scene = "detail" | "confirm" | "pending" | "failure" | "deleted" | "gone";

const variants: Array<{ key: Variant; name: string }> = [
  { key: "A", name: "Quiet danger zone" },
  { key: "B", name: "Detail takeover" },
  { key: "C", name: "Consequence checklist" },
];

const itemTitle = "Designing Data-Intensive Applications";

export function ItemDeletionPrototype() {
  const [searchParams, setSearchParams] = useSearchParams();
  const variant = readVariant(searchParams.get("variant"));
  const context = readContext(searchParams.get("context"));
  const [scene, setScene] = useState<Scene>("detail");
  const [failNext, setFailNext] = useState(false);

  useEffect(() => {
    setScene("detail");
    setFailNext(false);
  }, [variant, context]);

  const setPrototypeParam = (key: "variant" | "context", value: string) => {
    const next = new URLSearchParams(searchParams);
    next.set("prototype", "deletion");
    next.set(key, value);
    setSearchParams(next, { replace: true });
  };

  const cycleVariant = (direction: -1 | 1) => {
    const index = variants.findIndex((candidate) => candidate.key === variant);
    const next =
      variants[(index + direction + variants.length) % variants.length];
    setPrototypeParam("variant", next.key);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, [contenteditable]")) return;
      if (event.key === "ArrowLeft") cycleVariant(-1);
      if (event.key === "ArrowRight") cycleVariant(1);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const confirmDelete = () => {
    setScene("pending");
    window.setTimeout(() => {
      if (failNext) {
        setFailNext(false);
        setScene("failure");
        return;
      }
      setScene("deleted");
    }, 850);
  };

  const itemIsAbsent = scene === "deleted" || scene === "gone";

  return (
    <div className="relative min-h-[calc(100svh-7rem)] pb-28">
      <div className="mb-4 rounded-[var(--radius-card)] border border-dashed bg-muted px-4 py-3 text-xs text-muted-foreground">
        <strong className="text-foreground">
          PROTOTYPE — no data is changed.
        </strong>{" "}
        Delete returns to {contextName(context)}; a direct visit after deletion
        returns to Library.
      </div>

      <div
        className={cn(
          "grid min-w-0 items-start gap-6",
          !itemIsAbsent && "lg:grid-cols-[minmax(0,1fr)_minmax(22rem,28rem)]",
        )}
      >
        {!itemIsAbsent && (
          <PrototypeItemDetail
            variant={variant}
            scene={scene}
            onSceneChange={setScene}
            onConfirm={confirmDelete}
          />
        )}
        <BackgroundSurface
          context={scene === "gone" ? "library" : context}
          itemIsAbsent={itemIsAbsent}
        />
      </div>

      {scene === "deleted" && (
        <PrototypeNotice
          title="Item deleted"
          detail={`Returned to ${contextName(context)}. The Item has been removed here too.`}
          action="Visit the deleted Item URL"
          onAction={() => setScene("gone")}
        />
      )}
      {scene === "gone" && (
        <PrototypeNotice
          title="That Item is no longer in your Library"
          detail="The old Item link brought you back to Library."
          action="Reset prototype"
          onAction={() => setScene("detail")}
        />
      )}

      <PrototypeControls
        variant={variant}
        context={context}
        scene={scene}
        failNext={failNext}
        onPrevious={() => cycleVariant(-1)}
        onNext={() => cycleVariant(1)}
        onContextChange={(next) => setPrototypeParam("context", next)}
        onFailNextChange={setFailNext}
        onReset={() => setScene("detail")}
      />
    </div>
  );
}

function PrototypeItemDetail({
  variant,
  scene,
  onSceneChange,
  onConfirm,
}: {
  variant: Variant;
  scene: Scene;
  onSceneChange: (scene: Scene) => void;
  onConfirm: () => void;
}) {
  const waiting = scene === "pending";
  const failed = scene === "failure";

  return (
    <aside className="min-w-0 rounded-[var(--radius-panel)] border bg-card text-card-foreground lg:order-last lg:sticky lg:top-24">
      {variant === "B" && scene !== "detail" ? (
        <VariantBTakeover
          scene={scene}
          onCancel={() => onSceneChange("detail")}
          onConfirm={onConfirm}
        />
      ) : (
        <div className="grid gap-6 p-5 sm:p-6">
          <header className="flex min-w-0 items-start justify-between gap-3 border-b pb-5">
            <div className="min-w-0">
              <span className="mb-2 inline-flex rounded-full bg-muted px-2 py-1 text-xs font-semibold">
                Book
              </span>
              <h2 className="wrap-break-word font-serif text-2xl leading-tight sm:text-3xl">
                {itemTitle}
              </h2>
            </div>
            <Button
              type="button"
              variant="quiet"
              size="icon"
              className="-mt-2 -mr-2 size-11 sm:size-10"
            >
              <X aria-hidden="true" />
              <span className="sr-only">Close details</span>
            </Button>
          </header>

          <ItemFacts />

          {variant === "A" && (
            <VariantA
              open={scene !== "detail"}
              waiting={waiting}
              failed={failed}
              onOpen={() => onSceneChange("confirm")}
              onOpenChange={(open) => !open && onSceneChange("detail")}
              onConfirm={onConfirm}
            />
          )}
          {variant === "B" && (
            <div className="flex justify-end border-t pt-4">
              <Button
                type="button"
                variant="quiet"
                size="icon"
                onClick={() => onSceneChange("confirm")}
              >
                <MoreHorizontal aria-hidden="true" />
                <span className="sr-only">More Item actions</span>
              </Button>
            </div>
          )}
          {variant === "C" && (
            <VariantC
              scene={scene}
              onOpen={() => onSceneChange("confirm")}
              onCancel={() => onSceneChange("detail")}
              onConfirm={onConfirm}
            />
          )}
        </div>
      )}
    </aside>
  );
}

function ItemFacts() {
  return (
    <div className="grid gap-6">
      <section className="grid gap-4 sm:grid-cols-2">
        <Fact label="Status" value="In progress" />
        <Fact label="Target date" value="12 Sep 2026" />
      </section>
      <section className="grid gap-2">
        <h3 className="text-sm font-medium">Labels</h3>
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full border px-2.5 py-1 text-xs">
            Databases
          </span>
          <span className="rounded-full border px-2.5 py-1 text-xs">
            Systems
          </span>
        </div>
      </section>
      <section className="grid gap-2">
        <h3 className="text-sm font-medium">Learning Plans</h3>
        <p className="rounded-[var(--radius-card)] border bg-background p-3 text-sm">
          Backend foundations · Stage 2
        </p>
      </section>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1">
      <span className="text-sm font-medium">{label}</span>
      <span className="text-sm text-muted-foreground">{value}</span>
    </div>
  );
}

function VariantA({
  open,
  waiting,
  failed,
  onOpen,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  waiting: boolean;
  failed: boolean;
  onOpen: () => void;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <>
      <div className="border-t pt-4">
        <Button
          type="button"
          variant="quiet-destructive"
          className="w-full justify-start"
          onClick={onOpen}
        >
          <Trash2 aria-hidden="true" /> Delete Item
        </Button>
      </div>
      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (!waiting) onOpenChange(nextOpen);
        }}
      >
        <DialogContent showCloseButton={!waiting}>
          <DialogHeader>
            <DialogTitle>Delete “{itemTitle}”?</DialogTitle>
            <DialogDescription>
              This permanently removes its Parts, Labels, Today entry, and
              Learning Plan placements. Past Daily Focus keeps an unlinked
              snapshot. If it came from Discover, it becomes available there
              again. This can’t be undone.
            </DialogDescription>
          </DialogHeader>
          {failed && <FailureMessage />}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="secondary"
              disabled={waiting}
              onClick={() => onOpenChange(false)}
            >
              Keep Item
            </Button>
            <DeleteButton waiting={waiting} onClick={onConfirm} />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function VariantBTakeover({
  scene,
  onCancel,
  onConfirm,
}: {
  scene: Scene;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const waiting = scene === "pending";
  return (
    <div className="grid min-h-[30rem] content-between gap-8 p-5 sm:p-6">
      <div className="grid gap-6">
        <Button
          type="button"
          variant="quiet"
          className="w-fit px-0"
          disabled={waiting}
          onClick={onCancel}
        >
          <ArrowLeft aria-hidden="true" /> Back to Item
        </Button>
        <div className="grid gap-3">
          <span className="flex size-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <Trash2 aria-hidden="true" />
          </span>
          <h2 className="font-serif text-2xl leading-tight">
            Delete this Item?
          </h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            “{itemTitle}” will leave your active workspace everywhere: Library,
            Today, Labels, Parts, and every Learning Plan. Past Daily Focus
            retains an unlinked snapshot. A linked Discover Candidate becomes
            available there again.
          </p>
          <p className="text-sm font-medium text-destructive">
            There is no Trash or Undo.
          </p>
        </div>
        {scene === "failure" && <FailureMessage />}
      </div>
      <div className="grid gap-2 border-t pt-5">
        <DeleteButton
          waiting={waiting}
          onClick={onConfirm}
          className="w-full"
        />
        <Button
          type="button"
          variant="quiet"
          disabled={waiting}
          onClick={onCancel}
        >
          Keep Item
        </Button>
      </div>
    </div>
  );
}

function VariantC({
  scene,
  onOpen,
  onCancel,
  onConfirm,
}: {
  scene: Scene;
  onOpen: () => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (scene === "detail") {
    return (
      <div className="rounded-[var(--radius-card)] border border-destructive/25 bg-destructive/5 p-4">
        <h3 className="font-medium">Remove from Unshelf</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Permanently delete this Item and its active organisation.
        </p>
        <Button
          type="button"
          variant="quiet-destructive"
          className="mt-3 px-0"
          onClick={onOpen}
        >
          Review deletion <ArrowRight aria-hidden="true" />
        </Button>
      </div>
    );
  }

  const waiting = scene === "pending";
  return (
    <div className="grid gap-4 rounded-[var(--radius-card)] border border-destructive/35 bg-destructive/5 p-4">
      <div>
        <h3 className="font-serif text-xl">Delete “{itemTitle}”?</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Review what happens before continuing.
        </p>
      </div>
      <ul className="grid gap-2 text-sm">
        <Consequence>
          Removed from Library, Today, Labels, Parts, and Learning Plans
        </Consequence>
        <Consequence>
          Past Daily Focus keeps an unlinked day-end snapshot
        </Consequence>
        <Consequence>
          If it came from Discover, it becomes available there again
        </Consequence>
        <Consequence>No Trash, Restore, or Undo</Consequence>
      </ul>
      {scene === "failure" && <FailureMessage />}
      <div className="grid gap-2 sm:grid-cols-2">
        <Button
          type="button"
          variant="secondary"
          disabled={waiting}
          onClick={onCancel}
        >
          Keep Item
        </Button>
        <DeleteButton waiting={waiting} onClick={onConfirm} />
      </div>
    </div>
  );
}

function Consequence({ children }: { children: ReactNode }) {
  return (
    <li className="flex gap-2">
      <Check className="mt-0.5 size-4 text-destructive" aria-hidden="true" />
      <span>{children}</span>
    </li>
  );
}

function DeleteButton({
  waiting,
  onClick,
  className,
}: {
  waiting: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    <Button
      type="button"
      variant="destructive"
      loading={waiting}
      loadingLabel="Deleting…"
      className={className}
      onClick={onClick}
    >
      Delete Item
    </Button>
  );
}

function FailureMessage() {
  return (
    <div
      role="alert"
      className="flex gap-2 rounded-[var(--radius-card)] border border-destructive/30 bg-destructive/7 p-3 text-sm"
    >
      <CircleAlert
        className="mt-0.5 size-4 shrink-0 text-destructive"
        aria-hidden="true"
      />
      <span>
        <strong>Couldn’t delete this Item.</strong> Nothing changed. Try again.
      </span>
    </div>
  );
}

function BackgroundSurface({
  context,
  itemIsAbsent,
}: {
  context: Context;
  itemIsAbsent: boolean;
}) {
  return (
    <main className="min-w-0 rounded-[var(--radius-panel)] border bg-background p-5 sm:p-7">
      <header className="mb-6 flex items-center gap-3 border-b pb-5">
        {context === "library" ? (
          <Library aria-hidden="true" />
        ) : context === "today" ? (
          <CalendarDays aria-hidden="true" />
        ) : (
          <BookOpen aria-hidden="true" />
        )}
        <div>
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Preserved background
          </p>
          <h1 className="font-serif text-2xl">{contextName(context)}</h1>
        </div>
      </header>
      <div className={cn("grid gap-3", context === "plan" && "sm:grid-cols-2")}>
        <BackgroundItem
          title="The Staff Engineer’s Path"
          detail="Not started · Book"
        />
        {!itemIsAbsent && (
          <BackgroundItem
            title={itemTitle}
            detail="In progress · Book"
            emphasized
          />
        )}
        <BackgroundItem
          title="Database Internals"
          detail="In progress · Book"
        />
        {context === "plan" && (
          <BackgroundItem title="Release It!" detail="Not started · Book" />
        )}
      </div>
      {itemIsAbsent && (
        <p className="mt-5 rounded-[var(--radius-card)] border border-dashed bg-muted/60 p-4 text-sm text-muted-foreground">
          The deleted Item is absent immediately; surrounding order closes
          naturally.
        </p>
      )}
    </main>
  );
}

function BackgroundItem({
  title,
  detail,
  emphasized = false,
}: {
  title: string;
  detail: string;
  emphasized?: boolean;
}) {
  return (
    <article
      className={cn(
        "rounded-[var(--radius-card)] border bg-card p-4",
        emphasized && "border-primary/45 ring-2 ring-primary/10",
      )}
    >
      <h2 className="font-medium">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{detail}</p>
    </article>
  );
}

function PrototypeNotice({
  title,
  detail,
  action,
  onAction,
}: {
  title: string;
  detail: string;
  action: string;
  onAction: () => void;
}) {
  return (
    <div
      role="status"
      className="fixed top-20 right-4 z-40 grid max-w-sm gap-2 rounded-[var(--radius-panel)] border bg-popover p-4 text-popover-foreground shadow-[var(--shadow-floating)]"
    >
      <div className="flex items-start gap-3">
        <Check className="mt-0.5 size-5 text-primary" aria-hidden="true" />
        <div>
          <p className="font-semibold">{title}</p>
          <p className="text-sm text-muted-foreground">{detail}</p>
        </div>
      </div>
      <Button
        type="button"
        variant="quiet"
        size="compact"
        className="w-fit"
        onClick={onAction}
      >
        {action}
      </Button>
    </div>
  );
}

function PrototypeControls({
  variant,
  context,
  scene,
  failNext,
  onPrevious,
  onNext,
  onContextChange,
  onFailNextChange,
  onReset,
}: {
  variant: Variant;
  context: Context;
  scene: Scene;
  failNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
  onContextChange: (context: Context) => void;
  onFailNextChange: (fail: boolean) => void;
  onReset: () => void;
}) {
  if (!import.meta.env.DEV) return null;
  const current = variants.find((candidate) => candidate.key === variant)!;

  return (
    <div className="fixed bottom-3 left-1/2 z-[60] flex w-[min(calc(100%-1.5rem),58rem)] -translate-x-1/2 flex-wrap items-center justify-center gap-2 rounded-full border bg-foreground px-3 py-2 text-background shadow-[var(--shadow-floating)]">
      <Button
        type="button"
        variant="quiet"
        size="icon-compact"
        className="text-background hover:bg-background/15 hover:text-background"
        onClick={onPrevious}
      >
        <ArrowLeft aria-hidden="true" />
        <span className="sr-only">Previous variant</span>
      </Button>
      <strong className="min-w-32 text-center text-xs sm:text-sm">
        {current.key} — {current.name}
      </strong>
      <Button
        type="button"
        variant="quiet"
        size="icon-compact"
        className="text-background hover:bg-background/15 hover:text-background"
        onClick={onNext}
      >
        <ArrowRight aria-hidden="true" />
        <span className="sr-only">Next variant</span>
      </Button>
      <span className="hidden h-5 w-px bg-background/25 sm:block" />
      {(["library", "today", "plan"] as const).map((candidate) => (
        <button
          key={candidate}
          type="button"
          className={cn(
            "rounded-full px-2 py-1 text-xs",
            context === candidate
              ? "bg-background text-foreground"
              : "text-background/75 hover:text-background",
          )}
          onClick={() => onContextChange(candidate)}
        >
          {contextName(candidate)}
        </button>
      ))}
      <label className="flex items-center gap-1.5 rounded-full px-2 py-1 text-xs text-background/80">
        <input
          type="checkbox"
          checked={failNext}
          onChange={(event) => onFailNextChange(event.target.checked)}
        />{" "}
        Fail next
      </label>
      <button
        type="button"
        className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs text-background/80 hover:text-background"
        onClick={onReset}
      >
        <RotateCcw className="size-3" aria-hidden="true" /> {scene}
      </button>
    </div>
  );
}

function readVariant(value: string | null): Variant {
  return value === "B" || value === "C" ? value : "A";
}

function readContext(value: string | null): Context {
  return value === "today" || value === "plan" ? value : "library";
}

function contextName(context: Context) {
  if (context === "today") return "Today";
  if (context === "plan") return "Learning Plan";
  return "Library";
}
