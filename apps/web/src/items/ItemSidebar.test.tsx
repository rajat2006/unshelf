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
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { confirmChaptersRequestSchema } from "@unshelf/shared/validation";
import { MemoryRouter } from "react-router";
import {
  Status,
  StatusMode,
  Type,
  type ItemDetail,
  type ItemId,
  type Label,
  type LabelId,
  type PartId,
  type UserId,
} from "@unshelf/shared";
import {
  confirmChapters,
  applyLabelToItem,
  fetchItem,
  fetchLabels,
  researchChapters,
} from "../api";
import type { CurrentUser } from "../application-auth/types";
import { ItemSidebar } from "./ItemSidebar";

vi.mock("../api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api")>()),
  confirmChapters: vi.fn(),
  applyLabelToItem: vi.fn(),
  fetchItem: vi.fn(),
  fetchLabels: vi.fn(),
  researchChapters: vi.fn(),
}));

const userId = "00000000-0000-0000-0000-000000000001" as UserId;
const itemId = "00000000-0000-0000-0000-000000000002" as ItemId;
const secondItemId = "00000000-0000-0000-0000-000000000007" as ItemId;
const label: Label = {
  id: "00000000-0000-0000-0000-000000000003" as LabelId,
  userId,
  name: "Architecture",
};
const availableLabel: Label = {
  id: "00000000-0000-0000-0000-000000000004" as LabelId,
  userId,
  name: "Databases",
};
const item: ItemDetail = {
  id: itemId,
  userId,
  title: "Designing Data-Intensive Applications",
  source: "https://example.com/ddia",
  createdAt: "2026-08-14T00:00:00.000Z",
  type: Type.Book,
  status: Status.InProgress,
  statusMode: StatusMode.Automatic,
  targetDate: "2026-09-01",
  pastTarget: false,
  completedAt: null,
  labels: [label],
  partPercentage: 50,
  parts: [
    {
      id: "00000000-0000-0000-0000-000000000005" as PartId,
      itemId,
      title: "Storage and retrieval",
      position: 0,
      completed: true,
    },
  ],
};
const user: CurrentUser = { getToken: async () => null };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function renderSidebar() {
  return render(
    <MemoryRouter>
      <ItemSidebar
        itemId={itemId}
        user={user}
        onClose={vi.fn()}
        onItemChanged={vi.fn()}
      />
    </MemoryRouter>,
  );
}

