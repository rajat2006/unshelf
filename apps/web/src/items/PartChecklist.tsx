import { useEffect, useId, useState } from "react";
import type { FormEvent } from "react";
import { ArrowDown, ArrowUp, Check, Trash2 } from "lucide-react";
import type { ItemDetail, Part } from "@unshelf/shared";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import {
  createParts,
  removePart,
  reorderParts,
  updatePart,
  updatePartCompletion,
} from "../api";
import type { CurrentUser } from "../application-auth/types";

interface PartChecklistProps {
  item: ItemDetail;
  user: CurrentUser;
  onChanged: (item: ItemDetail) => void;
}

export function PartChecklist({ item, user, onChanged }: PartChecklistProps) {
  const headingId = useId();
  const addFieldId = useId();
  const [titles, setTitles] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [operationError, setOperationError] = useState<string | null>(null);

  const applyItemDetailMutation = async (
    operation: () => Promise<ItemDetail>,
  ) => {
    setOperationError(null);
    try {
      onChanged(await operation());
      return true;
    } catch {
      return false;
    }
  };

  const add = async (event: FormEvent) => {
    event.preventDefault();
    if (!titles.trim()) {
      setAddError("Enter at least one Part title.");
      return;
    }

    setAdding(true);
    setAddError(null);
    const changed = await applyItemDetailMutation(() =>
      createParts(user, item.id, titles.split("\n")),
    );
    setAdding(false);
    if (changed) {
      setTitles("");
    } else {
      setAddError("Couldn’t add Parts. Your titles are still here.");
    }
  };

  const move = async (part: Part, offset: -1 | 1) => {
    const currentIndex = item.parts.findIndex(({ id }) => id === part.id);
    const next = [...item.parts];
    const destination = currentIndex + offset;
    [next[currentIndex], next[destination]] = [
      next[destination],
      next[currentIndex],
    ];
    const changed = await applyItemDetailMutation(() =>
      reorderParts(
        user,
        item.id,
        next.map(({ id }) => id),
      ),
    );
    if (!changed) setOperationError("Couldn’t reorder Parts. Try again.");
    return changed;
  };

  const applyPartMutation = async (
    operation: () => Promise<ItemDetail>,
    failureMessage: string,
  ) => {
    const changed = await applyItemDetailMutation(operation);
    if (!changed) setOperationError(failureMessage);
    return changed;
  };

  return (
    <section
      className="grid min-w-0 gap-4 border-t pt-6"
      aria-labelledby={headingId}
    >
      <div className="grid gap-2">
        <div className="flex items-baseline justify-between gap-3">
          <h3 id={headingId} className="font-serif text-xl">
            Parts
          </h3>
          {item.partPercentage !== null && (
            <span className="text-sm text-muted-foreground">
              {item.partPercentage}% complete
            </span>
          )}
        </div>
        {item.partPercentage !== null && (
          <Progress
            value={item.partPercentage}
            aria-label={`${item.partPercentage}% of Parts complete`}
          />
        )}
      </div>
      {item.parts.length === 0 ? (
        <p className="text-sm text-muted-foreground">No Parts yet</p>
      ) : (
        <ol className="grid gap-3" aria-label="Parts">
          {item.parts.map((part, index) => (
            <PartRow
              key={part.id}
              part={part}
              first={index === 0}
              last={index === item.parts.length - 1}
              onCompletion={(completed) =>
                applyPartMutation(
                  () => updatePartCompletion(user, item.id, part.id, completed),
                  `Couldn’t update ${part.title}. Try again.`,
                )
              }
              onRename={(title) =>
                applyItemDetailMutation(() =>
                  updatePart(user, item.id, part.id, title),
                )
              }
              onMove={(offset) => move(part, offset)}
              onRemove={() =>
                applyPartMutation(
                  () => removePart(user, item.id, part.id),
                  `Couldn’t remove ${part.title}. Try again.`,
                )
              }
            />
          ))}
        </ol>
      )}
      {operationError && <Alert>{operationError}</Alert>}
      <form
        className="grid gap-3 rounded-[var(--radius-card)] bg-muted/55 p-4"
        onSubmit={(event) => void add(event)}
      >
        <Field>
          <FieldLabel htmlFor={addFieldId}>New Part titles</FieldLabel>
          <Textarea
            id={addFieldId}
            value={titles}
            disabled={adding}
            aria-invalid={addError !== null}
            aria-describedby={`${addFieldId}-description${addError ? ` ${addFieldId}-error` : ""}`}
            onChange={(event) => {
              setTitles(event.target.value);
              if (addError) setAddError(null);
            }}
            placeholder="One title per line"
          />
          <FieldDescription id={`${addFieldId}-description`}>
            Add one Part per line. Blank lines are ignored.
          </FieldDescription>
          {addError && (
            <FieldError id={`${addFieldId}-error`}>{addError}</FieldError>
          )}
        </Field>
        <Button
          type="submit"
          variant="secondary"
          className="min-h-11 w-fit sm:min-h-10"
          disabled={adding}
          loading={adding}
          loadingLabel="Adding Parts…"
        >
          Add Parts
        </Button>
      </form>
    </section>
  );
}

