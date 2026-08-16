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
  const [validationError, setValidationError] = useState<string>();
  const previousControlled = useRef({ value, locale });
  const lastEmittedValue = useRef<string | null | undefined>(undefined);
  const currentValidity = useRef(true);

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
      locale === previousControlled.current.locale
    ) {
      return;
    }
    previousControlled.current = { value, locale };
    lastEmittedValue.current = undefined;
    setDraft(value ? formatLocalizedCalendarDate(value, locale) : "");
    setValidationError(undefined);
    currentValidity.current = true;
    onValidityChange?.(true);
  }, [locale, onValidityChange, value]);

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
      {allowClear && value !== null && (
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

  if (!isDesktop) {
    return (
      <div className="grid gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            aria-label={ariaLabel}
            aria-labelledby={ariaLabelledBy}
            aria-describedby={describedBy || undefined}
            aria-invalid={validationError ? true : undefined}
            id={id}
            type="date"
            required={required}
            disabled={disabled}
            min={min}
            max={max}
            value={value ?? ""}
            onChange={(event) => {
              const nextValue = event.target.value;
              if (nextValue === "") {
                if (allowClear && !required) emitAction(null);
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
              setValidationError(validationMessage(error, locale, min, max));
              reportValidity(false);
            }}
            className="w-auto min-w-40"
          />
          {actions}
        </div>
        {validationError && (
          <FieldError id={errorId}>{validationError}</FieldError>
        )}
      </div>
    );
  }

  function validateDraft() {
    if (draft === "") {
      if (allowClear && !required) {
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

    setValidationError(validationMessage(result.error, locale, min, max));
    reportValidity(false);
  }

  return (
    <div
      className="grid gap-2"
      onBlur={(event) => {
        const nextTarget = event.relatedTarget;
        if (
          nextTarget instanceof Node &&
          event.currentTarget.contains(nextTarget)
        ) {
          return;
        }
        validateDraft();
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Input
          aria-label={ariaLabel}
          aria-labelledby={ariaLabelledBy}
          aria-describedby={describedBy || undefined}
          aria-invalid={validationError ? true : undefined}
          id={id}
          type="text"
          required={required}
          disabled={disabled}
          inputMode="numeric"
          value={draft}
          onChange={(event) => {
            const nextDraft = event.target.value;
            setDraft(nextDraft);
            setValidationError(undefined);
            reportValidity(
              nextDraft === ""
                ? allowClear && !required
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
          className="w-auto min-w-40"
        />
        {actions}
      </div>
      {validationError && (
        <FieldError id={errorId}>{validationError}</FieldError>
      )}
    </div>
  );
}

function validationMessage(
  error: "incomplete" | "malformed" | "impossible" | "before-min" | "after-max",
  locale: DatePickerLocale,
  min?: string,
  max?: string,
): string {
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