function resolveSupportingReads() {
  vi.mocked(fetchLabels).mockResolvedValue([label, availableLabel]);
}

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("canonical Item detail panel", () => {
  it("presents every shared Item fact and makes Labels operable", async () => {
    vi.mocked(fetchItem).mockResolvedValue(item);
    resolveSupportingReads();
    vi.mocked(applyLabelToItem).mockResolvedValue({
      ...item,
      labels: [label, availableLabel],
    });

    renderSidebar();

    const panel = await screen.findByRole("complementary", {
      name: `${item.title} details`,
    });
    expect(panel).toHaveTextContent(item.title);
    expect(panel).toHaveTextContent("Book");
    expect(screen.getByRole("link", { name: item.source! })).toBeVisible();
    expect(screen.getByText("Architecture")).toBeVisible();
    expect(screen.getByText("In progress")).toBeVisible();
    expect(screen.getByLabelText(`Target date for ${item.title}`)).toHaveValue(
      "2026-09-01",
    );
    expect(screen.getByText("50% complete")).toBeVisible();
    expect(screen.getByText("Storage and retrieval")).toBeVisible();
    fireEvent.click(
      screen.getByRole("combobox", { name: `Add a Label to ${item.title}` }),
    );
    fireEvent.click(await screen.findByRole("option", { name: "Databases" }));
    fireEvent.click(screen.getByRole("button", { name: "Apply Label" }));

    await waitFor(() =>
      expect(applyLabelToItem).toHaveBeenCalledWith(
        user,
        itemId,
        availableLabel.id,
      ),
    );
    expect(await screen.findByText("Databases")).toBeVisible();
  });

  it("keeps the shaped panel available while loading and recovers in place", async () => {
    vi.mocked(fetchItem)
      .mockRejectedValueOnce(new Error("api responded 503"))
      .mockResolvedValueOnce(item);
    resolveSupportingReads();

    renderSidebar();

    expect(
      screen.getByRole("status", { name: "Loading Item details" }),
    ).toBeVisible();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Couldn’t load this Item",
    );

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(
      await screen.findByRole("complementary", {
        name: `${item.title} details`,
      }),
    ).toBeVisible();
    expect(fetchItem).toHaveBeenCalledTimes(2);
  });

  it("ignores an older Item response after route navigation", async () => {
    const firstRequest = deferred<ItemDetail>();
    const secondRequest = deferred<ItemDetail>();
    vi.mocked(fetchItem).mockImplementation((_user, requestedItemId) =>
      requestedItemId === itemId ? firstRequest.promise : secondRequest.promise,
    );
    resolveSupportingReads();
    const view = renderSidebar();

    view.rerender(
      <MemoryRouter>
        <ItemSidebar
          itemId={secondItemId}
          user={user}
          onClose={vi.fn()}
          onItemChanged={vi.fn()}
        />
      </MemoryRouter>,
    );
    const secondItem = {
      ...item,
      id: secondItemId,
      title: "Site reliability workbook",
      parts: [],
      partPercentage: null,
    };
    secondRequest.resolve(secondItem);

    expect(
      await screen.findByRole("complementary", {
        name: `${secondItem.title} details`,
      }),
    ).toBeVisible();

    firstRequest.resolve(item);
    await waitFor(() => expect(fetchItem).toHaveBeenCalledTimes(2));
    expect(
      screen.getByRole("complementary", {
        name: `${secondItem.title} details`,
      }),
    ).toBeVisible();
    expect(
      screen.queryByRole("status", { name: "Loading Item details" }),
    ).not.toBeInTheDocument();
  });
});

it("finds editable chapters on a saved empty book with evidence separate from edits", async () => {
  vi.mocked(fetchItem).mockResolvedValue({
    ...item,
    parts: [],
    partPercentage: null,
  });
  resolveSupportingReads();
  vi.mocked(researchChapters).mockResolvedValue({
    ok: true,
    preview: {
      kind: "suggestions",
      reason: null,
      title: "Matched book",
      author: "Writer",
      edition: null,
      coverage: "partial",
      chapters: [{ title: "Chapter 1", evidence: ["toc"] }],
      sources: [
        { id: "toc", title: "Contents", url: "https://example.com/contents" },
      ],
    },
  });
  renderSidebar();
  fireEvent.click(await screen.findByRole("button", { name: "Find chapters" }));
  const editor = await screen.findByRole("textbox", {
    name: "Chapter preview",
  });
  expect(editor).toHaveValue("Chapter 1");
  expect(screen.getByText("Partial chapter list")).toBeVisible();
  expect(screen.getByText(/Edition unknown/)).toBeVisible();
  fireEvent.change(editor, { target: { value: "My edited chapter" } });
  expect(screen.getByRole("link", { name: "Contents" })).toHaveAttribute(
    "href",
    "https://example.com/contents",
  );
  expect(
    screen.getByText("Chapter 1", { exact: false, selector: "li" }),
  ).toBeVisible();
  const saving = deferred<ItemDetail>();
  vi.mocked(confirmChapters).mockReturnValue(saving.promise);
  fireEvent.click(screen.getByRole("button", { name: "Add chapters" }));
  fireEvent.click(screen.getByRole("button", { name: "Saving chapters…" }));
  expect(confirmChapters).toHaveBeenCalledTimes(1);
  expect(vi.mocked(confirmChapters).mock.calls[0][0].request).toMatchObject({
    titles: ["My edited chapter"],
  });
  expect(editor).toBeDisabled();
  expect(
    screen.getByRole("button", { name: "Cancel research" }),
  ).toBeDisabled();
  saving.resolve({
    ...item,
    parts: [{ ...item.parts[0], title: "My edited chapter", completed: false }],
  });
  expect(
    await screen.findByRole("checkbox", { name: "My edited chapter" }),
  ).not.toBeChecked();
  expect(
    screen.queryByRole("textbox", { name: "Chapter preview" }),
  ).not.toBeInTheDocument();
});

