import { describe, expect, it } from "vitest";
import {
  calendarDateToLocalDate,
  formatLocalizedCalendarDate,
  localDateToCalendarDate,
  parseLocalizedCalendarDate,
  validateCanonicalCalendarDate,
} from "./calendar-date";

describe("calendar date adapter", () => {
  it("formats calendar fields in the selected locale, including years below 100", () => {
    expect(formatLocalizedCalendarDate("0004-02-29", "en-US")).toBe(
      "02/29/0004",
    );
    expect(formatLocalizedCalendarDate("2026-08-16", "en-GB")).toBe(
      "16/08/2026",
    );
  });

  it("strictly parses localized real calendar dates", () => {
    expect(
      parseLocalizedCalendarDate({ value: "02/29/2024", locale: "en-US" }),
    ).toEqual({ ok: true, value: "2024-02-29" });
    expect(
      parseLocalizedCalendarDate({ value: "29/02/0004", locale: "en-GB" }),
    ).toEqual({ ok: true, value: "0004-02-29" });
    expect(
      parseLocalizedCalendarDate({ value: "02/29/2023", locale: "en-US" }),
    ).toEqual({ ok: false, error: "impossible" });
    expect(
      parseLocalizedCalendarDate({ value: "2/29/2024", locale: "en-US" }),
    ).toEqual({ ok: false, error: "malformed" });
    expect(
      parseLocalizedCalendarDate({ value: "02/29/20", locale: "en-US" }),
    ).toEqual({ ok: false, error: "incomplete" });
  });

  it("rejects otherwise valid values outside the supplied bounds", () => {
    expect(
      parseLocalizedCalendarDate({
        value: "12/31/2025",
        locale: "en-US",
        min: "2026-01-01",
      }),
    ).toEqual({ ok: false, error: "before-min" });
    expect(
      parseLocalizedCalendarDate({
        value: "01/01/2027",
        locale: "en-US",
        max: "2026-12-31",
      }),
    ).toEqual({ ok: false, error: "after-max" });
  });

  it("validates canonical values and bounds through the shared contract", () => {
    expect(
      validateCanonicalCalendarDate({
        value: "2026-02-29",
        min: "2026-01-01",
        max: "2026-12-31",
      }),
    ).toEqual({ ok: false, error: "impossible" });
    expect(
      validateCanonicalCalendarDate({
        value: "2025-12-31",
        min: "2026-01-01",
      }),
    ).toEqual({ ok: false, error: "before-min" });
    expect(
      validateCanonicalCalendarDate({
        value: "2027-01-01",
        max: "2026-12-31",
      }),
    ).toEqual({ ok: false, error: "after-max" });
    expect(validateCanonicalCalendarDate({ value: "0004-02-29" })).toEqual({
      ok: true,
      value: "0004-02-29",
    });
  });

  it("keeps DST-boundary calendar fields stable across process timezones", () => {
    const originalTimezone = process.env.TZ;
    const observedHours = new Set<number>();
    try {
      for (const timezone of [
        "UTC",
        "America/Los_Angeles",
        "Pacific/Auckland",
      ]) {
        process.env.TZ = timezone;
        observedHours.add(new Date("2024-03-10T07:30:00Z").getHours());
        expect(
          parseLocalizedCalendarDate({
            value: "03/10/2024",
            locale: "en-US",
          }),
        ).toEqual({ ok: true, value: "2024-03-10" });
        expect(formatLocalizedCalendarDate("2024-11-03", "en-US")).toBe(
          "11/03/2024",
        );
      }
      expect(observedHours.size).toBeGreaterThan(1);
    } finally {
      if (originalTimezone === undefined) delete process.env.TZ;
      else process.env.TZ = originalTimezone;
    }
  });

  it("round-trips local calendar dates without timezone conversion, including years below 100", () => {
    const originalTimezone = process.env.TZ;
    try {
      for (const timezone of [
        "UTC",
        "America/Los_Angeles",
        "Pacific/Auckland",
      ]) {
        process.env.TZ = timezone;
        const earlyLeapDay = calendarDateToLocalDate("0004-02-29");
        expect(earlyLeapDay?.getFullYear()).toBe(4);
        expect(earlyLeapDay?.getMonth()).toBe(1);
        expect(earlyLeapDay?.getDate()).toBe(29);
        expect(localDateToCalendarDate(earlyLeapDay!)).toBe("0004-02-29");
      }
    } finally {
      if (originalTimezone === undefined) delete process.env.TZ;
      else process.env.TZ = originalTimezone;
    }
  });
});
