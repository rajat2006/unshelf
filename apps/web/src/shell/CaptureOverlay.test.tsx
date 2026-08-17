// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { useCallback, useState } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { Type, type SourceInspectionResponse } from "@unshelf/shared";
import { ApplicationAuthProvider } from "../application-auth/ApplicationAuthProvider";
import type { ApplicationAuth } from "../application-auth/types";
import { captureItem, inspectSource } from "../api";
import { CaptureOverlay } from "./CaptureOverlay";
import { CaptureProvider } from "./CaptureProvider";
import { useCapture } from "./useCapture";
import { useCaptureListener } from "./useCaptureListener";

vi.mock("../api", () => ({ captureItem: vi.fn(), inspectSource: vi.fn() }));

const auth: ApplicationAuth = {
  status: "signed-in",
  user: { getToken: async () => null },
  SignInButton: ({ children }) => children,
  UserButton: () => <button type="button">Account</button>,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function pasteSource(
  control: HTMLElement,
  pastedText: string,
  resultingValue = pastedText,
): void {
  fireEvent.paste(control, {
    clipboardData: { getData: () => pastedText },
  });
  fireEvent.change(control, { target: { value: resultingValue } });
}

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
    vi.useRealTimers();
    cleanup();
    vi.mocked(captureItem).mockReset();
    vi.mocked(inspectSource).mockReset();
  });

  it("inspects an eligible typed Source after a resettable pause", async () => {
    vi.useFakeTimers();
    vi.mocked(inspectSource).mockReturnValue(new Promise(() => undefined));
    render(<CaptureHarness />);

    const source = screen.getByLabelText("Source");
    fireEvent.change(source, {
      target: { value: "https://example.com/first" },
    });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    fireEvent.change(source, {
      target: { value: "https://example.com/final" },
    });
    act(() => {
      vi.advanceTimersByTime(299);
    });
    expect(inspectSource).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(inspectSource).toHaveBeenCalledOnce();
    expect(inspectSource).toHaveBeenCalledWith(
      auth.user,
      { source: "https://example.com/final" },
      expect.any(AbortSignal),
    );
  });

  it("immediately inspects the complete value produced by a paste", () => {
    vi.useFakeTimers();
    vi.mocked(inspectSource).mockReturnValue(new Promise(() => undefined));
    render(<CaptureHarness />);

    const source = screen.getByLabelText("Source");
    fireEvent.change(source, {
      target: { value: "https://example.com/" },
    });
    pasteSource(source, "article", "https://example.com/article");

    expect(source).toHaveValue("https://example.com/article");
    expect(inspectSource).toHaveBeenCalledOnce();
    expect(inspectSource).toHaveBeenCalledWith(
      auth.user,
      { source: "https://example.com/article" },
      expect.any(AbortSignal),
    );
  });

  it("aborts a replaced Source and ignores its late result", async () => {
    vi.useFakeTimers();
    const first = deferred<SourceInspectionResponse>();
    const second = deferred<SourceInspectionResponse>();
    vi.mocked(inspectSource)
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    render(<CaptureHarness />);

    const source = screen.getByLabelText("Source");
    pasteSource(source, "https://example.com/first");
    const firstSignal = vi.mocked(inspectSource).mock.calls[0]?.[2];
    pasteSource(source, "https://example.com/second");
    expect(firstSignal?.aborted).toBe(true);

    await act(async () => {
      second.resolve({
        status: "suggested",
        title: "Current title",
        titleEvidence: "document_title",
      });
      await second.promise;
    });
    await act(async () => {
      first.resolve({
        status: "suggested",
        title: "Stale title",
        titleEvidence: "document_title",
      });
      await first.promise;
    });

    expect(screen.getByLabelText("Title")).toHaveValue("Current title");
  });

  it("keeps User-owned fields while replacing untouched suggestions", async () => {
    vi.useFakeTimers();
    const first = deferred<SourceInspectionResponse>();
    const second = deferred<SourceInspectionResponse>();
    vi.mocked(inspectSource)
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    render(<CaptureHarness />);

    const source = screen.getByLabelText("Source");
    pasteSource(source, "https://example.com/first");
    await act(async () => {
      first.resolve({
        status: "suggested",
        title: "First title",
        titleEvidence: "open_graph",
        type: Type.Article,
        typeEvidence: "open_graph",
      });
      await first.promise;
    });
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "My title" },
    });

    pasteSource(source, "https://example.com/second");
    expect(screen.getByLabelText("Title")).toHaveValue("My title");
    expect(screen.getByLabelText("Type")).toHaveTextContent("Choose a type…");

    await act(async () => {
      second.resolve({
        status: "suggested",
        title: "Second title",
        titleEvidence: "document_title",
        type: Type.Course,
        typeEvidence: "schema_org",
      });
      await second.promise;
    });
    expect(screen.getByLabelText("Title")).toHaveValue("My title");
    expect(screen.getByLabelText("Type")).toHaveTextContent("Course");
  });

  it("treats clearing as ownership but focus alone as unowned", async () => {
    vi.useFakeTimers();
    const inspectionResult = deferred<SourceInspectionResponse>();
    vi.mocked(inspectSource).mockReturnValue(inspectionResult.promise);
    render(<CaptureHarness />);

    const title = screen.getByLabelText("Title");
    title.focus();
    fireEvent.change(title, { target: { value: "Temporary" } });
    fireEvent.change(title, { target: { value: "" } });
    pasteSource(screen.getByLabelText("Source"), "https://example.com/article");
    await act(async () => {
      inspectionResult.resolve({
        status: "suggested",
        title: "Publisher title",
        titleEvidence: "document_title",
        type: Type.Article,
        typeEvidence: "schema_org",
      });
      await inspectionResult.promise;
    });

    expect(title).toHaveValue("");
    expect(screen.getByLabelText("Type")).toHaveTextContent("Article");
  });

  it("allows a suggestion after focus without mutation", async () => {
    vi.useFakeTimers();
    const inspectionResult = deferred<SourceInspectionResponse>();
    vi.mocked(inspectSource).mockReturnValue(inspectionResult.promise);
    render(<CaptureHarness />);

    const title = screen.getByLabelText("Title");
    title.focus();
    pasteSource(screen.getByLabelText("Source"), "https://example.com/article");
    await act(async () => {
      inspectionResult.resolve({
        status: "suggested",
        title: "Publisher title",
        titleEvidence: "document_title",
      });
      await inspectionResult.promise;
    });

    expect(title).toHaveValue("Publisher title");
    expect(title).toHaveFocus();
  });

  it("leaves inspecting after three seconds and retries only on request", async () => {
    vi.useFakeTimers();
    const first = deferred<SourceInspectionResponse>();
    const retry = deferred<SourceInspectionResponse>();
    vi.mocked(inspectSource)
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(retry.promise);
    render(<CaptureHarness />);

    const status = screen.getByRole("status");
    expect(status).toBeEmptyDOMElement();
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveAttribute("aria-atomic", "true");
    pasteSource(screen.getByLabelText("Source"), "https://example.com/slow");
    expect(screen.getByRole("status")).toBe(status);
    expect(status).toHaveTextContent("Inspecting Source…");
    const firstSignal = vi.mocked(inspectSource).mock.calls[0]?.[2];

    act(() => {
      vi.advanceTimersByTime(2_999);
    });
    expect(status).toHaveTextContent("Inspecting Source…");
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(firstSignal?.aborted).toBe(true);
    expect(status).toHaveTextContent(
      "Source inspection unavailable. Continue manually.",
    );
    await act(async () => {
      first.resolve({
        status: "suggested",
        title: "Too late",
        titleEvidence: "document_title",
      });
      await first.promise;
    });
    expect(screen.getByLabelText("Title")).toHaveValue("");
    expect(status).toHaveTextContent(
      "Source inspection unavailable. Continue manually.",
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Retry Source inspection" }),
    );
    expect(inspectSource).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("status")).toBe(status);
    expect(status).toHaveTextContent("Inspecting Source…");

    const title = screen.getByLabelText("Title");
    title.focus();
    await act(async () => {
      retry.resolve({
        status: "suggested",
        type: Type.Video,
        typeEvidence: "open_graph",
      });
      await retry.promise;
    });
    expect(status).toHaveTextContent("Suggested Type.");
    expect(
      screen.queryByRole("button", { name: "Retry Source inspection" }),
    ).not.toBeInTheDocument();
    expect(title).toHaveFocus();
  });

  it("preserves User-owned fields across an unavailable result and Retry", async () => {
    const unavailable = deferred<SourceInspectionResponse>();
    const retry = deferred<SourceInspectionResponse>();
    vi.mocked(inspectSource)
      .mockReturnValueOnce(unavailable.promise)
      .mockReturnValueOnce(retry.promise);
    render(<CaptureHarness />);

    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "My title" },
    });
    fireEvent.click(screen.getByLabelText("Type"));
    fireEvent.click(await screen.findByRole("option", { name: "Book" }));
    vi.useFakeTimers();
    pasteSource(screen.getByLabelText("Source"), "https://example.com/book");
    await act(async () => {
      unavailable.resolve({ status: "unavailable" });
      await unavailable.promise;
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Retry Source inspection" }),
    );
    expect(screen.getByLabelText("Title")).toHaveValue("My title");
    expect(screen.getByLabelText("Type")).toHaveTextContent("Book");
    expect(inspectSource).toHaveBeenCalledTimes(2);
  });

  it("keeps ineligible Source text on the manual Capture path", () => {
    vi.useFakeTimers();
    render(<CaptureHarness />);

    fireEvent.change(screen.getByLabelText("Source"), {
      target: { value: "course://private-notes" },
    });
    act(() => {
      vi.advanceTimersByTime(3_300);
    });

    expect(inspectSource).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Source")).toHaveValue(
      "course://private-notes",
    );
    expect(screen.getByRole("status")).toBeEmptyDOMElement();

    fireEvent.change(screen.getByLabelText("Source"), {
      target: { value: `https://example.com/${"é".repeat(4_100)}` },
    });
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(inspectSource).not.toHaveBeenCalled();
  });

  it("opens with Source first and focused", async () => {
    render(<CaptureHarness />);

    const source = await screen.findByLabelText("Source");
    const title = screen.getByLabelText("Title");
    expect(source.compareDocumentPosition(title)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    await waitFor(() => expect(source).toHaveFocus());
  });

  it("suggests an editable Type and captures the exact pasted Source", async () => {
    const source = "  https://youtu.be/M7lc1UVf-VE?si=share-value  ";
    const inspectionResult = deferred<SourceInspectionResponse>();
    vi.mocked(inspectSource).mockReturnValue(inspectionResult.promise);
    vi.mocked(captureItem).mockResolvedValue(
      {} as Awaited<ReturnType<typeof captureItem>>,
    );
    render(<CaptureHarness />);
    vi.useFakeTimers();

    pasteSource(screen.getByLabelText("Source"), source);

    await act(async () => {
      inspectionResult.resolve({
        status: "suggested",
        type: Type.Video,
        typeEvidence: "youtube_route",
      });
      await inspectionResult.promise;
    });
    vi.useRealTimers();
    await waitFor(() =>
      expect(screen.getByLabelText("Type")).toHaveTextContent("Video"),
    );
    expect(screen.getByText("Suggested")).toBeVisible();
    expect(inspectSource).toHaveBeenCalledWith(
      auth.user,
      { source },
      expect.any(AbortSignal),
    );

    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Embedded player customization" },
    });
    fireEvent.click(screen.getByLabelText("Type"));
    fireEvent.click(await screen.findByRole("option", { name: "Playlist" }));
    fireEvent.click(screen.getByRole("button", { name: "Add to Library" }));

    await waitFor(() => expect(captureItem).toHaveBeenCalledOnce());
    expect(captureItem).toHaveBeenCalledWith(auth.user, {
      title: "Embedded player customization",
      type: "playlist",
      source,
    });
  });

  it("enables Add only for complete required fields and keeps validation guarded", async () => {
    render(<CaptureHarness />);

    const add = await screen.findByRole("button", { name: "Add to Library" });
    expect(add).toBeDisabled();
    fireEvent.submit(add.closest("form") as HTMLFormElement);

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

    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Ready to capture" },
    });
    expect(add).toBeDisabled();
    fireEvent.click(screen.getByLabelText("Type"));
    fireEvent.click(await screen.findByRole("option", { name: "Article" }));
    expect(add).toBeEnabled();
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

  it("keeps Add available during inspection and supersedes its late result", async () => {
    const inspectionResult = deferred<SourceInspectionResponse>();
    const captureResult = deferred<Awaited<ReturnType<typeof captureItem>>>();
    vi.mocked(inspectSource).mockReturnValue(inspectionResult.promise);
    vi.mocked(captureItem).mockReturnValue(captureResult.promise);
    render(<CaptureHarness />);

    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "User title" },
    });
    fireEvent.click(screen.getByLabelText("Type"));
    fireEvent.click(await screen.findByRole("option", { name: "Article" }));
    vi.useFakeTimers();
    pasteSource(screen.getByLabelText("Source"), "https://example.com/slow");
    const signal = vi.mocked(inspectSource).mock.calls[0]?.[2];
    const add = screen.getByRole("button", { name: "Add to Library" });
    expect(add).toBeEnabled();

    fireEvent.click(add);
    expect(signal?.aborted).toBe(true);
    await act(async () => {
      inspectionResult.resolve({
        status: "suggested",
        title: "Late title",
        titleEvidence: "open_graph",
        type: Type.Video,
        typeEvidence: "open_graph",
      });
      await inspectionResult.promise;
    });
    expect(screen.getByLabelText("Title")).toHaveValue("User title");
    expect(screen.getByLabelText("Type")).toHaveTextContent("Article");
    expect(captureItem).toHaveBeenCalledWith(auth.user, {
      title: "User title",
      type: "article",
      source: "https://example.com/slow",
    });

    vi.useRealTimers();
    await act(async () => {
      captureResult.resolve({} as Awaited<ReturnType<typeof captureItem>>);
      await captureResult.promise;
    });
  });

  it("aborts inspection on close and reopens with fresh Capture state", async () => {
    vi.useFakeTimers();
    const inspectionResult = deferred<SourceInspectionResponse>();
    vi.mocked(inspectSource).mockReturnValue(inspectionResult.promise);
    render(<CaptureHarness />);

    pasteSource(screen.getByLabelText("Source"), "https://example.com/slow");
    const signal = vi.mocked(inspectSource).mock.calls[0]?.[2];
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(signal?.aborted).toBe(true);
    await act(async () => {
      inspectionResult.resolve({
        status: "suggested",
        title: "Late title",
        titleEvidence: "document_title",
      });
      await inspectionResult.promise;
    });

    fireEvent.click(screen.getByRole("button", { name: "Capture" }));
    expect(screen.getByLabelText("Source")).toHaveValue("");
    expect(screen.getByLabelText("Title")).toHaveValue("");
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
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
    await waitFor(() => expect(screen.getByLabelText("Source")).toHaveFocus());
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
