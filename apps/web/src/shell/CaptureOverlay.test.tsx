// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { useCallback, useState } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { ApplicationAuthProvider } from "../application-auth/ApplicationAuthProvider";
import type { ApplicationAuth } from "../application-auth/types";
import { captureItem } from "../api";
import { CaptureOverlay } from "./CaptureOverlay";
import { CaptureProvider } from "./CaptureProvider";
import { useCapture } from "./useCapture";
import { useCaptureListener } from "./useCaptureListener";

vi.mock("../api", () => ({ captureItem: vi.fn() }));

const auth: ApplicationAuth = {
  status: "signed-in",
  user: { getToken: async () => null },
  SignInButton: ({ children }) => children,
  UserButton: () => <button type="button">Account</button>,
};

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

function CaptureHarness() {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <ApplicationAuthProvider auth={auth}>
      <button type="button" onClick={() => setIsOpen(true)}>
        Capture
      </button>
      <CaptureOverlay
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        onCaptured={() => undefined}
      />
    </ApplicationAuthProvider>
  );
}

function GlobalCaptureHarness() {
  return (
    <ApplicationAuthProvider auth={auth}>
      <CaptureProvider>
        <CaptureTrigger />
        <CapturedItems />
      </CaptureProvider>
    </ApplicationAuthProvider>
  );
}

function CaptureTrigger() {
  const capture = useCapture();
  return (
    <button type="button" onClick={capture.open}>
      Capture from Plan
    </button>
  );
}

function CapturedItems() {
  const [count, setCount] = useState(0);
  const increment = useCallback(() => setCount((current) => current + 1), []);
  useCaptureListener(increment);
  return <p>Captured Items: {count}</p>;
}

describe("global Capture", () => {
  afterEach(() => {
    cleanup();
    vi.mocked(captureItem).mockReset();
  });

  it("explains invalid required fields beside the controls", async () => {
    render(<CaptureHarness />);

    fireEvent.click(
      await screen.findByRole("button", { name: "Add to Library" }),
    );

    expect(screen.getByText("Enter a title.")).toBeVisible();
    expect(screen.getByText("Choose a type.")).toBeVisible();
    expect(screen.getByLabelText("Title")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(screen.getByLabelText("Type")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    await waitFor(() => expect(screen.getByLabelText("Title")).toHaveFocus());
    expect(captureItem).not.toHaveBeenCalled();
  });

  it("communicates progress and blocks duplicate submission", async () => {
    vi.mocked(captureItem).mockReturnValue(new Promise(() => undefined));
    render(<CaptureHarness />);

    fireEvent.change(await screen.findByLabelText("Title"), {
      target: { value: "Practical indexing" },
    });
    fireEvent.click(screen.getByLabelText("Type"));
    fireEvent.click(await screen.findByRole("option", { name: "Article" }));

    fireEvent.click(screen.getByRole("button", { name: "Add to Library" }));

    const submitting = await screen.findByRole("button", {
      name: "Adding to Library…",
    });
    expect(submitting).toBeDisabled();
    fireEvent.click(submitting);
    expect(captureItem).toHaveBeenCalledTimes(1);
  });

  it("contains request failure and preserves values for retry", async () => {
    vi.mocked(captureItem)
      .mockRejectedValueOnce(new Error("api responded 500"))
      .mockReturnValueOnce(new Promise(() => undefined));
    render(<CaptureHarness />);

    fireEvent.change(await screen.findByLabelText("Title"), {
      target: { value: "Reliable queues" },
    });
    fireEvent.click(screen.getByLabelText("Type"));
    fireEvent.click(await screen.findByRole("option", { name: "Course" }));
    fireEvent.change(screen.getByLabelText("Source"), {
      target: { value: "course://reliable-queues" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add to Library" }));

    expect(
      await screen.findByText(
        "Couldn't capture this Item. Check your connection and try again.",
      ),
    ).toBeVisible();
    expect(screen.getByRole("dialog", { name: "Capture" })).toBeVisible();
    expect(screen.getByLabelText("Title")).toHaveValue("Reliable queues");
    expect(screen.getByLabelText("Type")).toHaveTextContent("Course");
    expect(screen.getByLabelText("Source")).toHaveValue(
      "course://reliable-queues",
    );

    fireEvent.click(screen.getByRole("button", { name: "Add to Library" }));
    await waitFor(() => expect(captureItem).toHaveBeenCalledTimes(2));
  });

  it("closes successfully in place and returns focus to its opener", async () => {
    vi.mocked(captureItem).mockResolvedValue(
      {} as Awaited<ReturnType<typeof captureItem>>,
    );
    window.history.pushState({}, "", "/plans/plan-1");
    render(<GlobalCaptureHarness />);
    const trigger = screen.getByRole("button", { name: "Capture from Plan" });

    trigger.focus();
    fireEvent.click(trigger);
    await waitFor(() => expect(screen.getByLabelText("Title")).toHaveFocus());
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Systems thinking" },
    });
    fireEvent.click(screen.getByLabelText("Type"));
    fireEvent.click(await screen.findByRole("option", { name: "Book" }));
    fireEvent.click(screen.getByRole("button", { name: "Add to Library" }));

    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Capture" })).toBeNull(),
    );
    expect(screen.getByText("Captured Items: 1")).toBeVisible();
    expect(window.location.pathname).toBe("/plans/plan-1");
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(captureItem).toHaveBeenCalledWith(auth.user, {
      title: "Systems thinking",
      type: "book",
    });
  });

  it("dismisses with Escape and returns focus to its opener", async () => {
    render(<GlobalCaptureHarness />);
    const trigger = screen.getByRole("button", { name: "Capture from Plan" });
    trigger.focus();
    fireEvent.click(trigger);
    await screen.findByRole("dialog", { name: "Capture" });

    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Capture" })).toBeNull(),
    );
    await waitFor(() => expect(trigger).toHaveFocus());
  });
});
