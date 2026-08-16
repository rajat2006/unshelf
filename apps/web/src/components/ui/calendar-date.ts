export type DatePickerLocale = "en-US" | "en-GB";

interface CalendarDateParts {
  year: number;
  month: number;
  day: number;
}

export type CalendarDateValidationError =
  "incomplete" | "malformed" | "impossible" | "before-min" | "after-max";

export type CalendarDateParseResult =
  | { ok: true; value: string }
  | { ok: false; error: CalendarDateValidationError };

interface ParseLocalizedCalendarDateOptions {
  value: string;
  locale: DatePickerLocale;
  min?: string;
  max?: string;
}

interface ValidateCanonicalCalendarDateOptions {
  value: string;
  min?: string;
  max?: string;
}

export function resolveDatePickerLocale(
  languages: readonly string[],
): DatePickerLocale {
  const englishPreference = languages.find((language) =>
    language.toLowerCase().startsWith("en"),
  );
  return englishPreference?.toLowerCase() === "en-us" ? "en-US" : "en-GB";
}

export function formatLocalizedCalendarDate(
  value: string,
  locale: DatePickerLocale,
): string {
  const parts = parseCanonicalCalendarDate(value);
  if (!parts) return "";

  const year = String(parts.year).padStart(4, "0");
  const month = String(parts.month).padStart(2, "0");
  const day = String(parts.day).padStart(2, "0");
  return locale === "en-US"
    ? `${month}/${day}/${year}`
    : `${day}/${month}/${year}`;
}

export function parseLocalizedCalendarDate({
  value,
  locale,
  min,
  max,
}: ParseLocalizedCalendarDateOptions): CalendarDateParseResult {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  if (!match) {
    return {
      ok: false,
      error: isIncompleteLocalizedDate(value) ? "incomplete" : "malformed",
    };
  }

  const first = match[1];
  const second = match[2];
  const year = match[3];
  const month = locale === "en-US" ? first : second;
  const day = locale === "en-US" ? second : first;
  const canonical = `${year}-${month}-${day}`;

  return validateCanonicalCalendarDate({ value: canonical, min, max });
}

export function validateCanonicalCalendarDate({
  value,
  min,
  max,
}: ValidateCanonicalCalendarDateOptions): CalendarDateParseResult {
  if (!parseCanonicalCalendarDate(value)) {
    return { ok: false, error: "impossible" };
  }
  if (min && value < min) return { ok: false, error: "before-min" };
  if (max && value > max) return { ok: false, error: "after-max" };

  return { ok: true, value };
}

export function calendarDateToLocalDate(value: string): Date | undefined {
  const parts = parseCanonicalCalendarDate(value);
  if (!parts) return undefined;

  const date = new Date(0);
  date.setHours(12, 0, 0, 0);
  date.setFullYear(parts.year, parts.month - 1, parts.day);
  return date;
}

export function localDateToCalendarDate(value: Date): string | undefined {
  const year = value.getFullYear();
  const month = value.getMonth() + 1;
  const day = value.getDate();
  const canonical = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return parseCanonicalCalendarDate(canonical) ? canonical : undefined;
}

function parseCanonicalCalendarDate(value: string): CalendarDateParts | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12) return null;

  const daysInMonth = [
    31,
    isLeapYear(year) ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];
  if (day < 1 || day > daysInMonth[month - 1]) return null;

  return { year, month, day };
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function isIncompleteLocalizedDate(value: string): boolean {
  if (!/^[\d/]*$/.test(value)) return false;
  const segments = value.split("/");
  if (segments.length > 3) return false;

  return segments.every((segment, index) => {
    const isLast = index === segments.length - 1;
    const expectedLength = index === 2 ? 4 : 2;
    return isLast
      ? segment.length <= expectedLength
      : segment.length === expectedLength;
  });
}
