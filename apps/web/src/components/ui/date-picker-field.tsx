import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDaysIcon } from "lucide-react";
import {
  enGB as dayPickerEnGB,
  enUS as dayPickerEnUS,
} from "react-day-picker/locale";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
import {
  calendarDateToLocalDate,
  formatLocalizedCalendarDate,
  localDateToCalendarDate,
  parseLocalizedCalendarDate,
  validateCanonicalCalendarDate,
  type CalendarDateValidationError,
  type DatePickerLocale,
} from "@/components/ui/calendar-date";

const DESKTOP_DATE_PICKER_QUERY = "(min-width: 640px) and (pointer: fine)";
const NO_AUTHORITATIVE_TODAY = fixedDateOutsideSupportedRange();

interface DatePickerFieldProps {
  id: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  value: string | null;
  today: string | null;
  locale?: DatePickerLocale;
  required?: boolean;
  disabled?: boolean;
  allowToday?: boolean;
  allowClear?: boolean;
  min?: string;
  selectionMin?: string;
  max?: string;
  onValueChange: (value: string | null) => void;
  onValidityChange?: (valid: boolean) => void;
}

export function DatePickerField({
  id,
  value,
  today,
  locale = "en-GB",
  required = false,
  disabled = false,
  allowToday = false,
  allowClear = false,
  min,
  selectionMin,
  max,
  onValueChange,
  onValidityChange,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  "aria-describedby": ariaDescribedBy,
}: DatePickerFieldProps) {
  const isDesktop = useDesktopDatePicker();
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [draft, setDraft] = useState(() =>
    value ? formatLocalizedCalendarDate(value, locale) : "",
  );
  const [validationError, setValidationError] = useState<string | undefined>(
    () => controlledValueError({ value, locale, required, min, max }),
  );
  const previousControlled = useRef({
    value,
    locale,
    required,
    min,
    max,
  });
  const lastEmittedValue = useRef<string | null | undefined>(undefined);
  const currentValidity = useRef(validationError === undefined);
  const fieldRef = useRef<HTMLDivElement>(null);
  const calendarContentRef = useRef<HTMLDivElement>(null);
  const desktopInputRef = useRef<HTMLInputElement>(null);
  const focusCalendarOnOpen = useRef(false);
  const restoreDesktopInputFocus = useRef(false);
  const canClear = allowClear && !required;
  const minimumSelection = selectionMin ?? min;
  const preservesControlledSelection =
    value !== null &&
    selectionMin !== undefined &&
    validateCanonicalCalendarDate({ value, min, max }).ok &&
    !validateCanonicalCalendarDate({
      value,
      min: minimumSelection,
      max,
    }).ok;
  const [editingPreservedSelection, setEditingPreservedSelection] =
    useState(false);

  function isPreservedDraft(nextDraft: string) {
    return (
      preservesControlledSelection &&
      value !== null &&
      nextDraft === formatLocalizedCalendarDate(value, locale)
    );
  }

  function reportValidity(valid: boolean) {
    currentValidity.current = valid;
    onValidityChange?.(valid);
  }

  useEffect(() => {
    onValidityChange?.(currentValidity.current);
  }, [onValidityChange]);

  useEffect(() => {
    if (!disabled && restoreDesktopInputFocus.current) {
      restoreDesktopInputFocus.current = false;
      desktopInputRef.current?.focus();
    }
  }, [disabled]);

  useEffect(() => {
    if (
      value === previousControlled.current.value &&
      locale === previousControlled.current.locale &&
      required === previousControlled.current.required &&
      min === previousControlled.current.min &&
      max === previousControlled.current.max
    ) {
      return;
    }
    previousControlled.current = { value, locale, required, min, max };
    lastEmittedValue.current = undefined;
    setDraft(value ? formatLocalizedCalendarDate(value, locale) : "");
    const nextError = controlledValueError({
      value,
      locale,
      required,
      min,
      max,
    });
    setValidationError(nextError);
    const valid = nextError === undefined;
    currentValidity.current = valid;
    onValidityChange?.(valid);
  }, [locale, max, min, onValidityChange, required, value]);

  function emitAction(nextValue: string | null) {
    setDraft(nextValue ? formatLocalizedCalendarDate(nextValue, locale) : "");
    setValidationError(undefined);
    reportValidity(true);
    if (nextValue !== value && nextValue !== lastEmittedValue.current) {
      lastEmittedValue.current = nextValue;
      onValueChange(nextValue);
    }
  }

  const todayIsInBounds =
    today !== null &&
    validateCanonicalCalendarDate({
      value: today,
      min: minimumSelection,
      max,
    }).ok;
  const errorId = `${id}-error`;
  const describedBy = [ariaDescribedBy, validationError ? errorId : undefined]
    .filter(Boolean)
    .join(" ");
  const actions = (
    <>
      {allowToday && today !== null && (
        <Button
          type="button"
          variant="quiet"
          size="compact"
          className="min-h-11 sm:min-h-8"
          disabled={disabled || !todayIsInBounds}
          onClick={() => {
            if (todayIsInBounds) {
              if (isDesktop) restoreDesktopInputFocus.current = true;
              emitAction(today);
              setCalendarOpen(false);
            }
          }}
        >
          Today
        </Button>
      )}
      {canClear && value !== null && (
        <Button
          type="button"
          variant="quiet"
          size="compact"
          className="min-h-11 sm:min-h-8"
          disabled={disabled}
          onClick={() => {
            if (isDesktop) restoreDesktopInputFocus.current = true;
            emitAction(null);
            setCalendarOpen(false);
          }}
        >
          Clear
        </Button>
      )}
    </>
  );

  function validateDraft() {
    if (draft === "") {
      if (canClear) {
        setValidationError(undefined);
        reportValidity(true);
        if (value !== null && lastEmittedValue.current !== null) {
          lastEmittedValue.current = null;
          onValueChange(null);
        }
      } else {
        setValidationError("Enter a date.");
        reportValidity(false);
      }
      return;
    }

    if (isPreservedDraft(draft)) {
      setValidationError(undefined);
      reportValidity(true);
      return;
    }

    const result = parseLocalizedCalendarDate({
      value: draft,
      locale,
      min: minimumSelection,
      max,
    });
    if (result.ok) {
      setValidationError(undefined);
      reportValidity(true);
      if (result.value !== value && result.value !== lastEmittedValue.current) {
        lastEmittedValue.current = result.value;
        onValueChange(result.value);
      }
      return;
    }

    setValidationError(
      validationMessage({
        error: result.error,
        locale,
        min: minimumSelection,
        max,
      }),
    );
    reportValidity(false);
  }

  const sharedInputProps = {
    "aria-label": ariaLabel,
    "aria-labelledby": ariaLabelledBy,
    "aria-describedby": describedBy || undefined,
    "aria-invalid": validationError ? true : undefined,
    id,
    required,
    disabled,
    className: "w-auto min-w-40",
  };

  const selectedDate = useMemo(
    () => (value ? calendarDateToLocalDate(value) : undefined),
    [value],
  );
  const authoritativeToday = useMemo(
    () => (today ? calendarDateToLocalDate(today) : undefined),
    [today],
  );
  const openingDate = selectedDate ?? authoritativeToday;
  const [visibleMonth, setVisibleMonth] = useState(openingDate);

  useEffect(() => {
    if (openingDate) setVisibleMonth(openingDate);
  }, [openingDate]);

  function handleCompositeBlur(nextTarget: EventTarget | null) {
    if (
      nextTarget instanceof Node &&
      (fieldRef.current?.contains(nextTarget) ||
        calendarContentRef.current?.contains(nextTarget))
    ) {
      return;
    }
    if (
      nextTarget instanceof Element &&
      nextTarget.closest('[data-slot="select-content"]')
    ) {
      return;
    }
    validateDraft();
  }

  const calendarBounds = openingDate
    ? getCalendarBounds({
        today: authoritativeToday,
        selected: selectedDate,
        min: minimumSelection,
        max,
      })
    : undefined;

  function openDesktopCalendar({ focusCalendar }: { focusCalendar: boolean }) {
    if (disabled || !openingDate) return;
    focusCalendarOnOpen.current = focusCalendar;
    setVisibleMonth(openingDate);
    setCalendarOpen(true);
  }

  const input = isDesktop ? (
    <Popover
      open={calendarOpen}
      onOpenChange={(open) => {
        if (open && openingDate) setVisibleMonth(openingDate);
        setCalendarOpen(open && openingDate !== undefined);
      }}
    >
      <PopoverAnchor asChild>
        <div className="flex w-full min-w-40 items-center gap-2 rounded-xl border border-primary/25 bg-quiet-panel px-3 shadow-[inset_0_1px_0_color-mix(in_oklab,var(--color-card)_90%,transparent),0_5px_16px_color-mix(in_oklab,var(--color-primary)_8%,transparent)] transition-[border-color,box-shadow] focus-within:border-primary/60 focus-within:ring-3 focus-within:ring-ring/15 has-[input[aria-invalid=true]]:border-destructive has-[input[aria-invalid=true]]:ring-3 has-[input[aria-invalid=true]]:ring-destructive/20 sm:w-52">
          <Input
            {...sharedInputProps}
            ref={desktopInputRef}
            type="text"
            inputMode="numeric"
            role={openingDate ? "combobox" : undefined}
            value={draft}
            aria-haspopup={openingDate ? "dialog" : undefined}
            aria-expanded={openingDate ? calendarOpen : undefined}
            aria-controls={calendarOpen ? `${id}-calendar-dialog` : undefined}
            className="h-10 min-w-0 flex-1 border-0 bg-transparent px-0 shadow-none focus-visible:border-transparent focus-visible:ring-0"
            onClick={() => openDesktopCalendar({ focusCalendar: false })}
            onChange={(event) => {
              const nextDraft = event.target.value;
              setDraft(nextDraft);
              setValidationError(undefined);
              reportValidity(
                isPreservedDraft(nextDraft) ||
                  (nextDraft === ""
                    ? canClear
                    : parseLocalizedCalendarDate({
                        value: nextDraft,
                        locale,
                        min: minimumSelection,
                        max,
                      }).ok),
              );
            }}
            onKeyDown={(event) => {
              if (event.altKey && event.key === "ArrowDown") {
                event.preventDefault();
                openDesktopCalendar({ focusCalendar: true });
                return;
              }
              if (event.key === "Enter") validateDraft();
            }}
          />
          <span
            aria-hidden="true"
            className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary [&_svg]:size-4"
          >
            <CalendarDaysIcon />
          </span>
        </div>
      </PopoverAnchor>
      {openingDate && calendarBounds && (
        <PopoverContent
          id={`${id}-calendar-dialog`}
          ref={calendarContentRef}
          role="dialog"
          aria-label="Choose date"
          className="w-[252px] gap-1 rounded-xl border border-primary/20 p-1.5 ring-0"
          onOpenAutoFocus={(event) => {
            if (!focusCalendarOnOpen.current) event.preventDefault();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (!desktopInputRef.current?.disabled) {
              restoreDesktopInputFocus.current = false;
              desktopInputRef.current?.focus();
            }
          }}
          onBlur={(event) => handleCompositeBlur(event.relatedTarget)}
        >
          <Calendar
            mode="single"
            required
            autoFocus={focusCalendarOnOpen.current}
            selected={selectedDate}
            today={authoritativeToday ?? NO_AUTHORITATIVE_TODAY}
            modifiers={{ authoritativeToday }}
            locale={locale === "en-US" ? dayPickerEnUS : dayPickerEnGB}
            month={visibleMonth}
            onMonthChange={setVisibleMonth}
            startMonth={calendarBounds.start}
            endMonth={calendarBounds.end}
            captionLayout="dropdown"
            navLayout="around"
            disabled={[
              ...(calendarBounds.minimum
                ? [{ before: calendarBounds.minimum }]
                : []),
              ...(calendarBounds.maximum
                ? [{ after: calendarBounds.maximum }]
                : []),
            ]}
            onSelect={(date) => {
              const nextValue = localDateToCalendarDate(date);
              if (!nextValue) return;
              restoreDesktopInputFocus.current = true;
              emitAction(nextValue);
              setCalendarOpen(false);
            }}
          />
          {(allowToday || (canClear && value !== null)) && (
            <div className="flex items-center justify-end gap-1 border-t border-border px-1 pt-1">
              {actions}
            </div>
          )}
        </PopoverContent>
      )}
    </Popover>
  ) : (
    <Input
      {...sharedInputProps}
      type="date"
      min={
        preservesControlledSelection && !editingPreservedSelection
          ? undefined
          : minimumSelection
      }
      max={max}
      value={editingPreservedSelection ? "" : (value ?? "")}
      onFocus={() => {
        if (preservesControlledSelection) {
          setEditingPreservedSelection(true);
        }
      }}
      onBlur={() => {
        if (preservesControlledSelection) {
          setEditingPreservedSelection(false);
          setValidationError(undefined);
          reportValidity(true);
        }
      }}
      onChange={(event) => {
        const nextValue = event.target.value;
        if (nextValue === "") {
          if (canClear) emitAction(null);
          else {
            setValidationError("Enter a date.");
            reportValidity(false);
          }
          return;
        }

        const result = validateCanonicalCalendarDate({
          value: nextValue,
          min: minimumSelection,
          max,
        });
        if (result.ok) {
          setEditingPreservedSelection(false);
          emitAction(result.value);
          return;
        }

        setValidationError(
          validationMessage({
            error: result.error,
            locale,
            min: minimumSelection,
            max,
          }),
        );
        reportValidity(false);
      }}
    />
  );

  return (
    <div
      ref={fieldRef}
      className="grid gap-2"
      onBlur={
        isDesktop
          ? (event) => {
              handleCompositeBlur(event.relatedTarget);
            }
          : undefined
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        {input}
        {!isDesktop && actions}
      </div>
      {validationError && (
        <FieldError id={errorId}>{validationError}</FieldError>
      )}
    </div>
  );
}

interface CalendarBoundsOptions {
  today?: Date;
  selected?: Date;
  min?: string;
  max?: string;
}

interface CalendarBounds {
  start: Date;
  end: Date;
  minimum?: Date;
  maximum?: Date;
}

function getCalendarBounds({
  today,
  selected,
  min,
  max,
}: CalendarBoundsOptions): CalendarBounds {
  const anchor = today ?? selected;
  if (!anchor) throw new Error("Calendar bounds require an opening date.");

  const selectedYear = selected?.getFullYear();
  const startYear = Math.max(
    1,
    Math.min(
      anchor.getFullYear() - 100,
      selectedYear ?? Number.POSITIVE_INFINITY,
    ),
  );
  const endYear = Math.min(
    9999,
    Math.max(
      anchor.getFullYear() + 20,
      selectedYear ?? Number.NEGATIVE_INFINITY,
    ),
  );
  const rangeStart = calendarDateToLocalDate(
    `${String(startYear).padStart(4, "0")}-01-01`,
  );
  const rangeEnd = calendarDateToLocalDate(
    `${String(endYear).padStart(4, "0")}-12-31`,
  );
  if (!rangeStart || !rangeEnd) {
    throw new Error("Calendar navigation range is invalid.");
  }

  const minimum = min ? calendarDateToLocalDate(min) : undefined;
  const maximum = max ? calendarDateToLocalDate(max) : undefined;
  return {
    start:
      minimum && minimum.getTime() > rangeStart.getTime()
        ? minimum
        : rangeStart,
    end: maximum && maximum.getTime() < rangeEnd.getTime() ? maximum : rangeEnd,
    minimum,
    maximum,
  };
}

interface ValidationMessageOptions {
  error: CalendarDateValidationError;
  locale: DatePickerLocale;
  min?: string;
  max?: string;
}

interface ControlledValueErrorOptions {
  value: string | null;
  locale: DatePickerLocale;
  required: boolean;
  min?: string;
  max?: string;
}

function controlledValueError({
  value,
  locale,
  required,
  min,
  max,
}: ControlledValueErrorOptions): string | undefined {
  if (value === null) return required ? "Enter a date." : undefined;
  const result = validateCanonicalCalendarDate({ value, min, max });
  return result.ok
    ? undefined
    : validationMessage({ error: result.error, locale, min, max });
}

function validationMessage({
  error,
  locale,
  min,
  max,
}: ValidationMessageOptions): string {
  const format = locale === "en-US" ? "MM/DD/YYYY" : "DD/MM/YYYY";
  switch (error) {
    case "incomplete":
      return `Complete the date in ${format} format.`;
    case "malformed":
      return `Enter a date in ${format} format.`;
    case "impossible":
      return "Enter a real calendar date.";
    case "before-min":
      return `Enter a date on or after ${formatLocalizedCalendarDate(min ?? "", locale)}.`;
    case "after-max":
      return `Enter a date on or before ${formatLocalizedCalendarDate(max ?? "", locale)}.`;
  }
}

function fixedDateOutsideSupportedRange(): Date {
  const date = new Date(0);
  date.setHours(12, 0, 0, 0);
  date.setFullYear(0, 0, 1);
  return date;
}

function useDesktopDatePicker(): boolean {
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window === "undefined" || !window.matchMedia
      ? false
      : window.matchMedia(DESKTOP_DATE_PICKER_QUERY).matches,
  );

  useEffect(() => {
    if (!window.matchMedia) return;
    const query = window.matchMedia(DESKTOP_DATE_PICKER_QUERY);
    const update = () => setIsDesktop(query.matches);
    query.addEventListener("change", update);
    update();
    return () => query.removeEventListener("change", update);
  }, []);

  return isDesktop;
}
