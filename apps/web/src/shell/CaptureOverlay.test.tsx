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
import { Type } from "@unshelf/shared";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { ApplicationAuthProvider } from "../application-auth/ApplicationAuthProvider";
import type { ApplicationAuth } from "../application-auth/types";
import { captureItem } from "../api";
import { CaptureOverlay } from "./CaptureOverlay";
import { CaptureProvider } from "./CaptureProvider";
import { useCapture } from "./useCapture";
import { useCaptureListener } from "./useCaptureListener";
import { prepareYouTubeSourceInspection } from "./youtubeSourceInspection";

vi.mock("../api", () => ({ captureItem: vi.fn() }));
vi.mock("./youtubeSourceInspection", () => ({
  prepareYouTubeSourceInspection: vi.fn(),
}));

const auth: ApplicationAuth = {
  status: "signed-in",
  user: { getToken: async () => null },
  SignInButton: ({ children }) => children,
  UserButton: () => <button type="button">Account</button>,
};

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((fulfill) => {
    resolve = fulfill;
  });
  return { promise, resolve };
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
  beforeEach(() => {
    vi.mocked(prepareYouTubeSourceInspection).mockReturnValue(null);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.mocked(captureItem).mockReset();
    vi.mocked(prepareYouTubeSourceInspection).mockReset();
  });

  it("starts with Source and inspects once after one 300 ms pause", async () => {
    vi.useFakeTimers();
    let resolveTitle: (title: string | null) => void = () => undefined;
    const acquireTitle = vi.fn(
      () =>
        new Promise<string | null>((resolve) => {
          resolveTitle = resolve;
        }),
    );
    vi.mocked(prepareYouTubeSourceInspection).mockReturnValue({
      type: Type.Video,
      acquireTitle,
    });
    render(<CaptureHarness />);

    const fields = screen.getAllByRole("group");
    expect(fields.map((field) => field.textContent)).toEqual([
      expect.stringContaining("Source"),
      expect.stringContaining("Title"),
      expect.stringContaining("Type"),
    ]);
    await act(async () => undefined);
    expect(screen.getByLabelText("Source")).toHaveFocus();

    fireEvent.change(screen.getByLabelText("Source"), {
      target: { value: "https://youtu.be/abc_DEF-123" },
    });
    await act(async () => vi.advanceTimersByTimeAsync(299));
    expect(prepareYouTubeSourceInspection).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Source"), {
      target: { value: "https://youtu.be/abc_DEF-123?t=2" },
    });
    await act(async () => vi.advanceTimersByTimeAsync(299));
    expect(prepareYouTubeSourceInspection).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTimeAsync(1));

    expect(prepareYouTubeSourceInspection).toHaveBeenCalledOnce();
    expect(prepareYouTubeSourceInspection).toHaveBeenCalledWith(
      "https://youtu.be/abc_DEF-123?t=2",
    );
    expect(screen.getByLabelText("Type")).toHaveTextContent("Video");
    expect(screen.getAllByText("Suggested")).toHaveLength(1);
    expect(screen.getByRole("status")).toHaveTextContent(/checking/i);
    expect(acquireTitle).toHaveBeenCalledOnce();
    await act(async () => vi.advanceTimersByTimeAsync(1));

    await act(async () => {
      resolveTitle("A video title");
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByLabelText("Title")).toHaveValue("A video title");
    expect(screen.getAllByText("Suggested")).toHaveLength(2);
    expect(screen.getByRole("status")).toHaveTextContent(/details.*suggested/i);
  });

  it("treats paste like every Source mutation and keeps manual-only Sources silent", async () => {
    vi.useFakeTimers();
    render(<CaptureHarness />);
    const status = screen.getByRole("status");

    fireEvent.input(screen.getByLabelText("Source"), {
      target: { value: "https://example.com/manual" },
      inputType: "insertFromPaste",
    });
    await act(async () => vi.advanceTimersByTimeAsync(299));
    expect(prepareYouTubeSourceInspection).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTimeAsync(1));

    expect(prepareYouTubeSourceInspection).toHaveBeenCalledWith(
      "https://example.com/manual",
    );
    expect(status).toBe(screen.getByRole("status"));
    expect(status).toBeEmptyDOMElement();
  });

  it("protects independently owned fields and does not treat focus as ownership", async () => {
    vi.useFakeTimers();
    vi.mocked(prepareYouTubeSourceInspection).mockReturnValue({
      type: Type.Playlist,
      acquireTitle: vi.fn().mockResolvedValue("Suggested playlist"),
    });
    render(<CaptureHarness />);

    fireEvent.focus(screen.getByLabelText("Title"));
    fireEvent.blur(screen.getByLabelText("Title"));
    fireEvent.focus(screen.getByLabelText("Type"));
    fireEvent.blur(screen.getByLabelText("Type"));
    fireEvent.change(screen.getByLabelText("Source"), {
      target: { value: "https://youtube.com/playlist?list=0123456789" },
    });
    await act(async () => vi.advanceTimersByTimeAsync(300));
    await act(async () => vi.advanceTimersByTimeAsync(1));

    expect(screen.getByLabelText("Title")).toHaveValue("Suggested playlist");
    expect(screen.getByLabelText("Type")).toHaveTextContent("Playlist");

    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "" },
    });
    fireEvent.click(screen.getByLabelText("Type"));
    await act(async () => vi.advanceTimersByTimeAsync(0));
    fireEvent.click(screen.getByRole("option", { name: "Article" }));
    fireEvent.change(screen.getByLabelText("Source"), {
      target: { value: "https://youtube.com/watch?v=abcdefghijk" },
    });
    await act(async () => vi.advanceTimersByTimeAsync(300));
    await act(async () => vi.advanceTimersByTimeAsync(1));

    expect(screen.getByLabelText("Title")).toHaveValue("");
    expect(screen.getByLabelText("Type")).toHaveTextContent("Article");
    expect(screen.queryByText("Suggested")).toBeNull();
  });

  it("announces preservation when the User replaces a Type suggestion", async () => {
    vi.useFakeTimers();
    const title = deferred<string | null>();
    vi.mocked(prepareYouTubeSourceInspection).mockReturnValue({
      type: Type.Video,
      acquireTitle: vi.fn((_signal: AbortSignal) => title.promise),
    });
    render(<CaptureHarness />);

    fireEvent.change(screen.getByLabelText("Source"), {
      target: { value: "https://youtu.be/abc_DEF-123" },
    });
    await act(async () => vi.advanceTimersByTimeAsync(300));
    await act(async () => vi.advanceTimersByTimeAsync(1));
    fireEvent.click(screen.getByLabelText("Type"));
    await act(async () => vi.advanceTimersByTimeAsync(0));
    fireEvent.click(screen.getByRole("option", { name: "Article" }));
    await act(async () => {
      title.resolve(null);
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(screen.getByLabelText("Type")).toHaveTextContent("Article");
    expect(screen.getByRole("status")).toHaveTextContent(/entries were kept/i);
  });

  it("announces checking before settling with an already owned Title", async () => {
    vi.useFakeTimers();
    const acquireTitle = vi.fn().mockResolvedValue("Ignored title");
    vi.mocked(prepareYouTubeSourceInspection).mockReturnValue({
      type: Type.Video,
      acquireTitle,
    });
    render(<CaptureHarness />);

    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "My title" },
    });
    fireEvent.change(screen.getByLabelText("Source"), {
      target: { value: "https://youtu.be/abc_DEF-123" },
    });
    await act(async () => vi.advanceTimersByTimeAsync(300));

    expect(screen.getByRole("status")).toHaveTextContent(/checking/i);
    expect(acquireTitle).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(screen.getByRole("status")).toHaveTextContent(
      /Type was suggested; your Title was kept/i,
    );
    expect(acquireTitle).not.toHaveBeenCalled();
  });

  it("keeps cancellation silent when the User takes ownership of Title", async () => {
    vi.useFakeTimers();
    const title = deferred<string | null>();
    const acquireTitle = vi.fn((_signal: AbortSignal) => title.promise);
    vi.mocked(prepareYouTubeSourceInspection).mockReturnValue({
      type: Type.Video,
      acquireTitle,
    });
    render(<CaptureHarness />);

    fireEvent.change(screen.getByLabelText("Source"), {
      target: { value: "https://youtu.be/abc_DEF-123" },
    });
    await act(async () => vi.advanceTimersByTimeAsync(300));
    await act(async () => vi.advanceTimersByTimeAsync(1));
    const signal = acquireTitle.mock.calls[0]?.[0];

    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "My title" },
    });

    expect(signal?.aborted).toBe(true);
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    await act(async () => {
      title.resolve("Stale title");
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByLabelText("Title")).toHaveValue("My title");
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });

  it("clears required-field errors when suggestions complete the fields", async () => {
    vi.useFakeTimers();
    const title = deferred<string | null>();
    vi.mocked(prepareYouTubeSourceInspection).mockReturnValue({
      type: Type.Video,
      acquireTitle: vi.fn((_signal: AbortSignal) => title.promise),
    });
    render(<CaptureHarness />);

    fireEvent.change(screen.getByLabelText("Source"), {
      target: { value: "https://youtu.be/abc_DEF-123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add to Library" }));
    expect(screen.getByText("Enter a title.")).toBeVisible();
    expect(screen.getByText("Choose a type.")).toBeVisible();

    await act(async () => vi.advanceTimersByTimeAsync(300));
    expect(screen.queryByText("Choose a type.")).toBeNull();
    expect(screen.getByLabelText("Type")).toHaveAttribute("aria-invalid", "false");
    expect(screen.getByText("Enter a title.")).toBeVisible();
    await act(async () => vi.advanceTimersByTimeAsync(1));

    await act(async () => {
      title.resolve("Suggested title");
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.queryByText("Enter a title.")).toBeNull();
    expect(screen.getByLabelText("Title")).toHaveAttribute(
      "aria-invalid",
      "false",
    );
  });

  it("cancels replacement work, clears untouched suggestions, and ignores stale titles", async () => {
    vi.useFakeTimers();
    const firstTitle = deferred<string | null>();
    const secondTitle = deferred<string | null>();
    const firstAcquire = vi.fn((_signal: AbortSignal) => firstTitle.promise);
    const secondAcquire = vi.fn((_signal: AbortSignal) => secondTitle.promise);
    vi.mocked(prepareYouTubeSourceInspection)
      .mockReturnValueOnce({ type: Type.Video, acquireTitle: firstAcquire })
      .mockReturnValueOnce({
        type: Type.Playlist,
        acquireTitle: secondAcquire,
      });
    render(<CaptureHarness />);

    fireEvent.change(screen.getByLabelText("Source"), {
      target: { value: "https://youtu.be/abc_DEF-123" },
    });
    await act(async () => vi.advanceTimersByTimeAsync(300));
    await act(async () => vi.advanceTimersByTimeAsync(1));
    const firstSignal = firstAcquire.mock.calls[0]?.[0];
    expect(screen.getByLabelText("Type")).toHaveTextContent("Video");

    fireEvent.change(screen.getByLabelText("Source"), {
      target: {
        value: "https://youtube.com/playlist?list=0123456789",
      },
    });
    expect(firstSignal?.aborted).toBe(true);
    expect(screen.getByLabelText("Type")).toHaveTextContent("Choose a type");
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    await act(async () => vi.advanceTimersByTimeAsync(300));
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(screen.getByLabelText("Type")).toHaveTextContent("Playlist");

    await act(async () => {
      firstTitle.resolve("Stale video");
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByLabelText("Title")).toHaveValue("");
    await act(async () => {
      secondTitle.resolve("Current playlist");
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByLabelText("Title")).toHaveValue("Current playlist");
  });

  it.each(["disabled title lookup", "failed title lookup"])(
    "settles %s as Type-only assistance",
    async () => {
      vi.useFakeTimers();
      const acquireTitle = vi.fn().mockResolvedValue(null);
      vi.mocked(prepareYouTubeSourceInspection).mockReturnValue({
        type: Type.Video,
        acquireTitle,
      });
      render(<CaptureHarness />);

      fireEvent.change(screen.getByLabelText("Source"), {
        target: { value: "https://youtu.be/abc_DEF-123" },
      });
      await act(async () => vi.advanceTimersByTimeAsync(300));

      expect(screen.getByRole("status")).toHaveTextContent(/checking/i);
      expect(acquireTitle).toHaveBeenCalledOnce();
      await act(async () => vi.advanceTimersByTimeAsync(1));
      expect(screen.getByRole("status")).toHaveTextContent(/Type was suggested/i);
      expect(screen.getByLabelText("Title")).toHaveValue("");
    },
  );

  it("settles a hung acquisition within the visible ceiling", async () => {
    vi.useFakeTimers();
    const hung = deferred<string | null>();
    const acquireTitle = vi.fn((_signal: AbortSignal) => hung.promise);
    vi.mocked(prepareYouTubeSourceInspection).mockReturnValue({
      type: Type.Video,
      acquireTitle,
    });
    render(<CaptureHarness />);

    fireEvent.change(screen.getByLabelText("Source"), {
      target: { value: "https://youtu.be/abc_DEF-123" },
    });
    await act(async () => vi.advanceTimersByTimeAsync(300));
    await act(async () => vi.advanceTimersByTimeAsync(1));
    const signal = acquireTitle.mock.calls[0]?.[0];
    expect(screen.getByRole("status")).toHaveTextContent(/checking/i);
    await act(async () => vi.advanceTimersByTimeAsync(2_998));
    expect(screen.getByRole("status")).toHaveTextContent(/checking/i);
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(signal?.aborted).toBe(true);
    expect(screen.getByRole("status")).toHaveTextContent(/Type was suggested/i);
    await act(async () => {
      hung.resolve("Too late");
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByLabelText("Title")).toHaveValue("");
  });

  it("submits a complete Capture while checking without rewriting the exact Source", async () => {
    vi.useFakeTimers();
    const title = deferred<string | null>();
    const acquireTitle = vi.fn((_signal: AbortSignal) => title.promise);
    vi.mocked(prepareYouTubeSourceInspection).mockReturnValue({
      type: Type.Video,
      acquireTitle,
    });
    vi.mocked(captureItem).mockResolvedValue(
      {} as Awaited<ReturnType<typeof captureItem>>,
    );
    render(<CaptureHarness />);
    const exactSource = "  https://youtu.be/abc_DEF-123?t=5  ";

    fireEvent.change(screen.getByLabelText("Source"), {
      target: { value: exactSource },
    });
    await act(async () => vi.advanceTimersByTimeAsync(300));
    await act(async () => vi.advanceTimersByTimeAsync(1));
    const signal = acquireTitle.mock.calls[0]?.[0];
    expect(screen.getByRole("status")).toHaveTextContent(/checking/i);
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "My title" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Add to Library" }));
      await Promise.resolve();
    });

    expect(signal?.aborted).toBe(true);
    expect(captureItem).toHaveBeenCalledOnce();
    expect(captureItem).toHaveBeenCalledWith(auth.user, {
      source: exactSource,
      title: "My title",
      type: Type.Video,
    });
    await act(async () => {
      title.resolve("Too late");
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(captureItem).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog", { name: "Capture" })).toBeNull();
  });

  it("invalidates active acquisition when Capture closes or unmounts", async () => {
    vi.useFakeTimers();
    const closedTitle = deferred<string | null>();
    const unmountedTitle = deferred<string | null>();
    let attempt = 0;
    const acquireTitle = vi.fn((_signal: AbortSignal) => {
      attempt += 1;
      return attempt === 1 ? closedTitle.promise : unmountedTitle.promise;
    });
    vi.mocked(prepareYouTubeSourceInspection).mockReturnValue({
      type: Type.Video,
      acquireTitle,
    });
    render(<CaptureHarness />);

    fireEvent.change(screen.getByLabelText("Source"), {
      target: { value: "https://youtu.be/abc_DEF-123" },
    });
    await act(async () => vi.advanceTimersByTimeAsync(300));
    await act(async () => vi.advanceTimersByTimeAsync(1));
    const closeSignal = acquireTitle.mock.calls[0]?.[0];
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(closeSignal?.aborted).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Capture" }));
    expect(screen.getByLabelText("Title")).toHaveValue("");
    await act(async () => {
      closedTitle.resolve("Too late for the closed Capture");
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByLabelText("Title")).toHaveValue("");

    cleanup();
    const rendered = render(<CaptureHarness />);
    fireEvent.change(screen.getByLabelText("Source"), {
      target: { value: "https://youtu.be/123456789ab" },
    });
    await act(async () => vi.advanceTimersByTimeAsync(300));
    await act(async () => vi.advanceTimersByTimeAsync(1));
    const unmountSignal = acquireTitle.mock.calls[1]?.[0];
    rendered.unmount();

    expect(unmountSignal?.aborted).toBe(true);
    unmountedTitle.resolve("Too late for the unmounted Capture");
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
