import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Trash2, X } from "lucide-react";
import type { Item, ItemDetail, ItemId, Label } from "@unshelf/shared";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchItem, fetchLabels, ItemRequestError } from "../api";
import type { CurrentUser } from "../application-auth/types";
import { ItemLabels } from "./ItemLabels";
import type { ItemPlacementChange } from "./ItemPlacements";
import { ItemStatusSelect } from "./ItemStatusSelect";
import { ItemTargetDate } from "./ItemTargetDate";
import { ItemSource } from "./ItemSource";
import { ItemPlacements } from "./ItemPlacements";
import { TYPE_LABELS } from "./presentation";
import { PartChecklist } from "./PartChecklist";

interface ItemSidebarProps {
  itemId: ItemId;
  user: CurrentUser;
  itemOverride?: Item;
  onClose: () => void;
  onDelete: () => Promise<void>;
  onUnavailable: () => void;
  onItemChanged?: (item: Item) => void;
  onPlacementChanged?: (change: ItemPlacementChange) => void;
}

/** Route-owned canonical Item detail, isolated from the live surface beside it. */
export function ItemSidebar({
  itemId,
  user,
  itemOverride,
  onClose,
  onDelete,
  onUnavailable,
  onItemChanged,
  onPlacementChanged,
}: ItemSidebarProps) {
  const [item, setItem] = useState<ItemDetail | null>(null);
  const [labels, setLabels] = useState<Label[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteFailed, setDeleteFailed] = useState(false);
  const loadGeneration = useRef(0);
  const headingId = useId();

  const load = useCallback(async () => {
    const generation = ++loadGeneration.current;
    setError(null);
    try {
      const [itemResult, labelsResult] = await Promise.allSettled([
        fetchItem(user, itemId),
        fetchLabels(user),
      ]);
      if (generation !== loadGeneration.current) return;
      // Item availability owns route recovery, so a concurrent Labels failure
      // must not hide a not-found result from the canonical Item read.
      if (itemResult.status === "rejected") throw itemResult.reason;
      if (labelsResult.status === "rejected") throw labelsResult.reason;
      setItem(itemResult.value);
      setLabels(labelsResult.value);
    } catch (loadError) {
      if (generation !== loadGeneration.current) return;
      if (
        loadError instanceof ItemRequestError &&
        loadError.kind === "not_found"
      ) {
        onUnavailable();
        return;
      }
      setError(
        "Couldn’t load this Item. The rest of your workspace is still available.",
      );
    }
  }, [itemId, onUnavailable, user]);

  useEffect(() => {
    setItem(null);
    setLabels(null);
    void load();
    return () => {
      loadGeneration.current += 1;
    };
  }, [load]);

  const replaceItem = (changed: Item) => {
    setItem((current) => (current ? { ...current, ...changed } : null));
    onItemChanged?.(changed);
  };

  const loadedItem = item?.id === itemId ? item : null;
  const visibleItem = loadedItem
    ? itemOverride?.id === itemId
      ? { ...loadedItem, ...itemOverride }
      : loadedItem
    : null;

  const confirmDelete = async () => {
    if (deleting) return;
    setDeleteFailed(false);
    setDeleting(true);
    try {
      await onDelete();
    } catch {
      setDeleteFailed(true);
      setDeleting(false);
    }
  };

  return (
    <aside
      className="min-w-0 rounded-[var(--radius-panel)] border bg-card text-card-foreground lg:order-last lg:sticky lg:top-24 lg:max-h-[calc(100dvh-7rem)] lg:overflow-y-auto"
      aria-label={visibleItem ? `${visibleItem.title} details` : "Item details"}
    >
      {!visibleItem && !error && (
        <div
          className="grid gap-5 p-5 sm:p-6"
          role="status"
          aria-label="Loading Item details"
        >
          <Skeleton className="h-8 w-3/4" aria-hidden="true" />
          <Skeleton className="h-20 w-full" aria-hidden="true" />
          <Skeleton className="h-40 w-full" aria-hidden="true" />
        </div>
      )}
      {error && (
        <div className="grid min-h-56 content-center gap-4 p-5 sm:p-6">
          <Alert>{error}</Alert>
          <Button
            type="button"
            variant="secondary"
            className="w-fit"
            onClick={() => void load()}
          >
            Retry
          </Button>
        </div>
      )}
      {visibleItem && labels && (
        <div className="grid min-w-0 gap-6 p-5 sm:p-6">
          <header className="flex min-w-0 items-start justify-between gap-3 border-b pb-5">
            <div className="min-w-0">
              <Badge className="mb-2">{TYPE_LABELS[visibleItem.type]}</Badge>
              <h2
                id={headingId}
                className="wrap-break-word font-serif text-2xl leading-tight sm:text-3xl"
              >
                {visibleItem.title}
              </h2>
            </div>
            <Button
              type="button"
              variant="quiet"
              size="icon"
              className="-mt-2 -mr-2 size-11 sm:size-10"
              disabled={deleting}
              onClick={onClose}
            >
              <X aria-hidden="true" />
              <span className="sr-only">Close details</span>
            </Button>
          </header>
          <section className="grid gap-5" aria-label="Item facts">
            <div className="grid min-w-0 gap-5 sm:grid-cols-2">
              <ItemStatusSelect
                item={visibleItem}
                user={user}
                onChanged={replaceItem}
                structured={visibleItem.partPercentage !== null}
              />
              <ItemTargetDate
                item={visibleItem}
                user={user}
                onChanged={replaceItem}
              />
            </div>
            <ItemLabels
              item={visibleItem}
              labels={labels}
              user={user}
              onItemChanged={replaceItem}
            />
            <div className="grid gap-2">
              <h3 className="text-sm font-medium">Source</h3>
              {visibleItem.source ? (
                <ItemSource source={visibleItem.source} />
              ) : (
                <p className="text-sm text-muted-foreground">No Source</p>
              )}
            </div>
          </section>
          <PartChecklist
            item={visibleItem}
            user={user}
            onChanged={replaceItem}
          />
          <ItemPlacements
            itemId={visibleItem.id}
            itemTitle={visibleItem.title}
            user={user}
            onChanged={onPlacementChanged}
          />
          <section
            className="grid justify-items-start gap-3 border-t pt-5"
            aria-label="Delete Item"
          >
            <div>
              <h3 className="m-0 text-sm font-medium">Delete Item</h3>
              <p className="mt-1 mb-0 text-sm text-muted-foreground">
                Permanently remove this Item from your active workspace.
              </p>
            </div>
            <Button
              type="button"
              variant="quiet-destructive"
              onClick={() => {
                setDeleteFailed(false);
                setDeleteOpen(true);
              }}
            >
              <Trash2 aria-hidden="true" />
              Delete Item
            </Button>
          </section>
          <Dialog
            open={deleteOpen}
            onOpenChange={(open) => {
              if (!deleting) setDeleteOpen(open);
            }}
          >
            <DialogContent
              showCloseButton={false}
              overlayProps={{
                onClick: () => {
                  if (!deleting) setDeleteOpen(false);
                },
              }}
              className="max-h-[calc(100svh-2rem)] w-[calc(100%-2rem)] sm:max-w-lg"
              onEscapeKeyDown={(event) => {
                if (deleting) event.preventDefault();
              }}
              onPointerDownOutside={(event) => {
                if (deleting) event.preventDefault();
              }}
            >
              <DialogHeader>
                <DialogTitle>Delete “{visibleItem.title}”?</DialogTitle>
                <DialogDescription>
                  This permanently removes its Parts, Labels, Today entry, and
                  Learning Plan placements. Past Daily Focus keeps an unlinked
                  snapshot. If it came from Discover, it becomes available there
                  again. This can’t be undone.
                </DialogDescription>
              </DialogHeader>
              <Button
                type="button"
                variant="quiet"
                size="icon"
                className="absolute top-2 right-2 size-11 sm:size-10"
                disabled={deleting}
                onClick={() => setDeleteOpen(false)}
              >
                <X aria-hidden="true" />
                <span className="sr-only">Close</span>
              </Button>
              {deleteFailed && (
                <Alert>
                  Couldn’t confirm whether this Item was deleted. Try again.
                </Alert>
              )}
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={deleting}
                  onClick={() => setDeleteOpen(false)}
                >
                  Keep Item
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  loading={deleting}
                  loadingLabel="Deleting…"
                  onClick={() => void confirmDelete()}
                >
                  Delete Item
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      )}
    </aside>
  );
}