function PartRow({
  part,
  first,
  last,
  onCompletion,
  onRename,
  onMove,
  onRemove,
}: {
  part: Part;
  first: boolean;
  last: boolean;
  onCompletion: (completed: boolean) => Promise<boolean>;
  onRename: (title: string) => Promise<boolean>;
  onMove: (offset: -1 | 1) => Promise<boolean>;
  onRemove: () => Promise<boolean>;
}) {
  const [title, setTitle] = useState(part.title);
  const [busy, setBusy] = useState(false);
  const [renameError, setRenameError] = useState(false);
  const emptyTitle = !title.trim();
  useEffect(() => setTitle(part.title), [part.title]);

  const runRowMutation = async (operation: () => Promise<boolean>) => {
    setBusy(true);
    const changed = await operation();
    setBusy(false);
    return changed;
  };

  return (
    <li className="grid min-w-0 gap-3 rounded-[var(--radius-card)] border bg-background p-3">
      <label className="flex min-h-11 min-w-0 items-center gap-3 text-sm font-medium">
        <Checkbox
          className="size-5"
          checked={part.completed}
          disabled={busy}
          onCheckedChange={(checked) =>
            void runRowMutation(() => onCompletion(checked === true))
          }
        />
        <span
          className={part.completed ? "text-muted-foreground line-through" : ""}
        >
          {part.title}
        </span>
      </label>
      <Field>
        <FieldLabel htmlFor={`part-title-${part.id}`} className="sr-only">
          Title for {part.title}
        </FieldLabel>
        <Input
          id={`part-title-${part.id}`}
          value={title}
          disabled={busy}
          aria-invalid={emptyTitle || renameError || undefined}
          onChange={(event) => {
            setTitle(event.target.value);
            setRenameError(false);
          }}
        />
        {emptyTitle ? (
          <FieldError>Enter a Part title.</FieldError>
        ) : renameError ? (
          <FieldError>
            Couldn’t rename {part.title}. Your edit is still here.
          </FieldError>
        ) : null}
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          size="compact"
          className="min-h-11 sm:min-h-8"
          disabled={busy || emptyTitle || title.trim() === part.title}
          onClick={() =>
            void runRowMutation(() => onRename(title.trim())).then((changed) =>
              setRenameError(!changed),
            )
          }
        >
          <Check aria-hidden="true" />
          Save {title.trim() || "Part"}
        </Button>
        <Button
          type="button"
          variant="quiet"
          size="icon-compact"
          className="size-11 sm:size-8"
          disabled={busy || first}
          onClick={() => void runRowMutation(() => onMove(-1))}
        >
          <ArrowUp aria-hidden="true" />
          <span className="sr-only">Move {part.title} up</span>
        </Button>
        <Button
          type="button"
          variant="quiet"
          size="icon-compact"
          className="size-11 sm:size-8"
          disabled={busy || last}
          onClick={() => void runRowMutation(() => onMove(1))}
        >
          <ArrowDown aria-hidden="true" />
          <span className="sr-only">Move {part.title} down</span>
        </Button>
        <Button
          type="button"
          variant="quiet"
          size="icon-compact"
          className="size-11 text-destructive hover:text-destructive sm:size-8"
          disabled={busy}
          onClick={() => void runRowMutation(onRemove)}
        >
          <Trash2 aria-hidden="true" />
          <span className="sr-only">Remove {part.title}</span>
        </Button>
      </div>
      {busy && (
        <p role="status" className="text-sm text-muted-foreground">
          Updating {part.title}…
        </p>
      )}
    </li>
  );
}
