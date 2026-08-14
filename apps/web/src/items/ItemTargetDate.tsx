import { useId, useState } from "react";
import { CalendarClock } from "lucide-react";
import type { Item } from "@unshelf/shared";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { updateItemTargetDate } from "../api";
import type { CurrentUser } from "../application-auth/types";

interface ItemTargetDateProps {
  item: Item;
  user: CurrentUser;
  onChanged: (item: Item) => void;
}

/**
 * The Item-level Target date control — the User's soft "by when" (ADR-0005).
 *
 * A native date input carries set and change (and gives phones their own picker
 * for free); Clear appears only when there is a date to clear. The *past target*
 * state beside it is read from the Item the api just returned — never computed
 * here — so the whole app derives it in exactly one place. It states the fact and
 * stages: no red, no warning icon, no count of days. Unshelf never nags.
 */
export function ItemTargetDate({ item, user, onChanged }: ItemTargetDateProps) {
  const inputId = useId();
  const [saving, setSaving] = useState(false);
  const [failedTargetDate, setFailedTargetDate] = useState<string | null>();

  async function change(targetDate: string | null) {
    setSaving(true);
    setFailedTargetDate(undefined);
    try {
      onChanged(await updateItemTargetDate(user, item.id, targetDate));
    } catch {
      setFailedTargetDate(targetDate);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Field>
      <FieldLabel htmlFor={inputId}>Target date</FieldLabel>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          id={inputId}
          aria-label={`Target date for ${item.title}`}
          type="date"
          value={item.targetDate ?? ""}
          disabled={saving}
          onChange={(event) => void change(event.target.value || null)}
          className="w-auto min-w-40"
        />
        {item.targetDate && (
          <Button
            type="button"
            variant="quiet"
            size="compact"
            disabled={saving}
            onClick={() => void change(null)}
          >
            Clear
          </Button>
        )}
        {item.pastTarget && <PastTarget />}
      </div>
      {saving && (
        <FieldDescription role="status">Saving Target date…</FieldDescription>
      )}
      {failedTargetDate !== undefined && (
        <Alert className="grid gap-2">
          <span>
            Couldn’t update Target date. Your previous date is unchanged.
          </span>
          <Button
            type="button"
            variant="secondary"
            size="compact"
            className="w-fit"
            onClick={() => void change(failedTargetDate)}
          >
            Retry Target date
          </Button>
        </Alert>
      )}
    </Field>
  );
}

/** The derived past-target state: something you notice, not something that shouts. */
function PastTarget() {
  return (
    <Badge variant="past">
      <CalendarClock aria-hidden="true" />
      Past target
    </Badge>
  );
}