it("warns before discarding edits and suppresses a cancelled attempt's late result", async () => {
  vi.mocked(fetchItem).mockResolvedValue({
    ...item,
    parts: [],
    partPercentage: null,
  });
  resolveSupportingReads();
  const late = deferred<Awaited<ReturnType<typeof researchChapters>>>();
  vi.mocked(researchChapters)
    .mockReturnValueOnce(late.promise)
    .mockResolvedValue({
      ok: true,
      preview: {
        kind: "suggestions",
        reason: null,
        title: "New match",
        author: null,
        edition: null,
        coverage: "unknown",
        chapters: [{ title: "New chapter", evidence: ["toc"] }],
        sources: [
          { id: "toc", title: "Contents", url: "https://example.com/contents" },
        ],
      },
    });
  renderSidebar();
  fireEvent.click(await screen.findByRole("button", { name: "Find chapters" }));
  expect(screen.getByRole("button", { name: "Find chapters" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Cancel research" }));
  expect(
    vi.mocked(researchChapters).mock.calls.at(-1)?.[0].signal.aborted,
  ).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Find chapters" }));
  const editor = await screen.findByRole("textbox", {
    name: "Chapter preview",
  });
  fireEvent.change(editor, { target: { value: "Keep my edit" } });
  fireEvent.click(screen.getByRole("button", { name: "Cancel research" }));
  expect(screen.getByRole("alertdialog")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
  expect(editor).toHaveValue("Keep my edit");
  late.resolve({ ok: false, error: "provider_failure" });
  await waitFor(() => expect(editor).toHaveValue("Keep my edit"));
  fireEvent.click(screen.getByRole("button", { name: "Retry research" }));
  fireEvent.click(screen.getByRole("button", { name: "Discard edits" }));
  await waitFor(() =>
    expect(
      screen.getByRole("textbox", { name: "Chapter preview" }),
    ).toHaveValue("New chapter"),
  );
});

it("renders retrieved markup inertly and bounds waiting when the transport hangs", async () => {
  vi.mocked(fetchItem).mockResolvedValue({
    ...item,
    parts: [],
    partPercentage: null,
  });
  resolveSupportingReads();
  vi.mocked(researchChapters)
    .mockResolvedValueOnce({
      ok: true,
      preview: {
        kind: "suggestions",
        reason: null,
        title: "<script>attack()</script>",
        author: null,
        edition: null,
        coverage: "unknown",
        chapters: [
          { title: "<img src=x onerror=attack()>", evidence: ["toc"] },
        ],
        sources: [
          { id: "toc", title: "Unsafe source", url: "javascript:attack()" },
        ],
      },
    })
    .mockImplementationOnce(() => new Promise(() => {}));
  const view = renderSidebar();
  fireEvent.click(await screen.findByRole("button", { name: "Find chapters" }));
  expect(
    await screen.findByRole("textbox", { name: "Chapter preview" }),
  ).toHaveValue("<img src=x onerror=attack()>");
  expect(view.container.querySelector("script, img")).toBeNull();
  expect(
    screen.queryByRole("link", { name: "Unsafe source" }),
  ).not.toBeInTheDocument();
  vi.useFakeTimers();
  try {
    fireEvent.click(screen.getByRole("button", { name: "Retry research" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(65_000);
    });
    expect(screen.getByRole("alert")).toHaveTextContent(/timed out/i);
    expect(
      screen.getByRole("button", { name: "Retry research" }),
    ).toBeEnabled();
    expect(
      vi.mocked(researchChapters).mock.calls.at(-1)?.[0].signal.aborted,
    ).toBe(true);
  } finally {
    vi.useRealTimers();
  }
});

it.each([400, 413, 500, "disconnect", "malformed"])(
  "retains edits and safely retries a %s confirmation failure",
  async (failure) => {
    vi.mocked(fetchItem).mockResolvedValue({
      ...item,
      parts: [],
      partPercentage: null,
    });
    resolveSupportingReads();
    vi.mocked(researchChapters).mockResolvedValue({
      ok: true,
      preview: {
        kind: "suggestions",
        reason: null,
        title: "Book",
        author: null,
        edition: null,
        coverage: "unknown",
        chapters: [{ title: "Chapter 1", evidence: ["toc"] }],
        sources: [
          { id: "toc", title: "Contents", url: "https://example.com/contents" },
        ],
      },
    });
    const actual = await vi.importActual<typeof import("../api")>("../api");
    vi.mocked(confirmChapters).mockImplementation(actual.confirmChapters);
    const transport = vi.fn<typeof fetch>();
    if (failure === "disconnect")
      transport.mockRejectedValueOnce(new TypeError("Lost connection"));
    else
      transport.mockResolvedValueOnce(
        new Response(failure === "malformed" ? "{" : "{}", {
          status: typeof failure === "number" ? failure : 200,
        }),
      );
    transport.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ...item,
          parts: [{ ...item.parts[0], title: "Saved chapter" }],
        }),
      ),
    );
    vi.stubGlobal("fetch", transport);
    renderSidebar();
    fireEvent.click(
      await screen.findByRole("button", { name: "Find chapters" }),
    );
    const editor = await screen.findByRole("textbox", {
      name: "Chapter preview",
    });
    for (const value of [
      " ",
      "x".repeat(1001),
      Array(201).fill("One").join("\n"),
    ]) {
      fireEvent.change(editor, { target: { value } });
      fireEvent.click(screen.getByRole("button", { name: "Add chapters" }));
      expect(screen.getByRole("alert")).toBeVisible();
      expect(transport).not.toHaveBeenCalled();
      expect(editor).toHaveValue(value);
    }
    fireEvent.change(editor, {
      target: { value: "  Edited chapter\n\nEdited chapter" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add chapters" }));
    await screen.findByRole("alert");
    if (failure === 413)
      expect(screen.getByRole("alert")).toHaveTextContent(/100 KB/);
    expect(editor).toHaveValue("  Edited chapter\n\nEdited chapter");
    const first = confirmChaptersRequestSchema.parse(
      JSON.parse(transport.mock.calls[0][1]?.body as string),
    );
    if (failure === 400 || failure === 413) {
      expect(editor).toBeEnabled();
      fireEvent.change(editor, { target: { value: "Corrected" } });
      fireEvent.click(screen.getByRole("button", { name: "Add chapters" }));
    } else {
      expect(editor).toBeDisabled();
      expect(
        screen.getByRole("button", { name: "Retry research" }),
      ).toBeDisabled();
      fireEvent.click(
        screen.getByRole("button", { name: "Retry saving chapters" }),
      );
    }
    await screen.findByRole("checkbox", { name: "Saved chapter" });
    const second = confirmChaptersRequestSchema.parse(
      JSON.parse(transport.mock.calls[1][1]?.body as string),
    );
    if (failure === 400 || failure === 413) {
      expect(second.confirmationKey).not.toBe(first.confirmationKey);
      expect(second.titles).toEqual(["Corrected"]);
    } else expect(second).toEqual(first);
    expect(researchChapters).toHaveBeenCalledTimes(1);
  },
);
