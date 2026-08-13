import type { ReactNode } from "react";
import {
  BookOpen,
  CalendarDays,
  ExternalLink,
  FolderTree,
  Tags,
  Trash2,
} from "lucide-react";
import { ITEM_STATUSES, Status } from "@unshelf/shared";

import { ItemStatusBadge } from "@/components/unshelf/item-status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { STATUS_LABELS, TYPE_LABELS } from "@/items/presentation";

import type { PrototypeItem } from "./prototype-data";

export function ItemDetailSheet({
  item,
  onClose,
  onStatusChange,
}: {
  item: PrototypeItem | undefined;
  onClose: () => void;
  onStatusChange: (status: Status) => void;
}) {
  return (
    <Sheet
      open={item !== undefined}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      {item && (
        <SheetContent
          side="right"
          className="w-full gap-0 border-l bg-card p-0 sm:max-w-lg"
        >
          <SheetHeader className="gap-4 border-b p-6 pr-16">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{TYPE_LABELS[item.type]}</Badge>
              <ItemStatusBadge status={item.status} />
            </div>
            <SheetTitle className="font-serif text-3xl leading-9 font-semibold tracking-tight">
              {item.title}
            </SheetTitle>
            <SheetDescription className="text-base leading-7">
              {item.note}
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto p-6">
            <section aria-labelledby="item-status-heading">
              <h2
                id="item-status-heading"
                className="text-xs font-bold tracking-[0.12em] text-muted-foreground uppercase"
              >
                Status
              </h2>
              <Select
                value={item.status}
                onValueChange={(value) => onStatusChange(value as Status)}
              >
                <SelectTrigger className="mt-3 w-full" aria-label="Item status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ITEM_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      {STATUS_LABELS[status]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </section>

            <Separator className="my-6" />

            <dl className="grid gap-6 text-sm">
              <DetailRow
                icon={<BookOpen />}
                label="Type"
                value={TYPE_LABELS[item.type]}
              />
              <DetailRow
                icon={<CalendarDays />}
                label="Target"
                value={item.targetDate ?? "No target date"}
              />
              <DetailRow
                icon={<Tags />}
                label="Labels"
                value={item.labels.join(", ") || "No labels"}
              />
              <DetailRow
                icon={<FolderTree />}
                label="Placement"
                value={item.planned ? "Library and one Plan" : "Library only"}
              />
            </dl>

            <Separator className="my-6" />

            <section aria-labelledby="item-source-heading">
              <h2
                id="item-source-heading"
                className="text-xs font-bold tracking-[0.12em] text-muted-foreground uppercase"
              >
                Source
              </h2>
              <a
                href={item.source}
                className="mt-3 inline-flex items-center gap-2 rounded-sm text-sm font-semibold text-primary underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:ring-ring/35"
              >
                {item.sourceLabel}
                <ExternalLink aria-hidden="true" className="size-4" />
              </a>
            </section>
          </div>

          <SheetFooter className="border-t bg-quiet-panel p-4 sm:flex-row sm:justify-between">
            <Button type="button" variant="destructive">
              <Trash2 data-icon="inline-start" aria-hidden="true" />
              Delete
            </Button>
            <Button type="button" variant="outline" onClick={onClose}>
              Done
            </Button>
          </SheetFooter>
        </SheetContent>
      )}
    </Sheet>
  );
}

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="grid grid-cols-[1.5rem_5rem_minmax(0,1fr)] items-start gap-3">
      <span
        aria-hidden="true"
        className="mt-0.5 text-muted-foreground [&_svg]:size-4"
      >
        {icon}
      </span>
      <dt className="font-semibold text-muted-foreground">{label}</dt>
      <dd className="m-0 text-foreground">{value}</dd>
    </div>
  );
}
