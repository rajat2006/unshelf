import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  formatLocalizedCalendarDate,
  parseLocalizedCalendarDate,
  resolveDatePickerLocale,
  type DatePickerLocale,
} from "@/components/ui/calendar-date";

const DESKTOP_DATE_PICKER_QUERY = "(min-width: 640px) and (pointer: fine)";

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
  max?: string;
  onValueChange: (value: string | null) => void;
  onValidityChange?: (valid: boolean) => void;
}

export function DatePickerField({
  id,
  value,
  today,
  locale = browserDatePickerLocale(),
  required = false,
  disabled = false,
  allowToday = false,
  allowClear = false,
  min,
  max,
  onValueChange,
  onValidityChange,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  "aria-describedby": ariaDescribedBy,
}: DatePickerFieldProps) {
  const isDesktop = useDesktopDatePicker();
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
  const canClear = allowClear && !required;

  function reportValidity(valid: boolean) {
    currentValidity.current = valid;
    onValidityChange?.(valid);
  }

  useEffect(() => {
    onValidityChange?.(currentValidity.current);
  }, [onValidityChange]);

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
    formatLocalizedCalendarDate(today, locale) !== "" &&
    (!min || today >= min) &&
    (!max || today <= max);
  const errorId = `${id}-error`;
  const describedBy = [ariaDescribedBy, validationError ? errorId : undefined]
    .filter(Boolean)
    .join(" ");
  const actions = (
    <>
      {allowToday && (
        <Button
          type="button"
          variant="quiet"
          size="compact"
          className="min-h-11 sm:min-h-8"
          disabled={disabled || !todayIsInBounds}
          onClick={() => {
            if (todayIsInBounds) emitAction(today);
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
          onClick={() => emitAction(null)}
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

    const result = parseLocalizedCalendarDate({
      value: draft,
      locale,
      min,
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
      validationMessage({ error: result.error, locale, min, max }),
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

  const input = isDesktop ? (
    <Input
      {...sharedInputProps}
      type="text"
      inputMode="numeric"
      value={draft}
      onChange={(event) => {
        const nextDraft = event.target.value;
        setDraft(nextDraft);
        setValidationError(undefined);
        reportValidity(
          nextDraft === ""
            ? canClear
            : parseLocalizedCalendarDate({
                value: nextDraft,
                locale,
                min,
                max,
              }).ok,
        );
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") validateDraft();
      }}
    />
  ) : (
    <Input
      {...sharedInputProps}
      type="date"
      min={min}
      max={max}
      value={value ?? ""}
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

        const isValid =
          formatLocalizedCalendarDate(nextValue, locale) !== "" &&
          (!min || nextValue >= min) &&
          (!max || nextValue <= max);
        if (isValid) {
          emitAction(nextValue);
          return;
        }

        const error =
          formatLocalizedCalendarDate(nextValue, locale) === ""
            ? "impossible"
            : min && nextValue < min
              ? "before-min"
              : "after-max";
        setValidationError(validationMessage({ error, locale, min, max }));
        reportValidity(false);
      }}
    />
  );

  return (
    <div
      className="grid gap-2"
      onBlur={
        isDesktop
          ? (event) => {
              const nextTarget = event.relatedTarget;
              if (
                nextTarget instanceof Node &&
                event.currentTarget.contains(nextTarget)
              ) {
                return;
              }
              validateDraft();
            }
          : undefined
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        {input}
        {actions}
      </div>
      {validationError && (
        <FieldError id={errorId}>{validationError}</FieldError>
      )}
    </div>
  );
}

interface ValidationMessageOptions {
  error: "incomplete" | "malformed" | "impossible" | "before-min" | "after-max";
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
  if (formatLocalizedCalendarDate(value, locale) === "") {
    return validationMessage({ error: "impossible", locale, min, max });
  }
  if (min && value < min) {
    return validationMessage({ error: "before-min", locale, min, max });
  }
  if (max && value > max) {
    return validationMessage({ error: "after-max", locale, min, max });
  }
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

function browserDatePickerLocale(): DatePickerLocale {
  return resolveDatePickerLocale(
    typeof navigator === "undefined" ? [] : navigator.languages,
  );
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
