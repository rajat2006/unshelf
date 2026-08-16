// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stubMatchMedia } from "@/test-support/stub-match-media";
import { DatePickerField } from "./date-picker-field";

beforeEach(() => {
  stubMatchMedia(true);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("DatePickerField", () => {
  it("reports the initial controlled value as valid when requested", () => {
    const onValidityChange = vi.fn();
    render(
      <DatePickerField
        id="target-date"
        aria-label="Target date"
        value="2026-08-16"
        today="2026-08-16"
        locale="en-US"
        onValueChange={vi.fn()}
        onValidityChange={onValidityChange}
      />,
    );

    expect(onValidityChange).toHaveBeenCalledWith(true);
  });

  it("reports a controlled required-empty value as invalid", () => {
    const onValidityChange = vi.fn();
    render(
      <DatePickerField
        id="target-date"
        aria-label="Target date"
        value={null}
        today="2026-08-16"
        locale="en-US"
        required
        onValueChange={vi.fn()}
        onValidityChange={onValidityChange}
      />,
    );

    expect(onValidityChange).toHaveBeenCalledWith(false);
    expect(screen.getByLabelText("Target date")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a date.");
  });

  it("commits a valid localized desktop draft on Enter", () => {
    const onValueChange = vi.fn();
    render(
      <DatePickerField
        id="target-date"
        aria-label="Target date"
        value="2026-08-16"
        today="2026-08-16"
        locale="en-GB"
        onValueChange={onValueChange}
      />,
    );

    const input = screen.getByLabelText("Target date");
    expect(input).toHaveAttribute("type", "text");
    expect(input).toHaveValue("16/08/2026");

    fireEvent.change(input, { target: { value: "29/02/2028" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onValueChange).toHaveBeenCalledWith("2028-02-29");
  });

  it("retains an impossible draft with an associated error and emits no value", () => {
    const onValueChange = vi.fn();
    const onValidityChange = vi.fn();
    render(
      <>
        <p id="target-help">Helpful date guidance</p>
        <DatePickerField
          id="target-date"
          aria-label="Target date"
          aria-describedby="target-help"
          value="2026-08-16"
          today="2026-08-16"
          locale="en-US"
          onValueChange={onValueChange}
          onValidityChange={onValidityChange}
        />
      </>,
    );

    const input = screen.getByLabelText("Target date");
    fireEvent.change(input, { target: { value: "02/29/2023" } });
    expect(onValidityChange).toHaveBeenLastCalledWith(false);

    fireEvent.keyDown(input, { key: "Enter" });

    expect(input).toHaveValue("02/29/2023");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription(
      "Helpful date guidance Enter a real calendar date.",
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Enter a real calendar date.",
    );
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it("commits a valid draft when focus leaves the field", () => {
    const onValueChange = vi.fn();
    render(
      <DatePickerField
        id="target-date"
        aria-label="Target date"
        value={null}
        today="2026-08-16"
        locale="en-US"
        onValueChange={onValueChange}
      />,
    );

    const input = screen.getByLabelText("Target date");
    fireEvent.change(input, { target: { value: "12/31/2026" } });
    fireEvent.blur(input, { relatedTarget: null });

    expect(onValueChange).toHaveBeenCalledWith("2026-12-31");
  });

  it("emits an empty draft only when the optional field permits Clear", () => {
    const onValueChange = vi.fn();
    const { rerender } = render(
      <DatePickerField
        id="target-date"
        aria-label="Target date"
        value="2026-08-16"
        today="2026-08-16"
        locale="en-US"
        allowClear
        onValueChange={onValueChange}
      />,
    );

    const input = screen.getByLabelText("Target date");
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onValueChange).toHaveBeenCalledWith(null);

    onValueChange.mockClear();
    rerender(
      <DatePickerField
        id="target-date"
        aria-label="Target date"
        value="2026-08-16"
        today="2026-08-16"
        locale="en-US"
        allowClear
        required
        onValueChange={onValueChange}
      />,
    );
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(screen.getByRole("alert")).toHaveTextContent("Enter a date.");
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it("keeps an out-of-bounds draft visible with the applicable bound", () => {
    const onValueChange = vi.fn();
    render(
      <DatePickerField
        id="target-date"
        aria-label="Target date"
        value="2026-08-16"
        today="2026-08-16"
        locale="en-GB"
        min="2026-01-01"
        max="2026-12-31"
        onValueChange={onValueChange}
      />,
    );

    const input = screen.getByLabelText("Target date");
    fireEvent.change(input, { target: { value: "31/12/2025" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(input).toHaveValue("31/12/2025");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Enter a date on or after 01/01/2026.",
    );
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it("defers validation within the composite and exposes optional Today and Clear actions", () => {
    const onValueChange = vi.fn();
    render(
      <DatePickerField
        id="target-date"
        aria-label="Target date"
        value="2026-09-01"
        today="2026-08-16"
        locale="en-US"
        allowToday
        allowClear
        onValueChange={onValueChange}
      />,
    );

    const input = screen.getByLabelText("Target date");
    const today = screen.getByRole("button", { name: "Today" });
    fireEvent.change(input, { target: { value: "02/29/20" } });
    fireEvent.blur(input, { relatedTarget: today });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    fireEvent.click(today);
    expect(onValueChange).toHaveBeenCalledWith("2026-08-16");

    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(onValueChange).toHaveBeenCalledWith(null);
  });

  it("preserves an active draft for the same value and replaces it for a changed value", () => {
    const onValueChange = vi.fn();
    const field = (value: string) => (
      <DatePickerField
        id="target-date"
        aria-label="Target date"
        value={value}
        today="2026-08-16"
        locale="en-US"
        onValueChange={onValueChange}
      />
    );
    const { rerender } = render(field("2026-08-16"));
    const input = screen.getByLabelText("Target date");

    fireEvent.change(input, { target: { value: "02/29/20" } });
    fireEvent.keyDown(input, { key: "Enter" });
    rerender(field("2026-08-16"));
    expect(input).toHaveValue("02/29/20");
    expect(input).toHaveAttribute("aria-invalid", "true");

    rerender(field("2027-03-04"));
    expect(input).toHaveValue("03/04/2027");
    expect(input).not.toHaveAttribute("aria-invalid");
  });

  it("mounts one canonical native input outside the desktop fine-pointer mode", () => {
    stubMatchMedia(false);
    const onValueChange = vi.fn();
    render(
      <DatePickerField
        id="target-date"
        aria-label="Target date"
        value="2026-08-16"
        today="2026-08-16"
        min="0001-01-01"
        max="9999-12-31"
        allowToday
        allowClear
        onValueChange={onValueChange}
      />,
    );

    const inputs = screen.getAllByLabelText("Target date");
    expect(inputs).toHaveLength(1);
    expect(inputs[0]).toHaveAttribute("type", "date");
    expect(inputs[0]).toHaveValue("2026-08-16");

    fireEvent.change(inputs[0], { target: { value: "2027-03-04" } });
    expect(onValueChange).toHaveBeenCalledWith("2027-03-04");
  });

  it("does not emit a native empty value when the field is required", () => {
    stubMatchMedia(false);
    const onValueChange = vi.fn();
    render(
      <DatePickerField
        id="target-date"
        aria-label="Target date"
        value="2026-08-16"
        today="2026-08-16"
        required
        allowClear
        onValueChange={onValueChange}
      />,
    );

    const input = screen.getByLabelText("Target date");
    expect(
      screen.queryByRole("button", { name: "Clear" }),
    ).not.toBeInTheDocument();
    fireEvent.change(input, { target: { value: "" } });

    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a date.");
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it("reports a native value outside the supplied bounds without emitting it", () => {
    stubMatchMedia(false);
    const onValueChange = vi.fn();
    render(
      <DatePickerField
        id="target-date"
        aria-label="Target date"
        value="2026-08-16"
        today="2026-08-16"
        locale="en-US"
        min="2026-01-01"
        onValueChange={onValueChange}
      />,
    );

    fireEvent.change(screen.getByLabelText("Target date"), {
      target: { value: "2025-12-31" },
    });

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Enter a date on or after 01/01/2026.",
    );
    expect(onValueChange).not.toHaveBeenCalled();
  });
});
